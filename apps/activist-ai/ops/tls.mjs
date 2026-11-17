#!/usr/bin/env node
// The TLS front: where encryption ends, on our own machine, and the door's passcode.
//
// It holds app.ola.cx's certificate and takes each connection from the relay in front of it
// (Tailscale serve on stage 1, the ngrok agent's TLS pass-through on stage 2; both send a PROXY v1
// line first, so the client's address is known). It finishes TLS, and while the gate is on it
// asks for the door passcode (HTTP Basic auth, any user name) before a single byte reaches the
// front desk. A request that passes has its Authorization header removed and goes to the front
// desk on 127.0.0.1 over HTTP/1.1, on a connection that starts with a PROXY v1 line naming the
// client. Bodies and replies stream both ways with backpressure (server-sent events, uploads);
// nothing is buffered. Every other HTTP check (Host, Origin, the body limits, HSTS and the other
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
//   OLA_TLS_GATE          1                the door passcode is required (0: off, the day the review is done)
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
// wrong passcode is a failure for the client's address (an IPv6 one by its /64): the n-th failure
// in a row is answered after min(250 ms × 2^(n-1), 8 s), and the 10th within 15 minutes blocks the
// address for 15 minutes (429 to everything, the right passcode too). The comparison is of SHA-256
// digests in constant time, so neither the answer nor its timing depends on how close a guess was.
// `/api/health` passes without the passcode from loopback only (the status command asks there).
// A request to upgrade the connection (WebSocket) is refused: the front desk uses none.
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

export const CIPHERS = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
].join(':')
const KNOWN = ['LISTEN', 'UPSTREAM', 'CERT_DIR', 'SERVERNAME', 'PROXY_IN', 'PROXY_OUT', 'GATE', 'GATE_PASSCODE', 'CONNECTIONS_PER_ADDRESS', 'MAX_CONNECTIONS'].map((k) => `OLA_TLS_${k}`)
export const GATE = { firstDelayMs: 250, maxDelayMs: 8_000, blockAfter: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000, maxTracked: 10_000 }

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
  const gate = flag('OLA_TLS_GATE', '1')
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

const PAGE_401 = '<!doctype html><meta charset="utf-8"><title>Ola</title><p>Ola is private. Ask Bart for the door passcode.</p>\n'
const PAGE_429 = '<!doctype html><meta charset="utf-8"><title>Ola</title><p>Too many wrong passcodes from here. Try again in 15 minutes.</p>\n'

export function makeTlsFront(cfg = config()) {
  const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), event: 'tls', ...o }))
  let current = loadCert(cfg.certDir, cfg.servername)
  let seen = stamp(cfg.certDir)
  const counts = { noProxy: 0, handshake: 0, capped: 0, noPasscode: 0, wrongPasscode: 0, blocked: 0, upgrade: 0, upstreamDown: 0 }

  // ------------------------------------------------------------ the gate
  const fails = new Map() // address key -> { n, last, blockedUntil }
  function passes(req) {
    const h = req.headers.authorization
    if (typeof h !== 'string') return null
    const m = /^Basic ([A-Za-z0-9+/=]{1,400})$/.exec(h)
    const decoded = m ? Buffer.from(m[1], 'base64').toString('utf8') : ''
    const pass = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : ''
    return timingSafeEqual(createHash('sha256').update(pass).digest(), cfg.passDigest)
  }
  function failed(key) {
    const now = Date.now()
    let f = fails.get(key)
    if (!f || now - f.last > GATE.windowMs) f = { n: 0, last: now, blockedUntil: 0 }
    f.n++
    f.last = now
    if (f.n >= GATE.blockAfter) f.blockedUntil = now + GATE.blockMs
    fails.delete(key)
    fails.set(key, f) // newest last; the oldest are dropped past maxTracked
    if (fails.size > GATE.maxTracked) fails.delete(fails.keys().next().value)
    return Math.min(GATE.firstDelayMs * 2 ** (f.n - 1), GATE.maxDelayMs)
  }
  const blocked = (key) => (fails.get(key)?.blockedUntil ?? 0) > Date.now()
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
  const pipeUp = (req, res, client) => {
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && k !== 'authorization') headers[k] = v
    // A chunked body stays chunked. Node's client frames a GET, HEAD or DELETE body only when told:
    // without this the body went up as raw bytes after the headers, where a request inside it was
    // stopped only by the front desk's parser refusing bytes after a `Connection: close` request
    // (third review, 2026-11-16; frontdesk/review/rev3-tls.mjs). Node's parser has already refused
    // any Transfer-Encoding that does not end in chunked, and one sent with a Content-Length.
    if (req.headers['transfer-encoding'] !== undefined) headers['transfer-encoding'] = 'chunked'
    const up = http.request({
      method: req.method,
      path: req.url,
      headers,
      // No agent (agent: false would make one, which ignores createConnection): one upstream
      // connection per request, opened with the PROXY line.
      createConnection: (_o, cb) => {
        const s = net.connect({ host: cfg.upstream.host, port: cfg.upstream.port })
        s.once('connect', () => {
          if (cfg.proxyOut) {
            const v6 = net.isIP(client.address) === 6
            s.write(`PROXY ${v6 ? 'TCP6' : 'TCP4'} ${client.address} ${v6 ? '::1' : '127.0.0.1'} ${client.port} ${cfg.upstream.port}\r\n`)
          }
          cb(null, s)
        })
        s.once('error', (e) => cb(e))
        return undefined
      },
    })
    up.on('response', (r) => {
      const out = []
      for (let i = 0; i < r.rawHeaders.length; i += 2) if (!HOP.has(r.rawHeaders[i].toLowerCase())) out.push(r.rawHeaders[i], r.rawHeaders[i + 1])
      res.writeHead(r.statusCode, r.statusMessage, out)
      res.flushHeaders() // an event stream's headers go out at once
      r.pipe(res)
      r.on('error', () => res.destroy())
    })
    up.on('error', () => {
      counts.upstreamDown++
      if (!res.headersSent) refuse(res, 502, '<!doctype html><meta charset="utf-8"><title>Ola</title><p>Ola is not answering just now.</p>\n')
      else res.destroy()
    })
    res.on('close', () => up.destroy())
    req.pipe(up)
  }

  async function handle(req, res) {
    const client = req.socket.olaClient
    if (!client) return req.socket.destroy()
    if (cfg.gate && !(req.url === '/api/health' && LOOPBACK.has(client.address))) {
      const key = addressKey(client.address)
      if (blocked(key)) return counts.blocked++, refuse(res, 429, PAGE_429, { 'retry-after': String(Math.ceil(GATE.blockMs / 1000)) })
      const ok = passes(req)
      if (ok === null) return counts.noPasscode++, refuse(res, 401, PAGE_401, { 'www-authenticate': 'Basic realm="Ola", charset="UTF-8"' })
      if (!ok) {
        counts.wrongPasscode++
        const wait = failed(key)
        return setTimeout(() => refuse(res, 401, PAGE_401, { 'www-authenticate': 'Basic realm="Ola", charset="UTF-8"' }), wait)
      }
      fails.delete(key)
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
    front.log({ msg: 'start', listen: `${cfg.listen.host}:${front.listener.address().port}`, upstream: `${cfg.upstream.host}:${cfg.upstream.port}`, servername: cfg.servername, proxyIn: cfg.proxyIn, proxyOut: cfg.proxyOut, gate: cfg.gate, ...front.cert() }),
  )
  process.on('SIGHUP', () => front.reload('SIGHUP'))
  const stop = () => (front.close(), process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
