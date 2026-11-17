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
import { randomBytes } from 'node:crypto'
import { audit, nameRef } from './db.mjs'

export const VIEW_TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', csv: 'text/csv; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', xml: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', vtt: 'text/vtt',
}
export const isPage = (rel) => /\.html?$/i.test(rel)
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
/** The wrapper's CSP: no script, our font and inline style for its bar, and one frame. */
const outerCsp = (origin, grant) => `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; font-src 'self'; frame-src ${origin}/v/${grant}/; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const encodePath = (rel) => rel.split('/').map(encodeURIComponent).join('/')
const text = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

export function makeViews({ cfg, db, keys, auth, membership, workspaces }) {
  const grants = new Map() // grant -> { sess, personId, slug, wsId, scope, at, last }
  const lines = new Map() // slug -> { n, waiting: [] }

  function mint(sess, ws, rel) {
    const mine = [...grants].filter(([, g]) => g.personId === sess.personId)
    if (mine.length >= PER_PERSON) grants.delete(mine[0][0])
    if (grants.size >= TOTAL) grants.delete(grants.keys().next().value)
    const grant = randomBytes(32).toString('base64url')
    const scope = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : ''
    grants.set(grant, { sess, personId: sess.personId, slug: ws.slug, wsId: ws.id, scope, at: Date.now(), last: Date.now() })
    return grant
  }
  /** The grant's workspace if it is still good: in time, its session valid, its person a member. */
  function live(grant) {
    const g = grants.get(grant)
    if (!g) return null
    const now = Date.now()
    if (now - g.at > ABSOLUTE_MS || now - g.last > IDLE_MS || !auth.stillValid(g.sess) || !membership(g.personId, g.slug)) {
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

  return {
    /** GET /api/open?w=<slug>&path=<rel>: a signed-in member opens a page; answers the wrapper. */
    async open(req, res, sess, url) {
      const ws = membership(sess.personId, url.searchParams.get('w'))
      const rel = url.searchParams.get('path') ?? ''
      if (!ws || !isPage(rel) || !workspaces.validRel(rel) || rel.split('/').some((x) => x.startsWith('.'))) return text(res, 404, 'That page is not here, or it is not yours to open.')
      await workspaces.ensureRunning(ws.slug)
      const grant = mint(sess, ws, rel)
      audit(db, { actor: sess.personId, action: 'page_opened', workspace: ws.id, nameRef: nameRef(keys, ws.id, rel) })
      const name = rel.split('/').pop()
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
      if (!DESTS.has(dest)) return text(res, 403, 'Open this page from the project, with its Open button.')
      let rel
      try {
        rel = m[2].split('/').map(decodeURIComponent).join('/')
      } catch {
        return text(res, 404, 'That file is not here.')
      }
      if (!workspaces.validRel(rel) || rel.split('/').some((x) => x.startsWith('.')) || !rel.startsWith(g.scope)) return text(res, 404, 'That file is not here.')
      const done = await turn(g.slug)
      if (!done) return text(res, 503, 'Ola’s computer is busy. Reload the page in a moment.')
      const busy = workspaces.holdBusy(g.slug)
      const gone = new AbortController()
      res.on('close', () => gone.abort())
      try {
        await workspaces.ensureRunning(g.slug)
        const f = await workspaces.getStream(g.slug, rel, { signal: gone.signal })
        if (!f) return res.destroyed ? undefined : text(res, 404, 'That file is not here.')
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
        try {
          for await (const c of f.stream) {
            if (!res.write(c)) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
            if (res.destroyed) break
          }
          res.end()
        } catch {
          res.destroy()
        } finally {
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
