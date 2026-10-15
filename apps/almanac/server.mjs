// Adaptation Almanac: a research agent over the GAMI corpus, for Fran Moore. One Node process on the Mac mini:
// the web app under /almanac, its JSON API, the PDFs and the artifacts. See README.md.
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PORT, BASE, USERS, SECRET, PAPERS_DIR, MODEL } from './lib/config.mjs'
import * as store from './lib/store.mjs'
import { corpusStats } from './lib/db.mjs'
import { artifactFile, removeArtifact } from './lib/artifacts.mjs'
import { startTurn, stopTurn, snapshot, waitEvents, removeChat, isRunning, HttpError } from './lib/agent.mjs'
import { resumeAll, cancelJob, isActive } from './lib/jobs.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(HERE, 'public')
const NM = path.join(HERE, 'node_modules')
const VENDOR = {
  'marked.js': 'marked/lib/marked.umd.js',
  'purify.js': 'dompurify/dist/purify.min.js',
  'vega.js': 'vega/build/vega.min.js',
  'vega-lite.js': 'vega-lite/build/vega-lite.min.js',
  'vega-embed.js': 'vega-embed/build/vega-embed.min.js',
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.woff2': 'font/woff2',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// --- sessions: a signed cookie holding the name typed at sign-in ---
const COOKIE = 'almanac_session'
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url')
function sessionCookie(name) {
  const v = `${Buffer.from(name).toString('base64url')}.${Date.now() + 180 * 864e5}`
  return `${COOKIE}=${v}.${sign(v)}; Path=${BASE}; HttpOnly; SameSite=Lax; Max-Age=${180 * 86400}`
}
function whoIs(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  if (!m) return null
  const [n, exp, sig] = m[1].split('.')
  if (!sig || sign(`${n}.${exp}`) !== sig || Number(exp) < Date.now()) return null
  const who = Buffer.from(n, 'base64url').toString()
  return USERS.get(who.toLowerCase())?.name === who ? who : null  // a removed account is signed out
}
let failures = []
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

// --- helpers ---
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === 'string'
  res.writeHead(status, { 'Cache-Control': 'no-store', ...(isBuf ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers })
  res.end(isBuf ? body : JSON.stringify(body))
}
async function readJson(req) {
  let size = 0; const chunks = []
  for await (const c of req) { size += c.length; if (size > 2e6) throw new HttpError(413, 'too large'); chunks.push(c) }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {} } catch { throw new HttpError(400, 'bad JSON') }
}
async function sendFile(req, res, file, { type, headers = {}, cache = 'no-store' } = {}) {
  let st
  try { st = await fsp.stat(file) } catch { return send(res, 404, { error: 'not found' }) }
  if (!st.isFile()) return send(res, 404, { error: 'not found' })
  const ct = type || TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1
    if (start > end || start >= st.size) return send(res, 416, '', { 'Content-Range': `bytes */${st.size}` })
    res.writeHead(206, { 'Content-Type': ct, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, ...headers })
    return fs.createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { 'Content-Type': ct, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, ...headers })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file).pipe(res)
}
const slug = s => String(s || 'artifact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'artifact'

// --- routes ---
const routes = []
const route = (method, pattern, handler, open = false) =>
  routes.push({ method, re: new RegExp(`^${BASE}${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, open })

route('GET', '/health', (req, res) => send(res, 200, { ok: true, model: MODEL }), true)

route('POST', '/api/login', async (req, res) => {
  failures = failures.filter(t => t > Date.now() - 10 * 60e3)
  if (failures.length >= 20) return send(res, 429, { error: 'Too many tries. Wait ten minutes.' })
  const { name, passcode } = await readJson(req)
  const typed = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!typed) return send(res, 400, { error: 'Type your name.' })
  const user = USERS.get(typed.toLowerCase())
  if (!user || !safeEqual(String(passcode || ''), user.passcode)) { failures.push(Date.now()); return send(res, 401, { error: 'That name and passcode do not match.' }) }
  const who = user.name
  log('sign-in', who)
  send(res, 200, { name: who }, { 'Set-Cookie': sessionCookie(who) })
}, true)
route('POST', '/api/logout', (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=${BASE}; Max-Age=0` }), true)
route('GET', '/api/me', (req, res) => { const who = whoIs(req); send(res, who ? 200 : 401, who ? { name: who } : { error: 'signed out' }) }, true)

route('GET', '/api/stats', async (req, res) => send(res, 200, await corpusStats()))

route('GET', '/api/chats', (req, res) => send(res, 200, store.chats.list().map(c => ({ ...c, running: isRunning(c.id) }))))
route('POST', '/api/chats', async (req, res, p, who) => {
  const { text } = await readJson(req)
  const q = String(text || '').trim()
  if (!q) return send(res, 400, { error: 'Ask something.' })
  const title = q.replace(/\s+/g, ' ').slice(0, 90) + (q.length > 90 ? '…' : '')
  const id = store.chats.create({ title, author: who })
  startTurn(id, q, who)
  send(res, 200, { id })
})
route('GET', '/api/chats/:id', (req, res, p) => send(res, 200, snapshot(p.id)))
route('DELETE', '/api/chats/:id', (req, res, p) => { removeChat(p.id); send(res, 200, { ok: true }) })
route('POST', '/api/chats/:id/messages', async (req, res, p, who) => {
  const { text } = await readJson(req)
  const q = String(text || '').trim()
  if (!q) return send(res, 400, { error: 'Ask something.' })
  startTurn(p.id, q, who)
  send(res, 200, { ok: true })
})
route('POST', '/api/chats/:id/stop', (req, res, p) => send(res, 200, { stopped: stopTurn(p.id) }))
route('GET', '/api/chats/:id/events', async (req, res, p, who, url) => {
  const after = Number(url.searchParams.get('after') || 0)
  const wait = Math.min(Number(url.searchParams.get('wait') || 0), 30) * 1000
  if (!store.chats.get(p.id)) return send(res, 404, { error: 'no such conversation' })
  send(res, 200, await waitEvents(p.id, after, wait))
})

route('GET', '/api/artifacts', (req, res) => send(res, 200, store.artifacts.list()))
route('GET', '/api/artifacts/:id', (req, res, p) => {
  const a = store.artifacts.get(p.id)
  a ? send(res, 200, a) : send(res, 404, { error: 'no such artifact' })
})
route('DELETE', '/api/artifacts/:id', async (req, res, p) => { await removeArtifact(p.id); send(res, 200, { ok: true }) })
route('GET', '/a/:id/:file', async (req, res, p, who, url) => {
  const a = store.artifacts.get(p.id)
  if (!a) return send(res, 404, { error: 'no such artifact' })
  const file = artifactFile(p.id, decodeURIComponent(p.file))
  const ext = path.extname(file)
  const headers = {}
  // agent-written pages run in an opaque origin: no cookies, no API
  if (ext === '.html') headers['Content-Security-Policy'] = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals'
  if (url.searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="${slug(a.title)}${ext}"`
  sendFile(req, res, file, { headers })
})

route('GET', '/api/jobs', (req, res) => send(res, 200, store.jobs.list().map(j => ({ ...j, active: isActive(j.id) }))))
route('GET', '/api/jobs/:id', (req, res, p) => {
  const j = store.jobs.get(p.id)
  j ? send(res, 200, { ...j, active: isActive(j.id) }) : send(res, 404, { error: 'no such run' })
})
route('POST', '/api/jobs/:id/cancel', (req, res, p) => send(res, 200, { ok: cancelJob(p.id) }))

route('GET', '/papers/:file', (req, res, p) => {
  const m = decodeURIComponent(p.file).match(/^([\w.-]+)\.pdf$/)
  if (!m) return send(res, 404, { error: 'not found' })
  sendFile(req, res, path.join(PAPERS_DIR, `${m[1]}.pdf`), { headers: { 'Content-Disposition': `inline; filename="${m[1]}.pdf"` }, cache: 'private, max-age=86400' })
})

route('GET', '/vendor/:file', (req, res, p) => {
  const rel = VENDOR[p.file]
  rel ? sendFile(req, res, path.join(NM, rel), { type: TYPES['.js'], cache: 'public, max-age=86400' }) : send(res, 404, { error: 'not found' })
}, true)
route('GET', '/static/(?<file>.+)', (req, res, p) => {
  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p.file)))
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: 'not found' })
  sendFile(req, res, file, { cache: p.file.startsWith('fonts/') ? 'public, max-age=604800' : 'no-cache' })
}, true)
route('GET', '/', (req, res) => sendFile(req, res, path.join(PUBLIC, 'index.html'), { cache: 'no-cache' }), true)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/' || url.pathname === BASE) return send(res, 302, '', { Location: `${BASE}/` })
  const method = req.method === 'HEAD' ? 'GET' : req.method
  for (const r of routes) {
    if (r.method !== method) continue
    const m = url.pathname.match(r.re)
    if (!m) continue
    const who = whoIs(req)
    if (!r.open && !who) return send(res, 401, { error: 'signed out' })
    try { return await r.handler(req, res, m.groups || {}, who, url) } catch (e) {
      if (!(e instanceof HttpError)) log('error', req.method, url.pathname, e?.stack || e)
      if (!res.headersSent) return send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on the server.' })
      return res.end()
    }
  }
  send(res, 404, { error: 'not found' })
})
server.requestTimeout = 0
server.headersTimeout = 60e3
server.listen(PORT, () => {
  log(`Adaptation Almanac on http://localhost:${PORT}${BASE}/ (model ${MODEL})`)
  resumeAll()
  corpusStats().catch(e => log('stats failed', e.message))
})
