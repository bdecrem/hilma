// The second outside review's harness (2026-11-16): proofs against a front desk started here, on
// loopback ports of its own, with made-up people and workspaces (ids rev2-*). On the mini, from a
// copy of apps/activist-ai at ~/rev2/activist-ai:
//   node frontdesk/review/rev2.mjs proxy      the PROXY protocol: timeouts, address forms, the global ceiling
//   node frontdesk/review/rev2.mjs stall      one viewer's unread downloads against every other customer
//   node frontdesk/review/rev2.mjs --destroy  removes the rev2 workspaces and state
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SoftAuthn } from './softauthn.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.resolve(HERE, '../..')
const ROOT = path.join(homedir(), 'rev2-state')
const CTR = '/usr/local/bin/container'
const base = {
  ...process.env,
  OLA_HOME: path.join(homedir(), '.ola-rev2'),
  OLA_MAX_RUNNING: '2',
  OLA_GATEWAY_PORT: '4185',
  OLA_GATEWAY_DOORS: path.join(homedir(), '.ola-rev2', 'gw'),
  OLA_FD_IDLE_STOP_MIN: '0',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
const argv = process.argv.slice(2)

function deskEnv(port, extra = {}) {
  return { ...base, OLA_FD_DATA: path.join(ROOT, `fd-${port}`), OLA_FD_ORIGIN: `http://localhost:${port}`, OLA_FD_PORT: String(port), ...extra }
}
const admin = (env, ...a) => {
  const r = spawnSync(process.execPath, [path.join(AI, 'frontdesk/admin.mjs'), ...a], { env, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim()}`)
  return r.stdout.trim()
}
function startDesk(env) {
  const p = spawn(process.execPath, [path.join(AI, 'frontdesk/server.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', (d) => (p.log += d))
  p.stderr.on('data', (d) => (p.log += d))
  process.on('exit', () => p.kill())
  return p
}

/** One request on a fresh connection; with `from`, a PROXY v1 line first (TCP6 for an IPv6 address). */
function via(port, from, method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const r = http.request(
      {
        method,
        path: p,
        headers: { host: `localhost:${port}`, origin: `http://localhost:${port}`, 'content-type': 'application/json', ...headers },
        createConnection: () => {
          const sock = net.connect(port, '127.0.0.1')
          if (from) sock.write(`PROXY ${net.isIP(from) === 6 ? 'TCP6' : 'TCP4'} ${from} ${net.isIP(from) === 6 ? '::1' : '127.0.0.1'} 40000 ${port}\r\n`)
          return sock
        },
      },
      (res) => {
        let t = ''
        res.on('data', (d) => (t += d))
        res.on('end', () => {
          let j = null
          try {
            j = JSON.parse(t)
          } catch {}
          resolve({ status: res.statusCode, json: j, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] })
        })
      },
    )
    r.on('error', () => resolve({ status: 0 }))
    r.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
/** Bytes written as given, then how long until the server closes the connection (ms), and what came back. */
function trickle(port, first, { every = 700, forMs = 12_000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    let got = ''
    const sock = net.connect(port, '127.0.0.1', () => sock.write(first))
    const timer = setInterval(() => sock.writable && sock.write('X'), every)
    const done = (why) => (clearInterval(timer), clearTimeout(stop), sock.destroy(), resolve({ closedAfterMs: why === 'closed' ? Date.now() - t0 : null, got: got.slice(0, 40) }))
    const stop = setTimeout(() => done('still open'), forMs)
    sock.on('data', (d) => (got += d))
    sock.on('close', () => done('closed'))
    sock.on('error', () => {})
  })
}
async function up(port, from) {
  for (let i = 0; i < 80; i++) {
    if ((await via(port, from, 'GET', '/api/health')).status === 200) return
    await sleep(150)
  }
  throw new Error(`front desk on ${port} did not start`)
}
async function registerVia(env, port, from, handle) {
  admin(env, 'add-person', handle, '--name', `${handle} (made up)`)
  const key = new SoftAuthn({ rpId: 'localhost', origin: `http://localhost:${port}` })
  const o = await via(port, from, 'POST', '/api/auth/register/options', { invite: admin(env, 'invite', handle).split('/').pop() })
  const v = await via(port, from, 'POST', '/api/auth/register/verify', { ceremony: o.json?.ceremony, response: key.create(o.json.options) })
  if (v.status !== 200) throw new Error(`register ${handle}: ${v.status}`)
  return key
}
async function signIn(port, from, key) {
  const lo = await via(port, from, 'POST', '/api/auth/login/options', {})
  if (lo.status !== 200) return { options: lo.status }
  const lv = await via(port, from, 'POST', '/api/auth/login/verify', { ceremony: lo.json.ceremony, response: key.get(lo.json.options) })
  return { options: lo.status, verify: lv.status, cookie: lv.cookie }
}

if (argv.includes('--destroy')) {
  for (const id of ['rev2-a', 'rev2-b']) spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'destroy', id, '--confirm', id], { env: base, stdio: 'inherit' })
  rmSync(ROOT, { recursive: true, force: true })
  rmSync(base.OLA_HOME, { recursive: true, force: true })
  console.log('destroyed')
  process.exit(0)
}
rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })

// ---------------------------------------------------------------- the PROXY protocol
if (argv.includes('proxy')) {
  const PP = 4795
  const PLAIN = 4796
  const penv = deskEnv(PP, { OLA_FD_PROXY_PROTOCOL: '1', OLA_FD_SIGNIN_BURST: '10', OLA_FD_SIGNIN_PER_MIN: '10' })
  const fdp = startDesk(penv)
  const fdn = startDesk(deskEnv(PLAIN))
  await up(PP, '198.51.100.4')
  await up(PLAIN, null)

  // 1. Slow headers: with the PROXY protocol, are the 5 s header limit and the 15 min request limit enforced?
  const head = (port) => `GET /api/health HTTP/1.1\r\nHost: localhost:${port}\r\nX-Slow: `
  out('slow headers, no PROXY protocol', await trickle(PLAIN, head(PLAIN)))
  out('slow headers, behind the PROXY protocol', await trickle(PP, `PROXY TCP4 198.51.100.50 127.0.0.1 40000 ${PP}\r\n${head(PP)}`))
  out('PROXY line only, then nothing (5 s limit)', await trickle(PP, 'PROXY TCP4 198.51.100.51 127.0', { every: 60_000, forMs: 8000 }))

  // 2. Line forms.
  const sig2 = Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a, 0x21, 0x11, 0x00, 0x0c, 1, 2, 3, 4, 127, 0, 0, 1, 0x9c, 0x40, 0x12, 0xb3])
  out('PROXY v2 binary header', await trickle(PP, Buffer.concat([sig2, Buffer.from(`GET /api/health HTTP/1.1\r\nHost: localhost:${PP}\r\n\r\n`)]), { forMs: 3000 }))
  out('PROXY v1, port 99999', await trickle(PP, `PROXY TCP4 198.51.100.52 127.0.0.1 99999 99999\r\nGET /api/health HTTP/1.1\r\nHost: localhost:${PP}\r\nConnection: close\r\n\r\n`, { every: 60_000, forMs: 3000 }))
  out('PROXY v1, 200-byte line', await trickle(PP, `PROXY TCP4 198.51.100.53 ${'1'.repeat(200)} 1 1\r\n`, { every: 60_000, forMs: 3000 }))

  // 3. The same client under different spellings: separate sign-in buckets?
  const tally = async (froms, n) => {
    const c = {}
    for (const f of froms) for (let i = 0; i < n; i++) {
      const r = await via(PP, f, 'POST', '/api/auth/login/options', {})
      c[r.status] = (c[r.status] ?? 0) + 1
    }
    return c
  }
  out('one IPv4 address, 15 tries', await tally(['198.51.100.60'], 15))
  out('the same address as TCP4 and as ::ffff: mapped, 15 tries each', await tally(['198.51.100.61', '::ffff:198.51.100.61'], 15))
  out('one IPv6 address in two spellings, 15 tries each', await tally(['2001:db8:5::1', '2001:0db8:0005:0000:0000:0000:0000:0001'], 15))
  const slash64 = (n) => Array.from({ length: n }, (_, i) => `2001:db8:a:b::${(i + 1).toString(16)}`)
  out('50 addresses of ONE /64 (what any IPv6 client holds), 15 tries each', await tally(slash64(50), 15))

  // 4. The global ceiling against a real person: pia has a passkey; one /64 drains the ceiling.
  const pia = await registerVia(penv, PP, '198.51.100.4', 'rev2-pia')
  out('pia signs in before the attack', await signIn(PP, '198.51.100.4', pia).then((r) => ({ options: r.options, verify: r.verify })))
  const hammer = async (ms, from) => {
    const end = Date.now() + ms
    let i = 0
    const c = {}
    while (Date.now() < end) {
      // Every route an anonymous caller has, a fresh address of the /64 each time, about 60 a second
      // (throttled: an unthrottled loop ran the loopback's ephemeral ports out in the first run).
      const k = i % 3
      const r = await via(PP, `2001:db8:c:d::${(from + i++).toString(16)}`, 'POST', ['/api/auth/login/options', '/api/auth/register/options', '/api/auth/login/verify'][k], [{}, { invite: 'A'.repeat(43) }, { ceremony: 'x'.repeat(43), response: { id: 'made-up' } }][k])
      c[r.status] = (c[r.status] ?? 0) + 1
      await sleep(15)
    }
    return c
  }
  const att = hammer(20_000, 1)
  const during = []
  for (let k = 0; k < 4; k++) {
    await sleep(4000)
    const r = await signIn(PP, '203.0.113.9', pia)
    during.push({ options: r.options, verify: r.verify ?? null })
  }
  out('attacker, one /64, fresh address per request, 20 s', await att)
  out("pia's sign-ins during the attack (from her own address)", during)

  // 5. The per-passkey bucket, by anyone who knows a credential id (a device invitation's
  // registration options list them; ids are not secret in WebAuthn).
  const credId = pia.id
  await sleep(1500)
  const lock = {}
  for (let i = 0; i < 12; i++) {
    const r = await via(PP, `198.51.100.${100 + i}`, 'POST', '/api/auth/login/verify', { ceremony: 'x'.repeat(43), response: { id: credId } })
    lock[r.status] = (lock[r.status] ?? 0) + 1
  }
  out('12 garbage assertions naming pia\'s credential id, no ceremony, from 12 addresses', lock)
  const after = await signIn(PP, '198.51.100.4', pia)
  out('pia signs in right after', { options: after.options, verify: after.verify })
  out('credential id known to the harness', !!credId)
  fdp.kill()
  fdn.kill()
  process.exit(0)
}

// ---------------------------------------------------------------- unread downloads
if (argv.includes('stall')) {
  const PORT = 4797
  const env = deskEnv(PORT)
  const ws = (a) => spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), ...a], { env, encoding: 'utf8' })
  for (const id of ['rev2-a', 'rev2-b']) ws(['destroy', id, '--confirm', id])
  const fd = startDesk(env)
  await up(PORT, null)
  admin(env, 'create-workspace', 'rev2-a', '--name', 'Rev2 made-up A', '--team', 'rev2-ta', '--team-name', 'Rev2 team A', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  admin(env, 'create-workspace', 'rev2-b', '--name', 'Rev2 made-up B', '--team', 'rev2-tb', '--team-name', 'Rev2 team B', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  const vic = await registerVia(env, PORT, null, 'rev2-vic')
  const bob = await registerVia(env, PORT, null, 'rev2-bob')
  admin(env, 'add-member', 'rev2-ta', 'rev2-vic', 'viewer')
  admin(env, 'add-member', 'rev2-tb', 'rev2-bob', 'owner')
  const sv = await signIn(PORT, null, vic)
  const sb = await signIn(PORT, null, bob)
  const me = async (s) => (await via(PORT, null, 'GET', '/api/me', undefined, { cookie: s.cookie })).json
  const csrfB = (await me(sb)).csrf
  for (const [s, w] of [[sv, 'rev2-a'], [sb, 'rev2-b']]) {
    for (let i = 0; i < 60; i++) {
      const r = await via(PORT, null, 'GET', '/api/project', undefined, { cookie: s.cookie, 'x-ola-workspace': w })
      if (r.status === 200) break
      await sleep(1000)
    }
  }
  // "Ola made" a 128 MiB file in team A's workspace (as the agent would; the agent's user).
  const mk = spawnSync(CTR, ['exec', '--user', '1000', 'ola-rev2-a', 'sh', '-c', 'head -c 134217728 /dev/zero > /work/big.bin && ls -l /work/big.bin'], { encoding: 'utf8' })
  out('made in rev2-a', mk.stdout.trim().split(/\s+/).slice(4, 5).join(' ') + ' bytes')
  // vic, a VIEWER of team A, opens 4 downloads of it and reads nothing.
  const held = []
  for (let i = 0; i < 4; i++) {
    const s = net.connect(PORT, '127.0.0.1')
    s.write(`GET /api/files/big.bin?w=rev2-a HTTP/1.1\r\nHost: localhost:${PORT}\r\nCookie: ${sv.cookie}\r\n\r\n`)
    s.pause()
    held.push(s)
    await sleep(800)
  }
  await sleep(2000)
  // bob, another customer (team B), uploads 1 KiB to his own workspace, and downloads it.
  const upload = async () =>
    via(PORT, null, 'POST', '/api/files?name=bob-note.txt&replace=1', undefined, { cookie: sb.cookie, 'x-ola-csrf': csrfB, 'x-ola-workspace': 'rev2-b', 'content-type': 'application/octet-stream', 'content-length': '1024' })
  const up1 = await new Promise((resolve) => {
    const r = http.request({ port: PORT, host: '127.0.0.1', method: 'POST', path: '/api/files?name=bob-note.txt&replace=1', headers: { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}`, cookie: sb.cookie, 'x-ola-csrf': csrfB, 'x-ola-workspace': 'rev2-b', 'content-type': 'application/octet-stream', 'content-length': '1024' } }, (res) => (res.resume(), res.on('end', () => resolve(res.statusCode))))
    r.on('error', () => resolve(0))
    r.end(Buffer.alloc(1024, 98))
  })
  void upload
  out("bob's 1 KiB upload to his own workspace, while vic's 4 downloads sit unread", up1)
  await sleep(60_000)
  const up2 = await new Promise((resolve) => {
    const r = http.request({ port: PORT, host: '127.0.0.1', method: 'POST', path: '/api/files?name=bob-note.txt&replace=1', headers: { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}`, cookie: sb.cookie, 'x-ola-csrf': csrfB, 'x-ola-workspace': 'rev2-b', 'content-type': 'application/octet-stream', 'content-length': '1024' } }, (res) => (res.resume(), res.on('end', () => resolve(res.statusCode))))
    r.on('error', () => resolve(0))
    r.end(Buffer.alloc(1024, 98))
  })
  out('the same, 60 s later', up2)
  out("vic's downloads still open", held.filter((s) => !s.destroyed && s.readyState === 'open').length)
  const execs = spawnSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes('ola-rev2-a') && l.includes('ola-get')).length
  out('ola-get execs on the host for rev2-a', execs)
  for (const s of held) s.destroy()
  await sleep(1500)
  fd.kill()
  for (const id of ['rev2-a', 'rev2-b']) ws(['stop', id])
  process.exit(0)
}
console.error('usage: rev2.mjs proxy | stall | --destroy')
process.exit(2)
