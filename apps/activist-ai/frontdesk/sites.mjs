// Publish: a page Ola made, put on the public web at https://sites.ola.cx/<project>/ (OLA-209).
//
// Bart (2026-11-19): "users will want to publish stuff, 'for real'. so we should help with that",
// and for the cloud runtime "do something like sites.ola.cx/myproject - so ONE new subdomain then
// everyone gets a folder name there."
//
// Where the pages are served, and why (README, "Publish"):
//   - Not on the Ola machine and not through its tunnel: a separate Vercel project (`ola-sites`,
//     static files only, no functions, no build), deployed by this front desk through Vercel's
//     deploy API. The machine is never the server of a public page, so a busy or hostile public
//     page costs it nothing, and taking the machine down does not take the pages down.
//   - The deploy credential is a token scoped to that ONE Vercel project, in an env file on the
//     machine (~/.ola/sites.env, 600). It is read from the file at each deploy and kept in no
//     environment variable, so no child process (no `container exec`, no VM) inherits it; it is
//     never logged or sent anywhere but api.vercel.com.
//   - The files leave the sealed VM the way downloads do (ola-get, through the front desk): the VM
//     has no network and is never given a way to publish. Only the files the owner saw in the
//     list leave, and only after a check for secrets and private data (below).
//   - Every page there is served with a CSP `sandbox` (no allow-same-origin): each page runs with
//     an opaque origin, so it has no cookies and no storage, cannot register a service worker,
//     and cannot reach into another project's pages. app.ola.cx's sign-in cookies are host-only
//     `__Host-` cookies, never sent to sites.ola.cx and impossible for it to overwrite.
//
// What one shared origin still means (said plainly in the README and the sheet): every project's
// pages are under the same address, https://sites.ola.cx, so in the browser's terms they share an
// origin. Nothing published may hold a secret; a page can link to, frame or fetch another
// project's public files like any other site can.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'

const posix = path.posix

/**
 * One GET the way a reader's browser makes it: a new connection (no reused socket, so the host's
 * load balancer may hand it to another edge server) and no request headers asking a cache to skip
 * itself (fetch's `cache: 'no-store'` sends `Cache-Control: no-cache`, which a reader never does).
 * Follows up to 5 redirects. Returns { status, ok, body }.
 */
/**
 * The host's bot check answered instead of the page (OLA-230, Nov 23: after many reads from the
 * mini, Vercel's "Security Checkpoint" answered 403 to every read for about ten minutes, and Ola
 * told the person a live page was not up). Such an answer says nothing about the page.
 */
export function isChallenge(status, headers = {}, body = Buffer.alloc(0)) {
  if (status !== 403 && status !== 429) return false
  if (/challenge|deny|rate/i.test(String(headers['x-vercel-mitigated'] ?? ''))) return true
  return /Vercel Security Checkpoint/i.test(body.subarray(0, 64 * 1024).toString('utf8'))
}

export function readAsReader(url, hops = 5) {
  const u = new URL(url)
  const mod = u.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.get(u, { agent: false, headers: { 'user-agent': 'Mozilla/5.0 (ola publish check)', accept: 'text/html,*/*' }, timeout: 15_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops > 0) {
        res.resume()
        return resolve(readAsReader(new URL(res.headers.location, u), hops - 1))
      }
      const parts = []
      res.on('data', (c) => parts.push(c))
      res.on('end', () => {
        const body = Buffer.concat(parts)
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body, challenged: isChallenge(res.statusCode, res.headers, body) })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'TimeoutError' })))
    req.on('error', reject)
  })
}

export function sitesConfig(env = process.env) {
  const origin = new URL(env.OLA_FD_SITES_ORIGIN ?? 'https://sites.ola.cx').origin
  return {
    origin,
    api: (env.OLA_FD_SITES_API ?? 'https://api.vercel.com').replace(/\/$/, ''),
    // KEY=VALUE lines: OLA_SITES_VERCEL_TOKEN (scoped to the one project), OLA_SITES_PROJECT
    // (default ola-sites), OLA_SITES_TEAM_ID (only for a token that is not project-scoped).
    file: env.OLA_FD_SITES_FILE ?? path.join(os.homedir(), '.ola', 'sites.env'),
    maxFiles: Number(env.OLA_FD_SITES_MAX_FILES) || 300,
    maxFile: (Number(env.OLA_FD_SITES_MAX_FILE_MB) || 20) * 1024 * 1024,
    maxTotal: (Number(env.OLA_FD_SITES_MAX_TOTAL_MB) || 50) * 1024 * 1024,
    readyMs: Number(env.OLA_FD_SITES_READY_MS) || 180_000,
    verifyMs: Number(env.OLA_FD_SITES_VERIFY_MS) || 90_000,
    // A push is built by the host before it is served: a minute or two, longer when it is busy.
    gitVerifyMs: Number(env.OLA_FD_SITES_GIT_VERIFY_MS) || 300_000,
    // After a deploy the host's edge servers switch over seconds apart, and one keeps answering with
    // the old page while its neighbours have the new one (seen 2026-11-20: the front desk saw the new
    // page, curl a second later the old answer; OLA-302: the check saw one fresh copy, a reader got
    // the old page three times over the next 12 s, a cache HIT). So the page counts as live only
    // when every read for this long, and at least `settleReads` reads in a row, each on a new
    // connection (a reader's own, so another edge server can answer), show it; one old answer starts
    // the count again.
    gitSettleMs: Number(env.OLA_FD_SITES_GIT_SETTLE_MS) || 20_000,
    settleMs: Number(env.OLA_FD_SITES_SETTLE_MS) || 15_000,
    settleReads: Number(env.OLA_FD_SITES_SETTLE_READS) || 8,
    pollMs: Number(env.OLA_FD_SITES_POLL_MS) || 1500,
    // After the host's bot check answers instead of the page, the next read waits this long.
    challengeMs: Number(env.OLA_FD_SITES_CHALLENGE_MS) || 10_000,
  }
}

/** The one line shown in the Publish sheet (and the README). */
export const ACCEPTABLE_USE = 'Publish only what your group may share with everyone: nothing about a person they have not agreed to make public, nothing unlawful, nothing meant to deceive. Ola’s team takes down pages that break this.'

/** The headers every published file is served with (vercel.json, written at each deploy). */
export const SITE_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')
export const SITE_HEADERS = [
  { key: 'Content-Security-Policy', value: SITE_CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  // A sandboxed page has an opaque origin, so its own fonts and fetches are cross-origin to it.
  // Everything here is public anyway.
  { key: 'Access-Control-Allow-Origin', value: '*' },
]

// ---------------------------------------------------------------- what may not leave
// Names that hold secrets or private data, wherever they are.
const SECRET_NAME = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.env|env|\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.htpasswd|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.json)?|[^/]*\.(pem|key|p8|p12|pfx|jks|keystore|kdbx|ovpn|gpg|asc))$/i
const SECRET_DIR = /(^|\/)\.(git|ssh|aws|gnupg|config|opencode|claude|ola)(\/|$)/
const DATA_NAME = /\.(db|sqlite|sqlite3|db3|mdb|accdb)(-wal|-shm|-journal)?$/i
// Contents that are keys or passwords (never echoed back: the refusal names the file and the kind).
const SECRET_PATTERNS = [
  [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, 'a private key'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic API key'],
  [/\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/, 'an API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an Amazon key'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/, 'a GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\b[sr]k_live_[0-9A-Za-z]{20,}/, 'a Stripe key'],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, 'a SendGrid key'],
  [/\b(?:vcp|vck|vca)_[A-Za-z0-9]{24,}/, 'a Vercel token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a sign-in token'],
  [/^(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASS)[A-Z0-9_]*\s*=\s*\S{8,}/m, 'a password or key'],
  [/["']?\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|passw(?:or)?d|access[_-]?token|auth[_-]?token|private[_-]?key)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i, 'a password or key'],
]

// The kinds of file a published site may hold: what a browser shows or a page uses (pages, styles,
// scripts, pictures, fonts, sound, video, PDF, plain text and data). Anything else (a Word file, a
// spreadsheet, an archive, a program) is left out of a folder, and a page that uses one is told so:
// the host serves static files only, and a document the group keeps is not a web page.
export const STATIC_TYPE = /\.(html?|css|m?js|json|map|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|m4v|webm|ogv|mov|vtt|pdf|txt|md|csv|tsv|xml|webmanifest|wasm|glb|gltf)$/i

/** Why a file may not be published, in a few words, or null. `secrets`: the workspace's own. */
export function secretIn(rel, buf, secrets = []) {
  if (SECRET_NAME.test(rel) || SECRET_DIR.test(rel)) return 'its name says it holds passwords or keys'
  if (DATA_NAME.test(rel) || /^project\.db/.test(rel)) return 'it is a database, and the project’s data stays private'
  if (!buf) return null
  if (buf.subarray(0, 16).toString('latin1') === 'SQLite format 3\0') return 'it is a database, and the project’s data stays private'
  const text = buf.toString('latin1')
  for (const s of secrets) if (s && text.includes(s)) return 'it holds one of this project’s own keys'
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return `it seems to hold ${what}`
  return null
}

// ---------------------------------------------------------------- what a page uses
const ATTR = /\b(src|href|poster|data|srcset|imagesrcset|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi
const JS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g

/**
 * The references in a page, a stylesheet or a script: [{ ref, use }] where use is 'link' (an
 * <a href>: another page, fine to leave out or point elsewhere) or 'load' (something the page
 * itself loads: a picture, a script, a stylesheet, a font).
 */
export function referencesIn(rel, text) {
  const out = []
  if (/\.(html?|svg)$/i.test(rel)) {
    for (const t of text.matchAll(TAG)) {
      const tag = t[1].toLowerCase()
      for (const a of t[2].matchAll(ATTR)) {
        const name = a[1].toLowerCase()
        const v = a[2] ?? a[3] ?? a[4] ?? ''
        if (name === 'srcset' || name === 'imagesrcset') {
          for (const part of v.split(',')) out.push({ ref: part.trim().split(/\s+/)[0], use: 'load' })
        } else out.push({ ref: v, use: name === 'href' && (tag === 'a' || tag === 'area') ? 'link' : 'load' })
      }
    }
    for (const s of text.matchAll(/style\s*=\s*"([^"]*)"|<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push(...referencesIn('x.css', s[1] ?? s[2] ?? ''))
    for (const s of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) out.push(...referencesIn('x.js', s[1] ?? ''))
  } else if (/\.css$/i.test(rel)) {
    for (const m of text.matchAll(CSS_URL)) out.push({ ref: m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '', use: 'load' })
  } else if (/\.m?js$/i.test(rel)) {
    for (const m of text.matchAll(JS_IMPORT)) out.push({ ref: m[1], use: 'load' })
  }
  return out.filter((r) => r.ref)
}

/** One reference, from a file in `dir`, as a path in the project: { kind: 'local'|'outside'|'absolute'|'external'|'skip', path? }. */
export function resolveRef(dir, ref) {
  const r = ref.trim().replace(/[#?].*$/, '')
  if (!r || /^(data|mailto|tel|javascript|blob|about|sms):/i.test(ref.trim()) || ref.trim().startsWith('#')) return { kind: 'skip' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith('//')) {
    let host = ''
    try {
      host = new URL(r.startsWith('//') ? `https:${r}` : r).hostname
    } catch {}
    return { kind: 'external', host }
  }
  if (r.startsWith('/')) return { kind: 'absolute', ref: r }
  let dec = r
  try {
    dec = decodeURIComponent(r)
  } catch {}
  let p = posix.normalize(posix.join(dir || '.', dec))
  if (dec.endsWith('/')) p = posix.join(p, 'index.html')
  if (p === '..' || p.startsWith('../')) return { kind: 'outside', ref: r }
  return { kind: 'local', path: p.replace(/^\.\//, '') }
}

const sha1 = (b) => createHash('sha1').update(b).digest('hex')
const parse = (text) => Object.fromEntries(String(text).split('\n').map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]))

const ROOT_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pages made with Ola</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f6f1e7;color:#1d1a16;font:18px/1.5 Georgia,serif;padding:24px;box-sizing:border-box}main{max-width:32em}a{color:#1d1a16}</style>
</head><body><main><h1>Pages made with Ola</h1><p>Groups who work with Ola publish their pages here, each at its own address. This page lists none of them.</p><p><a href="https://ola.cx">What Ola is</a></p></main></body></html>
`
const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not here</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f6f1e7;color:#1d1a16;font:18px/1.5 Georgia,serif;padding:24px;box-sizing:border-box}main{max-width:32em}</style>
</head><body><main><h1>Nothing is published at this address</h1><p>It may have been taken down by the group that published it.</p></main></body></html>
`
// Compact, as JSON.stringify writes it (a tool that re-serializes JSON on the way, as the Vercel CLI's
// `api --input` does for sites-live.mjs, then sends the very same bytes).
export const vercelJson = () => JSON.stringify({ trailingSlash: true, headers: [{ source: '/(.*)', headers: SITE_HEADERS }] })

/**
 * What Publish reads, for a plain folder on this computer (the dev server and the tests; the front
 * desk reads a workspace through its VM instead, server.mjs siteCtx). Lists hidden files too.
 */
export function folderCtx(slug, root, { uploaded = () => false, secrets = () => [] } = {}) {
  const walk = (d, pre = '') =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const rel = pre ? `${pre}/${e.name}` : e.name
      if (e.isSymbolicLink()) return [{ path: rel, type: 'link', size: 0 }]
      if (e.isDirectory()) return walk(path.join(d, e.name), rel)
      if (!e.isFile()) return [{ path: rel, type: 'other', size: 0 }]
      // mtime and sha256 as the VM's ola-files reports them (the old-copy check reads both).
      const f = path.join(d, e.name)
      const st = fs.statSync(f)
      return [{ path: rel, type: 'file', size: st.size, mtime: Math.floor(st.mtimeMs / 1000), sha256: createHash('sha256').update(fs.readFileSync(f)).digest('hex') }]
    })
  return {
    slug,
    list: async () => walk(root),
    async read(rel, max) {
      const f = path.join(root, rel)
      if (!f.startsWith(root + path.sep)) return null
      try {
        const st = fs.lstatSync(f)
        return st.isFile() && st.size <= max ? fs.readFileSync(f) : null
      } catch {
        return null
      }
    },
    uploaded,
    secrets,
  }
}

// ---------------------------------------------------------------- a Mac's site (OLA-223)
// Bart (2026-11-19): "when i'm on the local computer, there's no reason it shouldn't be able to
// publish to the ola server if the user asks for it". A signed-in Mac (the app or `ola`, its device
// pass) sends a folder's files to /api/device/sites/* (server.mjs deviceSites); they go through the
// very same prepare() as a cloud project's folder, so every rule above holds for them too.

/** A site's name, the folder under sites.ola.cx: what a project's slug may be. */
export const SITE_NAME = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/
/** Names nobody publishes under: Ola's own words, the host's (`api` is Vercel's functions folder). */
export const RESERVED_NAMES = new Set(['api', 'www', 'ola', 'app', 'admin', 'sites', 'site', 'help', 'support', 'login', 'signin', 'sign-in', 'account', 'security', 'official', 'status', 'static', 'assets', 'public', 'vercel', 'index', 'abuse', 'report'])
/** The largest listing a Mac may send (names only for what is not sent: hidden files, working folders). */
export const MAX_LISTED = 5000

/**
 * What Publish reads, for files a Mac sent: `folder` (a plain name, the folder's own) holds them, so
 * prepare() sees exactly what it sees in a cloud project's folder. `files`: [{ path, size, data? }],
 * `data` a Buffer for the files sent, none for the ones only named (hidden files and the like, whose
 * bytes never leave the Mac; a secret-looking name among them still refuses the whole folder), and
 * `link: true` for a symbolic link (named, never followed: left out, as in a project).
 */
export function sentCtx(name, folder, files) {
  const byPath = new Map(files.map((f) => [`${folder}/${f.path}`, f]))
  return {
    slug: name,
    list: async () => [...byPath].map(([p, f]) => ({ path: p, type: f.link ? 'link' : 'file', size: f.size })),
    async read(rel, max) {
      const f = byPath.get(rel)
      return f?.data && !f.link && f.data.length === f.size && f.size <= max ? f.data : null
    },
    uploaded: () => false,
    secrets: () => [],
  }
}

/**
 * The body a Mac sends, checked: { name, folder, files: [{ path, size, data? }] } with `data` as
 * base64. Returns { ok: { name, folder, files } } or { refused: { status, body } }. `maxTotal`: the
 * most bytes one publish takes (what was sent, before prepare() looks at any of it).
 */
export function readSent(body, { maxTotal, maxFile }) {
  const no = (status, message, error = 'bad_request') => ({ refused: { status, body: { error, message } } })
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : ''
  if (!SITE_NAME.test(name) || name.includes('--')) return no(400, 'A site name is 3 to 32 lowercase letters, digits and single dashes, starting and ending with a letter or digit (for example tenants-flyer).', 'bad_name')
  const folder = typeof body.folder === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,60}$/.test(body.folder) && !body.folder.includes('..') ? body.folder : 'site'
  if (!Array.isArray(body.files) || !body.files.length) return no(400, 'Choose a folder with an index.html to publish.')
  if (body.files.length > MAX_LISTED) return no(413, `That folder holds more than ${MAX_LISTED} files. Publish a smaller folder (the site alone).`, 'too_many')
  const seen = new Set()
  const files = []
  let total = 0
  for (const f of body.files) {
    const p = f?.path
    if (typeof p !== 'string' || !p || p.length > 1300 || p.startsWith('/') || /[\\\0]/.test(p) || p.split('/').some((x) => !x || x === '.' || x === '..') || seen.has(p)) return no(400, 'The list of files was not one Ola can read. Nothing was published.')
    if (!Number.isSafeInteger(f.size) || f.size < 0) return no(400, 'The list of files was not one Ola can read. Nothing was published.')
    seen.add(p)
    let data
    if (f.data !== undefined) {
      if (typeof f.data !== 'string' || f.size > maxFile) return no(413, `${p} is larger than one published file can be (${Math.round(maxFile / 1024 / 1024)} MB).`, 'too_large')
      data = Buffer.from(f.data, 'base64')
      if (data.length !== f.size) return no(400, `${p} did not arrive whole. Nothing was published; try again.`)
      total += data.length
      if (total > maxTotal) return no(413, `Together these files are more than ${Math.round(maxTotal / 1024 / 1024)} MB, the most one publish takes.`, 'too_large')
    }
    if (f.link === true && data) return no(400, 'The list of files was not one Ola can read. Nothing was published.')
    files.push({ path: p, size: f.size, data, link: f.link === true })
  }
  return { ok: { name, folder, files } }
}

/**
 * Who a site name belongs to (migration 17, site_names): a name is the person's who first published
 * there, and stays theirs after they take the site down, so nobody else can pick up its old links. A
 * name that is a project's slug (any project, open or closed), or that a project published under,
 * is that project's address and never a person's. An admin's takedown holds the name: nobody
 * publishes there again until `admin.mjs site-release <name>`.
 */
export function makeSiteNames(db, sites) {
  const row = (name) => db.prepare('SELECT s.name, s.person_id, s.created_at, s.taken_down_at, p.handle FROM site_names s JOIN people p ON p.id = s.person_id WHERE s.name = ?').get(name)
  const isProject = (name) => !!db.prepare('SELECT 1 FROM workspaces WHERE slug = ?').get(name)
  const taken = (name) => ({ status: 409, body: { error: 'taken', message: `sites.ola.cx/${name}/ belongs to someone else. Choose another name for this site.` } })
  return {
    row,
    /** Whether `personId` may publish under `name` now: null, or the refusal. */
    problem(name, personId) {
      if (RESERVED_NAMES.has(name)) return { status: 409, body: { error: 'taken', message: `“${name}” is kept for Ola itself. Choose another name for this site.` } }
      const r = row(name)
      if (r && r.person_id !== personId) return taken(name)
      if (r?.taken_down_at) return { status: 403, body: { error: 'taken_down', message: `Ola’s team took sites.ola.cx/${name}/ down, so it cannot be published again. If you think that is a mistake, write to Ola’s team.` } }
      if (!r && (isProject(name) || sites.status(name))) return taken(name)
      return null
    },
    /** Takes the name for `personId` (after problem() said yes, with no await between). True if new. */
    claim(name, personId) {
      return db.prepare('INSERT OR IGNORE INTO site_names (name, person_id, created_at) VALUES (?, ?, ?)').run(name, personId, Date.now()).changes === 1
    },
    /** A failed first publish gives the name back. */
    release(name, personId) {
      db.prepare('DELETE FROM site_names WHERE name = ? AND person_id = ? AND taken_down_at IS NULL').run(name, personId)
    },
    /** A cloud project's slug a person's site already holds (the cloud route refuses it). */
    heldByPerson: (slug) => !!row(slug),
    mine: (personId) => db.prepare('SELECT name, created_at, taken_down_at FROM site_names WHERE person_id = ? ORDER BY name').all(personId),
    /** The admin's takedown: the name stays held. */
    hold: (name) => db.prepare('UPDATE site_names SET taken_down_at = ? WHERE name = ?').run(Date.now(), name).changes === 1,
    /** `admin.mjs site-release`: the hold lifted (`free`: the name given up altogether). */
    unhold: (name, { free = false } = {}) => (free ? db.prepare('DELETE FROM site_names WHERE name = ?').run(name) : db.prepare('UPDATE site_names SET taken_down_at = NULL WHERE name = ?').run(name)).changes === 1,
  }
}

// ---------------------------------------------------------------- an old copy (OLA-267)
// A site folder (site/) is a COPY of a page, made by the publish skill's `prepare`. It does not
// change when the page does. Nov 20: in a project that had published Bart, Oak and Cedar, a new
// conversation changed /work/index.html to Bart and published site/ as it was (Cedar); the address
// showed Cedar and Ola said "it's live". So a publish from the conversation checks the copy first:
//   - `prepare` leaves <folder>/.ola-source.json: the page it was made from and the sha256 of every
//     file it copied. A source that changed since means the copy is old.
//   - Whatever the record says, a page outside the folder changed after the folder was last written
//     means the folder may not be the page just made (the new page in a subfolder, an old site/).
export const SOURCE_RECORD = '.ola-source.json'
const visibleHtml = (p) => /\.html?$/i.test(p) && !p.split('/').some((x) => x.startsWith('.') || x === 'node_modules' || x === '__pycache__')
const prepareLine = (page, f) => `python3 /opt/ola/skills/publish/scripts/publish.py prepare ${page} --out ${f}`
/** Why folder `f` is an old copy, as the sentence the agent gets, or null. */
export async function staleness(ctx, entries, byPath, f, inside) {
  let rec = null
  if (byPath.get(`${f}/${SOURCE_RECORD}`)?.type === 'file') {
    try {
      rec = JSON.parse(String(await ctx.read(`${f}/${SOURCE_RECORD}`, 512 * 1024)))
    } catch {}
    if (!rec || typeof rec.page !== 'string' || !rec.sources || typeof rec.sources !== 'object') rec = null
  }
  if (rec) {
    const changed = Object.entries(rec.sources).filter(([p, sha]) => {
      const e = byPath.get(p)
      return !e || e.type !== 'file' || (typeof e.sha256 === 'string' && e.sha256 !== sha)
    })
    if (changed.length) {
      const names = changed.map(([p]) => p).slice(0, 4).join(', ')
      return `${f}/ is an old copy: it was made from ${rec.page}, and ${names} changed after, so it would publish the earlier page. Nothing was published. Make the copy again from the page the person asked for (${prepareLine(rec.page, f)}), then check ${f} and run ola-publish with the list it prints.`
    }
  }
  const newest = Math.max(0, ...inside.map((e) => e.mtime ?? 0))
  const mine = new Set(Object.keys(rec?.sources ?? {}))
  const later = entries.filter((e) => e.type === 'file' && !e.path.startsWith(`${f}/`) && visibleHtml(e.path) && !mine.has(e.path) && Number.isFinite(e.mtime) && e.mtime > newest)
  if (later.length) {
    const p = later.sort((a, b) => b.mtime - a.mtime)[0].path
    return `${p} changed after ${f}/ was made, so ${f}/ may be an earlier page and not the one just made. Nothing was published. Make ${f}/ from the page the person asked for (${prepareLine(p, f)}, or the page they meant), then check ${f} and run ola-publish with the list it prints.`
  }
  return null
}

/** What a page says, in a few words (its title and first heading), for Ola's answer to quote. */
export function wordsOf(buf) {
  const t = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf ?? '')
  const clean = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(t)?.[1] ?? '')
  const h = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t)?.[1] ?? '')
  const body = clean((/<body[^>]*>([\s\S]*)/i.exec(t)?.[1] ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '))
  const parts = [...new Set([title, h].filter(Boolean))]
  return (parts.length ? parts.join(' · ') : body).slice(0, 140)
}

// ---------------------------------------------------------------- the module
/** `request`: how calls reach the deploy API (fetch by default; sites-live.mjs goes through the Vercel CLI). */
export function makeSites({ cfg = sitesConfig(), dataDir, log = () => {}, request = fetch }) {
  const dir = path.join(dataDir, 'sites')
  const blobs = path.join(dir, 'blobs')
  const mk = () => (fs.mkdirSync(blobs, { recursive: true, mode: 0o700 }), fs.chmodSync(dir, 0o700))
  const manifestFile = (slug) => path.join(dir, `${slug}.json`)
  const stateFile = path.join(dir, 'state.json')

  // Two ways to reach the host, whichever the file names (a token wins when both are there):
  //   - OLA_SITES_VERCEL_TOKEN: Vercel's deploy API, below (deployAll).
  //   - OLA_SITES_GIT_REMOTE (+ OLA_SITES_GIT_KEY, the path of an ssh deploy key with write access to
  //     that one repository; OLA_SITES_GIT_BRANCH, default main): the whole site is written into a
  //     local clone and pushed, and the Vercel project deploys that repository on push (gitDeployAll).
  //     OLA-223, 2026-11-20: Vercel would not mint a token for this account, so the front desk
  //     holds a GitHub deploy key for bdecrem/ola-sites instead.
  function cred() {
    let c
    try {
      c = parse(fs.readFileSync(cfg.file, 'utf8'))
    } catch {
      return null
    }
    if (c.OLA_SITES_VERCEL_TOKEN) return { token: c.OLA_SITES_VERCEL_TOKEN, project: c.OLA_SITES_PROJECT || 'ola-sites', team: c.OLA_SITES_TEAM_ID || null }
    if (c.OLA_SITES_GIT_REMOTE) {
      return {
        git: {
          remote: c.OLA_SITES_GIT_REMOTE,
          key: c.OLA_SITES_GIT_KEY || null,
          branch: c.OLA_SITES_GIT_BRANCH || 'main',
          // The commit's author: a Vercel team deploys a private repository's commits only from
          // its own members, so this is the account owner's address.
          author: c.OLA_SITES_GIT_AUTHOR || 'Ola front desk',
          email: c.OLA_SITES_GIT_EMAIL || 'sites@ola.cx',
        },
      }
    }
    return null
  }
  const readJson = (f) => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'))
    } catch {
      return null
    }
  }
  const writeJson = (f, v) => {
    mk()
    const tmp = `${f}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(v, null, 1), { mode: 0o600 })
    fs.renameSync(tmp, f)
  }
  const manifests = () => {
    if (!fs.existsSync(dir)) return {}
    const out = {}
    for (const f of fs.readdirSync(dir)) {
      const m = /^([a-z0-9][a-z0-9-]{1,30}[a-z0-9])\.json$/.exec(f)
      if (m) {
        const v = readJson(path.join(dir, f))
        if (v?.files) out[m[1]] = v
      }
    }
    return out
  }
  const urlOf = (slug, page = 'index.html') => `${cfg.origin}/${slug}/${page === 'index.html' ? '' : page.split('/').map(encodeURIComponent).join('/')}`

  // One deploy at a time: in this process (a chain) and across processes (the admin CLI) by a lock
  // file. A lock older than ten minutes is a crashed holder's.
  let chain = Promise.resolve()
  const serial = (fn) => {
    const run = chain.then(async () => {
      mk()
      const lock = path.join(dir, 'deploy.lock')
      const until = Date.now() + 5 * 60_000
      for (;;) {
        try {
          fs.closeSync(fs.openSync(lock, 'wx', 0o600))
          break
        } catch {
          try {
            if (Date.now() - fs.statSync(lock).mtimeMs > 10 * 60_000) fs.rmSync(lock, { force: true })
          } catch {}
          if (Date.now() > until) throw Object.assign(new Error('another publish is under way'), { code: 'BUSY' })
          await new Promise((r) => setTimeout(r, 250))
        }
      }
      try {
        return await fn()
      } finally {
        fs.rmSync(lock, { force: true })
      }
    })
    chain = run.catch(() => {})
    return run
  }

  // ------------------------------------------------ Vercel's deploy API
  async function api(c, method, pathname, { body, headers = {}, ok = [200] } = {}) {
    const u = new URL(cfg.api + pathname)
    if (c.team) u.searchParams.set('teamId', c.team)
    const r = await request(u, { method, headers: { authorization: `Bearer ${c.token}`, ...headers }, body, signal: AbortSignal.timeout(60_000) })
    const j = await r.json().catch(() => null)
    if (!ok.includes(r.status)) throw Object.assign(new Error(`host ${method} ${u.pathname} ${r.status} ${String(j?.error?.code ?? '').slice(0, 40)}`), { code: 'HOST', status: r.status, body: j })
    return j
  }
  const upload = (c, buf, sha) => api(c, 'POST', '/v2/files', { body: buf, headers: { 'content-type': 'application/octet-stream', 'x-vercel-digest': sha, 'content-length': String(buf.length) } })
  const blobPut = (sha, buf) => {
    mk()
    const f = path.join(blobs, sha)
    if (!fs.existsSync(f)) fs.writeFileSync(f, buf, { mode: 0o600 })
  }

  /** Deploys every project's manifest as one site, waits for it, removes the one before. */
  async function deployAll(c, all) {
    const files = []
    for (const [slug, m] of Object.entries(all)) for (const f of m.files) files.push({ file: `${slug}/${f.as}`, sha: f.sha, size: f.size })
    for (const [name, text] of [['index.html', ROOT_PAGE], ['404.html', NOT_FOUND_PAGE], ['vercel.json', vercelJson()]]) {
      const buf = Buffer.from(text)
      const sha = sha1(buf)
      await upload(c, buf, sha)
      files.push({ file: name, sha, size: buf.length })
    }
    const body = JSON.stringify({ name: c.project, project: c.project, target: 'production', files, projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: null } })
    let d
    for (let i = 0; i < 2; i++) {
      try {
        d = await api(c, 'POST', '/v13/deployments?skipAutoDetectionConfirmation=1', { body, headers: { 'content-type': 'application/json' } })
        break
      } catch (e) {
        // The host no longer has some bytes (it forgets files no deployment uses): send them again
        // from our copy, once.
        const missing = e.body?.error?.code === 'missing_files' ? e.body.error.missing ?? [] : null
        if (!missing || i) throw e
        for (const sha of missing) {
          const f = path.join(blobs, String(sha).replace(/[^0-9a-f]/g, ''))
          if (!fs.existsSync(f)) throw e
          await upload(c, fs.readFileSync(f), sha)
        }
      }
    }
    const until = Date.now() + cfg.readyMs
    let state = d.readyState
    while (state !== 'READY') {
      if (['ERROR', 'CANCELED'].includes(state) || Date.now() > until) throw Object.assign(new Error(`deployment ${state}`), { code: 'HOST' })
      await new Promise((r) => setTimeout(r, cfg.pollMs))
      state = (await api(c, 'GET', `/v13/deployments/${encodeURIComponent(d.id)}`)).readyState
    }
    // The deployment before this one held what was just taken down or replaced: it goes too, so an
    // unpublished page is not kept at a deployment address either.
    const before = readJson(stateFile)?.deployment
    writeJson(stateFile, { deployment: d.id, at: new Date().toISOString() })
    if (before && before !== d.id) await api(c, 'DELETE', `/v13/deployments/${encodeURIComponent(before)}`, { ok: [200, 404] }).catch((e) => log(`sites: the earlier deployment was not removed (${e.status ?? e.code})`))
    return d.id
  }
  // ------------------------------------------------ a git repository the host deploys on push
  // The repository is a copy made from the manifests, never a source: every deploy writes the whole
  // site (every project's files from our blobs, the root page, the 404 page, vercel.json) as ONE
  // commit with no parent and force-pushes it, so an unpublished page is in no commit the
  // repository keeps (the same rule as deleting the deployment before, above). git runs with a
  // short, fixed environment: the front desk's own variables reach no git or ssh process.
  const repoDir = path.join(dir, 'repo')
  function git(g, args, { cwd = repoDir } = {}) {
    const ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=20']
    if (g.key) ssh.push('-o', 'IdentitiesOnly=yes', '-i', `'${g.key.replace(/'/g, '')}'`)
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: os.homedir(), GIT_SSH_COMMAND: ssh.join(' '), GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', LANG: 'C' }
    return new Promise((resolve, reject) => {
      execFile('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'commit.gpgsign=false', ...args], { cwd, env, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        // stderr is never logged whole: only its last line, cut short (it holds no secret, but a
        // remote's message is not ours to repeat at length).
        if (err) reject(Object.assign(new Error(`git ${args[0]} failed: ${String(stderr).trim().split('\n').pop()?.slice(0, 160) ?? ''}`), { code: 'HOST' }))
        else resolve(String(stdout))
      })
    })
  }
  async function gitDeployAll(g, all) {
    mk()
    if (!fs.existsSync(path.join(repoDir, '.git'))) {
      fs.rmSync(repoDir, { recursive: true, force: true })
      fs.mkdirSync(repoDir, { mode: 0o700 })
      await git(g, ['init', '-q'])
    }
    await git(g, ['remote', 'remove', 'origin']).catch(() => {})
    await git(g, ['remote', 'add', 'origin', g.remote])
    // The tree, written from scratch.
    for (const e of fs.readdirSync(repoDir)) if (e !== '.git') fs.rmSync(path.join(repoDir, e), { recursive: true, force: true })
    const put = (rel, buf) => {
      const f = path.join(repoDir, rel)
      if (!f.startsWith(repoDir + path.sep)) throw Object.assign(new Error('a path outside the site'), { code: 'HOST' })
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, buf)
    }
    for (const [slug, m] of Object.entries(all)) {
      for (const f of m.files) {
        const b = path.join(blobs, f.sha)
        if (!fs.existsSync(b)) throw Object.assign(new Error(`no copy of a file of ${slug}`), { code: 'HOST' })
        put(`${slug}/${f.as}`, fs.readFileSync(b))
      }
    }
    for (const [name, text] of [['index.html', ROOT_PAGE], ['404.html', NOT_FOUND_PAGE], ['vercel.json', vercelJson()]]) put(name, Buffer.from(text))
    const tmpBranch = `deploy-${process.pid}-${Date.now()}`
    await git(g, ['checkout', '-q', '--orphan', tmpBranch])
    await git(g, ['add', '-A', '.'])
    const when = new Date().toISOString()
    await git(g, ['-c', `user.name=${g.author}`, '-c', `user.email=${g.email}`, 'commit', '-q', '--allow-empty', '-m', `sites: ${Object.keys(all).length} site(s), ${when}`])
    await git(g, ['branch', '-M', g.branch])
    await git(g, ['push', '-q', '--force', 'origin', `HEAD:refs/heads/${g.branch}`])
    const head = (await git(g, ['rev-parse', 'HEAD'])).trim()
    // Old commits are dropped here too.
    await git(g, ['reflog', 'expire', '--expire=now', '--all']).catch(() => {})
    await git(g, ['gc', '-q', '--prune=now']).catch(() => {})
    writeJson(stateFile, { commit: head, at: when })
    return head
  }
  const deploy = (c, all) => (c.git ? gitDeployAll(c.git, all) : deployAll(c, all))

  // The public address answers with what was published (or, after an unpublish, with 404).
  // `shows` is what the address said last (the old words while it still has them).
  async function verify(url, expect, ms = cfg.verifyMs, settleMs = cfg.settleMs) {
    const until = Date.now() + ms
    let last = ''
    let shows = ''
    let since = null
    let streak = 0
    let challenged = false
    while (Date.now() < until) {
      try {
        const r = await readAsReader(url)
        last = String(r.status)
        challenged = !!r.challenged
        if (challenged) {
          // Reading faster only keeps the host's bot check on: wait, and keep the last real words.
          since = null
          streak = 0
          await new Promise((res) => setTimeout(res, cfg.challengeMs))
          continue
        }
        shows = r.ok ? wordsOf(r.body) : ''
        if (expect === null ? r.status === 404 : r.ok && sha1(r.body) === expect) {
          since ??= Date.now()
          streak += 1
          if (Date.now() - since >= settleMs && streak >= cfg.settleReads) return { ok: true, shows }
        } else {
          since = null
          streak = 0
        }
      } catch (e) {
        last = e.code ?? e.name
        since = null
        streak = 0
      }
      await new Promise((r) => setTimeout(r, since === null ? cfg.pollMs : Math.max(cfg.pollMs, Math.min(2000, settleMs / cfg.settleReads))))
    }
    log(`sites: ${url} did not show the change yet (${last}${challenged ? ', the host’s bot check answered' : ''})`)
    return { ok: false, shows, challenged }
  }

  // ------------------------------------------------ what would leave
  /**
   * The plan for a page (`sel.page`, a .html file and what it uses, from its folder) or a folder
   * (`sel.folder`, everything in it): the files, their public paths, what was left out and why,
   * and the address. Reads every file (to find what a page uses, and to check it). Returns
   * { plan } or { refused: { status, body } }.
   */
  async function prepare(ctx, sel, opts = {}) {
    const no = (status, message, extra = {}) => ({ refused: { status, body: { error: extra.error ?? 'not_publishable', message, ...extra } } })
    const entries = await ctx.list()
    const byPath = new Map(entries.map((e) => [e.path, e]))
    const plain = (p) => typeof p === 'string' && p.length > 0 && p.length <= 1300 && !p.split('/').some((x) => !x || x.startsWith('.') || x === '..')
    let base
    let start = []
    const warnings = []
    const leftOut = []
    if (typeof sel?.page === 'string') {
      if (!plain(sel.page) || !/\.html?$/i.test(sel.page) || byPath.get(sel.page)?.type !== 'file') return no(404, 'That page is not in this project any more.', { error: 'not_found' })
      base = posix.dirname(sel.page) === '.' ? '' : posix.dirname(sel.page)
      start = [sel.page]
    } else if (typeof sel?.folder === 'string') {
      const f = sel.folder.replace(/\/+$/, '')
      if (!plain(f)) return no(400, 'Choose a folder inside the project. The whole project can’t be published at once: it holds your uploads too.')
      base = f
      const inside = entries.filter((e) => e.path.startsWith(`${f}/`))
      if (!inside.length) return no(404, 'That folder is empty, or not in this project any more.', { error: 'not_found' })
      for (const e of inside) {
        const rel = e.path.slice(f.length + 1)
        if (SECRET_NAME.test(e.path) || SECRET_DIR.test(e.path)) return no(422, `Ola will not publish ${f}/: ${rel} is in it, and ${rel.split('/').pop()} usually holds passwords or keys. Move it out of the folder (or ask Ola to), then try again.`, { error: 'secret' })
        if (e.type !== 'file') leftOut.push({ path: e.path, why: 'a link or something that is not a plain file' })
        else if (rel.split('/').some((x) => x.startsWith('.') || x === 'node_modules' || x === '__pycache__')) leftOut.push({ path: e.path, why: 'hidden, or a working folder' })
        // A database stays in the list, so it is refused below rather than quietly left out.
        else if (!STATIC_TYPE.test(e.path) && !secretIn(e.path, null)) leftOut.push({ path: e.path, why: 'not a kind of file a web page uses' })
        else start.push(e.path)
      }
      if (!start.some((p) => p === `${f}/index.html`)) return no(422, `${f}/ has no index.html, the page a visitor sees first. Publish one page instead, or ask Ola to name the first page index.html.`, { error: 'no_index' })
      if (opts.fresh) {
        const stale = await staleness(ctx, entries, byPath, f, inside)
        if (stale) return no(409, stale, { error: 'stale' })
      }
    } else return no(400, 'Choose a page or a folder to publish.')

    // The files, and (for a page) everything it uses, followed through stylesheets, scripts and
    // the other pages of its folder it links to.
    const chosen = new Map() // path -> Buffer
    const queue = [...start]
    const seen = new Set(queue)
    const warn = (key, text) => warnings.some((w) => w.key === key) || warnings.push({ key, text })
    let total = 0
    while (queue.length) {
      const p = queue.shift()
      const e = byPath.get(p)
      if (chosen.size >= cfg.maxFiles) return no(413, `That is more than ${cfg.maxFiles} files, the most one publish takes.`, { error: 'too_many' })
      if (e.size > cfg.maxFile) return no(413, `${p} is ${Math.ceil(e.size / 1024 / 1024)} MB; one published file can be ${Math.round(cfg.maxFile / 1024 / 1024)} MB at most.`, { error: 'too_large' })
      total += e.size
      if (total > cfg.maxTotal) return no(413, `Together these files are more than ${Math.round(cfg.maxTotal / 1024 / 1024)} MB, the most one publish takes.`, { error: 'too_large' })
      const named = secretIn(p, null)
      if (named) return no(422, `Ola will not publish ${p}: ${named}. Nothing was published.${p === sel.page ? '' : ' Ask Ola to take it out of the page, then try again.'}`, { error: 'secret', file: p })
      const buf = await ctx.read(p, cfg.maxFile)
      if (!buf) return no(409, `${p} could not be read from the project just now. Try again in a minute.`, { error: 'unreadable' })
      const why = secretIn(p, buf, ctx.secrets?.() ?? [])
      if (why) return no(422, `Ola will not publish this: ${p} ${why.replace(/^it /, '')}. Nothing was published. Take it out (or ask Ola to remove it from the page), then try again.`, { error: 'secret', file: p })
      chosen.set(p, buf)
      if (typeof sel.page !== 'string' || !/\.(html?|css|m?js|svg)$/i.test(p)) continue
      const from = posix.dirname(p) === '.' ? '' : posix.dirname(p)
      for (const r of referencesIn(p, buf.toString('utf8'))) {
        const x = resolveRef(from, r.ref)
        if (x.kind === 'external') {
          if (r.use === 'load') warn(`ext:${x.host}`, `It loads something from ${x.host || 'another site'}. Published pages may only load their own files, so that part will not show.`)
          continue
        }
        if (x.kind === 'absolute') {
          warn(`abs:${x.ref}`, `It refers to ${x.ref}, which starts with “/” and so points outside the page’s folder once published. Ask Ola to make it a relative link.`)
          continue
        }
        if (x.kind === 'outside') {
          warn(`out:${x.ref}`, `It uses ${x.ref}, which is outside the page’s folder, so it is not published. Ask Ola to move it next to the page.`)
          continue
        }
        if (x.kind !== 'local' || seen.has(x.path)) continue
        const inBase = !base || x.path.startsWith(`${base}/`)
        const t = byPath.get(x.path)
        if (!inBase) {
          warn(`out:${x.path}`, `It uses ${x.path}, which is outside the page’s folder, so it is not published. Ask Ola to move it next to the page.`)
          continue
        }
        if (!t || t.type !== 'file') {
          if (r.use === 'load') warn(`miss:${x.path}`, `It uses ${x.path}, which is not in the project.`)
          continue
        }
        if (x.path.split('/').some((s) => s.startsWith('.'))) {
          if (secretIn(x.path, null)) return no(422, `Ola will not publish this: the page uses ${x.path}, which usually holds passwords or keys. Nothing was published.`, { error: 'secret', file: x.path })
          continue
        }
        if (!STATIC_TYPE.test(x.path) && !secretIn(x.path, null)) {
          warn(`type:${x.path}`, `It ${r.use === 'link' ? 'links to' : 'uses'} ${x.path}, which is not a kind of file a web page uses, so it is not published.`)
          continue
        }
        seen.add(x.path)
        queue.push(x.path)
      }
    }

    // Public paths: relative to the folder; a single page that is not index.html becomes it, so the
    // address is the project's own.
    const rel = (p) => (base ? p.slice(base.length + 1) : p)
    const items = [...chosen].map(([p, buf]) => ({ path: p, as: rel(p), size: buf.length, sha: sha1(buf), uploaded: !!ctx.uploaded?.(p) }))
    let page = 'index.html'
    if (typeof sel.page === 'string') {
      const me = items.find((i) => i.path === sel.page)
      if (me.as !== 'index.html' && !items.some((i) => i.as === 'index.html')) me.as = 'index.html'
      page = me.as
    }
    items.sort((a, b) => (a.as === page ? -1 : b.as === page ? 1 : a.as.localeCompare(b.as)))
    const up = items.filter((i) => i.uploaded).length
    if (up) warn('uploaded', `${up === 1 ? 'One of these files was' : `${up} of these files were`} added by your group, not made by Ola. Make sure ${up === 1 ? 'it is' : 'they are'} meant to be public.`)
    const fingerprint = createHash('sha256').update(JSON.stringify(items.map((i) => [i.as, i.sha]))).digest('hex')
    return { plan: { slug: ctx.slug, sel: sel.page ? { page: sel.page } : { folder: base }, url: urlOf(ctx.slug, page), page, items, leftOut: leftOut.slice(0, 50), warnings: warnings.map((w) => w.text), total, fingerprint }, buffers: chosen }
  }

  return {
    origin: cfg.origin,
    configured: () => !!cred(),
    /** What is published for a project now, or null. */
    status(slug) {
      const m = readJson(manifestFile(slug))
      return m?.files ? { url: m.url, at: m.at, files: m.files.length, page: m.sel?.page ?? null, folder: m.sel?.folder ?? null } : null
    },
    list: () => Object.entries(manifests()).map(([slug, m]) => ({ slug, url: m.url, at: m.at, files: m.files.length })),
    /** The sheet's list (nothing leaves). */
    async preview(ctx, sel, opts = {}) {
      const r = await prepare(ctx, sel, opts)
      if (r.refused) return r.refused
      const { plan } = r
      return { status: 200, body: { ...plan, items: plan.items.map(({ sha, ...i }) => i), published: this.status(ctx.slug), acceptableUse: ACCEPTABLE_USE } }
    },
    /**
     * Publishes exactly what the person saw: `fingerprint` is the preview's; if the files changed
     * since, nothing leaves and the sheet is shown again.
     */
    async publish(ctx, sel, fingerprint, opts = {}) {
      const c = cred()
      if (!c) return { status: 503, body: { error: 'not_set_up', message: 'Publishing is not set up on this Ola machine yet. Nothing was published.' } }
      const r = await prepare(ctx, sel, opts)
      if (r.refused) return r.refused
      const { plan, buffers } = r
      if (fingerprint !== plan.fingerprint) return { status: 409, body: { error: 'changed', message: 'The files changed since you looked. Look at the list again before publishing.' } }
      const again = !!readJson(manifestFile(ctx.slug))
      try {
        await serial(async () => {
          for (const i of plan.items) {
            const buf = buffers.get(i.path)
            if (!c.git) await upload(c, buf, i.sha)
            blobPut(i.sha, buf)
          }
          const all = manifests()
          all[ctx.slug] = { url: plan.url, at: new Date().toISOString(), sel: plan.sel, files: plan.items.map((i) => ({ as: i.as, sha: i.sha, size: i.size })) }
          await deploy(c, all)
          writeJson(manifestFile(ctx.slug), all[ctx.slug])
        })
      } catch (e) {
        log(`sites: publish of ${ctx.slug} failed (${e.code ?? e.name} ${e.status ?? ''})`)
        return { status: e.code === 'BUSY' ? 429 : 502, body: { error: 'publish_failed', message: e.code === 'BUSY' ? 'Another page is being published just now. Try again in a minute.' : 'The page could not be published just now: the host did not take it. Nothing changed. Try again in a few minutes.' } }
      }
      const index = plan.items.find((i) => i.as === plan.page)
      // The address itself, fetched, against the page just published: `live` and `shows` (what the
      // address says now) are what Ola's answer is written from (OLA-267), never what it believes.
      const seen = await verify(plan.url, index.sha, c.git ? cfg.gitVerifyMs : cfg.verifyMs, c.git ? cfg.gitSettleMs : cfg.settleMs)
      const live = seen.ok
      // When the host's bot check answered the last read, nothing is known about the page: say that,
      // never "it still shows the earlier page" (OLA-230, Nov 23).
      const notYet = live ? {} : seen.challenged
        ? { unconfirmed: true, message: `It was sent to ${cfg.origin}. Ola could not read ${plan.url} to confirm it just now: the host answered with its bot check instead of the page. Open the address to see it.` }
        : { message: `It was sent to ${cfg.origin}, but ${plan.url} does not show it yet${seen.shows ? ` (it still shows “${seen.shows}”)` : ''}. It usually appears within a few minutes; check the address again then.` }
      return { status: 200, body: { url: plan.url, again, files: plan.items.length, total: plan.total, live, shows: seen.challenged ? '' : seen.shows, expected: wordsOf(buffers.get(index.path)), ...notYet, fingerprint: plan.fingerprint }, plan }
    },
    /** Takes a project's pages down (the owner's Unpublish, or `admin.mjs unpublish`). */
    async unpublish(slug) {
      const c = cred()
      if (!c) return { status: 503, body: { error: 'not_set_up', message: 'Publishing is not set up on this Ola machine yet.' } }
      const m = readJson(manifestFile(slug))
      if (!m) return { status: 404, body: { error: 'not_published', message: 'Nothing of this project is published.' } }
      try {
        await serial(async () => {
          const all = manifests()
          delete all[slug]
          await deploy(c, all)
          fs.rmSync(manifestFile(slug), { force: true })
          // Our copies of its bytes go too, unless another project published the same file.
          const used = new Set(Object.values(all).flatMap((x) => x.files.map((f) => f.sha)))
          for (const f of m.files) if (!used.has(f.sha)) fs.rmSync(path.join(blobs, f.sha), { force: true })
        })
      } catch (e) {
        log(`sites: unpublish of ${slug} failed (${e.code ?? e.name} ${e.status ?? ''})`)
        return { status: 502, body: { error: 'unpublish_failed', message: 'The pages could not be taken down just now. They are still public. Try again in a minute.' } }
      }
      const seenGone = await verify(m.url, null, c.git ? cfg.gitVerifyMs : cfg.verifyMs, c.git ? cfg.gitSettleMs : cfg.settleMs)
      const gone = seenGone.ok
      const notYet = gone ? {} : seenGone.challenged
        ? { unconfirmed: true, message: `It was taken off ${cfg.origin}. Ola could not read ${m.url} to confirm it just now: the host answered with its bot check instead. Open the address to see that it is gone.` }
        : { message: `It was taken off ${cfg.origin}, but ${m.url} still shows it. It usually goes within a few minutes; check the address again then.` }
      return { status: 200, body: { unpublished: true, url: m.url, gone, ...notYet, files: m.files.length } }
    },
  }
}
