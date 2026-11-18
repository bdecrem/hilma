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
//   OPENCODE_PASSWORD=… node phone-door.mjs <listen-host> <listen-port> <opencode-host:port>
//   env: OLA_BART_PHONE_HANDLES (comma list), OLA_ACCOUNT_BASE (default https://app.ola.cx)
import { createHash } from 'node:crypto'
import http from 'node:http'

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
  if (!key) { miss(); return say(res, 401, 'signed_out', 'Sign in again.') }
  const w = await who(key)
  if (w.down) return say(res, 503, 'sign_in_down', 'Ola’s sign-in isn’t answering just now. Try again in a minute.')
  if (!w.signedIn) { miss(); return say(res, 401, 'signed_out', 'Sign in again.') }
  if (!w.ok) return say(res, 403, 'not_allowed', 'This account can’t work on the Ola machine from a phone.')
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
