// The alarm's tests: node --test ops/watch-test.mjs (about 15 s, any Mac or Linux with openssl).
// Each runs the real program (ops/watch.mjs --once, a child process) against fakes: df, sysctl,
// du, launchctl and container as small shell scripts; the front desk, the gateway, the TLS front
// (which is also the "public address", reached at 127.0.0.1 with a throwaway CA), the Almanac and
// the text service as servers on loopback; the clock through OLA_WATCH_NOW. No real text is sent
// and nothing on this machine is read but the fakes.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import tls from 'node:tls'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const T = mkdtempSync(path.join(tmpdir(), 'ola-watch-test-'))
const OLA = path.join(T, 'ola')
const LOGS = path.join(T, 'logs')
const BIN = path.join(T, 'bin')
const STAGING = path.join(T, 'staging')
const SECRET = 'VK-fake-9f8e7d6c5b4a39281706f5e4d3c2b1a0'
// The container CLI: running VMs from a file, a status, and a log tail with secrets in it.
const CONTAINER_FAKE = [
  'case "$1 $2" in',
  `  "list -q") cat "${T}/vms";;`,
  '  "system status") echo "status running"; echo "containers.running 0";;',
  `  "system logs") echo "12:01 apiserver: vm ola-a exited, BOX_API_KEY=4e45112f802a4a6da67cb0beb5f823dd OPENCODE_PASSWORD=GB-K0Ma5rZE4kr"; echo "12:01 apiserver: memory pressure critical";;`,
  'esac',
].join('\n')
const BANNED = /gateway|front desk|\bVMs?\b|TLS|tunnel|sandbox|workspace/i

// ------------------------------------------------------------------ fakes on disk
const put = (f, s) => writeFileSync(path.join(T, f), s)
function script(name, body) {
  writeFileSync(path.join(BIN, name), `#!/bin/sh\n${body}\n`)
  chmodSync(path.join(BIN, name), 0o755)
}
function fakes({ freeGB = 36, level = 1, swapUsed = 900, vms = '', tunnel = 'running' } = {}) {
  put('df.out', `Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s5 239075328 177209344 ${freeGB * 1024 * 1024} 83% 1 1 0% /System/Volumes/Data\n`)
  put('level', `${level}\n`)
  put('swap', `total = 2048.00M  used = ${swapUsed}.00M  free = ${2048 - swapUsed}.00M  (encrypted)\n`)
  put('vms', vms)
  put('tunnel', tunnel === 'missing' ? '' : `gui/501/cx.ola.tunnel = {\n\tstate = ${tunnel}\n}\n`)
}
const ssl = (...a) => {
  const r = spawnSync('openssl', a, { cwd: T, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`openssl ${a[0]}: ${r.stderr}`)
}
function leaf(dir, days) {
  mkdirSync(path.join(T, dir))
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${dir}/key.pem`)
  ssl('req', '-new', '-key', `${dir}/key.pem`, '-subj', '/CN=app.ola.cx', '-out', `${dir}/csr.pem`)
  writeFileSync(path.join(T, dir, 'ext.cnf'), 'subjectAltName=DNS:app.ola.cx\nextendedKeyUsage=serverAuth\n')
  ssl('x509', '-req', '-sha256', '-in', `${dir}/csr.pem`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', String(days), '-extfile', `${dir}/ext.cnf`, '-out', `${dir}/cert.pem`)
  return { key: readFileSync(path.join(T, dir, 'key.pem')), cert: readFileSync(path.join(T, dir, 'cert.pem')) }
}

// ------------------------------------------------------------------ fakes on loopback
const up = { fd: true, gw: true, almanac: true, prompt: true, open: false, imsg: 200 }
const texts = []
const statuses = [] // what the board push sent
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)))
const servers = []
let PORTS = {}
let LONG, SHORT, tlsServer
before(async () => {
  mkdirSync(OLA, { recursive: true })
  mkdirSync(BIN)
  mkdirSync(LOGS)
  mkdirSync(STAGING)
  mkdirSync(path.join(T, 'store'))
  script('df', `cat "${T}/df.out"`)
  script('sysctl', `case "$2" in kern.memorystatus_vm_pressure_level) cat "${T}/level";; vm.swapusage) cat "${T}/swap";; esac`)
  script('du', `for d in "$@"; do case "$d" in -*) ;; *) echo "1048576	$d";; esac; done`)
  script('launchctl', `if [ -s "${T}/tunnel" ]; then cat "${T}/tunnel"; else echo "Could not find service" >&2; exit 113; fi`)
  script('container', CONTAINER_FAKE)
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key')
  ssl('req', '-x509', '-sha256', '-new', '-key', 'ca.key', '-subj', '/CN=Ola watch test CA', '-days', '2', '-out', 'ca.pem')
  LONG = leaf('long', 90)
  SHORT = leaf('short', 10)

  const fd = http.createServer((req, res) => (res.writeHead(up.fd && req.url === '/api/health' ? 200 : 503), res.end()))
  const gw = http.createServer((req, res) => (res.writeHead(401), res.end()))
  const almanac = http.createServer((req, res) => (res.writeHead(up.almanac && req.url === '/almanac/' ? 200 : 502), res.end()))
  const imsg = http.createServer((req, res) => {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => {
      const j = JSON.parse(b)
      assert.equal(j.key, SECRET) // the key arrives, read from KEY_FROM
      if (req.url === '/api/venture/status') return (statuses.push(j.status), res.writeHead(200), res.end('{}'))
      if (up.imsg === 200) texts.push(j.text)
      res.writeHead(up.imsg)
      res.end('{}')
    })
  })
  tlsServer = tls.createServer({ ...LONG, ALPNProtocols: ['http/1.1'] }, (s) => {
    let t = ''
    s.on('data', (d) => {
      t += d
      if (!t.includes('\r\n\r\n')) return
      const p = /^GET (\S+)/.exec(t)?.[1]
      if (p === '/api/health') s.end('HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok')
      else if (up.prompt) s.end('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="Ola"\r\ncontent-length: 0\r\nconnection: close\r\n\r\n')
      else if (up.open) s.end('HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n')
      else s.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\nconnection: close\r\n\r\n')
    })
    s.on('error', () => {})
  })
  servers.push(fd, gw, almanac, imsg, tlsServer)
  PORTS = { fd: await listen(fd), gw: await listen(gw), almanac: await listen(almanac), imsg: await listen(imsg), tls: await listen(tlsServer) }
  writeFileSync(path.join(OLA, 'frontdesk.env'), `OLA_FD_ORIGIN=http://localhost:${PORTS.fd}\nOLA_FD_PORT=${PORTS.fd}\n`, { mode: 0o600 })
  writeFileSync(path.join(OLA, 'gateway.env'), `GATEWAY_PORT=${PORTS.gw}\nUPSTREAM_API_KEY=${SECRET}-other\n`, { mode: 0o600 })
  writeFileSync(path.join(OLA, 'tls.env'), `OLA_TLS_LISTEN=127.0.0.1:${PORTS.tls}\nOLA_TLS_PROXY_IN=0\n`, { mode: 0o600 })
  writeFileSync(path.join(OLA, 'tunnel.env'), 'NGROK_AUTHTOKEN=fake\n', { mode: 0o600 })
  writeFileSync(path.join(T, 'venture.env'), `SUPABASE_URL=x\nVENTURE_KEY=${SECRET}\n`, { mode: 0o600 })
})
after(() => {
  for (const s of servers) s.close()
  rmSync(T, { recursive: true, force: true })
})
beforeEach(() => {
  Object.assign(up, { fd: true, gw: true, almanac: true, prompt: true, open: false, imsg: 200 })
  tlsServer.setSecureContext({ ...LONG })
  fakes()
  texts.length = 0
  rmSync(path.join(OLA, 'watch-state.json'), { force: true })
  rmSync(path.join(OLA, 'watch.env'), { force: true })
  rmSync(path.join(STAGING, 'deploy.lock'), { force: true })
  rmSync(path.join(OLA, 'ws'), { recursive: true, force: true })
  for (const f of readdirSync(LOGS)) rmSync(path.join(LOGS, f))
})

// ------------------------------------------------------------------ running it
const ENV = () => ({
  PATH: process.env.PATH,
  HOME: T, // so ~/ola-* and the defaults point nowhere real
  OLA_HOME: OLA,
  OLA_WATCH_LOGS: LOGS,
  OLA_WATCH_DF_BIN: path.join(BIN, 'df'),
  OLA_WATCH_DU_BIN: path.join(BIN, 'du'),
  OLA_WATCH_SYSCTL_BIN: path.join(BIN, 'sysctl'),
  OLA_WATCH_LAUNCHCTL_BIN: path.join(BIN, 'launchctl'),
  OLA_WATCH_CONTAINER_BIN: path.join(BIN, 'container'),
  OLA_WATCH_PUBLIC_IP: '127.0.0.1',
  OLA_WATCH_PUBLIC_PORT: String(PORTS.tls),
  OLA_WATCH_PUBLIC_CA: path.join(T, 'ca.pem'),
  OLA_WATCH_ALMANAC_URL: `http://127.0.0.1:${PORTS.almanac}/almanac/`,
  OLA_WATCH_STAGING: STAGING,
  OLA_WATCH_CONTAINER_STORE: path.join(T, 'store'),
  OLA_WATCH_SUITE_LOCK: path.join(T, 'suite.lock'),
  OLA_WATCH_KEY_FROM: path.join(T, 'venture.env'),
  OLA_WATCH_SEND_BASE: `http://127.0.0.1:${PORTS.imsg}`,
  OLA_WATCH_PUSH_EVERY_MIN: '0', // the board push is off except in its own test
  OLA_WATCH_OFF: 'models', // the model check has its own tests (ops/models-test.mjs)
})
/** One run at a Pacific wall-clock time on 2026-11-17 (PST, UTC-8), e.g. at('14:00'). */
const at = (hhmm, day = 17) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 10, day, h + 8, m)).toISOString()
}
// Today's Pacific date as a day of November 2026 (Dec 1 is 31): for a test that compares the fake
// clock with a certificate made by the real one.
const TODAY = (() => {
  const t = new Date(Date.now() - 8 * 3_600_000)
  return 17 + Math.round((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(2026, 10, 17)) / 86_400_000)
})()
const all = { out: '' }
function watch(now, args = [], extra = {}) {
  return new Promise((resolve) => {
    const before = texts.length
    const c = spawn(process.execPath, [path.join(HERE, 'watch.mjs'), '--once', ...args], { env: { ...ENV(), OLA_WATCH_NOW: now, OLA_WATCH_DISK_TEXTS: '1', ...extra } }  /* the disk is the tests' handiest trigger; off in production */)
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (out += d))
    c.on('close', (code) => {
      all.out += out
      // The texting key (and the other service's key in gateway.env) never reaches the output, the
      // state file or any file in the log folder, after every single run.
      const files = [path.join(OLA, 'watch-state.json'), ...readdirSync(LOGS).map((f) => path.join(LOGS, f))].filter(existsSync)
      for (const [name, blob] of [['output', out], ...files.map((f) => [f, readFileSync(f, 'utf8')])]) assert.ok(!blob.includes(SECRET) && !blob.includes(SECRET.slice(3, 20)), `the key leaked into ${name}`)
      resolve({ code, out, sent: texts.slice(before) })
    })
  })
}
const state = () => JSON.parse(readFileSync(path.join(OLA, 'watch-state.json'), 'utf8'))

// ------------------------------------------------------------------ the tests
test('everything well: no text, one ok line with every check', async () => {
  const r = await watch(at('14:00'))
  assert.equal(r.code, 0, r.out)
  assert.deepEqual(r.sent, [])
  assert.match(r.out, /Z ok: disk 36 GB free; memory normal, swap 44%; fd 200; gw 401; tls 200; tunnel running; certificate \d+ days left; public 127\.0\.0\.1 401 basic; public certificate \d+ days left; almanac 200; 0 VM\(s\) running/)
  assert.match(r.out, /sizes \(GB\): container store 1/)
  assert.equal(state().lastRun.alarms.length, 0)
})

test('the web app behind the PROXY protocol: the line is sent first, as the front desk requires', async () => {
  // A front desk with OLA_FD_PROXY_PROTOCOL=1 resets a connection that does not start with one.
  const seen = []
  const fdp = net.createServer((s) => {
    let t = ''
    s.on('data', (d) => {
      t += d
      if (!t.includes('\r\n')) return
      if (!t.startsWith('PROXY TCP4 127.0.0.1 127.0.0.1 ')) return s.resetAndDestroy()
      if (!t.includes('\r\n\r\n')) return
      seen.push(t.split('\r\n')[1])
      s.end('HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n')
    })
    s.on('error', () => {})
  })
  const port = await listen(fdp)
  const env = path.join(OLA, 'frontdesk.env')
  const saved = readFileSync(env, 'utf8')
  try {
    writeFileSync(env, `OLA_FD_ORIGIN=https://app.ola.cx\nOLA_FD_PORT=${port}\nOLA_FD_PROXY_PROTOCOL=1\n`)
    assert.match((await watch(at('14:00'))).out, /; fd 200;/)
    assert.deepEqual(seen, ['GET /api/health HTTP/1.1'])
    writeFileSync(env, `OLA_FD_ORIGIN=https://app.ola.cx\nOLA_FD_PORT=${port}\n`) // the line not sent: refused
    assert.match((await watch(at('14:02'))).out, /; fd (ECONNRESET|EPIPE|0);/)
  } finally {
    writeFileSync(env, saved)
    fdp.close()
  }
})

test('disk: alarm at once, quiet for 2 hours, repeated, then back to normal once', async () => {
  fakes({ freeGB: 6 })
  assert.deepEqual((await watch(at('14:00'))).sent, ["Ola alarm: The mini's disk is almost full (6 GB left)."])
  assert.deepEqual((await watch(at('14:02'))).sent, [])
  assert.deepEqual((await watch(at('15:58'))).sent, [])
  assert.deepEqual((await watch(at('16:00'))).sent, ["Ola alarm: Still, since 2:00 pm: the mini's disk is almost full (6 GB left)."])
  assert.deepEqual((await watch(at('16:02'))).sent, [])
  fakes({ freeGB: 30 })
  assert.deepEqual((await watch(at('16:04'))).sent, ['Ola: back to normal. Disk has 30 GB free.'])
  assert.deepEqual((await watch(at('16:06'))).sent, [])
})

test('disk under 20 GB is a warning for the daily note, not a text', async () => {
  fakes({ freeGB: 15 })
  for (const t of ['14:00', '14:02', '14:04']) assert.deepEqual((await watch(at(t))).sent, [])
  fakes({ freeGB: 12 })
  await watch(at('14:06'))
  fakes({ freeGB: 30 })
  await watch(at('14:08'))
  const w = state().warnings.disk
  assert.equal(w.count, 1) // one episode, not four runs
  assert.equal(w.low, 12)
})

test('the web app: one failure is nothing, two in a row is an alarm, then back to normal', async () => {
  up.fd = false
  assert.deepEqual((await watch(at('14:00'))).sent, [])
  up.fd = true
  assert.deepEqual((await watch(at('14:02'))).sent, [])
  up.fd = false
  assert.deepEqual((await watch(at('14:04'))).sent, [])
  assert.deepEqual((await watch(at('14:06'))).sent, ['Ola alarm: The web app is not answering.'])
  up.fd = true
  assert.deepEqual((await watch(at('14:08'))).sent, ['Ola: back to normal. The web app answers again.'])
})

test('the model connection and the site address: several problems go out as one text', async () => {
  servers[1].close() // the gateway stops answering at all
  fakes({ tunnel: 'not running' })
  await watch(at('14:00'))
  const r = await watch(at('14:02'))
  assert.equal(r.sent.length, 1)
  assert.match(r.sent[0], /^Ola alarm: The model connection is not answering, so projects cannot think\. The site's address is cut off from the internet\.$/)
  await new Promise((res) => servers[1].listen(PORTS.gw, '127.0.0.1', res))
})

test('quiet hours: memory waits for 7 am, the disk does not', async () => {
  fakes({ level: 4 })
  assert.deepEqual((await watch(at('01:00'))).sent, [])
  assert.deepEqual((await watch(at('01:02'))).sent, []) // in alarm now, but not a night item
  assert.ok(state().active.memory)
  fakes({ level: 4, freeGB: 5 })
  assert.deepEqual((await watch(at('01:04'))).sent, ["Ola alarm: The mini's disk is almost full (5 GB left)."])
  fakes({ level: 4, freeGB: 40 })
  assert.deepEqual((await watch(at('03:00'))).sent, ['Ola: back to normal. Disk has 40 GB free.'])
  assert.deepEqual((await watch(at('06:58'))).sent, [])
  assert.deepEqual((await watch(at('07:00'))).sent, ['Ola alarm: The mini is running out of memory and will be slow.'])
})

test('swap nearly full counts as memory trouble', async () => {
  fakes({ swapUsed: 1900 })
  await watch(at('14:00'))
  assert.deepEqual((await watch(at('14:02'))).sent, ['Ola alarm: The mini is running out of memory and will be slow.'])
})

test('a problem that starts and ends at night is not texted; it is in the morning note', async () => {
  fakes({ level: 4 })
  await watch(at('02:00'))
  await watch(at('02:02'))
  fakes()
  assert.deepEqual((await watch(at('02:04'))).sent, [])
  const r = await watch(at('09:00'))
  assert.equal(r.sent.length, 1)
  assert.match(r.sent[0], /^Ola: a daily note, nothing urgent\. Since yesterday the mini is running out of memory and will be slow for a short while \(not texted\)\.$/)
})

test('the public address: the password prompt and a certificate with more than 14 days', async () => {
  // The certificates are made now, by the real clock (SHORT runs out 10 days from today), so this
  // test runs on today's date: on the fixed Nov 17 the short one had 15 days left once the real
  // date passed Nov 22, 14:06, and every update was refused (OLA-284 run, Nov 22).
  const day = TODAY
  up.prompt = false // something answers, but not our door
  await watch(at('14:00', day))
  assert.deepEqual((await watch(at('14:02', day))).sent, ['Ola alarm: The site (app.ola.cx) does not answer from the internet.'])
  up.prompt = true
  tlsServer.setSecureContext({ ...SHORT })
  // It answers again (the all-clear), but the certificate is short: one run so far, then the alarm.
  assert.deepEqual((await watch(at('14:04', day))).sent, ['Ola: back to normal. The site answers from the internet again.'])
  const r2 = await watch(at('14:06', day))
  assert.equal(r2.sent.length, 1)
  assert.match(r2.sent[0], /^Ola alarm: The site's certificate runs out in \d+ days and has not renewed\.$/)
  assert.ok(state().warnings.renewal, 'the served certificate under 21 days is a warning too')
})

test('the site password off (2026-11-17): the sign-in page answering 200 is the site answering', async () => {
  up.prompt = false
  up.open = true
  await watch(at('14:00'))
  assert.deepEqual((await watch(at('14:02'))).sent, [])
})

test('an untrusted certificate is an alarm on the public address', async () => {
  const r = await watch(at('14:00'), [], { OLA_WATCH_PUBLIC_CA: '' }) // the system's CAs do not know the test CA
  assert.match(r.out, /public 127\.0\.0\.1 (UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)/)
})

test("Frances's service: two failures in a row", async () => {
  up.almanac = false
  await watch(at('23:30'))
  assert.deepEqual((await watch(at('23:32'))).sent, ["Ola alarm: Frances's service is not answering."]) // a night item
  up.almanac = true
  assert.deepEqual((await watch(at('23:34'))).sent, ["Ola: back to normal. Frances's service answers again."])
})

test('every VM stopping at once: evidence saved (no secrets in it), a warning, the morning note', async () => {
  mkdirSync(path.join(OLA, 'ws/stage-a'), { recursive: true })
  fakes({ vms: 'buildkit\nola-stage-a\nola-x-chk-a\n' })
  await watch(at('14:00'))
  writeFileSync(path.join(LOGS, 'frontdesk.log'), 'ready\nstopped stage-a after 30 min idle token=abcdefabcdefabcdefabcdefabcdef\nsigned in kim\n')
  fakes({ vms: 'buildkit\n' })
  const r = await watch(at('14:02'))
  assert.deepEqual(r.sent, [])
  assert.match(r.out, /warn vm-drop/)
  const file = readdirSync(LOGS).find((f) => f.startsWith('watch-vm-drop-'))
  const ev = readFileSync(path.join(LOGS, file), 'utf8')
  assert.match(ev, /Running at the run before: ola-stage-a ola-x-chk-a/)
  assert.match(ev, /Memory now: normal, swap 44%/)
  assert.match(ev, /apiserver: vm ola-a exited/)
  assert.doesNotMatch(ev, /4e45112f802a4a6da67cb0beb5f823dd|GB-K0Ma5rZE4kr/)
  assert.match(ev, /stopped stage-a after 30 min idle token=\[removed\]/)
  assert.doesNotMatch(ev, /signed in kim/)
  const m = await watch(at('09:00', 18))
  assert.equal(m.sent.length, 1)
  assert.match(m.sent[0], /every running project stopped at once \(2 of them, at 2:02 pm\)/)
  assert.deepEqual((await watch(at('09:02', 18))).sent, [], 'the note goes once a day')
})

test('the container system not answering: every VM counts as stopped, recorded once', async () => {
  fakes({ vms: 'ola-p\nola-q\n' })
  await watch(at('14:00'))
  script('container', 'echo "XPC connection error: Connection invalid" >&2; exit 1')
  try {
    const r = await watch(at('14:02'))
    assert.match(r.out, /warn vms,vm-drop/)
    assert.match(r.out, /vms: XPC connection error/)
    const again = await watch(at('14:04'))
    assert.doesNotMatch(again.out, /vm-drop/)
    assert.equal(readdirSync(LOGS).filter((f) => f.startsWith('watch-vm-drop-')).length, 1)
  } finally {
    script('container', CONTAINER_FAKE)
  }
})

test('every VM stopping during a deploy is explained: no warning', async () => {
  fakes({ vms: 'ola-stage-a\nola-stage-b\n' })
  await watch(at('14:00'))
  writeFileSync(path.join(STAGING, 'deploy.lock'), '123')
  fakes({ vms: '' })
  const r = await watch(at('14:02'))
  assert.doesNotMatch(r.out, /warn vm-drop/)
  assert.match(r.out, /vm drop explained \(deploy\)/)
})

test('a nightly status file that failed is a warning', async () => {
  writeFileSync(path.join(LOGS, 'cert.json'), JSON.stringify({ at: at('04:17'), ok: false, error: 'lego: Bearer abcdefabcdefabcdefabcdefabcdef failed' }))
  const r = await watch(at('14:00'))
  assert.match(r.out, /warn nightly-cert/)
  assert.match(r.out, /cert: failed \(lego: Bearer \[removed\] failed\)/)
})

test('the weekly restore test has its own age limit: 6 days old is fine, 9 days is a warning (OLA-86)', async () => {
  writeFileSync(path.join(LOGS, 'restore.json'), JSON.stringify({ at: at('05:00', 11), ok: true }))
  let r = await watch(at('14:00'))
  assert.doesNotMatch(r.out, /warn nightly-restore/)
  writeFileSync(path.join(LOGS, 'restore.json'), JSON.stringify({ at: at('05:00', 8), ok: true }))
  r = await watch(at('14:00'))
  assert.match(r.out, /warn nightly-restore/)
  rmSync(path.join(LOGS, 'restore.json'))
})

test('a text that does not go out is retried at the next run', async () => {
  fakes({ freeGB: 4 })
  up.imsg = 500
  const r = await watch(at('14:00'))
  assert.equal(r.code, 1)
  assert.match(r.out, /NOT SENT \(the text service answered 500\), will retry/)
  up.imsg = 200
  assert.deepEqual((await watch(at('14:02'))).sent, ["Ola alarm: The mini's disk is almost full (4 GB left)."])
})

test('the key stays out of the output on every way a text can fail', async () => {
  fakes({ freeGB: 4 })
  const gone = http.createServer()
  const port = await listen(gone)
  await new Promise((r) => gone.close(r)) // nothing listens there now
  const down = await watch(at('14:00'), [], { OLA_WATCH_SEND_BASE: `http://127.0.0.1:${port}` })
  assert.match(down.out, /NOT SENT \(the text service did not answer \(ECONNREFUSED\)\)/)
  const bad = await watch(at('14:02'), [], { OLA_WATCH_SEND_BASE: 'not a url' })
  assert.match(bad.out, /NOT SENT \(the text service did not answer/)
  const nokey = await watch(at('14:04'), [], { OLA_WATCH_KEY_FROM: path.join(OLA, 'gateway.env') }) // a file with other secrets, no VENTURE_KEY
  assert.match(nokey.out, /NOT SENT \(no VENTURE_KEY in /)
  const show = spawnSync(process.execPath, [path.join(HERE, 'watch.mjs'), 'show'], { env: ENV(), encoding: 'utf8' })
  assert.ok(!show.stdout.includes(SECRET) && !show.stderr.includes(SECRET))
})

test('--dry prints what it would send and sends nothing', async () => {
  fakes({ freeGB: 4 })
  const r = await watch(at('14:00'), ['--dry'])
  assert.deepEqual(r.sent, [])
  assert.match(r.out, /would send: Ola alarm: The mini's disk is almost full \(4 GB left\)\./)
  assert.equal(existsSync(path.join(OLA, 'watch-state.json')), false)
})

test('mute: nothing is sent until it ends; then the alarm goes out', async () => {
  writeFileSync(path.join(OLA, 'watch-state.json'), JSON.stringify({ muteUntil: at('15:00') }))
  fakes({ freeGB: 4 })
  const r = await watch(at('14:00'))
  assert.deepEqual(r.sent, [])
  assert.match(r.out, /muted until/)
  assert.deepEqual((await watch(at('15:02'))).sent, ["Ola alarm: The mini's disk is almost full (4 GB left)."])
})

test('settings: watch.env tunes the levels and must be mode 600', async () => {
  fakes({ freeGB: 25 })
  writeFileSync(path.join(OLA, 'watch.env'), 'DISK_ALARM_GB=30\n', { mode: 0o644 })
  const bad = await watch(at('14:00'))
  assert.equal(bad.code, 1)
  assert.match(bad.out, /watch\.env must be this account's with mode 600/)
  chmodSync(path.join(OLA, 'watch.env'), 0o600)
  assert.deepEqual((await watch(at('14:02'))).sent, ["Ola alarm: The mini's disk is almost full (25 GB left)."])
})

test('--force test sends exactly the test text; --only none checks nothing', async () => {
  const r = await watch(at('14:00'), ['--only', 'none', '--force', 'test'])
  assert.deepEqual(r.sent, ['Ola: test of the new alarm. Nothing is wrong.'])
  assert.match(r.out, /nothing checked/)
})

test('status line: ok after a run, DOWN when stale or when a text did not go out', async () => {
  await watch(at('14:00'))
  const line = (now) => JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', `import { statusLine } from ${JSON.stringify(pathToFileURL(path.join(HERE, 'watch.mjs')).href)}; console.log(JSON.stringify(statusLine(${Date.parse(now)})))`], { env: ENV(), encoding: 'utf8' }).stdout)
  assert.deepEqual(line(at('14:03')), { ok: true, text: 'last run 3 min ago: no alarm' })
  assert.equal(line(at('14:10')).ok, false)
  fakes({ freeGB: 4 })
  up.imsg = 500
  await watch(at('14:12'))
  const l = line(at('14:13'))
  assert.equal(l.ok, false)
  assert.match(l.text, /ALARM disk; last text NOT sent: the text service answered 500/)
})

test('the board: a compact status every 10 minutes, with the key, and nothing that names a project', async () => {
  fakes({})
  up.imsg = 200
  const board = { OLA_WATCH_PUSH_EVERY_MIN: '10' }
  const before = statuses.length
  const r = await watch(at('16:00'), [], board)
  assert.match(r.out, /status pushed to the board/)
  assert.equal(statuses.length, before + 1)
  const s = statuses.at(-1)
  assert.deepEqual(Object.keys(s).sort(), ['alarm', 'asks', 'ci', 'deployed', 'disk', 'host', 'memory', 'parts', 'projects'])
  assert.equal(typeof s.alarm.state, 'string')
  assert.ok(!JSON.stringify(s).includes('ola-'), 'a project id reached the board')
  await watch(at('16:02'), [], board)
  assert.equal(statuses.length, before + 1, 'pushed again before 10 minutes')
  await watch(at('16:04'), ['--only', 'disk'], board)
  assert.equal(statuses.length, before + 1, 'a partial run pushed')
  await watch(at('16:10'), [], board)
  assert.equal(statuses.length, before + 2)
})

test('no secret in any output, state or log; no engineer words in any text', async () => {
  const sentAll = [...texts]
  const files = [path.join(OLA, 'watch-state.json'), ...readdirSync(LOGS).map((f) => path.join(LOGS, f))].filter(existsSync)
  for (const blob of [all.out, ...files.map((f) => readFileSync(f, 'utf8'))]) assert.ok(!blob.includes(SECRET), 'the key leaked')
  // Every text any test above sent (they are kept in all.out as "sent: ...").
  const lines = [...all.out.matchAll(/(?:sent|would send): (.+)/g)].map((m) => m[1])
  assert.ok(lines.length >= 15, `only ${lines.length} texts seen`)
  for (const t of [...lines, ...sentAll]) {
    assert.match(t, /^Ola( alarm)?: /)
    assert.doesNotMatch(t, BANNED, t)
    assert.ok(t.length <= 320, `too long for a phone: ${t}`)
  }
})

test('the disk is never texted in production (Bart, Nov 17), still shown in the daily note', async () => {
  const r = await watch('2026-11-20T15:00:00Z', [], { OLA_WATCH_DISK_TEXTS: '0', OLA_WATCH_DISK_ALARM_GB: '100000', OLA_WATCH_DISK_WARN_GB: '200000' })
  assert.equal(r.sent.length, 0, `a disk text went out: ${JSON.stringify(r.sent)}`)
})

test('the board never repeats an old alarm sentence its own reading contradicts (OLA-164)', async () => {
  // The state of Nov 18: a disk alarm left from before the disk stopped being texted, 73 GB free now.
  writeFileSync(path.join(OLA, 'watch-state.json'), JSON.stringify({ active: { disk: { since: Date.parse(at('09:00')), item: 1, sentAt: Date.parse(at('09:00')), lastSentAt: Date.parse(at('09:00')), say: "the mini's disk is almost full (3 GB left)." } }, clears: {}, streak: { disk: 4 }, lastDigest: '2026-11-17' }))
  fakes({ freeGB: 73 })
  const board = { OLA_WATCH_PUSH_EVERY_MIN: '10', OLA_WATCH_DISK_TEXTS: '0' }
  const r = await watch(at('16:00'), [], board)
  assert.equal(r.sent.length, 0)
  const s = statuses.at(-1)
  assert.equal(s.disk.freeGB, 73)
  assert.equal(s.alarm.state, 'ok')
  assert.deepEqual(s.alarm.says, [])
  assert.equal(state().active.disk, undefined, 'the old disk alarm is still in the state')
  // A disk that is really under the alarm level is shown on the board with today's number.
  fakes({ freeGB: 5 })
  await watch(at('16:12'), [], board)
  assert.deepEqual(statuses.at(-1).alarm.says, ["the mini's disk is almost full (5 GB left)."])
})

test('a check that is turned off forgets the alarm it raised before (OLA-476)', async () => {
  // The Studio, Nov 26: the Almanac (which lives on the mini) had been checked there and alarmed;
  // after OFF=almanac the run still began "ALARM almanac", because nothing could clear it.
  writeFileSync(path.join(OLA, 'watch-state.json'), JSON.stringify({ active: { almanac: { since: Date.parse(at('09:00')), item: 5, sentAt: Date.parse(at('09:00')), lastSentAt: Date.parse(at('09:00')), say: "Frances's service is not answering." } }, clears: {}, streak: { almanac: 9 }, lastDigest: '2026-11-17' }))
  fakes()
  const r = await watch(at('16:00'), [], { OLA_WATCH_OFF: 'models,almanac', OLA_WATCH_DISK_TEXTS: '0' })
  assert.equal(r.sent.length, 0, `a text went out: ${JSON.stringify(r.sent)}`)
  assert.match(r.out, /Z ok: /)
  assert.doesNotMatch(r.out, /almanac/)
  assert.equal(state().active.almanac, undefined, 'the old alarm is still in the state')
  assert.equal(state().streak.almanac, undefined)
})

test('the Studio (MACHINE=Studio, OLA-477): its texts say so, and its status is sent as its own', async () => {
  fakes({ freeGB: 6 })
  up.imsg = 200
  const studio = { OLA_WATCH_MACHINE: 'Studio', OLA_WATCH_PUSH_EVERY_MIN: '10' }
  const before = statuses.length
  const r = await watch(at('14:00'), [], studio)
  assert.deepEqual(r.sent, ["Ola alarm (the Studio): The Studio's disk is almost full (6 GB left)."])
  assert.match(r.out, /status pushed to the board/)
  assert.equal(statuses.length, before + 1)
  assert.equal(statuses.at(-1).host, 'studio')
  assert.deepEqual(statuses.at(-1).alarm.says, ["the Studio's disk is almost full (6 GB left)."])
  fakes({ freeGB: 30 })
  assert.deepEqual((await watch(at('14:02'), [], studio)).sent, ['Ola (the Studio): back to normal. Disk has 30 GB free.'])
})
