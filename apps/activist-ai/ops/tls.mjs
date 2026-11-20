#!/usr/bin/env node
// The TLS front: where encryption ends, on our own machine (and, only when switched on, a gate).
//
// It holds app.ola.cx's certificate and takes each connection from the relay in front of it
// (Tailscale serve on stage 1, the ngrok agent's TLS pass-through on stage 2; both send a PROXY v1
// line first, so the client's address is known). It finishes TLS, and while the gate is on it
// asks for the door passcode (HTTP Basic auth, any user name) before a single byte reaches the
// front desk. A request that passes has its Authorization header removed and goes to the front
// desk on 127.0.0.1 over HTTP/1.1, on a connection that starts with a PROXY v1 line naming the
// client. Bodies and replies stream both ways with backpressure (server-sent events, uploads);
// nothing is buffered. While the front desk restarts (a deploy), a request waits up to 20 s for it
// to take connections again instead of failing, and a GET or HEAD with no body that the stopping
// front desk cut before answering is sent again (OLA-94). Every other HTTP check (Host, Origin, the body limits, HSTS and the other
// headers) is the front desk's.
//
//   node ops/run.mjs ~/.ola/tls.env ops/tls.mjs       (the launchd job cx.ola.tls)
//
// Settings (refused at start if malformed; an unknown OLA_TLS_* is refused too):
//   OLA_TLS_LISTEN        127.0.0.1:4743   loopback only: the relay runs on this machine
//   OLA_TLS_UPSTREAM      127.0.0.1:4700   the front desk
//   OLA_TLS_CERT_DIR      ~/.ola/tls/current, holding key.pem and cert.pem (the chain)
//   OLA_TLS_SERVERNAME    app.ola.cx       the only name served; any other SNI is refused
//   OLA_TLS_PROXY_IN      1                a connection must start with a PROXY v1 line (else refused)
//   OLA_TLS_PROXY_OUT     1                send a PROXY v1 line to the front desk (OLA_FD_PROXY_PROTOCOL=1 there)
//   OLA_TLS_GATE          0                1: a site-wide passcode is required before the sign-in page (off
//                                          since 2026-11-17: people sign in with their name and password)
//   OLA_TLS_GATE_PASSCODE                  the passcode, 20 to 200 printable characters (required with the gate)
//   OLA_TLS_CONNECTIONS_PER_ADDRESS 128, OLA_TLS_MAX_CONNECTIONS 512 (the front desk's own caps)
//
// TLS 1.2 and 1.3 only; on 1.2 only ECDHE with AEAD ciphers (Mozilla's "intermediate" list);
// ALPN offers http/1.1 only. The PROXY line must arrive within 5 s, the handshake finish within
// 10 s, a request's headers within 5 s (8 KiB at most); an idle kept-alive connection closes after
// 5 s: the front desk's own limits. The certificate is read again on SIGHUP and whenever key.pem,
// cert.pem or their directory change (checked every 10 s); a pair that does not load (key and
// certificate do not match, the name is not covered, it is not valid now) is not used and the one
// in force stays. New connections get the new certificate; open ones keep theirs.
//
// The gate. A request without credentials gets 401 with `WWW-Authenticate: Basic realm="Ola"` and
// a tiny fixed page, and does not count as a failure (a browser always asks first without them). A
// wrong passcode counts against the name typed with it (the Basic user name, as the person typed
// it, case and spacing aside) from the client's address (an IPv6 one by its /64): the n-th failure
// in a row for that name is answered after min(250 ms × 2^(n-1), 8 s), and the 10th within 15
// minutes blocks that name from that address for 15 minutes (429, the right passcode too, with a
// page that says so and for how long). Other names on the same address are not touched: until
// OLA-95 the count was the address's alone, so ten wrong tries by one person behind an office or
// home NAT locked out everyone there. A guesser who changes the name at every try is stopped by the
// backstop: 100 wrong tries from one address within 15 minutes block the address for 15 minutes.
// The comparison is of SHA-256 digests in constant time, so neither the answer nor its timing
// depends on how close a guess was. `/api/health` passes without the passcode from loopback only
// (the status command asks there). A request to upgrade the connection (WebSocket) is refused.
//
// A page Ola made (OLA-95). It runs in a sandboxed frame with an opaque origin (frontdesk/views.mjs),
// so its own fetch() of a data file beside it is cross-origin and the browser sends no passcode with
// it: with the gate on, its data never loaded. A GET or HEAD whose path, raw and as the front desk
// parses it, is under `/v/<grant>/` (43 base64url characters) passes the door without the passcode:
// the grant is 256 random bits that the front desk checks against the opener's session, team and
// address, and answers a guess with a 404.
//
// Passes (2026-11-17; ops/pass.mjs). A signed-in device (the Mac app, the command line) sends
// `Authorization: Bearer olap1.…` instead of the passcode. With OLA_GATE_PASS_KEY set (the same
// value as the front desk's), a pass whose MAC checks out and has not expired, on a path under
// /api/device/, goes through without the passcode: its Authorization is removed and the pass is
// sent on as `X-Ola-Pass`, which the front desk checks again itself. Any other bearer (a bad MAC,
// expired, another path, or no key set) is a wrong credential: the same growing delays, the same
// block, the same reply. An `X-Ola-Pass` a client sends is always removed. This is the same with
// the gate on or off, so a device keeps working the day the passcode goes.
//
// Logs: one JSON line per start and reload, and once a minute the counts of refusals. Never an
// address, a path or a header.
import { X509Certificate, createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import http from 'node:http'
import { Duplex } from 'node:stream'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import { bearerPass, passKey, PASS_PATH, readPass } from './pass.mjs'

export const CIPHERS = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
].join(':')
const KNOWN = ['LISTEN', 'UPSTREAM', 'CERT_DIR', 'SERVERNAME', 'PROXY_IN', 'PROXY_OUT', 'GATE', 'GATE_PASSCODE', 'CONNECTIONS_PER_ADDRESS', 'MAX_CONNECTIONS'].map((k) => `OLA_TLS_${k}`)
// How long a request waits for the front desk to take connections again (it restarts in a deploy).
export const UPSTREAM_WAIT_MS = 20_000
export const GATE = { firstDelayMs: 250, maxDelayMs: 8_000, blockAfter: 10, addressBlockAfter: 100, windowMs: 15 * 60_000, blockMs: 15 * 60_000, maxTracked: 20_000 }

function hostPort(v, name) {
  const m = /^(\[[0-9a-fA-F:.]+\]|[0-9.]+):(\d{1,5})$/.exec(v)
  const host = m?.[1].replace(/^\[|\]$/g, '')
  if (!m || +m[2] > 65535 || !net.isIP(host)) throw new Error(`${name} must be <IP address>:<port>`)
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error(`${name} must be loopback (127.0.0.1 or ::1): the relay and the front desk run on this machine`)
  return { host, port: +m[2] }
}
export function config(env = process.env) {
  for (const k of Object.keys(env)) if (k.startsWith('OLA_TLS_') && !KNOWN.includes(k)) throw new Error(`unknown setting ${k}`)
  const flag = (k, d) => {
    const v = env[k] ?? d
    if (v !== '0' && v !== '1') throw new Error(`${k} must be 0 or 1`)
    return v === '1'
  }
  const int = (k, d, lo, hi) => {
    const v = env[k] ?? String(d)
    if (!/^\d+$/.test(v) || +v < lo || +v > hi) throw new Error(`${k} must be a whole number from ${lo} to ${hi}`)
    return +v
  }
  const servername = env.OLA_TLS_SERVERNAME ?? 'app.ola.cx'
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(servername)) throw new Error('OLA_TLS_SERVERNAME must be a lower-case host name')
  const gate = flag('OLA_TLS_GATE', '0')
  const pass = env.OLA_TLS_GATE_PASSCODE ?? ''
  if (gate && !/^[\x21-\x7e]{20,200}$/.test(pass)) throw new Error('OLA_TLS_GATE_PASSCODE must be 20 to 200 printable characters while OLA_TLS_GATE=1')
  return {
    listen: hostPort(env.OLA_TLS_LISTEN ?? '127.0.0.1:4743', 'OLA_TLS_LISTEN'),
    upstream: hostPort(env.OLA_TLS_UPSTREAM ?? '127.0.0.1:4700', 'OLA_TLS_UPSTREAM'),
    servername,
    certDir: env.OLA_TLS_CERT_DIR ?? path.join(homedir(), '.ola/tls/current'),
    proxyIn: flag('OLA_TLS_PROXY_IN', '1'),
    proxyOut: flag('OLA_TLS_PROXY_OUT', '1'),
    gate,
    passDigest: gate ? createHash('sha256').update(pass).digest() : null,
    // Device passes (ops/pass.mjs): null when OLA_GATE_PASS_KEY is unset, and then every bearer is refused.
    passKey: passKey(env),
    perAddress: int('OLA_TLS_CONNECTIONS_PER_ADDRESS', 128, 1, 10_000),
    maxConnections: int('OLA_TLS_MAX_CONNECTIONS', 512, 1, 10_000),
  }
}

/** key.pem and cert.pem, checked: they load as a pair, the leaf names the server name, it is valid now. */
export function loadCert(dir, servername) {
  const key = readFileSync(path.join(dir, 'key.pem'))
  const cert = readFileSync(path.join(dir, 'cert.pem'))
  const leaf = new X509Certificate(cert)
  if (!leaf.checkHost(servername)) throw new Error(`the certificate does not name ${servername}`)
  const now = Date.now()
  if (now < Date.parse(leaf.validFrom) || now > Date.parse(leaf.validTo)) throw new Error('the certificate is not valid now')
  const opts = { key, cert, minVersion: 'TLSv1.2', ciphers: CIPHERS, honorCipherOrder: false }
  tls.createSecureContext(opts) // throws when the key does not match the certificate
  return { opts, info: { serial: leaf.serialNumber, notAfter: new Date(leaf.validTo).toISOString() } }
}
function stamp(dir) {
  try {
    const real = realpathSync(dir)
    return [real, ...['key.pem', 'cert.pem'].map((f) => {
      const s = statSync(path.join(real, f))
      return `${s.ino}:${s.mtimeMs}:${s.size}`
    })].join('|')
  } catch {
    return 'missing'
  }
}

/** "PROXY TCP4|TCP6 <src> <dst> <sport> <dport>" (without its CRLF) -> { address, port }, or null. */
export function parseProxy(line) {
  const m = /^PROXY (TCP4|TCP6) (\S{2,45}) (\S{2,45}) (\d{1,5}) (\d{1,5})$/.exec(line)
  const fam = m && (m[1] === 'TCP4' ? 4 : 6)
  if (!m || net.isIP(m[2]) !== fam || net.isIP(m[3]) !== fam || +m[4] > 65535 || +m[5] > 65535) return null
  return { address: plain(m[2]), port: +m[4] }
}
const plain = (a) => /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a ?? '')?.[1] ?? a
/** An address's key for limits: IPv4 as is, IPv6 by its /64 (as the front desk's addressKey). */
export function addressKey(a) {
  if (net.isIP(a) !== 6) return a
  const [head, tail = ''] = a.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const full = a.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h
  return `${full.slice(0, 4).map((x) => parseInt(x || '0', 16).toString(16)).join(':')}::/64`
}
const LOOPBACK = new Set(['127.0.0.1', '::1'])

const PAGE_401 = '<!doctype html><meta charset="utf-8"><title>Ola</title><p>Ola is private. Ask Bart how to reach it.</p>\n'
const minutesText = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60_000))
  return m === 1 ? '1 minute' : `${m} minutes`
}
/** The page for a blocked name (or device) or a blocked address, with how long is left. */
const page429 = (scope, ms) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ola</title><p>${
    scope === 'address'
      ? `Too many wrong passcodes from your internet address. Try again in ${minutesText(ms)}.`
      : scope === 'device'
        ? `Too many wrong sign-ins from this device. Try again in ${minutesText(ms)}.`
        : `Too many wrong passcodes for this name. Try again in ${minutesText(ms)}. Other people here are not affected.`
  }</p>\n`
/** The key a wrong try counts under besides the address: the Basic user name, normalized. */
export function nameKey(authorization) {
  const m = typeof authorization === 'string' ? /^Basic ([A-Za-z0-9+/=]{1,400})$/.exec(authorization) : null
  const decoded = m ? Buffer.from(m[1], 'base64').toString('utf8') : ''
  const user = decoded.includes(':') ? decoded.slice(0, decoded.indexOf(':')) : ''
  const n = user.normalize('NFKC').trim().toLowerCase()
  return n.length <= 64 ? `name:${n}` : `name#${createHash('sha256').update(n).digest('hex').slice(0, 32)}`
}
// A view of a page Ola made: GET or HEAD under /v/<43 base64url characters>/ (see "A page Ola made").
const VIEW_PATH = /^\/v\/[A-Za-z0-9_-]{43}\/[^?#]/

export function makeTlsFront(cfg = config()) {
  const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), event: 'tls', ...o }))
  let current = loadCert(cfg.certDir, cfg.servername)
  let seen = stamp(cfg.certDir)
  const counts = { noProxy: 0, handshake: 0, capped: 0, noPasscode: 0, wrongPasscode: 0, badPass: 0, passes: 0, probes: 0, blocked: 0, upgrade: 0, upstreamDown: 0, upstreamWaits: 0, upstreamRetries: 0 }

  // ------------------------------------------------------------ the gate
  // `a:<address key>` (the backstop) and `n:<address key> <name or device>` -> { n, last, blockedUntil }
  const fails = new Map()
  function passes(req) {
    const h = req.headers.authorization
    if (typeof h !== 'string') return null
    const m = /^Basic ([A-Za-z0-9+/=]{1,400})$/.exec(h)
    const decoded = m ? Buffer.from(m[1], 'base64').toString('utf8') : ''
    const pass = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : ''
    return timingSafeEqual(createHash('sha256').update(pass).digest(), cfg.passDigest)
  }
  function count(key, after) {
    const now = Date.now()
    let f = fails.get(key)
    if (!f || (now - f.last > GATE.windowMs && f.blockedUntil <= now)) f = { n: 0, last: now, blockedUntil: 0 }
    f.n++
    f.last = now
    if (f.n >= after && f.blockedUntil <= now) f.blockedUntil = now + GATE.blockMs
    fails.delete(key)
    fails.set(key, f) // newest last; the oldest are dropped past maxTracked
    while (fails.size > GATE.maxTracked) fails.delete(fails.keys().next().value)
    return f.n
  }
  /** A wrong try by `who` (a name or a device) from address `addr`: the delay before its answer. */
  function failed(addr, who) {
    count(`a:${addr}`, GATE.addressBlockAfter)
    const n = count(`n:${addr} ${who}`, GATE.blockAfter)
    return Math.min(GATE.firstDelayMs * 2 ** (n - 1), GATE.maxDelayMs)
  }
  const left = (key) => Math.max(0, (fails.get(key)?.blockedUntil ?? 0) - Date.now())
  /** Null, or the 429 for a blocked address or a blocked name or device on it. */
  function blocked(res, addr, who) {
    let ms = left(`a:${addr}`)
    let scope = 'address'
    if (!ms) (ms = left(`n:${addr} ${who}`)), (scope = who.startsWith('pass') ? 'device' : 'name')
    if (!ms) return null
    counts.blocked++
    return refuse(res, 429, page429(scope, ms), { 'retry-after': String(Math.ceil(ms / 1000)) }) ?? true
  }
  function refuse(res, status, page, extra = {}) {
    if (res.destroyed || res.headersSent) return
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(page),
      'cache-control': 'no-store',
      'strict-transport-security': 'max-age=63072000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      connection: 'close',
      ...extra,
    })
    res.end(page) // with `connection: close` Node closes the socket once it is sent; an unread body is never read
  }

  // ------------------------------------------------------------ to the front desk
  // Hop-by-hop headers stay on their own hop; Node frames each side itself.
  const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate'])
  const pipeUp = (req, res, client, pass = null) => {
    const headers = {}
    // The client's own X-Ola-Pass never goes on: only one this front checked does.
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && k !== 'authorization' && k !== 'x-ola-pass') headers[k] = v
    if (pass) headers['x-ola-pass'] = pass
    // A chunked body stays chunked. Node's client frames a GET, HEAD or DELETE body only when told:
    // without this the body went up as raw bytes after the headers, where a request inside it was
    // stopped only by the front desk's parser refusing bytes after a `Connection: close` request
    // (third review, 2026-11-16; frontdesk/review/rev3-tls.mjs). Node's parser has already refused
    // any Transfer-Encoding that does not end in chunked, and one sent with a Content-Length.
    if (req.headers['transfer-encoding'] !== undefined) headers['transfer-encoding'] = 'chunked'
    // While the front desk restarts (a deploy, OLA-94) its port refuses connections for a second or
    // two: the request waits here instead of failing (nothing has been sent, so this is always
    // safe). A GET or HEAD with no body whose connection is cut before any answer is sent again: the
    // old front desk was stopping and no request of that kind changes anything.
    const deadline = Date.now() + UPSTREAM_WAIT_MS
    const bodyless = (req.method === 'GET' || req.method === 'HEAD') && req.headers['content-length'] === undefined && req.headers['transfer-encoding'] === undefined
    let gone = false
    let up = null
    res.on('close', () => ((gone = true), up?.destroy()))
    const send = () => {
      let answered = false
      up = http.request({
        method: req.method,
        path: req.url,
        headers,
        // No agent (agent: false would make one, which ignores createConnection): one upstream
        // connection per request, opened with the PROXY line.
        createConnection: (_o, cb) => {
          let wait = 50
          const dial = () => {
            const s = net.connect({ host: cfg.upstream.host, port: cfg.upstream.port })
            s.once('connect', () => {
              if (gone) return s.destroy()
              if (cfg.proxyOut) {
                const v6 = net.isIP(client.address) === 6
                s.write(`PROXY ${v6 ? 'TCP6' : 'TCP4'} ${client.address} ${v6 ? '::1' : '127.0.0.1'} ${client.port} ${cfg.upstream.port}\r\n`)
              }
              cb(null, s)
            })
            s.once('error', (e) => {
              if (!gone && e.code === 'ECONNREFUSED' && Date.now() + wait < deadline) return (counts.upstreamWaits++, setTimeout(dial, wait), (wait = Math.min(wait * 2, 250)))
              cb(e)
            })
          }
          dial()
          return undefined
        },
      })
      up.on('response', (r) => {
        answered = true
        const out = []
        for (let i = 0; i < r.rawHeaders.length; i += 2) if (!HOP.has(r.rawHeaders[i].toLowerCase())) out.push(r.rawHeaders[i], r.rawHeaders[i + 1])
        res.writeHead(r.statusCode, r.statusMessage, out)
        res.flushHeaders() // an event stream's headers go out at once
        r.pipe(res)
        r.on('error', () => res.destroy())
      })
      up.on('error', (e) => {
        if (gone) return
        if (bodyless && !answered && !res.headersSent && e.code === 'ECONNRESET' && Date.now() < deadline) return (counts.upstreamRetries++, setTimeout(send, 50))
        counts.upstreamDown++
        if (!res.headersSent) refuse(res, 502, '<!doctype html><meta charset="utf-8"><title>Ola</title><p>Ola is not answering just now.</p>\n')
        else res.destroy()
      })
      if (bodyless) up.end()
      else req.pipe(up)
    }
    if (bodyless) req.resume() // nothing to read, but the request must end for the connection's next one
    send()
  }

  // A pass may be used only under /api/device/: the raw request line and the path as the front desk
  // will read it (the URL parser resolves dot segments, %2e%2e included) must both be there.
  const passPathOk = (url) => {
    if (typeof url !== 'string' || !PASS_PATH.test(url)) return false
    try {
      return PASS_PATH.test(new URL(url, 'http://x').pathname)
    } catch {
      return false
    }
  }
  const viewPathOk = (url) => {
    if (typeof url !== 'string' || !VIEW_PATH.test(url)) return false
    try {
      const p = new URL(url, 'http://x').pathname
      return VIEW_PATH.test(p) && p.slice(0, 47) === url.slice(0, 47)
    } catch {
      return false
    }
  }
  async function handle(req, res) {
    const client = req.socket.olaClient
    if (!client) return req.socket.destroy()
    // The apps' probe, before they open the browser: is device sign-in open here? Exactly
    // `GET /api/device/me` with no Authorization, answered here with a fixed reply and nothing
    // read or passed on: 401 {"error":"signed_out"} when the pass key is set, 404 when it is not
    // (what the front desk itself answers a device with no pass). It says only that.
    if (req.method === 'GET' && req.url === '/api/device/me' && req.headers.authorization === undefined) {
      counts.probes++
      const on = !!cfg.passKey
      return refuse(res, on ? 401 : 404, on ? '{"error":"signed_out"}\n' : '{"error":"not_found"}\n', { 'content-type': 'application/json; charset=utf-8' })
    }
    // Signing in from the Mac app with a name and password (2026-11-17): exactly `POST
    // /api/device/login` (the raw request line, no query, nothing more), no Authorization, and only
    // while device sign-in is on. It goes through without the passcode, because an app cannot answer
    // a browser's password prompt; it stands on the front desk's own password check and its limits
    // (per address, per name, the global ceiling, a 4 KiB body). Nothing else is let through this way.
    // Its passkey step (2026-11-17, never a browser): exactly `POST /api/device/login/passkey`, the
    // same way, standing on the front desk's own check of the passkey's answer to a ceremony it made.
    if (req.method === 'POST' && (req.url === '/api/device/login' || req.url === '/api/device/login/passkey') && req.headers.authorization === undefined && cfg.passKey) {
      counts.logins = (counts.logins ?? 0) + 1
      return pipeUp(req, res, client)
    }
    // Apple's check that the Mac app may use this site's passkeys: exactly `GET
    // /.well-known/apple-app-site-association` (no query, no credential). It reads a fixed file the
    // front desk serves, and nothing else is let through this way.
    if (req.method === 'GET' && req.url === '/.well-known/apple-app-site-association' && req.headers.authorization === undefined) {
      counts.aasa = (counts.aasa ?? 0) + 1
      return pipeUp(req, res, client)
    }
    // A bearer is a device's pass, or a wrong credential: never the passcode, never let through.
    // Wrong ones count per device (the bearer as sent) on the address, so one Mac holding an old
    // pass does not lock out the rest of its office (OLA-95); the address backstop still applies.
    if (typeof req.headers.authorization === 'string' && /^bearer\s/i.test(req.headers.authorization)) {
      const addr = addressKey(client.address)
      const who = `pass:${createHash('sha256').update(req.headers.authorization).digest('hex').slice(0, 32)}`
      if (blocked(res, addr, who)) return
      const pass = bearerPass(req.headers.authorization)
      if (!pass || !passPathOk(req.url) || !readPass(cfg.passKey, pass)) {
        counts.badPass++
        const wait = failed(addr, who)
        return setTimeout(() => refuse(res, 401, PAGE_401, { 'www-authenticate': 'Basic realm="Ola", charset="UTF-8"' }), wait)
      }
      fails.delete(`n:${addr} ${who}`)
      counts.passes++
      return pipeUp(req, res, client, pass)
    }
    // A page Ola made, loading its own files (see "A page Ola made" at the top). Any Basic header
    // is dropped on the way (pipeUp) and neither checked nor counted.
    if ((req.method === 'GET' || req.method === 'HEAD') && viewPathOk(req.url)) {
      counts.views = (counts.views ?? 0) + 1
      return pipeUp(req, res, client)
    }
    if (cfg.gate && !(req.url === '/api/health' && LOOPBACK.has(client.address))) {
      const addr = addressKey(client.address)
      const who = nameKey(req.headers.authorization)
      if (blocked(res, addr, who)) return
      const ok = passes(req)
      if (ok === null) return counts.noPasscode++, refuse(res, 401, PAGE_401, { 'www-authenticate': 'Basic realm="Ola", charset="UTF-8"' })
      if (!ok) {
        counts.wrongPasscode++
        const wait = failed(addr, who)
        return setTimeout(() => refuse(res, 401, PAGE_401, { 'www-authenticate': 'Basic realm="Ola", charset="UTF-8"' }), wait)
      }
      // A right passcode clears its name's count; the address's backstop runs out on its own.
      fails.delete(`n:${addr} ${who}`)
    }
    pipeUp(req, res, client)
  }

  // ------------------------------------------------------------ HTTP/1.1, once TLS is done
  // An HTTP server that never listens: each connection is handed to it after its handshake. Its
  // limits are the front desk's.
  const server = http.createServer(
    { requestTimeout: 15 * 60_000, headersTimeout: 5_000, keepAliveTimeout: 5_000, maxHeaderSize: 8 * 1024, connectionsCheckingInterval: 1_000 },
    (req, res) => handle(req, res).catch(() => res.destroy()),
  )
  server.on('upgrade', (_req, sock) => (counts.upgrade++, sock.destroy()))
  server.on('clientError', (_e, sock) => sock.destroy())

  // ------------------------------------------------------------ TLS
  // The secure context in force; a reload swaps it, and only new connections use it.
  let ctx = tls.createSecureContext(current.opts)
  function reload(why) {
    const now = stamp(cfg.certDir)
    if (why === 'poll' && now === seen) return
    seen = now
    try {
      const next = loadCert(cfg.certDir, cfg.servername)
      ctx = tls.createSecureContext(next.opts)
      current = next
      log({ msg: 'certificate loaded', why, ...current.info })
    } catch (e) {
      log({ msg: 'certificate NOT reloaded; the one in force stays', why, error: String(e.message).slice(0, 200), ...current.info })
    }
  }
  const poll = setInterval(() => reload('poll'), 10_000)
  poll.unref()

  /**
   * TLS over the connection's bytes after the PROXY line. The TLS socket is built over a plain
   * stream that carries those bytes (and the rest of the first read), not over the TCP socket's
   * handle, which Node's TLS would read directly, losing what the PROXY reader already took.
   */
  function terminate(raw, client, rest) {
    const carry = new Duplex({
      read: () => raw.resume(),
      write: (c, enc, cb) => raw.write(c, enc, cb),
      final: (cb) => (raw.end(), cb()),
      destroy: (err, cb) => (raw.destroy(), cb(err)),
    })
    if (rest?.length) carry.push(rest)
    raw.on('data', (d) => carry.push(d) || raw.pause())
    raw.on('end', () => carry.push(null))
    raw.on('close', () => carry.destroy())
    const sock = new tls.TLSSocket(carry, {
      isServer: true,
      secureContext: ctx,
      ALPNProtocols: ['http/1.1'],
      // Only our name; a ClientHello naming another gets no certificate at all.
      SNICallback: (name, cb) => (name === cfg.servername ? cb(null, ctx) : cb(new Error('unknown server name'))),
    })
    sock.olaClient = client
    let secure = false
    const shut = () => (sock.destroy(), raw.destroy())
    const shake = setTimeout(() => (counts.handshake++, shut()), 10_000)
    // Before the handshake is done Node reports TLS errors as '_tlsError' (as its own TLS server
    // listens for them), after it as 'error'.
    const bad = () => (clearTimeout(shake), secure || counts.handshake++, shut())
    sock.on('_tlsError', bad)
    sock.on('error', bad)
    sock.on('close', () => (clearTimeout(shake), raw.destroy()))
    sock.once('secure', () => {
      clearTimeout(shake)
      secure = true
      server.emit('connection', sock)
    })
    raw.resume()
  }

  // ------------------------------------------------------------ what listens: plain TCP
  // It reads the relay's PROXY line (when on), applies the per-address cap, and starts TLS.
  const perAddr = new Map()
  const hand = (sock, client, rest) => {
    const key = addressKey(client.address)
    if ((perAddr.get(key) ?? 0) >= cfg.perAddress) return counts.capped++, sock.destroy()
    perAddr.set(key, (perAddr.get(key) ?? 0) + 1)
    sock.once('close', () => {
      const n = perAddr.get(key) - 1
      n > 0 ? perAddr.set(key, n) : perAddr.delete(key)
    })
    terminate(sock, client, rest)
  }
  const listener = net.createServer({ pauseOnConnect: true, allowHalfOpen: false }, (sock) => {
    sock.on('error', () => sock.destroy())
    if (!cfg.proxyIn) return hand(sock, { address: plain(sock.remoteAddress), port: sock.remotePort })
    let head = Buffer.alloc(0)
    const timer = setTimeout(() => (counts.noProxy++, sock.destroy()), 5_000)
    const onData = (d) => {
      head = Buffer.concat([head, d])
      const nl = head.indexOf('\r\n')
      // The spec's longest v1 line is 107 bytes with its CRLF; anything longer is refused.
      if (nl < 0 ? head.length > 107 : nl > 105) return clearTimeout(timer), counts.noProxy++, sock.destroy()
      if (nl < 0) return
      clearTimeout(timer)
      sock.off('data', onData)
      sock.pause()
      const p = parseProxy(head.subarray(0, nl).toString('latin1'))
      if (!p) return counts.noProxy++, sock.destroy()
      hand(sock, p, head.subarray(nl + 2))
    }
    sock.on('data', onData)
    sock.resume()
  })
  listener.maxConnections = cfg.maxConnections
  // Node starts the HTTP header and request timeouts on the server's 'listening' event, and this
  // server never listens itself (as at the front desk behind the PROXY protocol): pass it on, and
  // refuse to start if Node no longer hooks them there.
  if (!server.listeners('listening').some((f) => f.name === 'setupConnectionsTracking')) throw new Error('this Node does not start HTTP timeouts on listening; review ops/tls.mjs')
  listener.once('listening', () => server.emit('listening'))

  const report = setInterval(() => {
    if (Object.values(counts).some((n) => n > 0)) log({ msg: 'refused in the last minute', ...counts })
    for (const k of Object.keys(counts)) counts[k] = 0
  }, 60_000)
  report.unref()

  return { cfg, listener, reload, cert: () => current.info, log, close: () => (clearInterval(poll), clearInterval(report), listener.close(), server.close()) }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  let front
  try {
    front = makeTlsFront()
  } catch (e) {
    console.error(`tls: ${e.message}`)
    process.exit(78)
  }
  const { cfg } = front
  front.listener.on('error', (e) => (console.error(`tls: listen: ${e.code}`), process.exit(1)))
  front.listener.listen(cfg.listen.port, cfg.listen.host, () =>
    front.log({ msg: 'start', listen: `${cfg.listen.host}:${front.listener.address().port}`, upstream: `${cfg.upstream.host}:${cfg.upstream.port}`, servername: cfg.servername, proxyIn: cfg.proxyIn, proxyOut: cfg.proxyOut, gate: cfg.gate, devicePasses: !!cfg.passKey, ...front.cert() }),
  )
  process.on('SIGHUP', () => front.reload('SIGHUP'))
  const stop = () => (front.close(), process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
