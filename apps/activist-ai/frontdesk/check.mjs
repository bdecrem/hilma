#!/usr/bin/env node
// The front desk's proofs, run on the machine that hosts the workspaces (the Mac mini for now):
//
//   node frontdesk/check.mjs [--no-live] [--keep] [--shots <dir>]
//
// It starts its own model gateway (port 4182; Together as the stand-in, key from TOGETHER_API_KEY
// or ~/Documents/code/hilma/.env.local, never printed), makes a fresh platform database, three
// made-up people (alice owns team A, vera is its viewer, bob owns team B) and two small sealed
// workspaces (fd-a, fd-b under ~/.ola-fdcheck), starts the front desk on 127.0.0.1:4790 (origin
// http://localhost:4790), and drives it with Chromium, whose virtual authenticator holds each
// person's passkey. Only made-up data. One line per check; exits 0 only if all pass.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { ALLOWED } from '../web/server/proxy.mjs'

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
}
const node = (script, argv, opts = {}) => spawnSync(process.execPath, [path.join(AI, script), ...argv], { env, encoding: 'utf8', ...opts })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
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
const tokens = readFileSync(path.join(env.OLA_HOME, 'gateway-tokens'), 'utf8').trim().slice('GATEWAY_TOKENS='.length)
const gateway = start('gateway', 'gateway/server.mjs', {
  HOME: homedir(),
  UPSTREAM_BASE_URL: 'https://api.together.xyz/v1',
  UPSTREAM_API_KEY: together(),
  GATEWAY_TOKENS: tokens,
  GATEWAY_MODELS: 'general=zai-org/GLM-5.3-Flash',
  GATEWAY_PORT: String(GW_PORT),
  GATEWAY_DB: path.join(run, 'usage.db'),
})
await until(() => gateway.log.includes('"event":"start"'), 10_000, 'the gateway start')
const fd = start('frontdesk', 'frontdesk/server.mjs')
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
  const link = admin('invite', 'bob', '--hours', '0.0003') // about a second
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

// ---------------------------------------------------------------- authorization
const sampleRoutes = ALLOWED.map(([m, re]) => {
  const p = re.source.replace(/\\\//g, '/').replace(/^\^|\$$/g, '').replace(/\[A-Za-z0-9_-\]\{1,80\}/g, 'ses_x1').replace(/\\/g, '')
  return [m, `/oc${p}`]
})
const deskRoutes = [
  ['GET', '/api/project'], ['GET', '/api/files'], ['GET', '/api/activity'], ['POST', '/api/files?name=planted.txt'],
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
  const big = await api('/api/files?name=big.bin', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: randomBytes(3 * 1024 * 1024), headers: { 'content-type': 'application/octet-stream' } })
  assert(big.status === 413, `3 MiB answered ${big.status}`)
  for (const name of ['../escape.txt', '.hidden', 'a/b.txt', '--replace', 'x'.repeat(240)]) {
    const r = await api(`/api/files?name=${encodeURIComponent(name)}`, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: 'fd-a', body: 'x' })
    assert(r.status === 400, `${name} answered ${r.status}`)
  }
  // The agent plants a link to the VM's environment (which holds its secrets) and asks for it by name.
  spawnSync('/usr/local/bin/container', ['exec', 'ola-fd-a', 'ln', '-sf', '/proc/1/environ', '/work/env.txt'])
  const r = await api('/api/files/env.txt?w=fd-a', { cookie: a.cookie })
  assert(r.status === 404 && !r.text.includes('OPENCODE_PASSWORD'), `the link answered ${r.status}`)
  spawnSync('/usr/local/bin/container', ['exec', 'ola-fd-a', 'rm', '-f', '/work/env.txt'])
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
  admin('revoke-sessions', 'alice')
  const after = await Promise.all([api('/api/me', thief), api('/api/files', { ...thief, ws: 'fd-a' }), api('/api/files?name=t.txt', { ...thief, method: 'POST', ws: 'fd-a', body: 'x' }), api('/oc/api/session', { ...thief, ws: 'fd-a' })])
  assert(after.every((r) => r.status === 401), `after: ${after.map((r) => r.status)}`)
  // The open page notices on its next request and goes back to the sign-in screen.
  await A.page.goto(`${ORIGIN}/?w=fd-a#/`)
  await A.page.evaluate(() => (location.hash = '#/files'))
  await A.page.getByRole('button', { name: 'Sign in with your passkey' }).waitFor({ timeout: 15_000 })
  await signInWithPasskey(A)
  a = await signedIn(A)
  return 'refused on 4 routes; alice signed in again'
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
await check('"people working" is the real count of people active, never who', async () => {
  const r = await api('/api/project', { cookie: a.cookie, ws: 'fd-a' })
  const m = r.json.machine
  assert(Object.keys(m).sort().join() === 'capacity,working' && m.working === 3 && m.capacity === 4, JSON.stringify(m))
  const lights = await A.page.locator('.machine-lights .light.on').count()
  assert(lights >= 3, `${lights} lights on`)
  return `${m.working} of ${m.capacity}`
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

await browser.close()
ok('no request left the origin', foreign.size === 0, [...foreign].slice(0, 3).join(' '))
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} of ${results.length} checks passed`)
if (failed) console.log(`front desk log (tail):\n${fd.log.split('\n').slice(-15).join('\n')}`)
cleanup()
process.exit(failed ? 1 : 0)
