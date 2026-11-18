// The phone's own way to Bart's opencode, for the iPhone app's "On the Ola machine" (2026-11-17):
// the phone works here directly, with the Mac off. It listens on the machine's Tailscale address
// only (like opencode and forward.mjs; nothing new on the public address), and lets a request
// through only with an Ola device key (`Authorization: Bearer <pass>`, the one the phone got by
// signing in with a name and password, POST /api/device/login) whose person is on this door's list
// (OLA_BART_PHONE_HANDLES, default `bart`). The key is checked with the front desk
// (`<account base>/api/device/me`), so a device removed under "Your devices", or signed out, stops
// working here within a minute, open event streams included. Then the request goes to opencode
// with opencode's own password, which the phone never sees.
//
// Only the routes the apps use (the Mac relay's list, OlaKit/Relay.swift MacRelay.allowList), and
// only Content-Type and Accept from the phone. Eight wrong keys from one address in a minute and
// that address waits a minute. No dependencies.
//
// It also carries the machine's "Lots of permissions" (OLA-139, approver.mjs): `GET /ola/permissions`
// says `{ "mode": "lots" | "ask" }`, `PUT` with the same body changes it, and this process answers
// the ask-first steps under `lots`. Those two routes also take opencode's own Basic password (the
// Mac app's credential for this machine), and only those: the Mac sets the same choice here.
//
//   OPENCODE_PASSWORD=… node phone-door.mjs <listen-host> <listen-port> <opencode-host:port>
//   env: OLA_BART_PHONE_HANDLES (comma list), OLA_ACCOUNT_BASE (default https://app.ola.cx),
//        OLA_BART_PERMISSIONS (the choice's file; without it no approver runs and the routes are 404)
import { createHash, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { MODES, readMode, startApprover, writeMode } from './approver.mjs'

const [host, port, upstream] = process.argv.slice(2)
const PASSWORD = process.env.OPENCODE_PASSWORD ?? ''
if (!host || !port || !upstream || !PASSWORD) {
  console.error('usage: OPENCODE_PASSWORD=… node phone-door.mjs <listen-host> <listen-port> <opencode-host:port>')
  process.exit(2)
}
const [upHost, upPort] = [upstream.slice(0, upstream.lastIndexOf(':')), Number(upstream.slice(upstream.lastIndexOf(':') + 1))]
const HANDLES = new Set((process.env.OLA_BART_PHONE_HANDLES ?? 'bart').split(',').map((s) => s.trim()).filter(Boolean))
const BASE = (process.env.OLA_ACCOUNT_BASE ?? 'https://app.ola.cx').replace(/\/$/, '')
const BASIC = 'Basic ' + Buffer.from(`opencode:${PASSWORD}`).toString('base64')
const KEEP_MS = 60_000
const PERMS = process.env.OLA_BART_PERMISSIONS ?? ''
const approver = PERMS ? startApprover({ upstream, basic: BASIC, file: PERMS, log: (l) => console.log(l) }) : null
const sameBasic = (h) => {
  const a = Buffer.from(h), b = Buffer.from(BASIC)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const ALLOW = [
  ['GET', /^\/api\/info$/],
  ['GET', /^\/api\/event$/],
  ['GET', /^\/api\/session$/],
  ['POST', /^\/api\/session$/],
  ['GET', /^\/api\/session\/active$/],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}$/],
  ['PATCH', /^\/api\/session\/[A-Za-z0-9_-]{1,80}$/],
  ['DELETE', /^\/api\/session\/[A-Za-z0-9_-]{1,80}$/],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/prompt$/],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/interrupt$/],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/model$/],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/message$/],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/permission$/],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/permission\/[A-Za-z0-9_-]{1,80}\/reply$/],
  ['GET', /^\/api\/model$/],
  ['GET', /^\/api\/model\/default$/],
  ['GET', /^\/api\/fs\/list$/],
  ['GET', /^\/api\/fs\/read\/[^?#]+$/],
]
const allowed = (method, path) => !/\/\.\.(\/|$)|%2e%2e/i.test(path) && ALLOW.some(([m, re]) => m === method && re.test(path))

const sha = (s) => createHash('sha256').update(s).digest('hex')
const known = new Map() // sha256(key) -> { ok, handle, until }
const misses = new Map() // address -> { n, until }

/** Who a device key belongs to, from the front desk: { ok, handle } or { down: true }. */
async function who(key) {
  const k = sha(key)
  const hit = known.get(k)
  if (hit && hit.until > Date.now()) return hit
  let r
  try {
    r = await fetch(`${BASE}/api/device/me`, { headers: { authorization: `Bearer ${key}` }, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  } catch {
    return { down: true }
  }
  if (r.status >= 500) return { down: true }
  const j = r.status === 200 ? await r.json().catch(() => null) : null
  const handle = j?.person?.handle ?? null
  const v = { ok: !!handle && HANDLES.has(handle), signedIn: !!handle, handle, until: Date.now() + KEEP_MS }
  known.set(k, v)
  if (known.size > 500) for (const [kk, vv] of known) if (vv.until <= Date.now()) known.delete(kk)
  return v
}

function say(res, status, error, message) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error, message }))
}

/** The machine's "Lots of permissions": read it, or set it (a body of { "mode": "lots" | "ask" }). */
async function permissions(req, res) {
  if (!approver) return say(res, 404, 'not_here', 'This machine keeps no permissions setting.')
  const send = () => {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ mode: readMode(PERMS) }))
  }
  if (req.method === 'GET') return send()
  if (req.method !== 'PUT') return say(res, 405, 'method', 'GET or PUT.')
  let raw = ''
  for await (const c of req) {
    raw += c
    if (raw.length > 1024) return say(res, 413, 'too_large', 'Too long.')
  }
  let mode
  try {
    mode = JSON.parse(raw)?.mode
  } catch {}
  if (!MODES.includes(mode)) return say(res, 400, 'bad_mode', 'The mode is lots or ask.')
  writeMode(PERMS, mode)
  console.log(`permissions: ${mode}`)
  if (mode === 'lots') await approver.sweep().catch(() => 0)
  send()
}

const server = http.createServer(async (req, res) => {
  const addr = req.socket.remoteAddress ?? ''
  const m = misses.get(addr)
  if (m && m.until > Date.now() && m.n >= 8) return say(res, 429, 'too_many', 'Too many tries. Wait a minute.')
  const url = new URL(req.url ?? '/', 'http://door')
  const auth = req.headers.authorization ?? ''
  const key = /^Bearer ([A-Za-z0-9._~-]{8,512})$/.exec(auth)?.[1]
  const miss = () => {
    const cur = misses.get(addr)
    misses.set(addr, cur && cur.until > Date.now() ? { n: cur.n + 1, until: cur.until } : { n: 1, until: Date.now() + 60_000 })
  }
  if (url.pathname === '/ola/permissions' && auth.startsWith('Basic ')) {
    if (!sameBasic(auth)) { miss(); return say(res, 401, 'wrong_password', 'Wrong password.') }
    return permissions(req, res)
  }
  if (!key) { miss(); return say(res, 401, 'signed_out', 'Sign in again.') }
  const w = await who(key)
  if (w.down) return say(res, 503, 'sign_in_down', 'Ola’s sign-in isn’t answering just now. Try again in a minute.')
  if (!w.signedIn) { miss(); return say(res, 401, 'signed_out', 'Sign in again.') }
  if (!w.ok) return say(res, 403, 'not_allowed', 'This account can’t work on the Ola machine from a phone.')
  if (url.pathname === '/ola/permissions') return permissions(req, res)
  if (!allowed(req.method ?? 'GET', url.pathname)) return say(res, 403, 'not_allowed', 'Not available from the phone.')

  const headers = { authorization: BASIC, host: upstream }
  for (const h of ['content-type', 'accept', 'content-length']) if (req.headers[h]) headers[h] = req.headers[h]
  const up = http.request({ host: upHost, port: upPort, method: req.method, path: url.pathname + url.search, headers }, (r) => {
    const out = {}
    for (const h of ['content-type', 'content-length', 'cache-control']) if (r.headers[h]) out[h] = r.headers[h]
    res.writeHead(r.statusCode === 401 ? 502 : r.statusCode ?? 502, out)
    r.pipe(res)
  })
  up.on('error', () => { if (!res.headersSent) say(res, 502, 'machine_down', 'The agent on the Ola machine isn’t answering.'); else res.destroy() })
  // An event stream stays open for hours: the key is checked again every minute, and a removed
  // device's stream ends.
  let recheck
  if (url.pathname === '/api/event') {
    recheck = setInterval(async () => {
      const again = await who(key)
      if (!again.down && !again.ok) { up.destroy(); res.destroy() }
    }, KEEP_MS)
  }
  const end = () => { clearInterval(recheck); up.destroy() }
  res.on('close', end)
  req.pipe(up)
})
server.requestTimeout = 0
server.headersTimeout = 30_000
server.on('error', (e) => {
  console.error(`phone-door: ${e.code ?? e.message}`)
  process.exit(1)
})
server.listen(Number(port), host, () => console.log(`phone door on ${host}:${port} -> ${upstream} for ${[...HANDLES].join(', ')} (keys checked at ${BASE})`))
