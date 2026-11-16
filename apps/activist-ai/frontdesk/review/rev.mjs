// The outside review's harness for the front desk (2026-11-16): the proofs of the findings that
// stay open (slow body, many things, FIFO, concurrent uploads, the working count, invitations) and
// the before-fix runs of the fixed ones (streams, query). A software passkey (softauthn.mjs) signs
// in without a browser. On the mini, from a copy of apps/activist-ai at ~/rev-fd/activist-ai:
//   cd frontdesk/review && node rev.mjs [test ...]     (made-up people and workspaces, ids rev-*)
//   node rev.mjs --destroy

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SoftAuthn } from './softauthn.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.resolve(HERE, '../..')
const ROOT = path.join(homedir(), 'rev-fd')
const STATE = path.join(ROOT, 'state.json')
const PORT = Number(process.env.REV_PORT ?? 4795)
const ORIGIN = `http://localhost:${PORT}`
const CTR = '/usr/local/bin/container'
const env = {
  ...process.env,
  OLA_HOME: path.join(homedir(), '.ola-rev-fd'),
  OLA_MAX_RUNNING: '2',
  OLA_GATEWAY_PORT: '4183',
  OLA_FD_DATA: path.join(ROOT, 'fd'),
  OLA_FD_ORIGIN: ORIGIN,
  OLA_FD_PORT: String(PORT),
  OLA_FD_SIGNIN_BURST: process.env.REV_BURST ?? '500',
  OLA_FD_SIGNIN_PER_MIN: process.env.REV_BURST ?? '500',
  OLA_FD_MAX_UPLOAD_MB: '2',
}
const argv = process.argv.slice(2)
const node = (script, a) => spawnSync(process.execPath, [path.join(AI, script), ...a], { env, encoding: 'utf8' })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a.join(' ')}: ${r.stderr.trim()}`)
  return r.stdout.trim()
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)

if (argv.includes('--destroy')) {
  for (const id of ['rev-fa', 'rev-fb']) node('workspace/ws.mjs', ['destroy', id, '--confirm', id])
  rmSync(ROOT + '/fd', { recursive: true, force: true })
  rmSync(STATE, { force: true })
  rmSync(env.OLA_HOME, { recursive: true, force: true })
  console.log('destroyed')
  process.exit(0)
}

async function api(p, { method = 'GET', cookie, csrf, ws, origin = method === 'GET' ? undefined : ORIGIN, body, headers = {}, signal } = {}) {
  const h = { ...headers }
  if (cookie) h.cookie = `__Host-ola=${cookie}`
  if (csrf) h['x-ola-csrf'] = csrf
  if (ws) h['x-ola-workspace'] = ws
  if (origin) h.origin = origin
  if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json'
  const r = await fetch(`${ORIGIN}${p}`, { method, headers: h, body, signal, redirect: 'manual' })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: r.status, json, text, headers: r.headers, cookie: /__Host-ola=([^;]*)/.exec(r.headers.get('set-cookie') ?? '')?.[1] }
}
const post = (p, b, o = {}) => api(p, { method: 'POST', body: JSON.stringify(b), ...o })

// ---------------------------------------------------------------- setup (once)
let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null
function startDesk(extra = {}) {
  const p = spawn(process.execPath, [path.join(AI, 'frontdesk/server.mjs')], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', (d) => (p.log += d))
  p.stderr.on('data', (d) => (p.log += d))
  return p
}
async function up() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${ORIGIN}/api/health`)).ok) return
    } catch {}
    await sleep(150)
  }
  throw new Error('front desk did not start')
}
const desk = startDesk()
process.on('exit', () => desk.kill())
await up()

async function register(handle) {
  const link = admin('invite', handle)
  const invite = link.split('/').pop()
  const a = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  const o = await post('/api/auth/register/options', { invite })
  const v = await post('/api/auth/register/verify', { ceremony: o.json.ceremony, response: a.create(o.json.options) })
  if (v.status !== 200) throw new Error(`register ${handle}: ${v.status} ${v.text}`)
  return a
}
if (!state) {
  mkdirSync(ROOT, { recursive: true })
  for (const id of ['rev-fa', 'rev-fb']) node('workspace/ws.mjs', ['destroy', id, '--confirm', id])
  for (const [h, n] of [['rev-alice', 'Alice R.'], ['rev-bob', 'Bob R.'], ['rev-vera', 'Vera R.'], ['rev-dan', 'Dan R.']]) admin('add-person', h, '--name', n)
  admin('create-workspace', 'rev-fa', '--name', 'Rev made-up A', '--team', 'rev-ta', '--team-name', 'Rev team A', '--owner', 'rev-alice', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  admin('create-workspace', 'rev-fb', '--name', 'Rev made-up B', '--team', 'rev-tb', '--team-name', 'Rev team B', '--owner', 'rev-bob', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  admin('add-member', 'rev-ta', 'rev-vera', 'viewer')
  admin('add-member', 'rev-ta', 'rev-dan', 'member')
  state = { keys: {} }
  for (const h of ['rev-alice', 'rev-bob', 'rev-vera', 'rev-dan']) state.keys[h] = (await register(h)).save()
  writeFileSync(STATE, JSON.stringify(state))
  console.log('setup done')
}
const keys = Object.fromEntries(Object.entries(state.keys).map(([h, s]) => [h, new SoftAuthn({ rpId: 'localhost', origin: ORIGIN, saved: s })]))
const saveKeys = () => {
  for (const [h, k] of Object.entries(keys)) state.keys[h] = k.save()
  writeFileSync(STATE, JSON.stringify(state))
}
async function login(h, opts = {}) {
  const o = await post('/api/auth/login/options', {})
  const v = await post('/api/auth/login/verify', { ceremony: o.json.ceremony, response: keys[h].get(o.json.options, opts) })
  saveKeys()
  if (v.status !== 200) return { status: v.status }
  const me = await api('/api/me', { cookie: v.cookie })
  return { status: 200, cookie: v.cookie, csrf: me.json.csrf, me: me.json }
}
/** Opens a long request (an event stream) and collects what arrives. */
function stream(p, s, ws) {
  const ctl = new AbortController()
  const st = { text: '', open: true, status: null, stop: () => ctl.abort() }
  fetch(`${ORIGIN}${p}`, { headers: { cookie: `__Host-ola=${s.cookie}`, 'x-ola-workspace': ws, accept: 'text/event-stream' }, signal: ctl.signal })
    .then(async (r) => {
      st.status = r.status
      for await (const c of r.body) st.text += Buffer.from(c).toString('utf8')
    })
    .catch(() => {})
    .finally(() => (st.open = false))
  return st
}
const exec = (ws, ...cmd) => spawnSync(CTR, ['exec', `ola-${ws}`, ...cmd], { encoding: 'utf8' })

const S = {}
for (const h of ['rev-alice', 'rev-bob', 'rev-vera', 'rev-dan']) S[h] = await login(h)
out('logins', Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.status])))
const want = argv.filter((a) => !a.startsWith('--'))
const T = {}

// ---------------------------------------------------------------- tests
T.webauthn = async () => {
  const r = {}
  // registration knobs, on fresh invitations for dan (a second passkey if one gets through)
  for (const [name, knob] of [['reg uv off', { uv: false }], ['reg other origin', { origin: 'http://localhost:4796' }], ['reg other rpId', { rpId: 'evil.example' }]]) {
    const inv = admin('invite', 'rev-dan').split('/').pop()
    const a = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
    const o = await post('/api/auth/register/options', { invite: inv })
    r[name] = (await post('/api/auth/register/verify', { ceremony: o.json.ceremony, response: a.create(o.json.options, knob) })).status
  }
  // the invitation race: two ceremonies from one invitation, verified at the same moment
  const inv = admin('invite', 'rev-dan').split('/').pop()
  const [o1, o2] = await Promise.all([post('/api/auth/register/options', { invite: inv }), post('/api/auth/register/options', { invite: inv })])
  const a1 = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  const a2 = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  const both = await Promise.all([post('/api/auth/register/verify', { ceremony: o1.json.ceremony, response: a1.create(o1.json.options) }), post('/api/auth/register/verify', { ceremony: o2.json.ceremony, response: a2.create(o2.json.options) })])
  r['invite race'] = both.map((x) => x.status)
  // sign-in knobs
  const o = await post('/api/auth/login/options', {})
  const resp = keys['rev-alice'].get(o.json.options)
  r['login ok'] = (await post('/api/auth/login/verify', { ceremony: o.json.ceremony, response: resp })).status
  r['same assertion, same ceremony'] = (await post('/api/auth/login/verify', { ceremony: o.json.ceremony, response: resp })).status
  const o3 = await post('/api/auth/login/options', {})
  r['same assertion, new ceremony'] = (await post('/api/auth/login/verify', { ceremony: o3.json.ceremony, response: resp })).status
  const lk = async (opts) => {
    const x = await post('/api/auth/login/options', {})
    return (await post('/api/auth/login/verify', { ceremony: x.json.ceremony, response: keys['rev-alice'].get(x.json.options, opts) })).status
  }
  r['login uv off'] = await lk({ uv: false })
  r['login other origin'] = await lk({ origin: 'http://localhost:4796' })
  r['login old counter'] = await lk({ counter: 1 })
  r['login with bob user handle'] = await lk({ userHandle: keys['rev-bob'].userHandle })
  r['login ok after'] = await lk({})
  saveKeys()
  r['dan passkeys'] = admin('list').split('\n').find((l) => l.startsWith('person rev-dan'))
  out('webauthn', r)
}

T.streams = async () => {
  // A viewer's open event stream, then the admin removes her from the team.
  const vs = stream('/oc/api/event', S['rev-vera'], 'rev-fa')
  const ds = stream('/oc/api/event', S['rev-dan'], 'rev-fa')
  await sleep(4000)
  out('streams open', { vera: vs.status, dan: ds.status })
  admin('remove-member', 'rev-ta', 'rev-vera')
  admin('revoke-sessions', 'rev-dan')
  const after = await api('/api/files', { cookie: S['rev-vera'].cookie, ws: 'rev-fa' })
  const dme = await api('/api/me', { cookie: S['rev-dan'].cookie })
  await sleep(1500)
  const mk = `marker-after-removal-${Date.now()}`
  const c = await post('/oc/api/session', { title: mk }, { cookie: S['rev-alice'].cookie, csrf: S['rev-alice'].csrf, ws: 'rev-fa' })
  await sleep(8000)
  out('removed viewer, new request', after.status)
  out('revoked member, new request', dme.status)
  out('alice made a session', c.status)
  out('removed viewer still receives events', { open: vs.open, sawMarker: vs.text.includes(mk), bytes: vs.text.length })
  out('revoked member still receives events', { open: ds.open, sawMarker: ds.text.includes(mk), bytes: ds.text.length })
  vs.stop()
  ds.stop()
  admin('add-member', 'rev-ta', 'rev-vera', 'viewer')
  S['rev-dan'] = await login('rev-dan')
}

T.slowbody = async () => {
  // No session: a write with a large declared body. The 401 comes at once; is the socket kept?
  const sock = net.connect(PORT, '127.0.0.1')
  let resp = ''
  let closedAt = null
  const t0 = Date.now()
  sock.on('data', (d) => (resp += d))
  sock.on('close', () => (closedAt = Date.now() - t0))
  sock.write(`POST /api/files?name=x HTTP/1.1\r\nHost: localhost:${PORT}\r\nOrigin: ${ORIGIN}\r\nContent-Length: 100000000\r\n\r\nx`)
  for (let i = 0; i < 6 && closedAt === null; i++) {
    await sleep(5000)
    if (closedAt === null) sock.write('x')
  }
  out('slow body', { status: resp.split('\r\n')[0], closedAfterMs: closedAt, stillOpenAfterMs: closedAt === null ? Date.now() - t0 : null })
  sock.destroy()
}

T.things = async () => {
  const n = Number(process.env.REV_N ?? 200)
  exec('rev-fa', 'python3', '-c', `import os\nfor i in range(${n}): open('/work/note%04d.md' % i,'w').write('# n%d\\nhi\\n' % i)`)
  const t0 = Date.now()
  const r = await api('/api/project', { cookie: S['rev-alice'].cookie, ws: 'rev-fa' })
  out('project with many .md files', { files: n, status: r.status, things: r.json?.things?.length, ms: Date.now() - t0 })
  exec('rev-fa', 'sh', '-c', 'rm -f /work/note*.md')
}

T.fifo = async () => {
  exec('rev-fa', 'mkfifo', '/work/pipe.csv')
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 10_000)
  let status = 'hung (aborted by the client after 10 s)'
  try {
    status = (await api('/api/files/pipe.csv?w=rev-fa', { cookie: S['rev-alice'].cookie, signal: ctl.signal })).status
  } catch {}
  clearTimeout(timer)
  await sleep(500)
  const procs = spawnSync('pgrep', ['-fl', 'ola-get pipe.csv'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length
  out('download of a FIFO', { status, ms: Date.now() - t0, ola_get_execs_left_running: procs })
  exec('rev-fa', 'rm', '-f', '/work/pipe.csv')
}

T.downloads = async () => {
  exec('rev-fa', 'sh', '-c', `printf '<script>alert(1)</script>' > /work/evil.html; printf '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' > /work/evil.svg`)
  const r = {}
  for (const f of ['evil.html', 'evil.svg']) {
    const x = await api(`/api/files/${f}?w=rev-fa`, { cookie: S['rev-alice'].cookie })
    r[f] = { status: x.status, type: x.headers.get('content-type'), disp: x.headers.get('content-disposition'), csp: x.headers.get('content-security-policy'), nosniff: x.headers.get('x-content-type-options') }
  }
  out('agent-written html/svg downloads', r)
  exec('rev-fa', 'rm', '-f', '/work/evil.html', '/work/evil.svg')
}

T.query = async () => {
  // The query string goes to opencode untouched.
  const a = await api('/oc/api/session', { cookie: S['rev-vera'].cookie, ws: 'rev-fa' })
  const b = await api('/oc/api/session?directory=/', { cookie: S['rev-vera'].cookie, ws: 'rev-fa' })
  const c = await api('/oc/api/session?directory=/opt/ola', { cookie: S['rev-vera'].cookie, ws: 'rev-fa' })
  out('viewer GET /oc/api/session', { plain: [a.status, a.text.slice(0, 160)], 'directory=/': [b.status, b.text.slice(0, 160)], 'directory=/opt/ola': [c.status, c.text.slice(0, 160)] })
}

T.working = async () => {
  await api('/api/me', { cookie: S['rev-bob'].cookie })
  const r = await api('/api/me', { cookie: S['rev-alice'].cookie })
  out('alice sees "working" (bob is in another team)', r.json.machine)
}

T.perms = async () => {
  const m = (f) => (existsSync(f) ? (statSync(f).mode & 0o777).toString(8) : 'missing')
  const d = env.OLA_FD_DATA
  out('modes', { dir: m(d), db: m(`${d}/platform.db`), wal: m(`${d}/platform.db-wal`), key: m(`${d}/frontdesk.key`), wsSecrets: m(`${env.OLA_HOME}/ws/rev-fa/secrets.env`), wsDir: m(`${env.OLA_HOME}/ws/rev-fa`), sock: m(`${env.OLA_HOME}/ws/rev-fa/opencode.sock`) })
}

T.uploads = async () => {
  // Concurrent slow uploads by one member: how many container exec processes does that hold?
  const socks = []
  for (let i = 0; i < 8; i++) {
    const s = net.connect(PORT, '127.0.0.1')
    s.on('error', () => {})
    s.write(`POST /api/files?name=slow${i}.bin HTTP/1.1\r\nHost: localhost:${PORT}\r\nOrigin: ${ORIGIN}\r\nCookie: __Host-ola=${S['rev-dan'].cookie}\r\nX-Ola-CSRF: ${S['rev-dan'].csrf}\r\nX-Ola-Workspace: rev-fa\r\nContent-Length: 1000000\r\n\r\nx`)
    socks.push(s)
  }
  await sleep(6000)
  const n = spawnSync('pgrep', ['-f', 'exec -i ola-rev-fa /opt/ola/bin/ola-put'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length
  out('8 slow uploads by one member hold', `${n} ola-put execs`)
  for (const s of socks) s.destroy()
}

T.invites = async () => {
  const l1 = admin('invite', 'rev-vera').split('/').pop()
  const l2 = admin('invite', 'rev-vera').split('/').pop()
  const r1 = await post('/api/auth/register/options', { invite: l1 })
  const r2 = await post('/api/auth/register/options', { invite: l2 })
  out('two outstanding invitations for one person both open', [r1.status, r2.status, r1.json?.name])
}

T.lockout = async () => {
  // Run with REV_BURST=10 (the defaults' per-address size): behind the relay everyone shares one
  // address, and the global bucket (60 a minute) is shared by everyone anywhere.
  const codes = []
  for (let i = 0; i < 12; i++) codes.push((await post('/api/auth/login/options', {})).status)
  const alice = await post('/api/auth/login/options', {})
  out("an outsider's 12 tries, then alice's sign-in", { outsider: codes.join(' '), alice: alice.status })
}

for (const t of want.length ? want : Object.keys(T)) {
  try {
    await T[t]()
  } catch (e) {
    out(`${t} ERROR`, String(e?.stack ?? e).slice(0, 400))
  }
}
desk.kill()
if (argv.includes('--log')) console.log(desk.log.slice(-3000))
process.exit(0)
