// A deploy drops no request (OLA-94): node --test ops/restart-test.mjs (about 20 s, no VM).
//
// 1. Which jobs a deploy restarts (ops/restart.mjs): each job's files, and "unchanged" between two
//    releases only when every one of them is the same.
// 2. The real TLS front (ops/tls.mjs) in front of the real front desk (frontdesk/server.mjs), each a
//    process of its own, while the front desk is stopped with SIGTERM and started again the moment it
//    exits (what launchd does in a deploy's kickstart -k): requests every 20 ms, GETs and POSTs, and
//    one POST whose body is still arriving when the stop comes. None may fail.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import { FILES, closure, fingerprint, unchanged } from './restart.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.join(HERE, '..')
const T = mkdtempSync(path.join(tmpdir(), 'ola-restart-test-'))
const kids = []
after(() => {
  for (const k of kids) k.kill('SIGKILL')
  rmSync(T, { recursive: true, force: true })
})

// ---------------------------------------------------------------- 1. which jobs restart
test('each job’s files: the TLS front is tls.mjs, pass.mjs and run.mjs; the tunnel adds ngrok.yml; the gateway is its folder', () => {
  assert.deepEqual(closure(AI, FILES['cx.ola.tls'].entries, FILES['cx.ola.tls'].read), ['ops/pass.mjs', 'ops/run.mjs', 'ops/tls.mjs'])
  assert.deepEqual(closure(AI, FILES['cx.ola.tunnel'].entries, FILES['cx.ola.tunnel'].read), ['ops/ngrok.yml', 'ops/run.mjs', 'ops/tunnel.mjs'])
  const gw = closure(AI, FILES['cx.ola.gateway'].entries)
  assert.ok(gw.includes('gateway/server.mjs') && gw.includes('gateway/specialists.mjs') && gw.includes('ops/run.mjs'), gw.join(' '))
  assert.ok(gw.every((f) => f.startsWith('gateway/') || f === 'ops/run.mjs'), gw.join(' '))
  assert.equal(fingerprint(AI, 'cx.ola.frontdesk'), null, 'the front desk always restarts')
})

test('unchanged only when every file of the job is the same: another file changing does not count; one of its own does; a missing release never is', () => {
  const a = path.join(T, 'releases/aaaa/apps/activist-ai')
  const b = path.join(T, 'releases/bbbb/apps/activist-ai')
  for (const d of [a, b]) {
    mkdirSync(path.join(d, 'ops'), { recursive: true })
    for (const f of ['tls.mjs', 'pass.mjs', 'run.mjs', 'tunnel.mjs', 'ngrok.yml']) cpSync(path.join(HERE, f), path.join(d, 'ops', f))
    mkdirSync(path.join(d, 'frontdesk'), { recursive: true })
  }
  writeFileSync(path.join(a, 'frontdesk/server.mjs'), '// one\n')
  writeFileSync(path.join(b, 'frontdesk/server.mjs'), '// two\n')
  assert.equal(unchanged('cx.ola.tls', a, b), true)
  assert.equal(unchanged('cx.ola.tunnel', a, b), true)
  assert.equal(unchanged('cx.ola.frontdesk', a, b), false)
  writeFileSync(path.join(b, 'ops/pass.mjs'), readFileSync(path.join(b, 'ops/pass.mjs'), 'utf8') + '\n// changed\n')
  assert.equal(unchanged('cx.ola.tls', a, b), false, 'pass.mjs is the TLS front’s')
  assert.equal(unchanged('cx.ola.tunnel', a, b), true, 'pass.mjs is not the tunnel’s')
  writeFileSync(path.join(b, 'ops/ngrok.yml'), 'version: 3\n')
  assert.equal(unchanged('cx.ola.tunnel', a, b), false, 'ngrok.yml is read at start')
  assert.equal(unchanged('cx.ola.tls', path.join(T, 'releases/gone/apps/activist-ai'), b), false)
  // A package import brings in its folder's lockfile (node_modules may differ with it).
  const c = path.join(T, 'pkg')
  mkdirSync(path.join(c, 'x'), { recursive: true })
  writeFileSync(path.join(c, 'package-lock.json'), '{}')
  writeFileSync(path.join(c, 'x/main.mjs'), "import a from 'some-package'\nimport { b } from './b.mjs'\nexport * from \"./c.mjs\"\nconst d = await import('./d.mjs')\n")
  for (const f of ['b', 'c', 'd']) writeFileSync(path.join(c, `x/${f}.mjs`), "import 'node:fs'\n")
  assert.deepEqual(closure(c, ['x/main.mjs']), ['package-lock.json', 'x/b.mjs', 'x/c.mjs', 'x/d.mjs', 'x/main.mjs'])
})

// ---------------------------------------------------------------- 2. a front desk restart behind the TLS front
const ssl = (...a) => {
  const r = spawnSync('openssl', a, { cwd: T, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`openssl ${a[0]}: ${r.stderr}`)
}
const freePort = () =>
  new Promise((r) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => r(p))
    })
  })
/** A child process, resolved when its output matches `ready`. */
function start(args, env, ready) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, args, { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    kids.push(c)
    let out = ''
    const take = (d) => {
      out += d
      if (ready.test(out)) resolve({ proc: c, out: () => out })
    }
    c.stdout.on('data', take)
    c.stderr.on('data', take)
    c.on('exit', (code) => reject(new Error(`${args[0]} exited ${code}: ${out.replace(/^\s+at .*$/gm, "").slice(0, 600)}`)))
  })
}

test('the front desk stops and starts again behind the TLS front (as in a deploy): no request fails, and one in flight finishes', async () => {
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key')
  ssl('req', '-x509', '-new', '-sha256', '-key', 'ca.key', '-subj', '/CN=Ola test CA', '-days', '2', '-out', 'ca.pem')
  mkdirSync(path.join(T, 'cert'))
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'cert/key.pem')
  ssl('req', '-new', '-sha256', '-key', 'cert/key.pem', '-subj', '/CN=app.ola.cx', '-out', 'cert/csr.pem')
  writeFileSync(path.join(T, 'cert/ext.cnf'), 'subjectAltName=DNS:app.ola.cx\nextendedKeyUsage=serverAuth\n')
  ssl('x509', '-req', '-sha256', '-in', 'cert/csr.pem', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '2', '-extfile', 'cert/ext.cnf', '-out', 'cert/cert.pem')
  const CA = readFileSync(path.join(T, 'ca.pem'))

  const fdPort = await freePort()
  mkdirSync(path.join(T, 'ola'), { mode: 0o700 })
  const fdEnv = {
    OLA_HOME: path.join(T, 'ola'),
    OLA_FD_DATA: path.join(T, 'fd'),
    OLA_FD_ORIGIN: 'https://app.ola.cx',
    OLA_FD_PORT: String(fdPort),
    OLA_FD_PROXY_PROTOCOL: '1',
    OLA_FD_GATEWAY_URL: 'http://127.0.0.1:9',
    OLA_FD_SIGNIN_BURST: '1000',
    OLA_FD_SIGNIN_PER_MIN: '1000',
    OLA_FD_IDLE_STOP_MIN: '0',
  }
  const desk = () => start([path.join(AI, 'frontdesk/server.mjs')], fdEnv, /"event":"start"/)
  let fd = await desk()
  const front = await start([path.join(HERE, 'tls.mjs')], { OLA_TLS_LISTEN: '127.0.0.1:0', OLA_TLS_UPSTREAM: `127.0.0.1:${fdPort}`, OLA_TLS_CERT_DIR: path.join(T, 'cert'), OLA_TLS_PROXY_IN: '0' }, /"msg":"start","listen":"127\.0\.0\.1:\d+"/)
  const port = Number(/"listen":"127\.0\.0\.1:(\d+)"/.exec(front.out())[1])

  // Each request on a new connection, as a new visitor's would be.
  const ask = (method, p, { body, slow = 0 } = {}) =>
    new Promise((resolve) => {
      const t0 = Date.now()
      const r = https.request({ host: '127.0.0.1', port, servername: 'app.ola.cx', ca: CA, agent: false, method, path: p, headers: { host: 'app.ola.cx', origin: 'https://app.ola.cx', 'content-type': 'application/json', ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) } }, (res) => {
        let t = ''
        res.on('data', (d) => (t += d))
        res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - t0, body: t }))
      })
      r.on('error', (e) => resolve({ status: 0, error: e.code, ms: Date.now() - t0 }))
      if (!body) return r.end()
      if (!slow) return r.end(body)
      r.write(body.slice(0, 1))
      setTimeout(() => r.end(body.slice(1)), slow)
    })
  assert.equal((await ask('GET', '/api/health')).status, 200)

  const results = []
  let running = true
  const loop = (async () => {
    for (let i = 0; running; i++) {
      results.push(ask(i % 2 ? 'POST' : 'GET', i % 2 ? '/api/auth/login/options' : '/api/health', i % 2 ? { body: '{}' } : {}))
      await new Promise((r) => setTimeout(r, 20))
    }
  })()
  await new Promise((r) => setTimeout(r, 500))
  // A POST whose body is still coming when the stop arrives.
  const inFlight = ask('POST', '/api/auth/login/options', { body: '{}', slow: 600 })
  await new Promise((r) => setTimeout(r, 200))
  // The stop, and the next front desk as soon as this one exits (launchd's KeepAlive).
  const exited = new Promise((r) => fd.proc.once('exit', r))
  const t0 = Date.now()
  fd.proc.kill('SIGTERM')
  await exited
  const stoppedMs = Date.now() - t0
  fd = await desk()
  const restartMs = Date.now() - t0
  await new Promise((r) => setTimeout(r, 800))
  running = false
  await loop
  const all = await Promise.all(results)
  const flight = await inFlight
  const bad = all.filter((r) => r.status !== 200)
  assert.equal(flight.status, 200, `the request in flight: ${JSON.stringify(flight)}`)
  assert.ok(flight.ms >= 550, 'the request in flight was answered before its body arrived')
  assert.deepEqual(bad, [], `${bad.length} of ${all.length} failed while the front desk restarted`)
  assert.ok(all.length > 40, `only ${all.length} requests`)
  const slowest = Math.max(...all.map((r) => r.ms))
  console.log(`# ${all.length} requests, none failed; the old front desk took ${stoppedMs} ms to stop, the new one answered ${restartMs} ms after the stop; slowest request ${slowest} ms`)
})
