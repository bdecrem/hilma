// The third outside review's proofs against the TLS front (ops/tls.mjs, 2026-11-16). It starts
// the real program on a loopback port of its own, with a throwaway CA and certificate made here
// by openssl (SHA-256), in front of a recording stub front desk that reads the PROXY line and
// notes every request it is handed: method, path, the client address and the raw header names.
// Never against the live cx.ola.tls job.
//   node frontdesk/review/rev3-tls.mjs        one line per proof, `pass` or `FAIL`; exit 1 on any FAIL
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.resolve(HERE, '../..')
const T = mkdtempSync(path.join(tmpdir(), 'rev3-tls-'))
const NAME = 'app.ola.cx'
const PASS = 'made-up-door-passcode-rv3-0123'
const GOOD = `Basic ${Buffer.from(`x:${PASS}`).toString('base64')}`
const BAD = `Basic ${Buffer.from('x:not-the-passcode-at-all').toString('base64')}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const proof = (name, pass, detail) => {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`)
}
const ssl = (...a) => {
  const r = spawnSync('openssl', a, { cwd: T, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`openssl ${a[0]}: ${r.stderr}`)
}
ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key')
ssl('req', '-x509', '-new', '-sha256', '-key', 'ca.key', '-subj', '/CN=rev3 CA', '-days', '2', '-out', 'ca.pem')
ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'key.pem')
ssl('req', '-new', '-sha256', '-key', 'key.pem', '-subj', `/CN=${NAME}`, '-out', 'csr.pem')
writeFileSync(path.join(T, 'ext.cnf'), `subjectAltName=DNS:${NAME}\nextendedKeyUsage=serverAuth\n`)
ssl('x509', '-req', '-sha256', '-in', 'csr.pem', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '2', '-extfile', 'ext.cnf', '-out', 'leaf.pem')
writeFileSync(path.join(T, 'cert.pem'), readFileSync(path.join(T, 'leaf.pem'), 'utf8') + readFileSync(path.join(T, 'ca.pem'), 'utf8'))
const CA = readFileSync(path.join(T, 'ca.pem'))

// ------------------------------------------------------------------ the recording stub
const seen = [] // { conn, method, url, client, names }
const rawBytes = new Map() // conn -> every byte the stub got on it
let conns = 0
const stubHttp = http.createServer((req, res) => {
  seen.push({ conn: req.socket.rv3Conn, method: req.method, url: req.url, client: req.socket.olaClient, names: req.rawHeaders.filter((_, i) => i % 2 === 0).map((h) => h.toLowerCase()), te: req.headers['transfer-encoding'] ?? null, cl: req.headers['content-length'] ?? null })
  let n = 0
  req.on('data', (d) => (n += d.length))
  req.on('end', () => res.end(JSON.stringify({ bodyBytes: n })))
})
const stub = net.createServer({ pauseOnConnect: true }, (sock) => {
  let head = Buffer.alloc(0)
  sock.rv3Conn = ++conns
  sock.on('error', () => {})
  sock.on('data', (d) => rawBytes.set(sock.rv3Conn, (rawBytes.get(sock.rv3Conn) ?? '') + d))
  const onData = (d) => {
    head = Buffer.concat([head, d])
    const nl = head.indexOf('\r\n')
    if (nl < 0) return
    sock.off('data', onData)
    sock.pause()
    sock.olaClient = /^PROXY TCP[46] (\S+) /.exec(head.subarray(0, nl).toString('latin1'))?.[1] ?? 'NO PROXY LINE'
    const rest = head.subarray(nl + 2)
    if (rest.length) sock.unshift(rest)
    if (sock._handle) sock._handle._consumed = true
    stubHttp.emit('connection', sock)
    sock.resume()
  }
  sock.on('data', onData)
  sock.resume()
})
await new Promise((r) => stub.listen(0, '127.0.0.1', r))

// ------------------------------------------------------------------ the front under test
function startFront(env = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.join(AI, 'ops/tls.mjs')], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, OLA_TLS_LISTEN: '127.0.0.1:0', OLA_TLS_UPSTREAM: `127.0.0.1:${stub.address().port}`, OLA_TLS_CERT_DIR: T, OLA_TLS_GATE_PASSCODE: PASS, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    c.stdout.on('data', (d) => {
      out += d
      const m = /"msg":"start","listen":"127\.0\.0\.1:(\d+)"/.exec(out)
      if (m) resolve({ port: +m[1], proc: c, out: () => out })
    })
    c.stderr.on('data', (d) => (out += d))
    c.on('exit', (code) => reject(new Error(`tls.mjs exited ${code}: ${out.slice(-300)}`)))
    process.on('exit', () => c.kill('SIGKILL'))
  })
}
/** Raw bytes over TLS after a PROXY line naming `from`; what came back, by the time the front closed or `ms` passed. */
function rawTls(port, bytes, { from = '203.0.113.20', ms = 3000 } = {}) {
  return new Promise((resolve) => {
    const raw = net.connect(port, '127.0.0.1', () => {
      raw.write(`PROXY TCP4 ${from} 127.0.0.1 51000 443\r\n`)
      const s = tls.connect({ socket: raw, servername: NAME, ca: CA, ALPNProtocols: ['http/1.1'] }, () => {
        for (const b of [].concat(bytes)) s.write(b)
      })
      let got = ''
      const done = () => (clearTimeout(t), s.destroy(), resolve(got))
      const t = setTimeout(done, ms)
      s.on('data', (d) => (got += d))
      s.on('close', done)
      s.on('error', done)
    })
    raw.on('error', () => resolve('connect error'))
  })
}
const statuses = (got) => [...got.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((m) => +m[1])
const H = (method, p, headers = [], body = '') => `${method} ${p} HTTP/1.1\r\nHost: ${NAME}\r\n${headers.map((h) => h + '\r\n').join('')}\r\n${body}`

const front = await startFront()
const P = front.port

// 1. Nothing reaches the front desk without the passcode, whatever the request looks like.
const before1 = seen.length
const probes = {
  root: H('GET', '/'),
  page: H('GET', '/v/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/x.html'),
  healthNotLoopback: H('GET', '/api/health'),
  absoluteUri: H('GET', `https://${NAME}/api/me`, [`Authorization: ${BAD}`]),
  asterisk: H('OPTIONS', '*'),
  connect: `CONNECT ${NAME}:443 HTTP/1.1\r\nHost: ${NAME}:443\r\n\r\n`,
  upgrade: H('GET', '/oc/api/event', ['Connection: Upgrade', 'Upgrade: websocket', 'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', `Authorization: ${GOOD}`]),
  h2cUpgrade: H('GET', '/', ['Connection: Upgrade, HTTP2-Settings', 'Upgrade: h2c', 'HTTP2-Settings: AAMAAABkAARAAAAAAAIAAAAA']),
  expectContinue: H('POST', '/api/files?name=a.txt', ['Expect: 100-continue', 'Content-Length: 5'], 'hello'),
  bearer: H('GET', '/api/me', ['Authorization: Bearer x']),
  lowercaseScheme: H('GET', '/api/me', [`Authorization: basic ${GOOD.slice(6)}`]),
  foldedAuth: H('GET', '/api/me', ['Authorization: Basic', ` ${GOOD.slice(6)}`]),
  badThenGood: H('GET', '/api/me', [`Authorization: ${BAD}`, `Authorization: ${GOOD}`]),
  proxyAuthOnly: H('GET', '/api/me', [`Proxy-Authorization: ${GOOD}`]),
  http10: `GET / HTTP/1.0\r\n\r\n`,
  http09: `GET /\r\n`,
  hugeHeader: H('GET', '/', [`X-Big: ${'a'.repeat(9000)}`, `Authorization: ${GOOD}`]),
  nulInLine: `GET /\0api HTTP/1.1\r\nHost: ${NAME}\r\nAuthorization: ${GOOD}\r\n\r\n`,
}
const answered1 = {}
for (const [k, v] of Object.entries(probes)) answered1[k] = statuses(await rawTls(P, v, { ms: 1500 })).join(',') || 'closed'
// The exact health path from a claimed loopback client is the one exception, by design.
const healthLoop = statuses(await rawTls(P, H('GET', '/api/health'), { from: '127.0.0.1' }))[0]
const healthQuery = statuses(await rawTls(P, H('GET', '/api/health?x=1'), { from: '127.0.0.1' }))[0]
const leaked = seen.slice(before1).filter((x) => x.url !== '/api/health' || x.client !== '127.0.0.1')
proof('without the passcode nothing reaches the front desk (19 request shapes)', leaked.length === 0 && healthLoop === 200 && healthQuery === 401, { reachedUpstream: leaked.map((x) => `${x.method} ${x.url}`), answers: answered1, healthFromLoopback: healthLoop, healthWithQueryFromLoopback: healthQuery })

// 2. Pipelined: one request with the passcode, then two without, on one connection.
const before2 = seen.length
const pipe = await rawTls(P, H('GET', '/one', [`Authorization: ${GOOD}`]) + H('GET', '/two') + H('GET', '/three', [`Authorization: ${BAD}`]), { ms: 3000 })
const got2 = seen.slice(before2).map((x) => x.url)
proof('pipelined requests after an authenticated one are each gated', got2.join() === '/one', { reachedUpstream: got2, answers: statuses(pipe) })

// 3. Framing: what an authenticated client's body becomes at the front desk.
const smuggle = `GET /smuggled HTTP/1.1\r\nHost: ${NAME}\r\n\r\n`
const chunk = (s) => `${Buffer.byteLength(s).toString(16)}\r\n${s}\r\n0\r\n\r\n`
const framing = {
  getChunked: H('GET', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding: chunked'], chunk(smuggle)),
  deleteChunked: H('DELETE', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding: chunked'], chunk(smuggle)),
  clAndTe: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Content-Length: 4', 'Transfer-Encoding: chunked'], chunk(smuggle)),
  twoLengths: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Content-Length: 4', `Content-Length: ${smuggle.length + 4}`], `abcd${smuggle}`),
  teIdentity: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding: identity'], smuggle),
  teChunkedThenIdentity: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding: chunked, identity'], chunk(smuggle)),
  chunkExtension: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding: chunked'], `${Buffer.byteLength(smuggle).toString(16)};ext="a\r\n"\r\n${smuggle}\r\n0\r\n\r\n`),
  foldedTe: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding:', ' chunked'], chunk(smuggle)),
  spaceBeforeColon: H('POST', '/framed', [`Authorization: ${GOOD}`, 'Transfer-Encoding : chunked', 'Content-Length: 4'], 'abcd' + smuggle),
}
const framed = {}
for (const [k, v] of Object.entries(framing)) {
  const b = seen.length
  const got = await rawTls(P, v, { ms: 1500 })
  framed[k] = { answers: statuses(got).join(',') || 'closed', upstream: seen.slice(b).map((x) => x.url) }
}
const smuggled = Object.entries(framed).filter(([, v]) => v.upstream.includes('/smuggled')).map(([k]) => k)
// What actually went up for the chunked GET and DELETE: framed, or the body as bare bytes after
// the headers (then only the front desk's own parser, refusing data after a Connection: close
// request, keeps the request inside it from being read).
const upFor = (method) => [...rawBytes.values()].find((b) => b.includes(`${method} /framed `)) ?? ''
const bare = ['GET', 'DELETE'].filter((m) => /\r\n\r\nGET \/smuggled/.test(upFor(m)))
proof('a body is never read as a request by the front desk, and a chunked body stays framed', smuggled.length === 0 && bare.length === 0, { smuggledIn: smuggled, bareBodyAfterHeaders: bare, all: framed })

// 4. Authorization (and the PROXY line's address) as the front desk sees them.
const authSeen = seen.filter((x) => x.names.includes('authorization') || x.names.includes('proxy-authorization')).length
const clients = [...new Set(seen.filter((x) => x.url !== '/smuggled').map((x) => x.client))]
proof('no Authorization reaches the front desk; every request carries the PROXY address', authSeen === 0 && clients.every((c) => ['203.0.113.20', '127.0.0.1'].includes(c)), { withAuthorization: authSeen, clients })

// 5. Garbage, then is it still up?
const garbage = []
for (const g of [Buffer.from('PROXY TCP4 1.2.3.4 5.6.7.8 1 2\r\n' + 'x'.repeat(300)), Buffer.from([0x16, 0x03, 0x01, 0xff, 0xff, ...Array(500).fill(0x41)]), Buffer.alloc(4096, 0xff)]) {
  garbage.push(
    await new Promise((resolve) => {
      const s = net.connect(P, '127.0.0.1', () => s.write(g))
      s.on('error', () => {})
      s.on('close', () => resolve('closed'))
      setTimeout(() => (s.destroy(), resolve('open after 6 s')), 6000)
    }),
  )
}
garbage.push(statuses(await rawTls(P, Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 7919) % 256)))).join(',') || 'closed')
const alive = statuses(await rawTls(P, H('GET', '/alive', [`Authorization: ${GOOD}`])))[0]
proof('garbage at each layer is dropped and the front keeps serving', alive === 200 && front.proc.exitCode === null, { garbage, afterwards: alive })

// 6. The lockout is per client address as the relay reports it.
const lock = []
for (let i = 0; i < 10; i++) lock.push(statuses(await rawTls(P, H('GET', '/api/me', [`Authorization: ${BAD}`]), { from: '198.51.100.66', ms: 12_000 }))[0])
const rightFromThere = statuses(await rawTls(P, H('GET', '/after', [`Authorization: ${GOOD}`]), { from: '198.51.100.66' }))[0]
const rightElsewhere = statuses(await rawTls(P, H('GET', '/after', [`Authorization: ${GOOD}`]), { from: '198.51.100.67' }))[0]
proof('ten wrong passcodes block that address only (the right one too, by design)', lock.at(-1) === 401 && rightFromThere === 429 && rightElsewhere === 200, { tenWrong: lock, rightFromSame: rightFromThere, rightFromOther: rightElsewhere })

front.proc.kill()
stub.close()
rmSync(T, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
