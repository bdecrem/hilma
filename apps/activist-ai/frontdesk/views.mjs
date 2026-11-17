// "Open" for a page Ola built: an .html file in a workspace, shown rendered in a new tab, with its
// relative assets (css, js, images, data files beside it) working.
//
// A model wrote that page, so it is treated as hostile. The proper home for it is a separate
// registrable domain per workspace (README, "The preview origin"); until that exists, this is the
// strongest arrangement we found on one origin. Three layers, each enough on its own for what it
// covers:
//
//   1. The page has no origin of ours. Every response under /v/ carries
//      `Content-Security-Policy: sandbox allow-scripts allow-forms` (never allow-same-origin), so
//      the browser gives the document an opaque origin: it cannot read our cookies (document.cookie
//      throws), our storage, or the app's windows, and anything it requests is cross-site to us.
//      The session cookie is SameSite=Strict, so the browser does not attach it to those requests,
//      and /api and /oc refuse any request marked cross-site (Sec-Fetch-Site) before looking at a
//      cookie. So even a request that got out would not act as the signed-in person.
//   2. It may load only its own workspace's files. The same CSP allows scripts, styles, images,
//      fonts, media, fetch and frames only from `<origin>/v/<grant>/` (a path-limited source),
//      plus inline code and data: URLs. Not /api, not /oc, not the app, not another origin.
//      form-action 'none', base-uri 'none', no workers, no plugins.
//   3. It cannot navigate away with data. The page is shown inside a frame of a small wrapper page
//      of ours (no script at all) whose CSP says `frame-src <origin>/v/<grant>/`: if the page
//      sends itself to another origin (location, a meta refresh, a link), the browser refuses that
//      navigation. The frame's sandbox has no allow-top-navigation and no allow-popups, so it
//      cannot move the tab or open a window either. An inner document asked for as a top-level
//      tab (Sec-Fetch-Dest: document) is refused, so the page never runs outside the wrapper.
//
// How the subresources load without the cookie: opening a page mints a **grant**, 32 random
// bytes, kept in this process's memory only and named in the path (`/v/<grant>/<file>`). The
// wrapper request itself needs the signed-in session (a same-origin navigation from the app, so
// the Strict cookie is sent). Every later request under the grant is checked against the session
// and the membership the grant was minted for: sign-out, revocation, expiry, the idle limit,
// suspension or removal from the team and the grant stops working at once. A grant also ends
// after 30 minutes unused or 8 hours in all, and with a front desk restart. Its scope is the
// opened page's folder and below; hidden files (names starting with a dot, where opencode keeps
// its database) are never served.
//
// What is not covered on one origin, and would not be by the separate origin either: a WebRTC
// connection to an outside STUN server (no CSP directive browsers enforce stops it), and DNS
// lookups from prefetch hints. Both are ways a hostile page could leak what it can read, which is
// the files in its own folder that the person opening it can already see. The audit log records
// each open as `page_opened` with the keyed hash of the page's name, never the name.
//
// Open for every other kind (2026-11-17). The same grant, the same wrapper with no script, the same
// checks on every request; but nothing of these files ever runs, so their grants are stricter
// still: the CSP under /v/ is `sandbox` with no allow-scripts at all, and only the one thing the
// wrapper shows may be fetched, as what it is:
//   - a picture (png, jpeg, gif, webp, avif, svg): the file itself, and only as an image
//     (Sec-Fetch-Dest: image). An SVG is therefore always an image, never a document: in an <img>
//     its scripts and outside images do not run or load, and a direct visit is refused.
//   - a PDF: never sent to the browser. ola-view renders each page to a PNG inside the VM
//     (`/v/<grant>/@page/<n>.png`, images only), and the wrapper lists the pages, each with the
//     text the project database holds for it (escaped here) and a mark on pages read from a scan.
//     `?page=N` marks the cited page, and the link's `#page-N` scrolls to it, with no script.
//   - a Word, Markdown or text file: ola-view writes it as plain HTML inside the VM
//     (`/v/<grant>/@doc`, frames only), shown in a frame with sandbox="" and that CSP: a page
//     that runs nothing, loads nothing, and cannot navigate. The VM's HTML is the VM's word.
//   - a table (csv, tsv, xlsx): opened in the app itself (`/?w=<slug>#/table?path=`), as the Data
//     tab's table browser; the rows come as JSON (GET /api/view/table) and are shown as text.
import { randomBytes } from 'node:crypto'
import { audit, nameRef } from './db.mjs'

export const VIEW_TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', csv: 'text/csv; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', xml: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', vtt: 'text/vtt',
}
export const isPage = (rel) => /\.html?$/i.test(rel)
/** What Open does with a file: 'page', 'image', 'pdf', 'doc', 'table', or null (Download only). */
export const kindOf = (rel) =>
  /\.html?$/i.test(rel) ? 'page' : /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(rel) ? 'image' : /\.pdf$/i.test(rel) ? 'pdf' : /\.(docx|md|markdown|txt|odt)$/i.test(rel) ? 'doc' : /\.(csv|tsv|xlsx|xlsm)$/i.test(rel) ? 'table' : null
const PAGE_WIDTH = 1400 // pixels of a rendered PDF page
const MAX_PDF_PAGES = 3000
const MAX_BYTES = 32 * 1024 * 1024
const IDLE_MS = 30 * 60_000
const ABSOLUTE_MS = 8 * 3600_000
const PER_PERSON = 100
const TOTAL = 10_000
// Execs for page files at once, per workspace; more wait in line (a page with many images).
const AT_ONCE = 4
const MAX_WAITING = 64
const WAIT_MS = 20_000
// Fetch destinations a page's own requests may have. A document (a top-level tab), an embed or
// object, a worker and a missing header are refused.
const DESTS = new Set(['iframe', 'frame', 'image', 'style', 'script', 'font', 'empty', 'audio', 'video', 'track'])

/** The CSP of everything under one grant (see layer 1 and 2 above). */
export const innerCsp = (origin, grant) => {
  const own = `${origin}/v/${grant}/`
  return [
    'sandbox allow-scripts allow-forms',
    "default-src 'none'",
    `script-src ${own} 'unsafe-inline'`,
    `style-src ${own} 'unsafe-inline'`,
    `img-src ${own} data: blob:`,
    `font-src ${own} data:`,
    `media-src ${own} data: blob:`,
    `connect-src ${own}`,
    `frame-src ${own}`,
    "worker-src 'none'",
    "manifest-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${origin}`,
  ].join('; ')
}
/** The CSP under a grant for a file that must run nothing (every kind but a page). */
export const inertCsp = (origin) => ['sandbox', "default-src 'none'", "style-src 'unsafe-inline'", 'img-src data:', "base-uri 'none'", "form-action 'none'", `frame-ancestors ${origin}`].join('; ')
/** The wrapper's CSP: no script, our font and inline style for its bar, and one frame or its images. */
const outerCsp = (origin, grant) => `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src ${origin}/v/${grant}/; frame-src ${origin}/v/${grant}/; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const encodePath = (rel) => rel.split('/').map(encodeURIComponent).join('/')
const text = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

export function makeViews({ cfg, db, keys, auth, membership, workspaces }) {
  const grants = new Map() // grant -> { sess, personId, slug, wsId, scope, at, last }
  const lines = new Map() // slug -> { n, waiting: [] }

  function mint(sess, ws, rel, kind = 'page', pages = 0) {
    const mine = [...grants].filter(([, g]) => g.personId === sess.personId)
    if (mine.length >= PER_PERSON) grants.delete(mine[0][0])
    if (grants.size >= TOTAL) grants.delete(grants.keys().next().value)
    const grant = randomBytes(32).toString('base64url')
    const scope = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : ''
    grants.set(grant, { sess, personId: sess.personId, slug: ws.slug, wsId: ws.id, scope, kind, rel, pages, at: Date.now(), last: Date.now() })
    return grant
  }

  // The wrapper of a picture, a PDF or a document: ours, no script, the file's name and words
  // escaped. Only the grant's own path may be framed or shown as an image (outerCsp).
  function wrapper(name, note, body, extraStyle = '') {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">
<title>${esc(name)} · Ola</title>
<style>
@font-face{font-family:'Bricolage Grotesque';src:url('/fonts/bricolage.woff2') format('woff2');font-weight:400 760}
html,body{margin:0;min-height:100%;background:#f7f0e3}
body{display:flex;flex-direction:column;min-height:100vh;font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1d1a16}
.bar{flex:none;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;padding:8px 16px;background:#25407a;color:#f7f0e3;font-size:15px;line-height:1.4;position:sticky;top:0;z-index:2}
.bar b{font-weight:650}.bar span{color:#c9d2ea}.bar a{color:#f7f0e3;margin-left:auto;font-weight:600}
${extraStyle}
</style></head>
<body><div class="bar" role="note"><b>${esc(name)}</b><span>${esc(note)}</span></div>
${body}
</body></html>
`
  }
  const sendWrapper = (res, grant, html) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': outerCsp(cfg.origin, grant) })
    res.end(html)
  }
  const downloadLink = (ws, rel) => `/api/files/${encodePath(rel)}?w=${encodeURIComponent(ws.slug)}`

  async function openInert(req, res, sess, ws, rel, kind, name, url) {
    if (kind === 'image') {
      const grant = mint(sess, ws, rel, kind)
      audit(db, { actor: sess.personId, action: 'page_opened', workspace: ws.id, nameRef: nameRef(keys, ws.id, rel) })
      return sendWrapper(res, grant, wrapper(name, 'A picture in this project. Only the people in the project can open it.',
        `<main class="pic"><img src="/v/${grant}/${esc(encodePath(rel))}" alt="${esc(name)}"></main>`,
        '.pic{flex:1;display:flex;align-items:center;justify-content:center;padding:24px 16px}.pic img{max-width:100%;max-height:calc(100vh - 96px);height:auto;background:#fff;box-shadow:0 1px 3px rgba(29,26,22,.18)}'))
    }
    if (kind === 'doc') {
      const grant = mint(sess, ws, rel, kind)
      audit(db, { actor: sess.personId, action: 'page_opened', workspace: ws.id, nameRef: nameRef(keys, ws.id, rel) })
      return sendWrapper(res, grant, wrapper(name, 'A document in this project, shown as plain text and headings. Only the people in the project can open it.',
        `<iframe src="/v/${grant}/@doc" sandbox="" referrerpolicy="no-referrer" title="${esc(name)}"></iframe>`,
        'iframe{flex:1;border:0;width:100%;min-height:calc(100vh - 40px);background:#fbf8f1}'))
    }
    // A PDF: its pages, as pictures the VM made, with the text Ola has of each.
    const info = await workspaces.viewJson(ws.slug, ['pdf-info', rel])
    const pages = Number.isSafeInteger(info?.pages) ? Math.min(info.pages, MAX_PDF_PAGES) : 0
    if (!pages) return text(res, 404, 'That PDF could not be shown here. Download it instead.')
    const grant = mint(sess, ws, rel, kind, pages)
    audit(db, { actor: sess.personId, action: 'page_opened', workspace: ws.id, nameRef: nameRef(keys, ws.id, rel) })
    const cited = Number.parseInt(url.searchParams.get('page') ?? '', 10)
    const sizes = Array.isArray(info.sizes) ? info.sizes : []
    const texts = Array.isArray(info.texts) ? info.texts : null
    const methods = Array.isArray(info.methods) ? info.methods : null
    const out = []
    for (let n = 1; n <= pages; n++) {
      const s = sizes[n - 1]
      const [w, h] = Array.isArray(s) && s.every((x) => Number.isFinite(x) && x > 0 && x < 20000) ? s : [612, 792]
      const height = Math.round((PAGE_WIDTH * h) / w)
      const scan = methods && typeof methods[n - 1] === 'string' && methods[n - 1].startsWith('ocr')
      const t = texts && typeof texts[n - 1] === 'string' ? texts[n - 1] : null
      const near = Number.isSafeInteger(cited) && Math.abs(n - cited) <= 1
      out.push(`<section class="pg${n === cited ? ' cited' : ''}" id="page-${n}" aria-label="Page ${n}">
<p class="pno">Page ${n} of ${pages}${n === cited ? ' <b>· the page cited</b>' : ''}${scan ? ' <i>· read from a scan: the words Ola has of it may be wrong</i>' : ''}</p>
<img src="/v/${grant}/@page/${n}.png" width="${PAGE_WIDTH}" height="${height}" loading="${n <= 2 || near ? 'eager' : 'lazy'}" alt="Page ${n} of ${esc(name)}">
${t ? `<details><summary>The text of page ${n}${scan ? ', as read from the scan' : ''}</summary><div class="txt">${esc(t).replace(/\n/g, '<br>')}</div></details>` : ''}
</section>`)
    }
    return sendWrapper(res, grant, wrapper(name, `A PDF in this project, ${pages === 1 ? 'one page' : `${pages} pages`}, shown as pictures of its pages. Only the people in the project can open it.`,
      `<main class="pdf">${out.join('\n')}</main>`,
      `.bar a{display:none}
.pdf{max-width:900px;width:100%;margin:0 auto;padding:16px 16px 48px;box-sizing:border-box}
.pg{margin:0 0 28px;scroll-margin-top:52px}
.pg img{display:block;width:100%;height:auto;background:#fff;box-shadow:0 1px 3px rgba(29,26,22,.22)}
.pno{margin:0 0 6px;font-size:14px;color:#5b5346}.pno b{color:#25407a;font-weight:650}.pno i{font-style:normal;color:#8a3b12}
.cited img{outline:3px solid #e9a23b;outline-offset:3px}
details{margin:8px 0 0;font-size:15px}summary{cursor:pointer;color:#25407a}
.txt{margin-top:8px;padding:12px 14px;background:#fbf8f1;border:1px solid #e2d8c6;font:16px/1.55 Georgia,serif;overflow-wrap:anywhere}`))
  }

  // A stream from the VM, sent on as `type`, kept moving like a download (server.mjs).
  async function pipe(res, f, type) {
    res.writeHead(200, { 'content-type': type, 'content-length': String(f.size), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' })
    let sent = 0
    let mark = 0
    const slow = setInterval(() => (sent - mark < 32 * 1024 ? res.destroy() : (mark = sent)), Number(process.env.OLA_FD_SLOW_MS) || 30_000)
    try {
      for await (const c of f.stream) {
        sent += c.length
        if (!res.write(c) && !res.destroyed) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
        if (res.destroyed) break
      }
      res.end()
    } catch {
      res.destroy()
    } finally {
      clearInterval(slow)
      f.kill()
    }
  }
  /** The grant's workspace if it is still good: in time, its session valid, its person a member. */
  function live(grant) {
    const g = grants.get(grant)
    if (!g) return null
    const now = Date.now()
    // A closed workspace (a rotation could not make it safe) ends its grants too, like a removal
    // (third review, 2026-11-16: an earlier grant kept serving a closed workspace's files).
    if (now - g.at > ABSOLUTE_MS || now - g.last > IDLE_MS || !auth.stillValid(g.sess) || membership(g.personId, g.slug)?.status !== 'active') {
      grants.delete(grant)
      return null
    }
    g.last = now
    return g
  }
  async function turn(slug) {
    const l = lines.get(slug) ?? lines.set(slug, { n: 0, waiting: [] }).get(slug)
    if (l.n < AT_ONCE) return l.n++, () => release(slug)
    if (l.waiting.length >= MAX_WAITING) return null
    return new Promise((resolve) => {
      const w = { go: () => (clearTimeout(timer), l.n++, resolve(() => release(slug))) }
      const timer = setTimeout(() => (l.waiting.splice(l.waiting.indexOf(w), 1), resolve(null)), WAIT_MS)
      l.waiting.push(w)
    })
  }
  function release(slug) {
    const l = lines.get(slug)
    l.n--
    l.waiting.shift()?.go()
    if (!l.n && !l.waiting.length) lines.delete(slug)
  }

  // Under a picture's, a PDF's or a document's grant: the one thing its wrapper shows, as what it
  // is, and nothing else (no other file of the folder, no other destination).
  async function serveInert(req, res, g, tail, dest) {
    res.setHeader('content-security-policy', inertCsp(cfg.origin))
    let job
    if (g.kind === 'image') {
      let rel
      try {
        rel = tail.split('/').map(decodeURIComponent).join('/')
      } catch {}
      if (rel !== g.rel) return text(res, 404, 'That file is not here.')
      if (dest !== 'image') return text(res, 403, 'A picture is shown only as a picture. Open it from the project.')
      const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase()
      job = { type: VIEW_TYPES[ext] ?? 'application/octet-stream', get: (signal) => workspaces.getStream(g.slug, rel, { signal }) }
    } else if (g.kind === 'pdf') {
      const n = /^@page\/(\d{1,5})\.png$/.exec(tail)
      if (!n || +n[1] < 1 || +n[1] > g.pages) return text(res, 404, 'That page is not here.')
      if (dest !== 'image') return text(res, 403, 'Open this PDF from the project.')
      job = { type: 'image/png', get: (signal) => workspaces.viewStream(g.slug, ['pdf-page', g.rel, n[1], '--width', PAGE_WIDTH], { signal }) }
    } else if (g.kind === 'doc') {
      if (tail !== '@doc') return text(res, 404, 'That file is not here.')
      if (dest !== 'iframe') return text(res, 403, 'Open this document from the project.')
      job = { type: 'text/html; charset=utf-8', get: (signal) => workspaces.viewStream(g.slug, ['doc', g.rel], { signal }) }
    } else return text(res, 404, 'That file is not here.')
    const gone = new AbortController()
    res.on('close', () => gone.abort())
    const done = await turn(g.slug)
    if (!done) return text(res, 503, 'Ola’s computer is busy. Reload the page in a moment.')
    if (res.destroyed) return done()
    const busy = workspaces.holdBusy(g.slug)
    try {
      await workspaces.ensureRunning(g.slug)
      const f = await job.get(gone.signal)
      if (!f) return res.destroyed ? undefined : text(res, 404, 'That could not be shown. Download the file instead.')
      if (res.destroyed) return f.kill()
      if (f.size > MAX_BYTES) return f.kill(), text(res, 413, 'That file is too large to show here. Download it instead.')
      await pipe(res, f, job.type)
    } finally {
      busy()
      done()
    }
  }

  return {
    /** GET /api/open?w=<slug>&path=<rel>: a signed-in member opens a page; answers the wrapper. */
    async open(req, res, sess, url) {
      const ws = membership(sess.personId, url.searchParams.get('w'))
      const rel = url.searchParams.get('path') ?? ''
      const kind = kindOf(rel)
      if (!ws || !kind || !workspaces.validRel(rel) || rel.split('/').some((x) => x.startsWith('.'))) return text(res, 404, 'That file is not here, or it is not yours to open.')
      // Closed by the admin CLI: refused here as on every other workspace route (third review).
      if (ws.status !== 'active') return text(res, 423, 'This project is closed for now. Your files are kept.')
      // A table opens in the app's own table view (its rows come as JSON and are shown as text).
      if (kind === 'table') {
        res.writeHead(303, { location: `/?w=${encodeURIComponent(ws.slug)}#/table?path=${encodeURIComponent(rel)}`, 'cache-control': 'no-store' })
        return res.end()
      }
      await workspaces.ensureRunning(ws.slug)
      const name = rel.split('/').pop()
      if (kind !== 'page') return openInert(req, res, sess, ws, rel, kind, name, url)
      const grant = mint(sess, ws, rel)
      audit(db, { actor: sess.personId, action: 'page_opened', workspace: ws.id, nameRef: nameRef(keys, ws.id, rel) })
      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">
<title>${esc(name)} · Ola</title>
<style>
@font-face{font-family:'Bricolage Grotesque';src:url('/fonts/bricolage.woff2') format('woff2');font-weight:400 760}
html,body{margin:0;height:100%;background:#f7f0e3}
body{display:flex;flex-direction:column;font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,-apple-system,sans-serif}
.bar{flex:none;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;padding:8px 16px;background:#25407a;color:#f7f0e3;font-size:15px;line-height:1.4}
.bar b{font-weight:650}.bar span{color:#c9d2ea}
iframe{flex:1;border:0;width:100%;background:#fff}
</style></head>
<body><div class="bar" role="note"><b>${esc(name)}</b><span>A page Ola made in this project. Only the people in the project can open it, and it cannot reach the internet or your account.</span></div>
<iframe src="/v/${grant}/${esc(encodePath(rel))}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" title="${esc(name)}, a page Ola made"></iframe>
</body></html>
`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': outerCsp(cfg.origin, grant) })
      res.end(html)
    },

    /** GET /v/<grant>/<rel>: one file of an opened page, under its grant (no cookie needed). */
    async serve(req, res, p) {
      const m = /^\/v\/([A-Za-z0-9_-]{43})\/(.+)$/.exec(p)
      const g = m && live(m[1])
      // Whatever the answer, it is not a document of ours: the sandbox CSP goes on every one.
      if (m) res.setHeader('content-security-policy', innerCsp(cfg.origin, m[1]))
      res.removeHeader('x-frame-options')
      if (req.method !== 'GET') return text(res, 405, 'Only reading is possible here.')
      if (!g) return text(res, 404, 'This page is no longer open. Open it again from the project.')
      const dest = req.headers['sec-fetch-dest']
      if (g.kind !== 'page') return serveInert(req, res, g, m[2], dest)
      if (!DESTS.has(dest)) return text(res, 403, 'Open this page from the project, with its Open button.')
      let rel
      try {
        rel = m[2].split('/').map(decodeURIComponent).join('/')
      } catch {
        return text(res, 404, 'That file is not here.')
      }
      if (!workspaces.validRel(rel) || rel.split('/').some((x) => x.startsWith('.')) || !rel.startsWith(g.scope)) return text(res, 404, 'That file is not here.')
      // Listened for before the wait in line: a request given up on while it waited must not get
      // an exec when its turn comes. Attached after, its 'close' had already passed, the exec's
      // first write found the response destroyed and waited for a 'drain' or 'close' that never
      // came: the exec, the turn and the busy mark were held for good, so a page's script that
      // aborted a dozen fetches killed Open for the team and kept the workspace from ever
      // stopping, until the front desk restarted (third review, 2026-11-16; rev3.mjs views).
      const gone = new AbortController()
      res.on('close', () => gone.abort())
      const done = await turn(g.slug)
      if (!done) return text(res, 503, 'Ola’s computer is busy. Reload the page in a moment.')
      if (res.destroyed) return done()
      const busy = workspaces.holdBusy(g.slug)
      try {
        await workspaces.ensureRunning(g.slug)
        const f = await workspaces.getStream(g.slug, rel, { signal: gone.signal })
        if (!f) return res.destroyed ? undefined : text(res, 404, 'That file is not here.')
        if (res.destroyed) return f.kill()
        if (f.size > MAX_BYTES) return f.kill(), text(res, 413, 'That file is too large to show here. Download it instead.')
        const ext = rel.includes('.') ? rel.slice(rel.lastIndexOf('.') + 1).toLowerCase() : ''
        res.writeHead(200, {
          'content-type': VIEW_TYPES[ext] ?? 'application/octet-stream',
          'content-length': String(f.size),
          'cache-control': 'no-store',
          // The page's origin is opaque, so its own images and scripts are cross-origin loads:
          // without these the browser would refuse them. No credentials are involved.
          'cross-origin-resource-policy': 'cross-origin',
          'access-control-allow-origin': '*',
        })
        // A page file must keep moving like a download (server.mjs): under 32 KiB taken in a window
        // (30 s) ends it. Without this, four unread requests held this workspace's four execs, so
        // every other page file of the team waited 20 s and got a 503, and kept the workspace busy,
        // so it never stopped for idleness, for as long as the sockets stayed open (third review,
        // 2026-11-16; frontdesk/review/rev3.mjs views).
        let sent = 0
        let mark = 0
        const slow = setInterval(() => (sent - mark < 32 * 1024 ? res.destroy() : (mark = sent)), Number(process.env.OLA_FD_SLOW_MS) || 30_000)
        try {
          for await (const c of f.stream) {
            sent += c.length
            if (!res.write(c) && !res.destroyed) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
            if (res.destroyed) break
          }
          res.end()
        } catch {
          res.destroy()
        } finally {
          clearInterval(slow)
          f.kill()
        }
      } finally {
        busy()
        done()
      }
    },
    /** For the checks: how many grants are held. */
    size: () => grants.size,
  }
}
