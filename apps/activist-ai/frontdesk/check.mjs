#!/usr/bin/env node
// The front desk's proofs, run on the machine that hosts the workspaces (the Mac mini for now):
//
//   node frontdesk/check.mjs [--no-live] [--keep] [--shots <dir>]
//
// It starts its own model gateway (port 4182; Together as the stand-in, key from TOGETHER_API_KEY
// or ~/Documents/code/hilma/.env.local, never printed; with --no-live the scripted fake model of
// web/server/fake-model.mjs instead, and the long-run checks always use the fake), makes a fresh platform database, three
// made-up people (alice owns team A, vera is its viewer, bob owns team B) and two small sealed
// workspaces (fd-a, fd-b under ~/.ola-fdcheck), starts the front desk on 127.0.0.1:4790 (origin
// http://localhost:4790), and drives it with Chromium, whose virtual authenticator holds each
// person's passkey. Only made-up data. One line per check; exits 0 only if all pass.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startFakeModel } from '../web/server/fake-model.mjs'
import { ALLOWED } from '../web/server/proxy.mjs'
import { SoftAuthn } from './review/softauthn.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.join(HERE, '..')
const args = process.argv.slice(2)
const LIVE = !args.includes('--no-live')
const KEEP = args.includes('--keep')
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
const PORT = 4790
const ORIGIN = `http://localhost:${PORT}`
const GW_PORT = 4182
const run = mkdtempSync(path.join(tmpdir(), 'ola-fdcheck-'))
const env = {
  ...process.env,
  OLA_HOME: path.join(homedir(), '.ola-fdcheck'),
  OLA_GATEWAY_PORT: String(GW_PORT),
  OLA_MAX_RUNNING: '2',
  OLA_FD_DATA: path.join(run, 'frontdesk'),
  OLA_FD_ORIGIN: ORIGIN,
  OLA_FD_PORT: String(PORT),
  OLA_FD_SIGNIN_BURST: '40',
  OLA_FD_SIGNIN_PER_MIN: '40',
  OLA_FD_MAX_UPLOAD_MB: '2',
  OLA_FD_WORKING_WINDOW_S: '4', // "people working" changes once per window; 4 s so the check can watch it
  OLA_FD_SLOW_MS: '4000', // a download must move 32 KiB per window; 4 s here (30 s by default) so the check can watch it
}
const node = (script, argv, opts = {}) => spawnSync(process.execPath, [path.join(AI, script), ...argv], { env, encoding: 'utf8', ...opts })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
const adminAsync = (...a) =>
  new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(AI, 'frontdesk/admin.mjs'), ...a], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (err += d))
    c.on('close', (code) => resolve({ code, out, err }))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CTR = '/usr/local/bin/container'
const secretsOf = (id) => Object.fromEntries(readFileSync(path.join(env.OLA_HOME, 'ws', id, 'secrets.env'), 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
// From inside a workspace, through its door: the gateway's answer to a token (given on stdin).
const PROBE = 'import sys, urllib.request\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/models", headers={"Authorization": "Bearer " + sys.stdin.read().strip()})\ntry:\n    print(urllib.request.urlopen(req, timeout=10).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\nexcept Exception:\n    print("error")\n'
const insideToken = (id, token) => spawnSync(CTR, ['exec', '-i', `ola-${id}`, 'python3', '-I', '-c', PROBE], { input: token, encoding: 'utf8' }).stdout.trim()
// opencode's answer through the workspace's desk socket to a password.
const deskStatus = (id, password) =>
  new Promise((resolve) => {
    const r = http.request({ socketPath: path.join(env.OLA_HOME, 'ws', id, 'opencode.sock'), path: '/api/info', headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }, timeout: 10_000 }, (res) => (res.resume(), resolve(res.statusCode)))
    r.on('error', () => resolve(0))
    r.on('timeout', () => (r.destroy(), resolve(0)))
    r.end()
  })
// Raw bytes to the front desk: how it answers and when it closes the connection.
const raw = (text, { port = PORT, pre = '' } = {}) =>
  new Promise((resolve) => {
    const t0 = Date.now()
    const sock = net.connect(port, '127.0.0.1')
    let got = ''
    sock.on('data', (d) => (got += d))
    sock.on('close', () => resolve({ ms: Date.now() - t0, got: got.split('\r\n')[0] }))
    sock.on('error', () => {})
    sock.write(pre + text)
    setTimeout(() => sock.destroy(), 30_000)
  })
const sha = (b) => createHash('sha256').update(b).digest('hex')
const results = []
const ok = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function check(name, fn) {
  try {
    const d = await fn()
    ok(name, true, d ?? '')
  } catch (e) {
    ok(name, false, String(e?.message ?? e).split('\n')[0].slice(0, 300))
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m)
}

// ---------------------------------------------------------------- the stack
const children = []
function start(name, script, extraEnv = {}) {
  const p = spawn(process.execPath, [path.join(AI, script)], { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', (d) => (p.log = (p.log + d).slice(-20000)))
  p.stderr.on('data', (d) => (p.log = (p.log + d).slice(-20000)))
  children.push(p)
  return p
}
function together() {
  if (process.env.TOGETHER_API_KEY) return process.env.TOGETHER_API_KEY
  const line = readFileSync(path.join(homedir(), 'Documents/code/hilma/.env.local'), 'utf8').split('\n').find((l) => l.startsWith('TOGETHER_API_KEY='))
  if (!line) throw new Error('no TOGETHER_API_KEY')
  return line.slice('TOGETHER_API_KEY='.length).replace(/^["']|["']$/g, '').trim()
}
async function until(fn, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`${what} did not happen`)
}
function cleanup() {
  for (const p of children) p.kill('SIGTERM')
  if (!KEEP) for (const id of ['fd-a', 'fd-b']) node('workspace/ws.mjs', ['destroy', id, '--confirm', id])
  rmSync(run, { recursive: true, force: true })
}

console.log('setting up: two workspaces, three people, the gateway, the front desk')
for (const id of ['fd-a', 'fd-b']) node('workspace/ws.mjs', ['destroy', id, '--confirm', id]) // leftovers from an earlier run
const IMAGE = (await import('../workspace/ws.mjs')).IMAGE
if (spawnSync('/usr/local/bin/container', ['image', 'inspect', IMAGE]).status !== 0) node('workspace/ws.mjs', ['image'], { stdio: 'inherit' })
admin('add-person', 'alice', '--name', 'Alice A.')
admin('add-person', 'bob', '--name', 'Bob B.')
admin('add-person', 'vera', '--name', 'Vera V.')
admin('create-workspace', 'fd-a', '--name', 'Made-up eviction report', '--team', 'team-a', '--team-name', 'Made-up Tenants’ Union', '--owner', 'alice', '--memory', '1g', '--disk', '1g', '--cpus', '1')
admin('create-workspace', 'fd-b', '--name', 'Made-up wage survey', '--team', 'team-b', '--team-name', 'Made-up Workers’ Center', '--owner', 'bob', '--memory', '1g', '--disk', '1g', '--cpus', '1')
admin('add-member', 'team-a', 'vera', 'viewer')
const fake = await startFakeModel()
fake.server.unref()
const FAKE_UP = { UPSTREAM_BASE_URL: `http://127.0.0.1:${fake.port}/v1`, UPSTREAM_API_KEY: 'fake-model-key-not-a-secret', GATEWAY_MODELS: 'general=fake' }
const gwEnv = {
  HOME: homedir(),
  ...(LIVE ? { UPSTREAM_BASE_URL: 'https://api.together.xyz/v1', UPSTREAM_API_KEY: together(), GATEWAY_MODELS: 'general=zai-org/GLM-5.3-Flash' } : FAKE_UP),
  // The tokens file ws.mjs keeps (reloaded when it changes) and the workspaces' door sockets.
  GATEWAY_TOKENS_FILE: path.join(env.OLA_HOME, 'gateway-tokens'),
  GATEWAY_DOOR_DIR: path.join(env.OLA_HOME, 'gw'),
  GATEWAY_PORT: String(GW_PORT),
  GATEWAY_DB: path.join(run, 'usage.db'),
}
let gateway = start('gateway', 'gateway/server.mjs', gwEnv)
await until(() => gateway.log.includes('"event":"start"'), 10_000, 'the gateway start')
let fd = start('frontdesk', 'frontdesk/server.mjs')
await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
// The invitations, printed once by the admin CLI.
const invites = { alice: admin('invite', 'alice'), bob: admin('invite', 'bob'), vera: admin('invite', 'vera') }

// ---------------------------------------------------------------- helpers
const browser = await chromium.launch()
const foreign = new Set()
async function person(viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  page.on('request', (r) => !r.url().startsWith(`${ORIGIN}/`) && !r.url().startsWith('data:') && foreign.add(r.url()))
  return { ctx, page, cdp }
}
const cookieOf = async (ctx) => (await ctx.cookies(ORIGIN)).find((c) => c.name === '__Host-ola')
/** A request from outside the browser (node), as a thief with the cookie would send it. */
async function api(pathname, { method = 'GET', cookie, csrf, ws, origin = method === 'GET' ? undefined : ORIGIN, body, headers = {} } = {}) {
  const h = { ...headers }
  if (cookie) h.cookie = `__Host-ola=${cookie}`
  if (csrf) h['x-ola-csrf'] = csrf
  if (ws) h['x-ola-workspace'] = ws
  if (origin) h.origin = origin
  const r = await fetch(`${ORIGIN}${pathname}`, { method, headers: h, body, redirect: 'manual' })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: r.status, json, text, headers: r.headers }
}
/** An open event stream (GET /oc/api/event), collecting what arrives until it ends. */
function openStream(cookie, ws) {
  const ctl = new AbortController()
  const st = { text: '', open: true, status: null, stop: () => ctl.abort() }
  fetch(`${ORIGIN}/oc/api/event`, { headers: { cookie: `__Host-ola=${cookie}`, 'x-ola-workspace': ws, accept: 'text/event-stream' }, signal: ctl.signal })
    .then(async (r) => {
      st.status = r.status
      for await (const c of r.body) st.text += Buffer.from(c).toString('utf8')
    })
    .catch(() => {})
    .finally(() => (st.open = false))
  return st
}
async function signedIn(p) {
  const c = await cookieOf(p.ctx)
  const me = await api('/api/me', { cookie: c?.value })
  return { cookie: c?.value, csrf: me.json?.csrf, me }
}
async function register(p, link) {
  await p.page.goto(link)
  const btn = p.page.getByRole('button', { name: 'Make my passkey' })
  await until(() => btn.isEnabled(), 10_000, 'the passkey button')
  await btn.click()
  await p.page.waitForSelector('.project-title', { timeout: 60_000 })
}
async function signInWithPasskey(p) {
  await p.page.goto(`${ORIGIN}/`)
  const btn = p.page.getByRole('button', { name: 'Sign in with your passkey' })
  await until(() => btn.isEnabled(), 10_000, 'the sign-in button')
  await btn.click()
  await p.page.waitForSelector('.project-title', { timeout: 60_000 })
}
const auditRows = (ws) => JSON.parse(admin('audit', '--workspace', ws, '--limit', '500', '--json'))

// ---------------------------------------------------------------- invitations and passkeys
const A = await person()
const B = await person()
const V = await person()
let a, b, v

await check('alice: invitation link → passkey made → her project opens', async () => {
  await A.page.goto(invites.alice)
  await A.page.waitForSelector('.gate-name')
  const greet = await A.page.locator('.gate-name').innerText()
  assert(greet === 'Alice A.', `greeting: ${greet}`)
  if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'invite-1280.png') })
  await register(A, invites.alice)
  a = await signedIn(A)
  assert(a.me.status === 200 && a.me.json.workspaces.length === 1 && a.me.json.workspaces[0].slug === 'fd-a', JSON.stringify(a.me.json))
  assert(new URL(A.page.url()).search === '?w=fd-a', A.page.url())
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent !== 'Your project')
  return `project "${await A.page.locator('.project-title').innerText()}"`
})
await check('bob and vera register from their own invitations', async () => {
  await register(B, invites.bob)
  await register(V, invites.vera)
  b = await signedIn(B)
  v = await signedIn(V)
  assert(b.me.json.workspaces.map((w) => w.slug).join() === 'fd-b', 'bob sees ' + JSON.stringify(b.me.json.workspaces))
  assert(v.me.json.workspaces.map((w) => `${w.slug}:${w.role}`).join() === 'fd-a:viewer', 'vera sees ' + JSON.stringify(v.me.json.workspaces))
})
await check('an invitation works once', async () => {
  const token = invites.alice.split('/').pop()
  const r = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: token }), headers: { 'content-type': 'application/json' } })
  assert(r.status === 404, `second use answered ${r.status}`)
  const rows = JSON.parse(admin('audit', '--limit', '500', '--json')).filter((x) => x.action === 'passkey_registered')
  assert(rows.length === 3, `${rows.length} passkeys registered`)
})
await check('an expired invitation is refused', async () => {
  admin('add-person', 'evan', '--name', 'Evan E.')
  const link = admin('invite', 'evan', '--hours', '0.0003') // about a second
  await new Promise((r) => setTimeout(r, 1600))
  const r = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: link.split('/').pop() }), headers: { 'content-type': 'application/json' } })
  assert(r.status === 404, `answered ${r.status}`)
})
await check('the session cookie is __Host-, HttpOnly, Secure, SameSite=Strict, Path=/', async () => {
  const c = await cookieOf(A.ctx)
  assert(c && c.httpOnly && c.secure && c.sameSite === 'Strict' && c.path === '/', JSON.stringify({ ...c, value: '…' }))
  assert(!(await A.page.evaluate(() => document.cookie)).includes('__Host-ola'), 'the page script can read the cookie')
})
await check('sign out, then sign in again with the passkey', async () => {
  const before = a.cookie
  await A.page.getByRole('button', { name: 'Sign out' }).click()
  await A.page.getByRole('button', { name: 'Sign in with your passkey' }).waitFor()
  assert((await api('/api/me', { cookie: before })).status === 401, 'the signed-out cookie still works')
  if (SHOTS) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await A.page.setViewportSize({ width: w, height: h })
      await A.page.waitForTimeout(300)
      await A.page.screenshot({ path: path.join(SHOTS, `signin-${w}.png`) })
    }
    await A.page.setViewportSize({ width: 1280, height: 860 })
  }
  await signInWithPasskey(A)
  a = await signedIn(A)
  assert(a.me.status === 200 && a.cookie !== before, 'no new session')
})

await check('invitations: a new one voids the older; a person with a passkey gets one only by --add-device, and is told once', async () => {
  const ro = (t) => api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: t }), headers: { 'content-type': 'application/json' } })
  admin('add-person', 'dora', '--name', 'Dora D.')
  const older = admin('invite', 'dora').split('/').pop()
  const newer = admin('invite', 'dora').split('/').pop()
  const [r1, r2] = [await ro(older), await ro(newer)]
  assert(r1.status === 404 && r2.status === 200, `older ${r1.status}, newer ${r2.status}`)
  const plain = node('frontdesk/admin.mjs', ['invite', 'alice'])
  assert(plain.status !== 0 && /--add-device/.test(plain.stderr), 'an ordinary invitation was made for alice, who has a passkey')
  const link = admin('invite', 'alice', '--add-device')
  const device = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  const o = await ro(link.split('/').pop())
  const reg = await fetch(`${ORIGIN}/api/auth/register/verify`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ceremony: o.json.ceremony, response: device.create(o.json.options) }) })
  assert(reg.status === 200, `the new device registered: ${reg.status}`)
  const devCookie = /__Host-ola=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1]
  assert(!(await api('/api/me', { cookie: devCookie })).json.notices?.length, 'the new device is told about itself instead of the person')
  // Alice's own browser hears of it on its next load, once. (about:blank first: a goto to the
  // address the page is already on is only a hash change, not a load.)
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=fd-a#/`)
  await A.page.waitForSelector('.notice-bar', { timeout: 15_000 })
  const text = await A.page.locator('.notice-bar p').first().innerText()
  await A.page.getByRole('button', { name: 'I have read this' }).click()
  assert(!(await api('/api/me', { cookie: a.cookie })).json.notices?.length, 'told twice')
  const rows = JSON.parse(admin('audit', '--limit', '500', '--json')).map((x) => x.action)
  assert(['invitations_voided', 'device_invited', 'device_added'].every((x) => rows.includes(x)), 'audit rows missing')
  const listed = admin('list').split('\n').find((l) => l.startsWith('person alice '))
  assert(/2 passkey\(s\)/.test(listed) && listed.includes('another device'), listed)
  return `older invitation 404, plain invite for alice refused; notice: "${text.slice(0, 70)}…"`
})

// ---------------------------------------------------------------- authorization
const sampleRoutes = ALLOWED.map(([m, re]) => {
  const p = re.source.replace(/\\\//g, '/').replace(/^\^|\$$/g, '').replace(/\[A-Za-z0-9_-\]\{1,80\}/g, 'ses_x1').replace(/\\/g, '')
  return [m, `/oc${p}`]
})
const deskRoutes = [
  ['GET', '/api/project'], ['GET', '/api/files'], ['GET', '/api/activity'], ['GET', '/api/runs'], ['POST', '/api/files?name=planted.txt'],
  ['GET', '/api/files/survey.csv?w=fd-a'], ['DELETE', '/api/files/survey.csv'], ...sampleRoutes,
]
await check(`bob cannot reach alice's workspace: ${deskRoutes.length} routes by API, all 404`, async () => {
  const bad = []
  for (const [m, p] of deskRoutes) {
    const r = await api(p, { method: m, cookie: b.cookie, csrf: b.csrf, ws: 'fd-a', body: m === 'GET' ? undefined : '{}' })
    if (r.status !== 404) bad.push(`${m} ${p} ${r.status}`)
  }
  // The same with no workspace named, and with a name that does not exist.
  for (const ws of [undefined, 'fd-zz', '../fd-a', 'FD-A']) {
    const r = await api('/api/files', { cookie: b.cookie, ws })
    if (r.status !== 404) bad.push(`ws=${ws} ${r.status}`)
  }
  assert(!bad.length, bad.join(', '))
})
await check("bob cannot reach alice's workspace by direct URL in his browser", async () => {
  await B.page.goto(`${ORIGIN}/?w=fd-a#/files`)
  await B.page.waitForSelector('.gate-problem')
  const text = await B.page.locator('main').innerText()
  assert(text.includes('not one of yours') && !text.includes('Made-up eviction report'), text.slice(0, 200))
  const dl = await B.page.evaluate(() => fetch('/api/files/survey.csv?w=fd-a').then((r) => r.status))
  assert(dl === 404, `download ${dl}`)
})
await check('the opencode door refuses routes the page does not use, for an owner too', async () => {
  const bad = []
  for (const [m, p] of [['GET', '/oc/api/config'], ['POST', '/oc/api/session/x/shell'], ['GET', '/oc/api/credential'], ['POST', '/oc/api/pty'], ['GET', '/oc/api/provider'], ['GET', '/oc/api/file?path=/etc/passwd']]) {
    const r = await api(p, { method: m, cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: m === 'GET' ? undefined : '{}' })
    if (r.status !== 403) bad.push(`${m} ${p} ${r.status}`)
  }
  assert(!bad.length, bad.join(', '))
})

// ---------------------------------------------------------------- files
const made = { name: 'made-up notes.csv', bytes: Buffer.from(`id,city,hours\n${Array.from({ length: 40 }, (_, i) => `N${i},Springfield,${i % 9}`).join('\n')}\n`) }
const tmpFile = path.join(run, made.name)
writeFileSync(tmpFile, made.bytes)
await check('alice uploads, lists, downloads (same bytes) and deletes through the page', async () => {
  await A.page.goto(`${ORIGIN}/?w=fd-a#/files`)
  await A.page.waitForSelector('#files-title')
  await A.page.setInputFiles('#file-picker', tmpFile)
  await A.page.locator('table.files', { hasText: made.name }).first().waitFor({ timeout: 30_000 })
  const list = await api('/api/files', { cookie: a.cookie, ws: 'fd-a' })
  const entry = list.json.files.find((f) => f.path === made.name)
  assert(entry?.origin === 'uploaded' && entry.size === made.bytes.length, JSON.stringify(entry))
  const back = await A.page.evaluate(async (n) => {
    const r = await fetch(`/api/files/${encodeURIComponent(n)}?w=fd-a`)
    return [r.status, r.headers.get('content-disposition'), Array.from(new Uint8Array(await r.arrayBuffer()))]
  }, made.name)
  assert(back[0] === 200 && back[1].startsWith('attachment') && sha(Buffer.from(back[2])) === sha(made.bytes), `download ${back[0]} ${back[1]}`)
  const row = A.page.locator('tr', { hasText: made.name })
  await row.getByRole('button', { name: /Delete/ }).click()
  const lede = await A.page.locator('dialog.confirm .sheet-lede').innerText()
  assert(lede.includes('14 days'), `the confirmation says: ${lede}`)
  await A.page.locator('dialog.confirm').getByRole('button', { name: /^Delete/ }).click()
  await until(async () => !(await api('/api/files', { cookie: a.cookie, ws: 'fd-a' })).json.files.some((f) => f.path === made.name), 15_000, 'the delete')
  return `confirmation: "${lede.slice(0, 70)}…"`
})
await check('upload, download and delete are in the audit log, with no file name in the database', async () => {
  const rows = auditRows('fd-a')
  const want = sha(made.bytes)
  const has = (action) => rows.find((r) => r.action === action && r.sha256 === want && r.ok === 1 && r.actor === 'alice')
  assert(has('file_uploaded') && has('file_downloaded') && has('file_deleted'), rows.map((r) => `${r.action}:${r.sha256?.slice(0, 6)}`).join(' '))
  const ref = has('file_uploaded').name_ref
  assert(has('file_deleted').name_ref === ref && ref.length === 64, 'name refs differ')
  const db = ['platform.db', 'platform.db-wal'].map((f) => path.join(env.OLA_FD_DATA, f)).filter(existsSync).map((f) => readFileSync(f))
  assert(db.every((buf) => !buf.includes(Buffer.from('made-up notes')) && !buf.includes(Buffer.from('Springfield'))), 'a file name or content is in the database')
  return 'name kept only as a keyed hash'
})
await check('uploads are limited: size, names, and a planted symlink is not followed', async () => {
  // The front desk answers 413 on the declared size while the body is still being sent, and
  // closes the lingering way (web/server/linger.mjs). Destroyed at once (M2), the unread bytes drew
  // a reset and the client often lost the answer: this check failed about half the time on the
  // mini (2026-11-16). Now 30 tries with node:http and 30 with fetch (what the page uses) must all
  // read the 413 and its sentence; the page refuses a larger file before sending it, in words.
  const size = 3 * 1024 * 1024
  const want = 'That file is larger than 2 MB, the most Ola accepts.'
  const headers = { host: `localhost:${PORT}`, origin: ORIGIN, cookie: `__Host-ola=${a.cookie}`, 'x-ola-csrf': a.csrf, 'x-ola-workspace': 'fd-a', 'content-type': 'application/octet-stream' }
  const viaHttp = () =>
    new Promise((resolve) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/api/files?name=big.bin', headers: { ...headers, 'content-length': size } }, (res) => {
        let text = ''
        res.on('data', (d) => (text += d))
        res.on('end', () => resolve(`${res.statusCode} ${text}`))
      })
      r.on('error', (e) => resolve(`a reset before any answer (${e.code})`))
      r.setTimeout(15_000, () => (r.destroy(), resolve('no answer in 15 s')))
      r.end(randomBytes(size))
    })
  const viaFetch = async () => {
    try {
      const r = await fetch(`${ORIGIN}/api/files?name=big.bin`, { method: 'POST', headers, body: randomBytes(size), signal: AbortSignal.timeout(15_000) })
      return `${r.status} ${await r.text()}`
    } catch (e) {
      return `a reset before any answer (${e.cause?.code ?? e.name})`
    }
  }
  const tally = {}
  for (const [how, send] of [['node:http', viaHttp], ['fetch', viaFetch]])
    for (let i = 0; i < 30; i++) {
      const got = await send()
      const k = `${how} ${got.startsWith('413 ') && JSON.parse(got.slice(4)).message === want ? '413 with its sentence' : got.slice(0, 80)}`
      tally[k] = (tally[k] ?? 0) + 1
    }
  assert(tally['node:http 413 with its sentence'] === 30 && tally['fetch 413 with its sentence'] === 30, `3 MiB answered ${JSON.stringify(tally)}`)
  const me = await api('/api/me', { cookie: a.cookie })
  assert(me.json?.policy?.maxUpload === 2 * 1024 * 1024, `/api/me policy ${JSON.stringify(me.json?.policy)}`)
  const bigFile = path.join(run, 'too big.bin')
  writeFileSync(bigFile, randomBytes(size))
  await A.page.goto(`${ORIGIN}/?w=fd-a#/files`)
  await A.page.waitForSelector('#files-title')
  await A.page.setInputFiles('#file-picker', bigFile)
  const shown = await A.page.locator('.problem[role=alert] p').first().innerText({ timeout: 15_000 })
  assert(shown === `too big.bin was not sent. ${want}`, `the page says: ${shown}`)
  for (const name of ['../escape.txt', '.hidden', 'a/b.txt', '--replace', 'x'.repeat(240)]) {
    const r = await api(`/api/files?name=${encodeURIComponent(name)}`, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: 'x' })
    assert(r.status === 400, `${name} answered ${r.status}`)
  }
  // The agent plants a link to the VM's environment (which holds its secrets) and asks for it by name.
  spawnSync('/usr/local/bin/container', ['exec', 'ola-fd-a', 'ln', '-sf', '/proc/1/environ', '/work/env.txt'])
  const r = await api('/api/files/env.txt?w=fd-a', { cookie: a.cookie })
  assert(r.status === 404 && !r.text.includes('OPENCODE_PASSWORD'), `the link answered ${r.status}`)
  spawnSync('/usr/local/bin/container', ['exec', 'ola-fd-a', 'rm', '-f', '/work/env.txt'])
  return `3 MiB: 413 and its sentence 30 of 30 with node:http, 30 of 30 with fetch; the page: "${shown}"`
})

await check('a refused request with an unread body is closed at once; slow headers and a trickled sign-in body are cut', async () => {
  const [body, heads, trickle] = await Promise.all([
    raw(`POST /api/files?name=x HTTP/1.1\r\nHost: localhost:${PORT}\r\nOrigin: ${ORIGIN}\r\nContent-Length: 100000000\r\n\r\nab`),
    raw(`GET /api/me HTTP/1.1\r\nHost: local`),
    raw(`POST /api/auth/login/options HTTP/1.1\r\nHost: localhost:${PORT}\r\nOrigin: ${ORIGIN}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`),
  ])
  assert(body.got.startsWith('HTTP/1.1 401') && body.ms < 2000, `unread body: ${body.got} after ${body.ms} ms`)
  assert(heads.ms < 8000, `slow headers held ${heads.ms} ms`)
  assert(trickle.ms < 13_000, `a trickled sign-in body held ${trickle.ms} ms`)
  return `401 then closed after ${body.ms} ms (before: open past 30 s); slow headers cut after ${heads.ms} ms; trickled body after ${trickle.ms} ms`
})
await check('the project view reads at most 12 documents, in one exec, and caches them', async () => {
  // The agent writes 200 small documents (review: 13.6 s and 200 execs per page load).
  spawnSync(CTR, ['exec', 'ola-fd-a', 'python3', '-I', '-c', 'for i in range(200):\n    open(f"/work/note-{i:03}.md", "w").write(f"# Made-up note {i}\\n\\nLine {i}.\\n")'])
  try {
    let t0 = Date.now()
    const first = await api('/api/project', { cookie: a.cookie, ws: 'fd-a' })
    const ms1 = Date.now() - t0
    t0 = Date.now()
    const again = await api('/api/project', { cookie: a.cookie, ws: 'fd-a' })
    const ms2 = Date.now() - t0
    const notes = (first.json?.things ?? []).filter((t) => String(t.id).startsWith('file:note-'))
    assert(first.status === 200 && notes.length === 12 && notes.every((t) => /^Made-up note \d+$/.test(t.title)), `${first.status}, ${notes.length} things`)
    assert(ms1 < 6000 && again.json.things.length === first.json.things.length, `${ms1} ms`)
    return `200 files: ${notes.length} things in ${ms1} ms, ${ms2} ms again (cached)`
  } finally {
    spawnSync(CTR, ['exec', 'ola-fd-a', 'python3', '-I', '-c', 'import glob, os\nfor f in glob.glob("/work/note-*.md"):\n    os.remove(f)'])
  }
})
await check("one person's concurrent uploads are capped at 3; the rest are refused at once, and uploads work again after", async () => {
  const one = (i) =>
    new Promise((resolve) => {
      let done = false
      const end = (v) => !done && ((done = true), resolve(v))
      const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: `/api/files?name=slow-${i}.bin`, headers: { host: `localhost:${PORT}`, origin: ORIGIN, cookie: `__Host-ola=${a.cookie}`, 'x-ola-csrf': a.csrf, 'x-ola-workspace': 'fd-a', 'content-length': String(1024 * 1024) } }, (res) => (res.resume(), end(res.statusCode)))
      r.on('error', () => end('closed'))
      r.write(Buffer.alloc(1000))
      setTimeout(() => (end('held'), r.destroy()), 5000)
    })
  const codes = await Promise.all(Array.from({ length: 8 }, (_, i) => one(i)))
  const held = codes.filter((c) => c === 'held').length
  const refused = codes.filter((c) => c === 429).length
  assert(held === 3 && refused === 5, codes.join(' '))
  await until(async () => (await api('/api/files?name=after-cap.txt', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: 'x' })).status === 201, 15_000, 'an upload after the slow ones ended')
  await api('/api/files/after-cap.txt', { method: 'DELETE', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a' })
  return `8 at once: ${held} held, ${refused} refused with 429`
})
await check('a download of a FIFO the agent made fails at once and leaves no process behind', async () => {
  spawnSync(CTR, ['exec', 'ola-fd-a', 'mkfifo', '/work/pipe.csv'])
  try {
    const t0 = Date.now()
    const r = await api('/api/files/pipe.csv?w=fd-a', { cookie: a.cookie })
    const ms = Date.now() - t0
    await sleep(500)
    const host = spawnSync('pgrep', ['-f', 'ola-get pipe.csv'], { encoding: 'utf8' }).stdout.trim()
    const vm = spawnSync(CTR, ['exec', 'ola-fd-a', 'python3', '-I', '-c', 'import os\nn = b"ola" + b"-get"\nprint(sum(1 for p in os.listdir("/proc") if p.isdigit() and n in open(f"/proc/{p}/cmdline", "rb").read()))'], { encoding: 'utf8' }).stdout.trim()
    assert(r.status === 404 && ms < 3000 && host === '' && vm === '0', `${r.status} after ${ms} ms; host processes [${host}], in the VM ${vm}`)
    return `404 after ${ms} ms; no ola-get on the host or in the VM`
  } finally {
    spawnSync(CTR, ['exec', 'ola-fd-a', 'rm', '-f', '/work/pipe.csv'])
  }
})

await check("one person's unread downloads are cut, and cannot hold every other customer's transfers", async () => {
  // Second review (2026-11-16): a viewer's 4 unread downloads of a 128 MiB file held all 512 MiB in
  // flight and 4 execs for good; every other customer's uploads answered 429.
  spawnSync(CTR, ['exec', '--user', '1000', 'ola-fd-a', 'sh', '-c', 'head -c 134217728 /dev/zero > /work/big.bin'])
  const held = []
  try {
    const codes = []
    for (let i = 0; i < 4; i++) {
      const sock = net.connect(PORT, '127.0.0.1')
      sock.write(`GET /api/files/big.bin?w=fd-a HTTP/1.1\r\nHost: localhost:${PORT}\r\nCookie: __Host-ola=${a.cookie}\r\n\r\n`)
      const first = await new Promise((resolve) => (sock.once('data', (d) => resolve(String(d).slice(9, 12))), setTimeout(() => resolve('none'), 5000)))
      sock.pause()
      codes.push(first)
      held.push(sock)
    }
    const bobUp = await api('/api/files?name=bob-while.txt', { method: 'POST', cookie: b.cookie, csrf: b.csrf, ws: 'fd-b', body: 'x' })
    const ogets = () => spawnSync('pgrep', ['-f', 'ola-get big.bin'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length
    const during = ogets()
    await until(async () => ogets() === 0, 20_000, 'the unread downloads cut')
    await api('/api/files/bob-while.txt', { method: 'DELETE', cookie: b.cookie, csrf: b.csrf, ws: 'fd-b' })
    assert(codes[0] === '200' && codes.slice(1).every((c) => c === '503') && bobUp.status === 201 && during === 1, `alice's downloads ${codes.join(' ')}, bob's upload ${bobUp.status}, ola-get ${during}`)
    return `alice: ${codes.join(' ')} (one at a time beyond her share); bob's upload ${bobUp.status} meanwhile; the unread one cut, no ola-get left`
  } finally {
    for (const s of held) s.destroy()
    spawnSync(CTR, ['exec', 'ola-fd-a', 'rm', '-f', '/work/big.bin'])
  }
})

await check('a workspace that always says a run is executing is still interrupted and stopped, also after a restart', async () => {
  // Second review (2026-11-16): a new session id at every sweep was never interrupted and never
  // stopped; a front desk restart also gave a run a fresh ceiling.
  const r = spawnSync(process.execPath, [path.join(HERE, 'test/hostile-active.mjs'), 'rotate', '14'], { encoding: 'utf8' })
  const j = JSON.parse(r.stdout.trim().split('\n').pop() || '{}')
  const first = j.first?.stopTriedAtMs
  const again = j.afterRestart ? j.afterRestart.stopTriedAtMs - j.afterRestart.restartedAtMs : null
  assert(first !== null && first < 10_000 && j.first.interrupts >= 1 && again !== null && again < 4000, `hostile active: ${r.stdout.trim() || r.stderr.trim().slice(-200)}`)
  return `stop tried ${first} ms after the one prompt (idle 2 s, ceiling 3 s), ${j.first.interrupts} interrupt; after a restart, ${again} ms`
})

await check('a workspace that forges "read by a run" events cannot flood the audit log or bury what people did', async () => {
  // The agent answers on opencode's port: 20,000 forged reads of different files after one prompt.
  const r = spawnSync(process.execPath, [path.join(HERE, 'test/hostile-events.mjs'), '20000'], { encoding: 'utf8' })
  const j = JSON.parse(r.stdout.trim().split('\n').pop() || '{}')
  assert(j.auditRowsWritten > 0 && j.auditRowsWritten <= 200, `forged reads: ${r.stdout.trim() || r.stderr.trim().slice(-200)}`)
  // And the activity view: 500 run rows (what a flood before the cap left) do not push out people's rows.
  const db = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'))
  db.exec('PRAGMA busy_timeout = 5000')
  const wsId = db.prepare("SELECT id FROM workspaces WHERE slug = 'fd-a'").get().id
  const ins = db.prepare("INSERT INTO audit (at, actor_kind, action, workspace_id, name_ref) VALUES (?, 'run', 'file_read_by_run', ?, ?)")
  for (let i = 0; i < 500; i++) ins.run(Date.now(), wsId, randomBytes(32))
  const act = await api('/api/activity', { cookie: a.cookie, ws: 'fd-a' })
  db.prepare("DELETE FROM audit WHERE workspace_id = ? AND actor_kind = 'run' AND actor_person_id IS NULL").run(wsId)
  db.close()
  const people = (act.json?.activity ?? []).filter((x) => !x.viaRun).map((x) => x.action)
  assert(people.includes('file_uploaded') && people.includes('file_deleted'), `the view kept: ${[...new Set(people)].join()}`)
  return `${j.auditRowsWritten} of ${j.forgedEvents} forged reads written (stall ${j.worstEventLoopStallMs} ms); people's rows kept beside 500 run rows`
})

// ---------------------------------------------------------------- roles
await check('a viewer reads but cannot upload, delete or run', async () => {
  const base = { cookie: v.cookie, csrf: v.csrf, ws: 'fd-a' }
  const reads = await Promise.all(['/api/project', '/api/files', '/oc/api/session'].map((p) => api(p, base)))
  assert(reads.every((r) => r.status === 200), `reads ${reads.map((r) => r.status)}`)
  const bad = []
  for (const [m, p] of [['POST', '/api/files?name=v.txt'], ['DELETE', '/api/files/survey.csv'], ...sampleRoutes.filter(([m]) => m !== 'GET')]) {
    const r = await api(p, { ...base, method: m, body: '{}' })
    if (r.status !== 403) bad.push(`${m} ${p} ${r.status}`)
  }
  assert(!bad.length, bad.join(', '))
  await V.page.goto(`${ORIGIN}/?w=fd-a#/`)
  await V.page.waitForSelector('.viewer-note')
  assert(!(await V.page.locator('#askbar-input').isVisible()) && !(await V.page.getByRole('button', { name: 'Add files' }).count()), 'the viewer sees Ask Ola or Add files')
  return `${sampleRoutes.filter(([m]) => m !== 'GET').length + 2} writes refused`
})

await check("removing a member: their open stream is cut by the recheck, then the workspace gets new secrets", async () => {
  const old = secretsOf('fd-a')
  const gone = openStream(v.cookie, 'fd-a')
  const stays = openStream(a.cookie, 'fd-a')
  await until(() => gone.status === 200 && stays.status === 200, 30_000, 'both streams opening')
  const t0 = Date.now()
  const removal = adminAsync('remove-member', 'team-a', 'vera')
  try {
    await until(() => !gone.open, 10_000, "the removed viewer's stream closing")
    const ms = Date.now() - t0
    // The member's stream was still open when the viewer's was cut: membership did it, not the restart.
    const memberOpen = stays.open
    const r = await removal
    assert(r.code === 0, `remove-member: ${r.err.trim().split('\n').pop()}`)
    assert(memberOpen, "the member's stream had closed too: the cut came from the restart, not the recheck")
    const now = secretsOf('fd-a')
    assert(now.OPENCODE_PASSWORD !== old.OPENCODE_PASSWORD && now.BOX_API_KEY !== old.BOX_API_KEY, 'the secrets did not change')
    // The gateway (not restarted) picks up the new token from its file; the old one is refused.
    await until(() => insideToken('fd-a', now.BOX_API_KEY) === '200', 15_000, 'the new token working through the door')
    const oldToken = insideToken('fd-a', old.BOX_API_KEY)
    const pw = [await deskStatus('fd-a', old.OPENCODE_PASSWORD), await deskStatus('fd-a', now.OPENCODE_PASSWORD)]
    assert(oldToken === '401' && pw[0] === 401 && pw[1] === 200, `old token ${oldToken}, old password ${pw[0]}, new password ${pw[1]}`)
    // Alice carries on through the front desk; the removed viewer's stream saw nothing after.
    const again = openStream(a.cookie, 'fd-a')
    await until(() => again.status === 200, 30_000, "alice's stream after the restart")
    const mark = `made-up after removal ${Date.now()}`
    const made = await api('/oc/api/session', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: JSON.stringify({ title: mark }), headers: { 'content-type': 'application/json' } })
    await until(() => again.text.includes(mark), 15_000, "alice's stream getting the new session")
    again.stop()
    assert(made.status === 200 && !gone.text.includes(mark), 'the removed viewer saw a later event')
    assert(auditRows('fd-a').some((x) => x.action === 'secrets_rotated'), 'no secrets_rotated row')
    return `cut ${ms} ms after the removal with the member's stream still open; then old token ${oldToken} and old password ${pw[0]}, the new ones 200, gateway not restarted`
  } finally {
    gone.stop()
    stays.stop()
    await removal
    admin('add-member', 'team-a', 'vera', 'viewer')
  }
})
await check('the query to opencode cannot pick another folder (?directory=)', async () => {
  const ids = (r) => (r.json?.data ?? []).map((x) => x.id).join()
  const plain = await api('/oc/api/session', { cookie: v.cookie, ws: 'fd-a' })
  const other = await api('/oc/api/session?directory=/opt/ola', { cookie: v.cookie, ws: 'fd-a' })
  assert(plain.status === 200 && ids(plain) && ids(other) === ids(plain), `plain ${plain.status} [${ids(plain)}], directory=/opt/ola ${other.status} [${ids(other)}]`)
  return `${plain.json.data.length} session(s), the same list either way`
})

// ---------------------------------------------------------------- CSRF and other origins
await check('CSRF: a write without our Origin and token is refused', async () => {
  const p = '/api/files?name=csrf.txt'
  const cases = {
    'no token': await api(p, { method: 'POST', cookie: a.cookie, ws: 'fd-a', body: 'x' }),
    'wrong token': await api(p, { method: 'POST', cookie: a.cookie, csrf: 'x'.repeat(43), ws: 'fd-a', body: 'x' }),
    "bob's token": await api(p, { method: 'POST', cookie: a.cookie, csrf: b.csrf, ws: 'fd-a', body: 'x' }),
    'other origin': await api(p, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', origin: 'http://127.0.0.1:4791', body: 'x' }),
    'no origin': await api(p, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', origin: null, body: 'x' }),
    'cross-site fetch': await api('/api/me', { cookie: a.cookie, headers: { 'sec-fetch-site': 'cross-site' } }),
    'same-site fetch': await api('/api/me', { cookie: a.cookie, headers: { 'sec-fetch-site': 'same-site' } }),
  }
  const bad = Object.entries(cases).filter(([, r]) => r.status !== 403).map(([k, r]) => `${k} ${r.status}`)
  assert(!bad.length, bad.join(', '))
  const files = (await api('/api/files', { cookie: a.cookie, ws: 'fd-a' })).json.files
  assert(!files.some((f) => f.path === 'csrf.txt'), 'a refused write landed')
  return `${Object.keys(cases).length} cases`
})
await check("another site's page cannot act as alice (form post and fetch)", async () => {
  const evil = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><form id=f method=post action="${ORIGIN}/api/signout" enctype="text/plain"><input name=x value=y></form>
<script>fetch('${ORIGIN}/api/me',{credentials:'include'}).then(r=>document.title='read:'+r.status).catch(()=>document.title='blocked');setTimeout(()=>f.submit(),300)</script>`)
  })
  await new Promise((r) => evil.listen(4791, '127.0.0.1', r))
  const page = await A.ctx.newPage()
  await page.goto('http://127.0.0.1:4791/')
  await page.waitForTimeout(2500)
  const body = await page.locator('body').innerText().catch(() => '')
  await page.close()
  evil.close()
  const still = await api('/api/me', { cookie: a.cookie })
  assert(still.status === 200, 'the form post signed alice out')
  assert(!body.includes('"csrf"'), 'the other site read /api/me')
  foreign.delete('http://127.0.0.1:4791/')
  return 'alice still signed in; nothing read'
})

// ---------------------------------------------------------------- sessions
await check('a stolen cookie works until revoked, then fails', async () => {
  const thief = { cookie: a.cookie, csrf: a.csrf }
  assert((await api('/api/files', { cookie: thief.cookie, ws: 'fd-a' })).status === 200, 'the cookie did not work before revocation')
  const open = openStream(thief.cookie, 'fd-a')
  await until(() => open.status === 200, 30_000, "the thief's event stream opening")
  admin('revoke-sessions', 'alice')
  await until(() => !open.open, 10_000, "the thief's open event stream closing after revocation")
  const after = await Promise.all([api('/api/me', thief), api('/api/files', { ...thief, ws: 'fd-a' }), api('/api/files?name=t.txt', { ...thief, method: 'POST', ws: 'fd-a', body: 'x' }), api('/oc/api/session', { ...thief, ws: 'fd-a' })])
  assert(after.every((r) => r.status === 401), `after: ${after.map((r) => r.status)}`)
  // The open page notices on its next request and goes back to the sign-in screen.
  await A.page.goto(`${ORIGIN}/?w=fd-a#/`)
  await A.page.evaluate(() => (location.hash = '#/files'))
  await A.page.getByRole('button', { name: 'Sign in with your passkey' }).waitFor({ timeout: 15_000 })
  await signInWithPasskey(A)
  a = await signedIn(A)
  return 'refused on 4 routes and the open stream cut; alice signed in again'
})
await check('a session ends at its expiry and after the idle limit', async () => {
  const db = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'))
  const id = createHash('sha256').update(b.cookie).digest()
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, id)
  const expired = (await api('/api/me', { cookie: b.cookie })).status
  db.prepare('UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE id = ?').run(Date.now() + 3600_000, Date.now() - 25 * 3600_000, id)
  const idle = (await api('/api/me', { cookie: b.cookie })).status
  db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(Date.now(), id)
  const back = (await api('/api/me', { cookie: b.cookie })).status
  db.close()
  assert(expired === 401 && idle === 401 && back === 200, `expired ${expired}, idle ${idle}, control ${back}`)
})

// ---------------------------------------------------------------- headers
await check('strict headers on the page, the API and a download; wrong Host refused', async () => {
  const page = await api('/')
  const csp = page.headers.get('content-security-policy') ?? ''
  const html = page.text
  const problems = []
  if (!/default-src 'none'/.test(csp) || !/script-src 'self'(;|$)/.test(csp) || /unsafe-|https?:|\*/.test(csp) || !/frame-ancestors 'none'/.test(csp)) problems.push(`csp ${csp}`)
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('an inline script in index.html')
  for (const r of [page, await api('/api/me'), await api('/api/project', { cookie: a.cookie, ws: 'fd-a' })]) {
    const h = (k) => r.headers.get(k) ?? ''
    if (!h('strict-transport-security').includes('max-age=')) problems.push('hsts')
    if (h('referrer-policy') !== 'no-referrer') problems.push('referrer')
    if (h('x-content-type-options') !== 'nosniff') problems.push('nosniff')
    if (h('x-frame-options') !== 'DENY') problems.push('xfo')
    if (!h('content-security-policy').includes("frame-ancestors 'none'")) problems.push('api csp')
  }
  const wrongHost = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', headers: { host: 'evil.example' } }, (r) => (r.resume(), resolve(r.statusCode))))
  if (wrongHost !== 421) problems.push(`wrong host ${wrongHost}`)
  assert(!problems.length, problems.join(', '))
  return csp.slice(0, 60) + '…'
})

// ---------------------------------------------------------------- the machine count
await check('"people working" is one number per whole window, all teams, never who or when within it', async () => {
  const W = 4000
  const boundary = () => sleep(W - (Date.now() % W) + 200)
  // Only the requests below count: the other browsers go quiet.
  for (const P of [B, V]) await P.page.goto('about:blank')
  await boundary()
  await Promise.all([a, b, v].map((x) => api('/api/me', { cookie: x.cookie })))
  await boundary()
  const n1 = (await api('/api/me', { cookie: a.cookie })).json.machine.working
  await sleep(1200)
  await api('/api/me', { cookie: b.cookie }) // bob, from another team, mid-window
  const n2 = (await api('/api/me', { cookie: a.cookie })).json.machine.working
  await boundary()
  const m = (await api('/api/project', { cookie: a.cookie, ws: 'fd-a' })).json.machine
  assert(n1 === 3 && n2 === 3 && m.working === 2 && Object.keys(m).sort().join() === 'capacity,working' && m.capacity === 4, `windows: ${n1}, then ${n2} after bob's request, then ${JSON.stringify(m)}`)
  return `${n1} for the window of three people; still ${n2} after bob's request mid-window; ${m.working} at the next window`
})

// ---------------------------------------------------------------- one real request
if (LIVE) {
  await check('a real request runs in the drawer, inside the sealed workspace, through the gateway', async () => {
    const survey = path.join(run, 'survey')
    const truth = JSON.parse(spawnSync('python3', [path.join(AI, 'spike/make-survey.py'), survey], { encoding: 'utf8' }).stdout)
    const up = await api('/api/files?name=survey.csv', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: readFileSync(path.join(survey, 'survey.csv')), headers: { 'content-type': 'application/octet-stream' } })
    assert(up.status === 201, `upload ${up.status}`)
    await A.page.goto(`${ORIGIN}/?w=fd-a#/`)
    await A.page.waitForSelector('.project-title')
    await A.page.fill('#askbar-input', 'Read survey.csv. Write summary.md: a heading "Volunteer survey", then one short paragraph saying how many respondents there are and which cities appear. Then tell me the number of respondents in one sentence.')
    await A.page.press('#askbar-input', 'Enter')
    const last = A.page.locator('.drawer .turn').last()
    const end = Date.now() + 240_000
    while (Date.now() < end) {
      const st = await last.getAttribute('data-status').catch(() => null)
      if (st && ['done', 'failed', 'stopped'].includes(st)) break
      if (await A.page.locator('dialog.approval[open]').count()) await A.page.getByRole('button', { name: 'Yes, this once' }).click()
      await A.page.waitForTimeout(500)
    }
    const st = await last.getAttribute('data-status')
    const answer = (await last.locator('.answer').allInnerTexts()).pop() ?? ''
    assert(st === 'done', `ended ${st}`)
    const files = (await api('/api/files', { cookie: a.cookie, ws: 'fd-a' })).json.files
    const n = truth.respondents ?? truth.rows ?? truth.count
    const rows = auditRows('fd-a')
    assert(rows.some((r) => r.action === 'run_started' && r.actor === 'alice'), 'no run_started in the audit log')
    const reads = rows.filter((r) => r.action === 'file_read_by_run').length
    const gw = gateway.log.split('\n').filter((l) => l.includes('"caller":"ws-fd-a"')).length
    assert(gw > 0, 'the gateway saw no request from ws-fd-a')
    return `answer: ${answer.slice(0, 90).replace(/\s+/g, ' ')}; truth ${n}; summary.md ${files.some((f) => f.path === 'summary.md' && f.origin === 'made') ? 'made' : 'not made'}; ${gw} gateway requests from ws-fd-a; ${reads} read-by-run rows`
  })
}
if (SHOTS) {
  // A fresh load of the home (the drawer closed), with what the run made among the things.
  await A.page.goto(`${ORIGIN}/?w=fd-a`)
  await A.page.waitForSelector('.thing')
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await A.page.setViewportSize({ width: w, height: h })
    await A.page.waitForTimeout(600)
    await A.page.screenshot({ path: path.join(SHOTS, `home-${w}.png`) })
  }
}

// ---------------------------------------------------------------- rate limits (last: they use up the sign-in budget)
await check('sign-in routes are rate-limited', async () => {
  const codes = []
  for (let i = 0; i < 70; i++) codes.push((await api('/api/auth/login/options', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status)
  const limited = codes.filter((c) => c === 429).length
  assert(codes[0] === 200 && limited >= 25, `${limited} of 70 limited`)
  const guess = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: 'A'.repeat(43) }), headers: { 'content-type': 'application/json' } })
  assert(guess.status === 429, `an invitation guess answered ${guess.status}`)
  return `${limited} of 70 refused with 429; invitation guessing too`
})

await check('behind the relay (PROXY protocol): an attacker hammering sign-in from one address cannot keep a real person out', async () => {
  const PP = 4792
  const PORIGIN = `http://localhost:${PP}`
  const fdp = start('frontdesk-proxy', 'frontdesk/server.mjs', { OLA_FD_PORT: String(PP), OLA_FD_ORIGIN: PORIGIN, OLA_FD_PROXY_PROTOCOL: '1', OLA_FD_SIGNIN_BURST: '10', OLA_FD_SIGNIN_PER_MIN: '10', OLA_FD_IDLE_STOP_MIN: '0' })
  const via = (from, method, p, body, cookie) =>
    new Promise((resolve) => {
      const r = http.request(
        {
          method,
          path: p,
          headers: { host: `localhost:${PP}`, origin: PORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
          createConnection: () => {
            const sock = net.connect(PP, '127.0.0.1')
            sock.write(net.isIP(from) === 6 ? `PROXY TCP6 ${from} ::1 40000 ${PP}\r\n` : `PROXY TCP4 ${from} 127.0.0.1 40000 ${PP}\r\n`)
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
  try {
    await until(async () => (await via('198.51.100.4', 'GET', '/api/health')).status === 200, 10_000, 'the front desk behind the relay')
    const bare = await raw(`GET /api/health HTTP/1.1\r\nHost: localhost:${PP}\r\n\r\n`, { port: PP })
    assert(bare.got === '', `a connection without a PROXY line was answered: ${bare.got}`)
    admin('add-person', 'pia', '--name', 'Pia P.')
    const pia = new SoftAuthn({ rpId: 'localhost', origin: PORIGIN })
    const o = await via('198.51.100.4', 'POST', '/api/auth/register/options', { invite: admin('invite', 'pia').split('/').pop() })
    const rg = await via('198.51.100.4', 'POST', '/api/auth/register/verify', { ceremony: o.json?.ceremony, response: pia.create(o.json.options) })
    assert(rg.status === 200, `pia registered: ${rg.status}`)
    // The attacker: 900 requests from one address on every anonymous route, garbage assertions too.
    const codes = {}
    const kinds = [['/api/auth/login/options', {}], ['/api/auth/register/options', { invite: 'A'.repeat(43) }], ['/api/auth/login/verify', { ceremony: 'x'.repeat(43), response: { id: 'made-up' } }]]
    const attack = (async () => {
      for (let i = 0; i < 900; i++) {
        const r = await via('203.0.113.7', 'POST', kinds[i % 3][0], kinds[i % 3][1])
        codes[r.status] = (codes[r.status] ?? 0) + 1
      }
    })()
    await sleep(1500)
    // While it runs, pia signs in from her own address.
    const lo = await via('198.51.100.4', 'POST', '/api/auth/login/options', {})
    const lv = await via('198.51.100.4', 'POST', '/api/auth/login/verify', { ceremony: lo.json?.ceremony, response: pia.get(lo.json.options) })
    const me = await via('198.51.100.4', 'GET', '/api/me', undefined, lv.cookie)
    await attack
    assert(lo.status === 200 && lv.status === 200 && me.json?.person?.handle === 'pia', `pia: options ${lo.status}, verify ${lv.status}, me ${me.status}`)
    assert((codes[429] ?? 0) >= 850, `the attacker was refused only ${codes[429] ?? 0} times`)
    // And after the attack she signs in again.
    const lo2 = await via('198.51.100.4', 'POST', '/api/auth/login/options', {})
    const lv2 = await via('198.51.100.4', 'POST', '/api/auth/login/verify', { ceremony: lo2.json?.ceremony, response: pia.get(lo2.json.options) })
    assert(lv2.status === 200, `pia after the attack: ${lv2.status}`)

    // Second review (2026-11-16). Header timeouts hold behind the PROXY protocol too (they did not:
    // the HTTP server never listened, so Node never started its checks).
    const slow = await new Promise((resolve) => {
      const t0 = Date.now()
      let got = ''
      const sock = net.connect(PP, '127.0.0.1', () => sock.write(`PROXY TCP4 198.51.100.50 127.0.0.1 40000 ${PP}\r\nGET /api/health HTTP/1.1\r\nHost: localhost:${PP}\r\nX-Slow: `))
      const drip = setInterval(() => sock.writable && sock.write('X'), 700)
      const end = () => (clearInterval(drip), clearTimeout(cap), sock.destroy(), resolve({ ms: Date.now() - t0, got: got.slice(9, 12) }))
      const cap = setTimeout(end, 12_000)
      sock.on('data', (d) => (got += d))
      sock.on('close', end)
      sock.on('error', () => {})
    })
    assert(slow.got === '408' && slow.ms < 9000, `slow headers behind the PROXY protocol: ${JSON.stringify(slow)}`)
    // Malformed lines get nothing.
    for (const line of [`PROXY TCP4 198.51.100.52 127.0.0.1 99999 1`, `PROXY TCP4 198.51.100.53 ${'1'.repeat(120)} 1 1`, `PROXY TCP6 198.51.100.54 127.0.0.1 1 1`]) {
      const r = await raw(`${line}\r\nGET /api/health HTTP/1.1\r\nHost: localhost:${PP}\r\n\r\n`, { port: PP })
      assert(r.got === '', `a malformed PROXY line was answered: ${line.slice(0, 40)}`)
    }
    // One IPv6 /64 is one client, however many addresses it uses; the same IPv4 address mapped is the same.
    let ok64 = 0
    for (let i = 1; i <= 50; i++) for (let k = 0; k < 2; k++) if ((await via(`2001:db8:a:b::${i.toString(16)}`, 'POST', '/api/auth/login/options', {})).status === 200) ok64++
    assert(ok64 <= 12, `50 addresses of one /64 got ${ok64} ceremonies`)
    // A distributed attacker (70 different /64s) empties the global ceiling; pia, with a passkey,
    // still signs in, and garbage naming her credential id does not lock her out.
    const dist = {}
    for (let i = 1; i <= 70; i++) for (let k = 0; k < 10; k++) {
      const r = await via(`2001:db8:${i.toString(16)}::1`, 'POST', k % 2 ? '/api/auth/register/options' : '/api/auth/login/verify', k % 2 ? { invite: 'A'.repeat(43) } : { ceremony: 'x'.repeat(43), response: { id: 'made-up' } })
      dist[r.status] = (dist[r.status] ?? 0) + 1
    }
    for (let i = 0; i < 15; i++) await via(`198.51.100.${120 + i}`, 'POST', '/api/auth/login/verify', { ceremony: 'x'.repeat(43), response: { id: pia.id } })
    const lo3 = await via('192.0.2.77', 'POST', '/api/auth/login/options', {})
    const lv3 = await via('192.0.2.77', 'POST', '/api/auth/login/verify', { ceremony: lo3.json?.ceremony, response: pia.get(lo3.json.options) })
    assert((dist[429] ?? 0) > 0 && lo3.status === 200 && lv3.status === 200, `distributed attacker ${JSON.stringify(dist)}; pia: options ${lo3.status}, verify ${lv3.status}`)
    return `attacker: ${JSON.stringify(codes)}; pia signed in during and after; a connection without a PROXY line gets nothing; slow headers 408 after ${slow.ms} ms; malformed lines nothing; one /64: ${ok64} of 100; 70 /64s ${JSON.stringify(dist)} and 15 garbage assertions on her id, pia still signs in`
  } finally {
    fdp.kill('SIGTERM')
  }
})

// ---------------------------------------------------------------- long runs (the fake model)
// A run is activity: the idle stop must not end it. The ceiling ends a run that goes on too long,
// and the page says why. Idle limit 3 s, ceiling 24 s, the fake model's "slow" runs.
const deskGet = (id, p) =>
  new Promise((resolve) => {
    const r = http.request({ socketPath: path.join(env.OLA_HOME, 'ws', id, 'opencode.sock'), path: p, headers: { authorization: `Basic ${Buffer.from(`opencode:${secretsOf(id).OPENCODE_PASSWORD}`).toString('base64')}` }, timeout: 10_000 }, (res) => {
      let t = ''
      res.on('data', (d) => (t += d))
      res.on('end', () => {
        try {
          resolve(JSON.parse(t))
        } catch {
          resolve(null)
        }
      })
    })
    r.on('error', () => resolve(null))
    r.on('timeout', () => (r.destroy(), resolve(null)))
    r.end()
  })
const executing = async (id) => Object.keys((await deskGet(id, '/api/session/active'))?.data ?? {})
const wsState = (id) => JSON.parse(node('workspace/ws.mjs', ['status', id, '--json']).stdout)[0]?.state
async function restartForLongRuns() {
  if (LIVE) {
    gateway.kill('SIGTERM')
    await until(() => gateway.exitCode !== null, 10_000, 'the gateway stopping')
    gateway = start('gateway-fake', 'gateway/server.mjs', { ...gwEnv, ...FAKE_UP })
    await until(() => gateway.log.includes('"event":"start"'), 10_000, 'the gateway start (fake model)')
  }
  fd.kill('SIGTERM')
  await until(() => fd.exitCode !== null, 10_000, 'the front desk stopping')
  fd = start('frontdesk', 'frontdesk/server.mjs', { OLA_FD_IDLE_STOP_MIN: '0.05', OLA_FD_RUN_CEILING_MIN: '0.4', OLA_FD_WAKE_WAIT_MS: '0' })
  await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
}
async function ask(text) {
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=fd-a#/`)
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent === 'Made-up eviction report', null, { timeout: 60_000 })
  await A.page.locator('.ask-new, button:has-text("New conversation")').first().click({ timeout: 2000 }).catch(() => {})
  await A.page.fill('#askbar-input', text)
  await A.page.press('#askbar-input', 'Enter')
  const t0 = Date.now()
  await until(async () => (await executing('fd-a')).length > 0, 20_000, 'the run starting')
  return { t0, sid: (await executing('fd-a'))[0] }
}

await check('a run longer than the idle limit finishes with no request from the browser, and the workspace stops only after it ends', async () => {
  await restartForLongRuns()
  const calls0 = fake.calls()
  const { t0, sid } = await ask('List the folder, slowly. slow 4x1500')
  await A.page.goto('about:blank') // no request from any browser while it runs
  const states = new Set()
  let lastSeen = Date.now()
  // The workspace's state, sampled only between two sightings of the run executing.
  while (Date.now() - t0 < 90_000) {
    if (!(await executing('fd-a')).length) break
    const st = wsState('fd-a')
    if (!(await executing('fd-a')).length) break
    states.add(st)
    lastSeen = Date.now()
    await sleep(500)
  }
  const ran = lastSeen - t0
  const msgs = JSON.stringify(await deskGet('fd-a', `/api/session/${sid}/message`))
  assert(states.size && [...states].every((s) => s === 'running'), `states during the run: ${[...states].join(', ')} (ran ${ran} ms)`)
  assert(ran > 6000, `the run lasted only ${ran} ms (idle limit 3 s)`)
  assert(msgs.includes('Done after 4 slow steps'), `the run did not reach its answer after ${ran} ms, ${fake.calls() - calls0} calls: ${msgs.slice(0, 900)}`)
  const ended = Date.now()
  await until(() => wsState('fd-a') !== 'running', 30_000, 'the idle stop after the run')
  return `ran ${(ran / 1000).toFixed(1)} s past a 3 s idle limit, running throughout, ${fake.calls() - calls0} model calls, answered; stopped ${((Date.now() - ended) / 1000).toFixed(1)} s after it ended`
})

await check('the run ceiling interrupts a run cleanly and the page says why', async () => {
  const { t0, sid } = await ask('List the folder, very slowly. slow 40x2000')
  const last = A.page.locator('.drawer .turn').last()
  await until(async () => (await last.getAttribute('data-status')) === 'stopped', 60_000, 'the run stopping at the ceiling')
  const at = Date.now() - t0
  await A.page.waitForFunction(() => /longest one request may run/.test(document.querySelector('.drawer .turn:last-of-type')?.textContent ?? ''), null, { timeout: 10_000 })
  const text = (await last.innerText()).replace(/\s+/g, ' ')
  assert(at >= 23_000 && at < 50_000, `stopped after ${at} ms (ceiling 24 s)`)
  assert(!(await executing('fd-a')).length, 'the session is still executing')
  const c1 = fake.calls()
  await sleep(3000)
  assert(fake.calls() === c1, 'the model is still being called after the stop')
  const runs = await api('/api/runs', { cookie: a.cookie, ws: 'fd-a' })
  const stops = runs.json?.stopped ?? []
  assert(stops.length === 1 && stops[0].session === sid && stops[0].minutes === 0.4, `/api/runs: ${stops.length} stops (${stops.map((x) => x.session === sid ? 'this run' : 'another').join(', ')})`)
  const m = /Ola stopped this after[^.]*\./.exec(text)?.[0] ?? text.slice(0, 80)
  return `stopped ${(at / 1000).toFixed(1)} s after the request (ceiling 24 s); no model call after; the turn says: "${m}"`
})

await check('an idle workspace stops, its event stream does not wake it, and opening the project does ("Waking your workspace…")', async () => {
  fd.kill('SIGTERM')
  await until(() => fd.exitCode !== null, 10_000, 'the front desk stopping')
  fd = start('frontdesk', 'frontdesk/server.mjs', { OLA_FD_IDLE_STOP_MIN: '0.05', OLA_FD_WAKE_WAIT_MS: '0' })
  await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
  const state = () => JSON.parse(node('workspace/ws.mjs', ['status', 'fd-a', '--json']).stdout)[0]?.state
  assert((await api('/api/files', { cookie: a.cookie, ws: 'fd-a' })).status === 200, 'a request to fd-a')
  const t0 = Date.now()
  await until(() => state() !== 'running', 30_000, 'the idle stop')
  const after = Date.now() - t0
  const ev = await fetch(`${ORIGIN}/oc/api/event`, { headers: { cookie: `__Host-ola=${a.cookie}`, 'x-ola-workspace': 'fd-a' }, signal: AbortSignal.timeout(5000) }).then(async (r) => [r.status, (await r.json()).error], () => ['no answer'])
  await sleep(1500)
  assert(ev[0] === 503 && ev[1] === 'asleep' && state() !== 'running', `event stream: ${ev.join(' ')}, state ${state()}`)
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=fd-a#/`)
  await A.page.getByText('Waking your workspace…').waitFor({ timeout: 10_000 })
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent === 'Made-up eviction report', null, { timeout: 60_000 })
  const back = state()
  assert(back === 'running', `after opening: ${back}`)
  return `stopped ${(after / 1000).toFixed(1)} s after its last request (limit 3 s, swept each second); event stream 503 asleep; the page said "Waking your workspace…", then opened it`
})

await browser.close()
ok('no request left the origin', foreign.size === 0, [...foreign].slice(0, 3).join(' '))
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} of ${results.length} checks passed`)
if (failed) console.log(`front desk log (tail):\n${fd.log.split('\n').slice(-15).join('\n')}`)
cleanup()
process.exit(failed ? 1 : 0)
