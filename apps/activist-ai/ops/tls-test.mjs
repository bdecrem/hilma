// The TLS front's tests: node --test ops/tls-test.mjs (about 10 s). Each starts the real program
// (ops/tls.mjs as a child process, its settings from the environment) in front of a stub front
// desk that reads the PROXY line the way the front desk does, with certificates from a throwaway
// CA made by openssl. Needs openssl on PATH (LibreSSL or OpenSSL).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const T = mkdtempSync(path.join(tmpdir(), 'ola-tls-test-'))
const NAME = 'app.ola.cx'
const PASS = 'k7Hm3Qp9Wx2Rt8Vn4Zc6'
const BASIC = `Basic ${Buffer.from(`ola:${PASS}`).toString('base64')}`
const ssl = (...a) => {
  const r = spawnSync('openssl', a, { cwd: T, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`openssl ${a[0]}: ${r.stderr}`)
}
/** A leaf for `name`, signed by the test CA, in its own folder (key.pem, cert.pem = leaf + CA). */
function leaf(dir, name) {
  mkdirSync(path.join(T, dir))
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${dir}/key.pem`)
  ssl('req', '-new', '-key', `${dir}/key.pem`, '-subj', `/CN=${name}`, '-out', `${dir}/csr.pem`)
  writeFileSync(path.join(T, dir, 'ext.cnf'), `subjectAltName=DNS:${name}\nextendedKeyUsage=serverAuth\n`)
  ssl('x509', '-req', '-in', `${dir}/csr.pem`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '2', '-extfile', `${dir}/ext.cnf`, '-out', `${dir}/leaf.pem`)
  writeFileSync(path.join(T, dir, 'cert.pem'), readFileSync(path.join(T, dir, 'leaf.pem'), 'utf8') + readFileSync(path.join(T, 'ca.pem'), 'utf8'))
  return new X509Certificate(readFileSync(path.join(T, dir, 'leaf.pem'))).serialNumber
}
let CA, SERIAL_A, SERIAL_B
const LIVE = path.join(T, 'current')
const swap = (dir) => (rmSync(`${LIVE}.new`, { force: true }), symlinkSync(path.join(T, dir), `${LIVE}.new`), renameSync(`${LIVE}.new`, LIVE))

// ------------------------------------------------------------------ the stub front desk
// Reads a PROXY v1 line (refusing a connection without one, as OLA_FD_PROXY_PROTOCOL=1 does), then
// serves: /who (the client address it was told), /upload (counts the body as it streams), /sse
// (an event every 200 ms until the client goes).
let stub, STUB_PORT
const stubHttp = http.createServer((req, res) => {
  const client = req.socket.olaClient ?? null
  if (req.url === '/who' || req.url === '/api/health') return res.end(JSON.stringify({ client, host: req.headers.host, authorization: req.headers.authorization ?? null }))
  if (req.url === '/upload') {
    let n = 0
    req.on('data', (d) => (n += d.length))
    req.on('end', () => res.end(JSON.stringify({ bytes: n, client })))
    return
  }
  if (req.url === '/sse') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
    let i = 0
    const t = setInterval(() => res.write(`data: ${i++}\n\n`), 200)
    res.on('close', () => clearInterval(t))
    return
  }
  res.statusCode = 404
  res.end()
})
function startStub() {
  return new Promise((resolve) => {
    stub = net.createServer({ pauseOnConnect: true }, (sock) => {
      let head = Buffer.alloc(0)
      const onData = (d) => {
        head = Buffer.concat([head, d])
        const nl = head.indexOf('\r\n')
        if (nl < 0) return head.length > 107 && sock.destroy()
        sock.off('data', onData)
        sock.pause()
        const m = /^PROXY (TCP4|TCP6) (\S+) (\S+) (\d+) (\d+)$/.exec(head.subarray(0, nl).toString('latin1'))
        if (!m) return sock.destroy()
        sock.olaClient = m[2]
        const rest = head.subarray(nl + 2)
        if (rest.length) sock.unshift(rest)
        if (sock._handle) sock._handle._consumed = true
        stubHttp.emit('connection', sock)
        sock.resume()
      }
      sock.on('data', onData)
      sock.on('error', () => {})
      sock.resume()
    })
    stub.listen(0, '127.0.0.1', () => resolve((STUB_PORT = stub.address().port)))
  })
}

// ------------------------------------------------------------------ the program under test
const kids = []
function startFront(env = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.join(HERE, 'tls.mjs')], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, OLA_TLS_LISTEN: '127.0.0.1:0', OLA_TLS_UPSTREAM: `127.0.0.1:${STUB_PORT}`, OLA_TLS_CERT_DIR: LIVE, OLA_TLS_GATE_PASSCODE: PASS, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    kids.push(c)
    let out = ''
    c.stdout.on('data', (d) => {
      out += d
      const m = /"msg":"start","listen":"127\.0\.0\.1:(\d+)"/.exec(out)
      if (m) resolve({ port: +m[1], proc: c, out: () => out })
    })
    c.stderr.on('data', (d) => (out += d))
    c.on('exit', (code) => reject(new Error(`tls.mjs exited ${code}: ${out}`)))
  })
}
/** A TLS connection to the front, after a PROXY line naming `from` (or none). */
function connect(port, { from = '100.101.102.103', proxy = true, servername = NAME, ...opts } = {}) {
  return new Promise((resolve, reject) => {
    const raw = net.connect(port, '127.0.0.1', () => {
      if (proxy) raw.write(net.isIP(from) === 6 ? `PROXY TCP6 ${from} ::1 51000 8443\r\n` : `PROXY TCP4 ${from} 100.95.51.98 51000 8443\r\n`)
      const s = tls.connect({ socket: raw, servername, ca: CA, ALPNProtocols: ['http/1.1'], ...opts })
      s.once('secureConnect', () => resolve(s))
      s.once('error', reject)
    })
    raw.once('error', reject)
  })
}
function get(port, p, { auth = `ola:${PASS}`, ...opts } = {}, body) {
  return connect(port, opts).then(
    (sock) =>
      new Promise((resolve, reject) => {
        const req = https.request({ host: NAME, defaultPort: 443, path: p, method: body ? 'POST' : 'GET', createConnection: () => sock, headers: { ...(body ? { 'content-length': body.length } : {}), ...(auth ? { authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {}) } }, (res) => {
          let t = ''
          res.on('data', (d) => (t += d))
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: t, serial: sock.getPeerX509Certificate()?.serialNumber, protocol: sock.getProtocol() }))
        })
        req.on('error', reject)
        req.end(body)
      }),
  )
}

before(async () => {
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key')
  ssl('req', '-x509', '-new', '-key', 'ca.key', '-subj', '/CN=Ola test CA', '-days', '2', '-out', 'ca.pem')
  CA = readFileSync(path.join(T, 'ca.pem'))
  SERIAL_A = leaf('a', NAME)
  SERIAL_B = leaf('b', NAME)
  leaf('wrong', 'other.example')
  swap('a')
  await startStub()
})
after(() => {
  for (const k of kids) k.kill('SIGKILL')
  stub?.close()
  rmSync(T, { recursive: true, force: true })
})

test('a request reaches the front desk with the client address from the relay, over TLS 1.3 by default', async () => {
  const f = await startFront()
  const r = await get(f.port, '/who', { from: '100.64.7.9' })
  assert.equal(r.status, 200)
  // The passcode got it through, and the front desk never sees it.
  assert.deepEqual(JSON.parse(r.body), { client: '100.64.7.9', host: NAME, authorization: null })
  assert.equal(r.serial, SERIAL_A)
  assert.equal(r.protocol, 'TLSv1.3')
  const r6 = await get(f.port, '/who', { from: 'fd7a:115c:a1e0::1' })
  assert.equal(JSON.parse(r6.body).client, 'fd7a:115c:a1e0::1')
  // TLS 1.2 with a modern cipher works.
  const r12 = await get(f.port, '/who', { maxVersion: 'TLSv1.2' })
  assert.equal(r12.status, 200)
  assert.equal(r12.protocol, 'TLSv1.2')
})

test('without OLA_TLS_PROXY_IN the client is the socket peer', async () => {
  const f = await startFront({ OLA_TLS_PROXY_IN: '0' })
  const r = await get(f.port, '/who', { proxy: false })
  assert.equal(JSON.parse(r.body).client, '127.0.0.1')
})

test('server-sent events arrive as they are written, not when the stream ends', async () => {
  const f = await startFront()
  const sock = await connect(f.port)
  const times = []
  await new Promise((resolve, reject) => {
    const t0 = Date.now()
    const req = https.request({ host: NAME, defaultPort: 443, path: '/sse', createConnection: () => sock, headers: { authorization: BASIC } }, (res) => {
      res.on('data', (d) => {
        for (const _ of String(d).match(/data: /g) ?? []) times.push(Date.now() - t0)
        if (times.length >= 4) (req.destroy(), resolve())
      })
    })
    req.on('error', (e) => (times.length >= 4 ? resolve() : reject(e)))
    req.end()
  })
  assert.ok(times[0] < 600, `first event after ${times[0]} ms`)
  assert.ok(times[3] - times[0] >= 450, `events came in a burst: ${times}`)
})

test('a 20 MB upload passes, streamed', async () => {
  const f = await startFront()
  const body = Buffer.alloc(20 * 1024 * 1024, 7)
  const r = await get(f.port, '/upload', {}, body)
  assert.equal(r.status, 200)
  assert.equal(JSON.parse(r.body).bytes, body.length)
})

test('refused: plain HTTP, TLS 1.1, no PROXY line, a malformed one, another server name', async () => {
  const f = await startFront()
  // Plain HTTP after a good PROXY line: no HTTP answer of any kind, the connection is closed.
  const plain = await new Promise((resolve) => {
    const s = net.connect(f.port, '127.0.0.1', () => s.write(`PROXY TCP4 100.64.0.2 100.95.51.98 1 8443\r\nGET /who HTTP/1.1\r\nHost: ${NAME}\r\n\r\n`))
    let got = ''
    s.on('data', (d) => (got += d.toString('latin1')))
    s.on('close', () => resolve(got))
    s.on('error', () => {})
  })
  assert.ok(!plain.includes('HTTP/'), `plain HTTP was answered: ${plain.slice(0, 40)}`)
  // TLS 1.1: the client offers only 1.1 (and 1.0); the server must answer with an alert.
  const old = await connect(f.port, { minVersion: 'TLSv1', maxVersion: 'TLSv1.1', ciphers: 'DEFAULT@SECLEVEL=0' }).then(
    () => 'connected',
    (e) => e.code ?? e.message,
  )
  assert.match(old, /ALERT_PROTOCOL_VERSION|protocol version|ECONNRESET|SOCKET_CLOSED|UNSUPPORTED_PROTOCOL/i, `TLS 1.1: ${old}`)
  assert.notEqual(old, 'connected')
  // TLS 1.2 with a non-forward-secret cipher (RSA key exchange) only: no shared cipher.
  const weak = await connect(f.port, { maxVersion: 'TLSv1.2', ciphers: 'AES128-SHA:AES256-SHA' }).then(() => 'connected', (e) => e.code ?? e.message)
  assert.notEqual(weak, 'connected')
  const noProxy = await connect(f.port, { proxy: false }).then(() => 'connected', (e) => e.code ?? e.message)
  assert.notEqual(noProxy, 'connected')
  const bad = await new Promise((resolve) => {
    const s = net.connect(f.port, '127.0.0.1', () => s.write('PROXY TCP4 999.1.1.1 127.0.0.1 1 1\r\n'))
    s.on('close', () => resolve('closed'))
    s.on('error', () => {})
  })
  assert.equal(bad, 'closed')
  const otherName = await connect(f.port, { servername: 'evil.example', checkServerIdentity: () => undefined }).then(() => 'connected', (e) => e.code ?? e.message)
  assert.notEqual(otherName, 'connected')
})

test('a new certificate is picked up (poll and SIGHUP) without dropping an open connection; a bad one is not used', async () => {
  swap('a')
  const f = await startFront()
  assert.equal((await get(f.port, '/who')).serial, SERIAL_A)
  // An open event stream on certificate A.
  const sock = await connect(f.port)
  let events = 0
  const req = https.request({ host: NAME, defaultPort: 443, path: '/sse', createConnection: () => sock, headers: { authorization: BASIC } }, (res) => res.on('data', (d) => (events += (String(d).match(/data: /g) ?? []).length)))
  req.on('error', () => {})
  req.end()
  await new Promise((r) => setTimeout(r, 500))
  swap('b')
  f.proc.kill('SIGHUP')
  await new Promise((r) => setTimeout(r, 300))
  assert.equal((await get(f.port, '/who')).serial, SERIAL_B)
  const before = events
  await new Promise((r) => setTimeout(r, 700))
  assert.ok(events > before && !sock.destroyed, `the open stream stopped after the reload (${before} -> ${events})`)
  assert.equal(sock.getPeerX509Certificate().serialNumber, SERIAL_A)
  req.destroy()
  // A pair that does not match (B's certificate, A's key) and a certificate for another name are refused; B stays.
  mkdirSync(path.join(T, 'mixed'))
  writeFileSync(path.join(T, 'mixed/key.pem'), readFileSync(path.join(T, 'a/key.pem')))
  writeFileSync(path.join(T, 'mixed/cert.pem'), readFileSync(path.join(T, 'b/cert.pem')))
  for (const dir of ['mixed', 'wrong']) {
    swap(dir)
    f.proc.kill('SIGHUP')
    await new Promise((r) => setTimeout(r, 300))
    assert.equal((await get(f.port, '/who')).serial, SERIAL_B, `${dir} was used`)
  }
  assert.match(f.out(), /certificate NOT reloaded/)
  // Back to A by the 10-second poll alone, no signal.
  swap('a')
  await new Promise((r) => setTimeout(r, 10_500))
  assert.equal((await get(f.port, '/who')).serial, SERIAL_A)
})

test('settings: refuses a non-loopback listen address, an unknown setting, and a certificate that does not load', async () => {
  for (const env of [{ OLA_TLS_LISTEN: '0.0.0.0:4743' }, { OLA_TLS_LISTEN: '100.95.51.98:443' }, { OLA_TLS_PROXYIN: '1' }, { OLA_TLS_CERT_DIR: path.join(T, 'wrong') }, { OLA_TLS_UPSTREAM: '10.0.0.1:4700' }]) {
    await assert.rejects(startFront(env), /exited 78/, JSON.stringify(env))
  }
  // The gate is on unless switched off, and it wants a real passcode.
  for (const env of [{ OLA_TLS_GATE_PASSCODE: '' }, { OLA_TLS_GATE_PASSCODE: 'short' }, { OLA_TLS_GATE_PASSCODE: 'has a space in it 1234567' }, { OLA_TLS_GATE: 'yes' }]) {
    await assert.rejects(startFront(env), /exited 78/, JSON.stringify(env))
  }
})

// ------------------------------------------------------------------ the door passcode
const challenge = 'Basic realm="Ola", charset="UTF-8"'
test('the gate: no passcode is 401 with a challenge and a tiny page, and nothing reaches the front desk', async () => {
  const f = await startFront()
  const r = await get(f.port, '/who', { auth: null })
  assert.equal(r.status, 401)
  assert.equal(r.headers['www-authenticate'], challenge)
  assert.equal(r.headers.connection, 'close')
  assert.ok(r.body.length < 200 && !r.body.includes('client'), r.body)
  // The user name does not matter; a wrong passcode is 401 too.
  assert.equal((await get(f.port, '/who', { auth: `x:${PASS}x`, from: '100.64.9.1' })).status, 401)
  assert.equal((await get(f.port, '/who', { auth: `someone-else:${PASS}`, from: '100.64.9.1' })).status, 200)
  assert.equal((await get(f.port, '/who', { auth: PASS, from: '100.64.9.2' })).status, 401, 'no colon is no passcode')
  // A POST with a 20 MB body and no passcode: refused without reading the body.
  const t0 = Date.now()
  const p = await get(f.port, '/upload', { auth: null }, Buffer.alloc(20 * 1024 * 1024)).catch((e) => ({ status: e.code }))
  assert.ok(p.status === 401 || p.status === 'EPIPE' || p.status === 'ECONNRESET', `upload without a passcode: ${p.status}`)
  assert.ok(Date.now() - t0 < 3000)
  // A WebSocket upgrade with the passcode is refused.
  const up = await connect(f.port).then(
    (s) =>
      new Promise((resolve) => {
        let got = ''
        s.on('data', (d) => (got += d))
        s.on('close', () => resolve(got))
        s.on('error', () => {})
        s.write(`GET /who HTTP/1.1\r\nHost: ${NAME}\r\nAuthorization: ${BASIC}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`)
      }),
  )
  assert.equal(up, '')
})

test('the gate: /api/health passes without the passcode from loopback only; OLA_TLS_GATE=0 lets everything through', async () => {
  const f = await startFront()
  assert.equal((await get(f.port, '/api/health', { auth: null, from: '127.0.0.1' })).status, 200)
  assert.equal((await get(f.port, '/api/health', { auth: null, from: '100.64.3.3' })).status, 401)
  assert.equal((await get(f.port, '/api/health?x', { auth: null, from: '127.0.0.1' })).status, 401)
  const open = await startFront({ OLA_TLS_GATE: '0', OLA_TLS_GATE_PASSCODE: '' })
  assert.equal((await get(open.port, '/who', { auth: null })).status, 200)
})

test('the gate: wrong passcodes get slower, then the address is blocked (the right passcode too); others are not', async () => {
  const f = await startFront()
  const time = async (auth, from) => {
    const t = Date.now()
    const r = await get(f.port, '/who', { auth, from })
    return { status: r.status, ms: Date.now() - t }
  }
  const a = '100.64.20.1'
  const t1 = await time('u:wrong', a)
  const t2 = await time('u:wrong', a)
  const t3 = await time('u:wrong', a)
  assert.deepEqual([t1.status, t2.status, t3.status], [401, 401, 401])
  assert.ok(t1.ms >= 240 && t2.ms >= 490 && t3.ms >= 990, `delays ${t1.ms} ${t2.ms} ${t3.ms}`)
  // A near miss and a far miss from fresh addresses get the same answer in the same time.
  const near = await time(`u:${PASS.slice(0, -1)}X`, '100.64.30.1')
  const far = await time('u:zzzzzzzzzzzzzzzzzzzzzzzz', '100.64.30.2')
  assert.equal(near.status, far.status)
  assert.ok(Math.abs(near.ms - far.ms) < 80, `near ${near.ms} ms, far ${far.ms} ms`)
  // Ten wrong tries (sent at once) block the address: then the right passcode is 429 too.
  const b = '100.64.40.1'
  await Promise.all(Array.from({ length: 10 }, () => time('u:nope', b)))
  const blocked = await get(f.port, '/who', { from: b })
  assert.equal(blocked.status, 429)
  assert.ok(blocked.headers['retry-after'])
  // Another address in the same IPv6 /64 is the same client; another /64 and another IPv4 are not.
  await Promise.all(Array.from({ length: 10 }, () => time('u:nope', '2001:db8:1:2::10')))
  assert.equal((await get(f.port, '/who', { from: '2001:db8:1:2::99' })).status, 429)
  assert.equal((await get(f.port, '/who', { from: '2001:db8:1:3::10' })).status, 200)
  assert.equal((await get(f.port, '/who', { from: '100.64.40.2' })).status, 200)
  // A right passcode resets the count of an address that is not blocked.
  const d = '100.64.50.1'
  await time('u:wrong', d)
  await get(f.port, '/who', { from: d })
  assert.ok((await time('u:wrong', d)).ms < 450, 'the count was not reset by a right passcode')
})

test('slow clients: headers a byte at a time are cut after about 5 s; a connection that never shakes hands, after 10 s', async () => {
  const f = await startFront()
  const sock = await connect(f.port)
  const t0 = Date.now()
  const got = await new Promise((resolve) => {
    let out = ''
    sock.on('data', (d) => (out += d))
    sock.on('close', () => resolve(out))
    sock.on('error', () => {})
    sock.write(`GET /who HTTP/1.1\r\nHost: ${NAME}\r\n`)
    const t = setInterval(() => (sock.destroyed ? clearInterval(t) : sock.write('X')), 500)
  })
  const ms = Date.now() - t0
  assert.ok(ms < 8000, `slow headers held ${ms} ms`)
  assert.ok(!got.includes('200 OK'), got.slice(0, 40))
  const raw = await new Promise((resolve) => {
    const t = Date.now()
    const s = net.connect(f.port, '127.0.0.1', () => s.write('PROXY TCP4 100.64.0.9 100.95.51.98 1 8443\r\n'))
    s.on('close', () => resolve(Date.now() - t))
    s.on('error', () => {})
  })
  assert.ok(raw >= 9000 && raw < 12_500, `no handshake held ${raw} ms`)
})
