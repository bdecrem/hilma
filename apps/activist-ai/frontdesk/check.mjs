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
//
// OLA_CHECK_TAG=<word> (a scratch copy run beside a deploy's suites): workspaces <word>-fd-a and
// <word>-fd-b under ~/.ola-fdcheck-<word>, and the front desk and gateway ports from
// OLA_CHECK_FD_PORT (4790; it also uses the next two) and OLA_CHECK_GW_PORT (4182).
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startFakeModel } from '../web/server/fake-model.mjs'
import { startFakeAnthropic } from '../web/server/fake-anthropic.mjs'
import { ALLOWED } from '../web/server/proxy.mjs'
import { SoftAuthn } from './review/softauthn.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.join(HERE, '..')
const args = process.argv.slice(2)
const LIVE = !args.includes('--no-live')
const KEEP = args.includes('--keep')
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
const TAG = process.env.OLA_CHECK_TAG ?? ''
if (TAG && !/^[a-z][a-z0-9]{0,7}$/.test(TAG)) throw new Error('OLA_CHECK_TAG is 1 to 8 lowercase letters or digits')
const FA = `${TAG ? `${TAG}-` : ''}fd-a`
const FB = `${TAG ? `${TAG}-` : ''}fd-b`
const FC = `${TAG ? `${TAG}-` : ''}fd-c` // team-a's second workspace, made for the rotation checks at the end
const PORT = Number(process.env.OLA_CHECK_FD_PORT || 4790)
const ORIGIN = `http://localhost:${PORT}`
const GW_PORT = Number(process.env.OLA_CHECK_GW_PORT || 4182)
// The session cookie's name for this origin (auth.mjs sessionCookie: ola-local on http://localhost).
const CK = (await import('./auth.mjs')).sessionCookie(ORIGIN).name
const CK_RE = new RegExp(`${CK}=([^;]+)`)
const run = mkdtempSync(path.join(tmpdir(), 'ola-fdcheck-'))
const env = {
  ...process.env,
  OLA_HOME: path.join(homedir(), `.ola-fdcheck${TAG ? `-${TAG}` : ''}`),
  OLA_GATEWAY_PORT: String(GW_PORT),
  OLA_MAX_RUNNING: '2',
  OLA_RUNNING_SCOPE: 'home', // the 2 counts this check's workspaces only (a person's may run meanwhile)
  OLA_FD_DATA: path.join(run, 'frontdesk'),
  OLA_FD_ORIGIN: ORIGIN,
  OLA_FD_PORT: String(PORT),
  OLA_FD_SIGNIN_BURST: '40',
  OLA_FD_SIGNIN_PER_MIN: '40',
  OLA_FD_MAX_UPLOAD_MB: '2',
  OLA_FD_WORKING_WINDOW_S: '4', // "people working" changes once per window; 4 s so the check can watch it
  OLA_FD_SLOW_MS: '4000', // a download must move 32 KiB per window; 4 s here (30 s by default) so the check can watch it
  OLA_FD_GATEWAY_USAGE_TOKEN: randomBytes(24).toString('hex'), // Fallback to Claude: the front desk asks the gateway with it
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
    // A "fetch failed" says nothing alone: its cause (ECONNREFUSED, a reset, a timeout) says who failed.
    const cause = e?.cause ? ` [cause: ${e.cause.code ?? e.cause.name ?? ''} ${String(e.cause.message ?? '').slice(0, 120)}]` : ''
    ok(name, false, String(e?.message ?? e).split('\n')[0].slice(0, 300) + cause)
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
  if (!KEEP) for (const id of [FA, FB, FC]) node('workspace/ws.mjs', ['destroy', id, '--confirm', id])
  rmSync(run, { recursive: true, force: true })
}

console.log('setting up: two workspaces, three people, the gateway, the front desk')
for (const id of [FA, FB, FC]) node('workspace/ws.mjs', ['destroy', id, '--confirm', id]) // leftovers from an earlier run
const IMAGE = (await import('../workspace/ws.mjs')).IMAGE
if (spawnSync('/usr/local/bin/container', ['image', 'inspect', IMAGE]).status !== 0) node('workspace/ws.mjs', ['image'], { stdio: 'inherit' })
admin('add-person', 'alice', '--name', 'Alice A.')
admin('add-person', 'bob', '--name', 'Bob B.')
admin('add-person', 'vera', '--name', 'Vera V.')
admin('create-workspace', FA, '--name', 'Made-up eviction report', '--team', 'team-a', '--team-name', 'Made-up Tenants’ Union', '--owner', 'alice', '--memory', '1g', '--disk', '1g', '--cpus', '1')
admin('create-workspace', FB, '--name', 'Made-up wage survey', '--team', 'team-b', '--team-name', 'Made-up Workers’ Center', '--owner', 'bob', '--memory', '1g', '--disk', '1g', '--cpus', '1')
admin('add-member', 'team-a', 'vera', 'viewer')
const fake = await startFakeModel()
fake.server.unref()
const fakeClaude = await startFakeAnthropic()
fakeClaude.server.unref()
const FAKE_UP = { UPSTREAM_BASE_URL: `http://127.0.0.1:${fake.port}/v1`, UPSTREAM_API_KEY: 'fake-model-key-not-a-secret', GATEWAY_MODELS: 'general=fake' }
// Fallback to a hosted open model: a second scripted model (web/server/fake-model.mjs, hosted), or
// with OLA_CHECK_HOSTED_LIVE=<model id> that model on Together (the one live hosted run; cents).
const HOSTED_LIVE = process.env.OLA_CHECK_HOSTED_LIVE || null
const fakeHosted = await startFakeModel({ hosted: true })
fakeHosted.server.unref()
const HOSTED_UP = HOSTED_LIVE
  ? { HOSTED_BASE_URL: 'https://api.together.xyz/v1', HOSTED_API_KEY: together(), HOSTED_MODEL: HOSTED_LIVE, HOSTED_PROVIDER: 'Together AI', GATEWAY_HOSTED_PRICES: process.env.OLA_CHECK_HOSTED_PRICES || 'in=1.4,out=4.4' }
  : { HOSTED_BASE_URL: `http://127.0.0.1:${fakeHosted.port}/v1`, HOSTED_API_KEY: 'fake-hosted-key-not-a-secret', HOSTED_MODEL: 'fake-hosted', HOSTED_PROVIDER: 'Made-up Cloud' }
const gwEnv = {
  HOME: homedir(),
  ...(LIVE ? { UPSTREAM_BASE_URL: 'https://api.together.xyz/v1', UPSTREAM_API_KEY: together(), GATEWAY_MODELS: 'general=zai-org/GLM-5.3-Flash' } : FAKE_UP),
  // The tokens file ws.mjs keeps (reloaded when it changes) and the workspaces' door sockets.
  GATEWAY_TOKENS_FILE: path.join(env.OLA_HOME, 'gateway-tokens'),
  GATEWAY_DOOR_DIR: path.join(env.OLA_HOME, 'gw'),
  GATEWAY_PORT: String(GW_PORT),
  GATEWAY_DB: path.join(run, 'usage.db'),
  // Fallback to Claude against a scripted Anthropic (web/server/fake-anthropic.mjs): the grants
  // file the front desk writes, a made-up API key, and the usage token the front desk asks with.
  GATEWAY_CLAUDE_FILE: path.join(env.OLA_HOME, 'gateway-claude'),
  GATEWAY_CLAUDE_UPSTREAM: fakeClaude.url,
  CLAUDE_API_KEY: 'sk-made-up-key-for-the-stand-in-0000',
  GATEWAY_USAGE_TOKEN: env.OLA_FD_GATEWAY_USAGE_TOKEN,
  // Web search and downloads: the front desk's grants file (OLA_FD_WEB_FILE defaults to this) and
  // the made-up search provider.
  GATEWAY_WEB_FILE: path.join(env.OLA_HOME, 'gateway-web'),
  GATEWAY_SEARCH_PROVIDER: 'mock',
  // the hosted open model, and the grants file the front desk writes for it
  ...HOSTED_UP,
  GATEWAY_HOSTED_FILE: path.join(env.OLA_HOME, 'gateway-hosted'),
}
let gateway = start('gateway', 'gateway/server.mjs', gwEnv)
await until(() => gateway.log.includes('"event":"start"'), 10_000, 'the gateway start')
let fd = start('frontdesk', 'frontdesk/server.mjs')
await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
// The invitations, printed once by the admin CLI.
const invites = { alice: admin('invite', 'alice'), bob: admin('invite', 'bob'), vera: admin('invite', 'vera') }

// The machine is shared (a person's workspace, another suite's): wait for the check's two VMs to fit.
const wsLib = await import('../workspace/ws.mjs')
const room = () => wsLib.waitForRoom([FA, FB, FC], 2).then(() => null, (e) => e.message)
{
  const full = await room()
  if (full) {
    ok('the machine has room for this suite', false, full)
    cleanup()
    process.exit(1)
  }
}

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
const cookieOf = async (ctx) => (await ctx.cookies(ORIGIN)).find((c) => c.name === CK)
/** A request from outside the browser (node), as a thief with the cookie would send it. */
let staleSockets = 0
async function api(pathname, { method = 'GET', cookie, csrf, ws, origin = method === 'GET' ? undefined : ORIGIN, body, headers = {} } = {}) {
  const h = { ...headers }
  if (cookie) h.cookie = `${CK}=${cookie}`
  if (csrf) h['x-ola-csrf'] = csrf
  if (ws) h['x-ola-workspace'] = ws
  if (origin) h.origin = origin
  // This check blocks its own event loop with spawnSync (a VM start, a member's removal and its
  // rotation: tens of seconds on a busy machine). Meanwhile the front desk closes the idle keep-alive
  // sockets (keepAliveTimeout 5 s), and undici, not having run, sends the next request on one of them:
  // "fetch failed", other side closed (UND_ERR_SOCKET) or a reset. That is this client's race, not the
  // front desk's, so a GET is sent once more on a fresh socket, and counted (printed at the end).
  let r
  try {
    r = await fetch(`${ORIGIN}${pathname}`, { method, headers: h, body, redirect: 'manual' })
  } catch (e) {
    if (!['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE'].includes(e?.cause?.code) || fd?.exitCode !== null) throw e
    staleSockets++
    r = await fetch(`${ORIGIN}${pathname}`, { method, headers: { ...h, connection: 'close' }, body, redirect: 'manual' })
  }
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
  fetch(`${ORIGIN}/oc/api/event`, { headers: { cookie: `${CK}=${cookie}`, 'x-ola-workspace': ws, accept: 'text/event-stream' }, signal: ctl.signal })
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
  assert(a.me.status === 200 && a.me.json.workspaces.length === 1 && a.me.json.workspaces[0].slug === FA, JSON.stringify(a.me.json))
  assert(new URL(A.page.url()).search === `?w=${FA}`, A.page.url())
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent !== 'Your project')
  return `project "${await A.page.locator('.project-title').innerText()}"`
})
await check('bob and vera register from their own invitations', async () => {
  await register(B, invites.bob)
  await register(V, invites.vera)
  b = await signedIn(B)
  v = await signedIn(V)
  assert(b.me.json.workspaces.map((w) => w.slug).join() === FB, 'bob sees ' + JSON.stringify(b.me.json.workspaces))
  assert(v.me.json.workspaces.map((w) => `${w.slug}:${w.role}`).join() === `${FA}:viewer`, 'vera sees ' + JSON.stringify(v.me.json.workspaces))
})
await check('an invitation works once', async () => {
  const token = invites.alice.split('/').pop()
  const r = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: token }), headers: { 'content-type': 'application/json' } })
  assert(r.status === 404, `second use answered ${r.status}`)
  const rows = JSON.parse(admin('audit', '--limit', '500', '--json')).filter((x) => x.action === 'passkey_registered')
  assert(rows.length === 3, `${rows.length} passkeys registered`)
})
// Safari did not keep the Secure session cookie over http://localhost, so Bart's first sign-in
// went in circles (2026-11-16). WebKit (Playwright's build, not Safari itself) makes a passkey from
// an invitation and makes an authenticated request. WebKit has no virtual authenticator, so the
// page's navigator.credentials is answered by the software passkey through an exposed function;
// everything else, the cookie above all, is WebKit's own.
await check('in WebKit, an invitation makes a passkey, the sign-in sticks, and an authenticated request works', async () => {
  const { webkit } = await import('playwright')
  const wk = await webkit.launch()
  try {
    admin('add-person', 'wanda', '--name', 'Wanda W.')
    const link = admin('invite', 'wanda')
    const device = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
    const ctx = await wk.newContext()
    const page = await ctx.newPage()
    await page.exposeFunction('__softCreate', (o) => device.create(o))
    await page.addInitScript(() => {
      const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const bin = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer
      navigator.credentials.create = async ({ publicKey: o }) => {
        const r = await window.__softCreate({ ...o, challenge: b64(o.challenge), user: { ...o.user, id: b64(o.user.id) }, excludeCredentials: [] })
        return { id: r.id, rawId: bin(r.rawId), type: r.type, authenticatorAttachment: 'platform', getClientExtensionResults: () => ({}), response: { clientDataJSON: bin(r.response.clientDataJSON), attestationObject: bin(r.response.attestationObject), getTransports: () => ['internal'] } }
      }
    })
    await page.goto(link)
    const btn = page.getByRole('button', { name: 'Make my passkey' })
    await until(() => btn.isEnabled(), 10_000, 'the passkey button')
    await btn.click()
    await until(async () => (await page.evaluate(() => fetch('/api/me').then((r) => r.status))) === 200, 15_000, 'an authenticated request from WebKit')
    const me = await page.evaluate(() => fetch('/api/me').then((r) => r.json()))
    const c = (await ctx.cookies(ORIGIN)).find((x) => x.name === CK)
    const kept = await page.locator('.gate-problem').count()
    await ctx.close()
    assert(me.person?.handle === 'wanda' && c && c.httpOnly && c.sameSite === 'Strict' && !kept, `me ${me.person?.handle}, cookie ${c ? c.name : 'none'}, problem shown ${kept}`)
    return `signed in as ${me.person.handle}; WebKit kept ${c.name} (HttpOnly, SameSite=${c.sameSite}, Secure ${c.secure})`
  } finally {
    await wk.close()
  }
})
await check('an expired invitation is refused', async () => {
  admin('add-person', 'evan', '--name', 'Evan E.')
  const link = admin('invite', 'evan', '--hours', '0.0003') // about a second
  await new Promise((r) => setTimeout(r, 1600))
  const r = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: link.split('/').pop() }), headers: { 'content-type': 'application/json' } })
  assert(r.status === 404, `answered ${r.status}`)
})
// On https the cookie is __Host-ola with Secure (test/unit.test.mjs); on this http://localhost
// origin it is ola-local without Secure, because Safari drops a Secure cookie set over http.
await check('the session cookie is HttpOnly, SameSite=Strict, Path=/ (ola-local on http://localhost, so Safari keeps it)', async () => {
  const c = await cookieOf(A.ctx)
  assert(c && c.name === 'ola-local' && c.httpOnly && !c.secure && c.sameSite === 'Strict' && c.path === '/' && !c.domain?.startsWith('.'), JSON.stringify({ ...c, value: '…' }))
  assert(!(await A.page.evaluate(() => document.cookie)).includes(CK), 'the page script can read the cookie')
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
  const devCookie = CK_RE.exec(reg.headers.get('set-cookie') ?? '')?.[1]
  assert(!(await api('/api/me', { cookie: devCookie })).json.notices?.length, 'the new device is told about itself instead of the person')
  // Alice's own browser hears of it on its next load, once. (about:blank first: a goto to the
  // address the page is already on is only a hash change, not a load.)
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
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
  ['GET', `/api/files/survey.csv?w=${FA}`], ['DELETE', '/api/files/survey.csv'], ...sampleRoutes,
]
await check(`bob cannot reach alice's workspace: ${deskRoutes.length} routes by API, all 404`, async () => {
  const bad = []
  for (const [m, p] of deskRoutes) {
    const r = await api(p, { method: m, cookie: b.cookie, csrf: b.csrf, ws: FA, body: m === 'GET' ? undefined : '{}' })
    if (r.status !== 404) bad.push(`${m} ${p} ${r.status}`)
  }
  // The same with no workspace named, and with a name that does not exist.
  for (const ws of [undefined, 'fd-zz', `../${FA}`, 'FD-A']) {
    const r = await api('/api/files', { cookie: b.cookie, ws })
    if (r.status !== 404) bad.push(`ws=${ws} ${r.status}`)
  }
  assert(!bad.length, bad.join(', '))
})
await check("bob cannot reach alice's workspace by direct URL in his browser", async () => {
  await B.page.goto(`${ORIGIN}/?w=${FA}#/files`)
  await B.page.waitForSelector('.gate-problem')
  const text = await B.page.locator('main').innerText()
  assert(text.includes('not one of yours') && !text.includes('Made-up eviction report'), text.slice(0, 200))
  const dl = await B.page.evaluate((w) => fetch(`/api/files/survey.csv?w=${w}`).then((r) => r.status), FA)
  assert(dl === 404, `download ${dl}`)
})
await check('the opencode door refuses routes the page does not use, for an owner too', async () => {
  const bad = []
  for (const [m, p] of [['GET', '/oc/api/config'], ['POST', '/oc/api/session/x/shell'], ['GET', '/oc/api/credential'], ['POST', '/oc/api/pty'], ['GET', '/oc/api/provider'], ['GET', '/oc/api/file?path=/etc/passwd']]) {
    const r = await api(p, { method: m, cookie: a.cookie, csrf: a.csrf, ws: FA, body: m === 'GET' ? undefined : '{}' })
    if (r.status !== 403) bad.push(`${m} ${p} ${r.status}`)
  }
  assert(!bad.length, bad.join(', '))
})

// ---------------------------------------------------------------- files
const made = { name: 'made-up notes.csv', bytes: Buffer.from(`id,city,hours\n${Array.from({ length: 40 }, (_, i) => `N${i},Springfield,${i % 9}`).join('\n')}\n`) }
const tmpFile = path.join(run, made.name)
writeFileSync(tmpFile, made.bytes)
await check('alice uploads, lists, downloads (same bytes) and deletes through the page', async () => {
  await A.page.goto(`${ORIGIN}/?w=${FA}#/files`)
  await A.page.waitForSelector('#files-title')
  await A.page.setInputFiles('#file-picker', tmpFile)
  await A.page.locator('table.files', { hasText: made.name }).first().waitFor({ timeout: 30_000 })
  const list = await api('/api/files', { cookie: a.cookie, ws: FA })
  const entry = list.json.files.find((f) => f.path === made.name)
  assert(entry?.origin === 'uploaded' && entry.size === made.bytes.length, JSON.stringify(entry))
  const back = await A.page.evaluate(async ([n, w]) => {
    const r = await fetch(`/api/files/${encodeURIComponent(n)}?w=${w}`)
    return [r.status, r.headers.get('content-disposition'), Array.from(new Uint8Array(await r.arrayBuffer()))]
  }, [made.name, FA])
  assert(back[0] === 200 && back[1].startsWith('attachment') && sha(Buffer.from(back[2])) === sha(made.bytes), `download ${back[0]} ${back[1]}`)
  const row = A.page.locator('tr', { hasText: made.name })
  await row.getByRole('button', { name: /Delete/ }).click()
  const lede = await A.page.locator('dialog.confirm .sheet-lede').innerText()
  assert(lede.includes('14 days'), `the confirmation says: ${lede}`)
  await A.page.locator('dialog.confirm').getByRole('button', { name: /^Delete/ }).click()
  await until(async () => !(await api('/api/files', { cookie: a.cookie, ws: FA })).json.files.some((f) => f.path === made.name), 15_000, 'the delete')
  return `confirmation: "${lede.slice(0, 70)}…"`
})
await check('upload, download and delete are in the audit log, with no file name in the database', async () => {
  const rows = auditRows(FA)
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
  const headers = { host: `localhost:${PORT}`, origin: ORIGIN, cookie: `${CK}=${a.cookie}`, 'x-ola-csrf': a.csrf, 'x-ola-workspace': FA, 'content-type': 'application/octet-stream' }
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
  await A.page.goto(`${ORIGIN}/?w=${FA}#/files`)
  await A.page.waitForSelector('#files-title')
  await A.page.setInputFiles('#file-picker', bigFile)
  const shown = await A.page.locator('.problem[role=alert] p').first().innerText({ timeout: 15_000 })
  assert(shown === `too big.bin was not sent. ${want}`, `the page says: ${shown}`)
  for (const name of ['../escape.txt', '.hidden', 'a/b.txt', '--replace', 'x'.repeat(240)]) {
    const r = await api(`/api/files?name=${encodeURIComponent(name)}`, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: 'x' })
    assert(r.status === 400, `${name} answered ${r.status}`)
  }
  // The agent plants a link to the VM's environment (which holds its secrets) and asks for it by name.
  spawnSync('/usr/local/bin/container', ['exec', `ola-${FA}`, 'ln', '-sf', '/proc/1/environ', '/work/env.txt'])
  const r = await api(`/api/files/env.txt?w=${FA}`, { cookie: a.cookie })
  assert(r.status === 404 && !r.text.includes('OPENCODE_PASSWORD'), `the link answered ${r.status}`)
  spawnSync('/usr/local/bin/container', ['exec', `ola-${FA}`, 'rm', '-f', '/work/env.txt'])
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
  spawnSync(CTR, ['exec', `ola-${FA}`, 'python3', '-I', '-c', 'for i in range(200):\n    open(f"/work/note-{i:03}.md", "w").write(f"# Made-up note {i}\\n\\nLine {i}.\\n")'])
  try {
    let t0 = Date.now()
    const first = await api('/api/project', { cookie: a.cookie, ws: FA })
    const ms1 = Date.now() - t0
    t0 = Date.now()
    const again = await api('/api/project', { cookie: a.cookie, ws: FA })
    const ms2 = Date.now() - t0
    const notes = (first.json?.things ?? []).filter((t) => String(t.id).startsWith('file:note-'))
    assert(first.status === 200 && notes.length === 12 && notes.every((t) => /^Made-up note \d+$/.test(t.title)), `${first.status}, ${notes.length} things`)
    assert(ms1 < 6000 && again.json.things.length === first.json.things.length, `${ms1} ms`)
    return `200 files: ${notes.length} things in ${ms1} ms, ${ms2} ms again (cached)`
  } finally {
    spawnSync(CTR, ['exec', `ola-${FA}`, 'python3', '-I', '-c', 'import glob, os\nfor f in glob.glob("/work/note-*.md"):\n    os.remove(f)'])
  }
})
await check("one person's concurrent uploads are capped at 3; the rest are refused at once, and uploads work again after", async () => {
  const one = (i) =>
    new Promise((resolve) => {
      let done = false
      const end = (v) => !done && ((done = true), resolve(v))
      const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: `/api/files?name=slow-${i}.bin`, headers: { host: `localhost:${PORT}`, origin: ORIGIN, cookie: `${CK}=${a.cookie}`, 'x-ola-csrf': a.csrf, 'x-ola-workspace': FA, 'content-length': String(1024 * 1024) } }, (res) => (res.resume(), end(res.statusCode)))
      r.on('error', () => end('closed'))
      r.write(Buffer.alloc(1000))
      setTimeout(() => (end('held'), r.destroy()), 5000)
    })
  const codes = await Promise.all(Array.from({ length: 8 }, (_, i) => one(i)))
  const held = codes.filter((c) => c === 'held').length
  const refused = codes.filter((c) => c === 429).length
  assert(held === 3 && refused === 5, codes.join(' '))
  await until(async () => (await api('/api/files?name=after-cap.txt', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: 'x' })).status === 201, 15_000, 'an upload after the slow ones ended')
  await api('/api/files/after-cap.txt', { method: 'DELETE', cookie: a.cookie, csrf: a.csrf, ws: FA })
  return `8 at once: ${held} held, ${refused} refused with 429`
})
await check('a download of a FIFO the agent made fails at once and leaves no process behind', async () => {
  spawnSync(CTR, ['exec', `ola-${FA}`, 'mkfifo', '/work/pipe.csv'])
  try {
    const t0 = Date.now()
    const r = await api(`/api/files/pipe.csv?w=${FA}`, { cookie: a.cookie })
    const ms = Date.now() - t0
    await sleep(500)
    const host = spawnSync('pgrep', ['-f', 'ola-get pipe.csv'], { encoding: 'utf8' }).stdout.trim()
    const vm = spawnSync(CTR, ['exec', `ola-${FA}`, 'python3', '-I', '-c', 'import os\nn = b"ola" + b"-get"\nprint(sum(1 for p in os.listdir("/proc") if p.isdigit() and n in open(f"/proc/{p}/cmdline", "rb").read()))'], { encoding: 'utf8' }).stdout.trim()
    assert(r.status === 404 && ms < 3000 && host === '' && vm === '0', `${r.status} after ${ms} ms; host processes [${host}], in the VM ${vm}`)
    return `404 after ${ms} ms; no ola-get on the host or in the VM`
  } finally {
    spawnSync(CTR, ['exec', `ola-${FA}`, 'rm', '-f', '/work/pipe.csv'])
  }
})

await check("one person's unread downloads are cut, and cannot hold every other customer's transfers", async () => {
  // Second review (2026-11-16): a viewer's 4 unread downloads of a 128 MiB file held all 512 MiB in
  // flight and 4 execs for good; every other customer's uploads answered 429.
  spawnSync(CTR, ['exec', '--user', '1000', `ola-${FA}`, 'sh', '-c', 'head -c 134217728 /dev/zero > /work/big.bin'])
  const held = []
  try {
    const codes = []
    for (let i = 0; i < 4; i++) {
      const sock = net.connect(PORT, '127.0.0.1')
      sock.write(`GET /api/files/big.bin?w=${FA} HTTP/1.1\r\nHost: localhost:${PORT}\r\nCookie: ${CK}=${a.cookie}\r\n\r\n`)
      const first = await new Promise((resolve) => (sock.once('data', (d) => resolve(String(d).slice(9, 12))), setTimeout(() => resolve('none'), 5000)))
      sock.pause()
      codes.push(first)
      held.push(sock)
    }
    const bobUp = await api('/api/files?name=bob-while.txt', { method: 'POST', cookie: b.cookie, csrf: b.csrf, ws: FB, body: 'x' })
    const ogets = () => spawnSync('pgrep', ['-f', 'ola-get big.bin'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length
    const during = ogets()
    await until(async () => ogets() === 0, 20_000, 'the unread downloads cut')
    await api('/api/files/bob-while.txt', { method: 'DELETE', cookie: b.cookie, csrf: b.csrf, ws: FB })
    assert(codes[0] === '200' && codes.slice(1).every((c) => c === '503') && bobUp.status === 201 && during === 1, `alice's downloads ${codes.join(' ')}, bob's upload ${bobUp.status}, ola-get ${during}`)
    return `alice: ${codes.join(' ')} (one at a time beyond her share); bob's upload ${bobUp.status} meanwhile; the unread one cut, no ola-get left`
  } finally {
    for (const s of held) s.destroy()
    spawnSync(CTR, ['exec', `ola-${FA}`, 'rm', '-f', '/work/big.bin'])
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
  const wsId = db.prepare(`SELECT id FROM workspaces WHERE slug = '${FA}'`).get().id
  const ins = db.prepare("INSERT INTO audit (at, actor_kind, action, workspace_id, name_ref) VALUES (?, 'run', 'file_read_by_run', ?, ?)")
  for (let i = 0; i < 500; i++) ins.run(Date.now(), wsId, randomBytes(32))
  const act = await api('/api/activity', { cookie: a.cookie, ws: FA })
  db.prepare("DELETE FROM audit WHERE workspace_id = ? AND actor_kind = 'run' AND actor_person_id IS NULL").run(wsId)
  db.close()
  const people = (act.json?.activity ?? []).filter((x) => !x.viaRun).map((x) => x.action)
  assert(people.includes('file_uploaded') && people.includes('file_deleted'), `the view kept: ${[...new Set(people)].join()}`)
  return `${j.auditRowsWritten} of ${j.forgedEvents} forged reads written (stall ${j.worstEventLoopStallMs} ms); people's rows kept beside 500 run rows`
})

// ---------------------------------------------------------------- "Open" on a page Ola built
// The agent writes a hostile page (made-up, through the VM itself, as a model would): it tries to
// read the cookie, call the API as the person, and reach another origin by fetch, beacon, image,
// popup, top navigation and navigating itself. "Another origin" is a little server of ours on
// 127.0.0.1 that counts what reaches it; it must count nothing.
const grantOf = async (who, rel = 'hostile.html') => {
  const r = await api(`/api/open?w=${FA}&path=${encodeURIComponent(rel)}`, { cookie: who.cookie })
  return { status: r.status, grant: /\/v\/([A-Za-z0-9_-]{43})\//.exec(r.text)?.[1] ?? null, headers: r.headers, text: r.text }
}
const viewGet = (grant, rel, dest = 'iframe', extra = {}) => api(`/v/${grant}/${rel}`, { headers: { ...(dest ? { 'sec-fetch-dest': dest } : {}), 'sec-fetch-site': 'cross-site', ...extra } })
await check('"Open" shows a page Ola built with its own files, and the page cannot read the cookie, call the API or reach another origin', async () => {
  const hits = []
  const outside = http.createServer((req, res) => (hits.push(req.url), res.writeHead(200, { 'access-control-allow-origin': '*' }).end('ok')))
  await new Promise((r) => outside.listen(0, '127.0.0.1', r))
  const OUT = `http://127.0.0.1:${outside.address().port}`
  try {
    const runJs = `
const OUT = ${JSON.stringify(OUT)}
const r = {}
try { r.cookie = 'read:' + document.cookie } catch (e) { r.cookie = 'blocked:' + e.name }
try { r.storage = 'read:' + localStorage.length } catch (e) { r.storage = 'blocked:' + e.name }
const tries = {
  api: () => fetch('/api/me', { credentials: 'include' }),
  apiFiles: () => fetch(${JSON.stringify(ORIGIN)} + '/api/files', { credentials: 'include', headers: { 'x-ola-workspace': ${JSON.stringify(FA)} } }),
  oc: () => fetch('/oc/api/session', { credentials: 'include' }),
  outside: () => fetch(OUT + '/fetch'),
  data: () => fetch('data.json').then((x) => x.json()).then((j) => ({ status: 'data ' + j.n })),
}
;(async () => {
  for (const [k, f] of Object.entries(tries)) {
    try { const x = await f(); r[k] = 'status ' + x.status } catch (e) { r[k] = 'blocked:' + e.name }
  }
  try { r.beacon = navigator.sendBeacon(OUT + '/beacon', 'x') ? 'sent' : 'refused' } catch (e) { r.beacon = 'blocked:' + e.name }
  const img = new Image(); img.src = OUT + '/img'
  try { r.popup = window.open(OUT + '/popup') ? 'opened' : 'refused' } catch (e) { r.popup = 'blocked:' + e.name }
  try { top.location.href = OUT + '/top'; r.top = 'tried' } catch (e) { r.top = 'blocked:' + e.name }
  r.css = getComputedStyle(document.getElementById('h')).color
  await new Promise((ok) => setTimeout(ok, 300))
  r.img = document.getElementById('pic').naturalWidth
  document.getElementById('out').textContent = JSON.stringify(r)
  document.body.dataset.done = '1'
  setTimeout(() => { location.href = OUT + '/self' }, 1500)
})()
`
    const files = {
      'hostile.html': '<!doctype html><html><head><title>Made-up hostile page</title><link rel="stylesheet" href="look.css"></head><body><h1 id="h">Hello, world</h1><img id="pic" src="dot.svg" alt=""><pre id="out">running</pre><script src="run.js"></script></body></html>',
      'look.css': 'h1 { color: rgb(1, 2, 3) }',
      'dot.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="7" height="7"><rect width="7" height="7"/></svg>',
      'data.json': '{"n": 42}',
      'run.js': runJs,
    }
    const py = 'import json, sys\nfor k, v in json.loads(sys.stdin.read()).items():\n    open("/work/" + k, "w").write(v)\n'
    const w = spawnSync(CTR, ['exec', '-i', `ola-${FA}`, 'python3', '-I', '-c', py], { input: JSON.stringify(files), encoding: 'utf8' })
    assert(w.status === 0, 'could not write the page inside the workspace')
    // The home lists it as a page with Open.
    await A.page.goto('about:blank')
    await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
    const card = A.page.locator('.thing-slot[data-kind="site"]', { hasText: 'Made-up hostile page' })
    await card.waitFor({ timeout: 30_000 })
    const [tab] = await Promise.all([A.ctx.waitForEvent('page'), card.getByRole('link', { name: /^Open/ }).click()])
    await tab.waitForLoadState()
    let frame
    await until(() => (frame = tab.frames().find((f) => f.url().includes('/v/'))), 15_000, 'the page frame')
    await frame.waitForSelector('body[data-done]', { timeout: 20_000 })
    const r = JSON.parse(await frame.locator('#out').innerText())
    const heading = await frame.locator('h1').innerText()
    if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'open-hostile.png') })
    await sleep(2500) // the self-navigation, the image, the beacon: time for each to reach the outside
    await tab.close()
    const blocked = (x) => typeof x === 'string' && x.startsWith('blocked')
    const bad = []
    if (heading !== 'Hello, world' || r.css !== 'rgb(1, 2, 3)' || r.img !== 7 || r.data !== 'status data 42') bad.push(`own files: heading ${heading}, css ${r.css}, img ${r.img}, data ${r.data}`)
    if (!blocked(r.cookie) || !blocked(r.storage)) bad.push(`cookie ${r.cookie}, storage ${r.storage}`)
    for (const k of ['api', 'apiFiles', 'oc', 'outside']) if (!blocked(r[k])) bad.push(`${k} ${r[k]}`)
    if (r.popup === 'opened') bad.push('a popup opened')
    if (hits.length) bad.push(`the outside got ${hits.join(' ')}`)
    // Beneath the CSP: had a request to /api got out, it would be cross-site, and refused as such.
    const marked = await api('/api/me', { cookie: a.cookie, headers: { 'sec-fetch-site': 'cross-site' } })
    if (marked.status !== 403) bad.push(`a cross-site request with the cookie: ${marked.status}`)
    assert(!bad.length, bad.join('; '))
    return `own css, image and data loaded; cookie ${r.cookie}; /api ${r.api}; outside ${r.outside}; beacon ${r.beacon}; popup ${r.popup}; top ${r.top}; nothing reached the outside origin`
  } finally {
    outside.close()
  }
})
await check('"Open": the headers, a top-level load refused, members only, and a link that ends with the session', async () => {
  const g = await grantOf(a)
  assert(g.status === 200 && g.grant, `open ${g.status}`)
  const outer = g.headers.get('content-security-policy') ?? ''
  assert(/script-src 'none'/.test(outer) && outer.includes(`frame-src ${ORIGIN}/v/${g.grant}/`) && /frame-ancestors 'none'/.test(outer), `wrapper CSP: ${outer}`)
  const inner = await viewGet(g.grant, 'hostile.html')
  const csp = inner.headers.get('content-security-policy') ?? ''
  assert(inner.status === 200 && /^sandbox allow-scripts allow-forms;/.test(csp) && !csp.includes('allow-same-origin') && csp.includes(`connect-src ${ORIGIN}/v/${g.grant}/;`) && !inner.headers.get('set-cookie'), `inner ${inner.status} ${csp}`)
  const top = await viewGet(g.grant, 'hostile.html', 'document')
  const none = await viewGet(g.grant, 'hostile.html', null)
  const hidden = await viewGet(g.grant, '.ola/opencode.db')
  assert(top.status === 403 && none.status === 403 && hidden.status === 404, `top-level ${top.status}, no dest ${none.status}, hidden ${hidden.status}`)
  const bobs = await grantOf(b)
  const anon = await api('/api/open?w=${FA}&path=hostile.html')
  const guess = await viewGet(randomBytes(32).toString('base64url'), 'hostile.html')
  assert(bobs.status === 404 && !bobs.grant && anon.status === 401 && guess.status === 404, `bob ${bobs.status}, signed out ${anon.status}, a guessed grant ${guess.status}`)
  // Another session of alice's (a second device): when it signs out, its grant stops at once.
  const extra = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  const link = admin('invite', 'alice', '--add-device')
  const o = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: link.split('/').pop() }), headers: { 'content-type': 'application/json' } })
  const reg = await fetch(`${ORIGIN}/api/auth/register/verify`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ceremony: o.json.ceremony, response: extra.create(o.json.options) }) })
  const c2 = CK_RE.exec(reg.headers.get('set-cookie') ?? '')?.[1]
  const me2 = await api('/api/me', { cookie: c2 })
  const g2 = await grantOf({ cookie: c2 })
  const before = (await viewGet(g2.grant, 'look.css', 'style')).status
  await api('/api/signout', { method: 'POST', cookie: c2, csrf: me2.json.csrf })
  const after = (await viewGet(g2.grant, 'look.css', 'style')).status
  assert(before === 200 && after === 404, `before sign-out ${before}, after ${after}`)
  await api('/api/me', { cookie: a.cookie }) // alice's own session hears of the added device here, not in a later check's page
  const rows = auditRows(FA).filter((x) => x.action === 'page_opened')
  assert(rows.length >= 2 && rows.every((x) => x.name_ref?.length === 64), `${rows.length} page_opened rows`)
  const dbs = ['platform.db', 'platform.db-wal'].map((f) => path.join(env.OLA_FD_DATA, f)).filter(existsSync).map((f) => readFileSync(f))
  assert(dbs.every((buf) => !buf.includes(Buffer.from('hostile'))), 'a page name is in the database')
  return `wrapper and page CSPs as designed; top-level 403; bob 404, signed out 401, a guessed grant 404; a grant ends with its session (${before} then ${after}); ${rows.length} page_opened rows, no names`
})

await check('"Open": page files given up on, or left unread, hold no exec (third review)', async () => {
  // A page's script can abort a dozen fetches at once, or leave some unread. Before the fix the
  // ones that waited in line got their exec after their asker had gone and held it for good: the
  // workspace's four page execs, so Open was dead for the team and the workspace never idled.
  const mk = spawnSync(CTR, ['exec', '--user', '1000', `ola-${FA}`, 'sh', '-c', 'head -c 31457280 /dev/zero > /work/rv3-big.bin'])
  assert(mk.status === 0, 'could not write the big file')
  const g = await grantOf(a)
  const execs = () => spawnSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8' }).stdout.split('\n').filter((x) => x.includes(`ola-${FA}`) && x.includes('ola-get')).length
  const socks = []
  for (let i = 0; i < 12; i++) {
    const s = net.connect(PORT, '127.0.0.1')
    s.on('error', () => {})
    s.write(`GET /v/${g.grant}/rv3-big.bin HTTP/1.1\r\nHost: localhost:${PORT}\r\nSec-Fetch-Dest: empty\r\n\r\n`)
    socks.push(s)
  }
  await sleep(50)
  for (const s of socks) s.destroy()
  // Four more that read nothing: ended by the minimum rate (OLA_FD_SLOW_MS, 4 s here).
  const unread = []
  for (let i = 0; i < 4; i++) {
    const s = net.connect(PORT, '127.0.0.1')
    s.on('error', () => {})
    s.write(`GET /v/${g.grant}/rv3-big.bin HTTP/1.1\r\nHost: localhost:${PORT}\r\nSec-Fetch-Dest: image\r\n\r\n`)
    s.pause()
    unread.push(s)
  }
  await sleep(14_000)
  const held = execs()
  const next = await viewGet(g.grant, 'look.css', 'style')
  for (const s of unread) s.destroy()
  spawnSync(CTR, ['exec', '--user', '1000', `ola-${FA}`, 'rm', '-f', '/work/rv3-big.bin'])
  assert(held === 0 && next.status === 200, `ola-get execs still held ${held}, the next page file ${next.status}`)
  return 'no exec held after 12 dropped and 4 unread requests; the next page file 200'
})

// ---------------------------------------------------------------- roles
await check('a viewer reads but cannot upload, delete or run', async () => {
  const base = { cookie: v.cookie, csrf: v.csrf, ws: FA }
  const reads = await Promise.all(['/api/project', '/api/files', '/oc/api/session'].map((p) => api(p, base)))
  assert(reads.every((r) => r.status === 200), `reads ${reads.map((r) => r.status)}`)
  const bad = []
  for (const [m, p] of [['POST', '/api/files?name=v.txt'], ['DELETE', '/api/files/survey.csv'], ...sampleRoutes.filter(([m]) => m !== 'GET')]) {
    const r = await api(p, { ...base, method: m, body: '{}' })
    if (r.status !== 403) bad.push(`${m} ${p} ${r.status}`)
  }
  assert(!bad.length, bad.join(', '))
  await V.page.goto(`${ORIGIN}/?w=${FA}#/`)
  await V.page.waitForSelector('.viewer-note')
  assert(!(await V.page.locator('#askbar-input').isVisible()) && !(await V.page.getByRole('button', { name: 'Add files' }).count()), 'the viewer sees Ask Ola or Add files')
  return `${sampleRoutes.filter(([m]) => m !== 'GET').length + 2} writes refused`
})

// ---------------------------------------------------------------- Data and the web (2.3.0-8)
const PDF = spawnSync('python3', [path.join(AI, 'workspace/testdata/mkpdf.py'), 'Page one is about drought in the Sahel.', 'Page two covers mangrove restoration in Tanzania.', 'Page three is about flood insurance.']).stdout
await check('Data: an uploaded PDF is indexed by page, a search cites page 2, the database downloads whole; delete takes it out; bob gets 404, the viewer reads', async () => {
  const base = { cookie: a.cookie, csrf: a.csrf, ws: FA }
  const up = await api('/api/files?name=made-up%20report.pdf', { ...base, method: 'POST', body: PDF, headers: { 'content-type': 'application/octet-stream' } })
  assert(up.status === 201, `upload ${up.status}`)
  await until(async () => (await api('/api/data', base)).json?.documents?.count === 1, 30_000, 'the PDF to be indexed')
  const hits = (await api('/api/data/docs?q=mangrove', base)).json
  assert(hits.hits?.[0]?.page === 2 && hits.hits[0].path === 'made-up report.pdf' && hits.hits[0].snip.includes('\u0002mangrove\u0003'), JSON.stringify(hits).slice(0, 200))
  const list = (await api('/api/files', base)).json.files.map((f) => f.path)
  assert(!list.some((f) => /^project\.db/.test(f)), 'the database files are listed under Files')
  const dl = await fetch(`${ORIGIN}/api/data/download?w=${FA}`, { headers: { cookie: `${CK}=${a.cookie}` } })
  const head = Buffer.from(await dl.arrayBuffer())
  assert(dl.status === 200 && head.subarray(0, 15).toString() === 'SQLite format 3' && /attachment/.test(dl.headers.get('content-disposition') ?? ''), `download ${dl.status}`)
  const bobs = await Promise.all(['/api/data', '/api/data/docs?q=x', '/api/data/table?name=documents', '/api/data/download', '/api/settings'].map((p) => api(p, { cookie: b.cookie, ws: FA })))
  assert(bobs.every((r) => r.status === 404), `bob: ${bobs.map((r) => r.status)}`)
  assert((await api('/api/data', { cookie: v.cookie, ws: FA })).status === 200, 'the viewer cannot read Data')
  const del = await api(`/api/files/${encodeURIComponent('made-up report.pdf')}`, { ...base, method: 'DELETE' })
  const after = (await api('/api/data/docs?q=mangrove', base)).json
  assert(del.status === 200 && after.total === 0 && (await api('/api/data', base)).json.documents.count === 0, `after delete: ${JSON.stringify(after).slice(0, 120)}`)
  return `${head.length} bytes of database`
})

const webFile = path.join(env.OLA_HOME, 'gateway-web')
const grants = () => JSON.parse(readFileSync(webFile, 'utf8'))
await check('Settings: web access per project, owners and members change it, the viewer cannot, each change in the audit log and the gateway file', async () => {
  const base = { cookie: a.cookie, csrf: a.csrf, ws: FA }
  assert((await api('/api/settings', { cookie: v.cookie, ws: FA })).json?.web?.always === false, 'starts off')
  assert((await api('/api/settings/web', { cookie: v.cookie, csrf: v.csrf, ws: FA, method: 'POST', body: '{"always":true}' })).status === 403, 'the viewer changed it')
  const on = await api('/api/settings/web', { ...base, method: 'POST', body: '{"always":true}' })
  assert(on.json?.web?.always === true && on.json.web.changedBy === 'Alice A.', JSON.stringify(on.json))
  assert(grants()[`ws-${FA}`]?.always === true && !grants()[`ws-${FB}`], 'the gateway file')
  const off = await api('/api/settings/web', { ...base, method: 'POST', body: '{"always":false}' })
  assert(off.json?.web?.always === false && !grants()[`ws-${FA}`], 'revoked in the gateway file')
  const rows = auditRows(FA).map((r) => r.action)
  assert(rows.includes('web_allowed') && rows.includes('web_revoked'), `audit: ${rows.slice(0, 6)}`)
  assert((statSync(webFile).mode & 0o777) === 0o600, 'the gateway file is not mode 600')
})

if (!LIVE) {
  // The approval in the page, with the scripted model ("search the web for …" runs one ola-search
  // in the sealed workspace) and the made-up search provider behind the gateway.
  const Q = 'made-up flood maps for Springfield'
  const searchLines = () => gateway.log.split('\n').filter((l) => l.includes(`"caller":"ws-${FA}"`) && l.includes('"route":"search"')).map((l) => JSON.parse(l))
  async function webAsk() {
    await A.page.goto('about:blank')
    await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
    await A.page.waitForSelector('.project-title')
    await A.page.getByRole('button', { name: 'Ask Ola' }).first().click()
    await A.page.locator('button:has-text("New conversation")').first().click({ timeout: 2000 }).catch(() => {})
    await A.page.fill('#ask-input', `Please search the web for ${Q}`)
    await A.page.press('#ask-input', 'Enter')
  }
  const done = () => A.page.waitForFunction(() => ['done', 'failed', 'stopped'].includes([...document.querySelectorAll('.drawer .turn')].pop()?.dataset.status ?? ''), null, { timeout: 60_000 })
  await check('the first web search asks in plain words; Allow once runs that search and is not remembered', async () => {
    const n = searchLines().length
    await webAsk()
    const dialog = A.page.locator('dialog.approval[open]')
    await dialog.waitFor({ timeout: 60_000 })
    const title = await dialog.locator('h2').innerText()
    assert(title.includes('Ola wants to search the web for:') && title.includes(Q), title)
    assert((await dialog.locator('.web-leaves').innerText()).includes('The words of the search go to Brave Search. Nothing from your files is sent.'), 'the line under it')
    await dialog.getByRole('button', { name: 'Allow once' }).click()
    await done()
    await until(() => searchLines().length > n, 10_000, 'the search at the gateway')
    const l = searchLines().at(-1)
    assert(l.status === 200 && l.grant === 'once', JSON.stringify(l))
    assert((await api('/api/settings', { cookie: a.cookie, ws: FA })).json.web.always === false, 'once was remembered as always')
  })
  await check('Always in this project: remembered across conversations (no second question), shown in Settings, revoked there, and then asked again; Not now searches nothing', async () => {
    await webAsk()
    let dialog = A.page.locator('dialog.approval[open]')
    await dialog.waitFor({ timeout: 60_000 })
    await dialog.getByRole('button', { name: 'Always in this project' }).click()
    await done()
    assert(searchLines().at(-1)?.grant === 'always' || searchLines().at(-1)?.grant === 'once', 'the search ran')
    // A new conversation: no question this time, and the gateway lets it through as "always".
    const n = searchLines().length
    await webAsk()
    await done()
    assert(!(await A.page.locator('dialog.approval[open]').count()), 'asked again after Always')
    await until(() => searchLines().length > n, 10_000, 'the second search')
    assert(searchLines().at(-1).grant === 'always' && searchLines().at(-1).status === 200, JSON.stringify(searchLines().at(-1)))
    // Settings shows it; its switch takes it back.
    await A.page.goto(`${ORIGIN}/?w=${FA}#/settings`)
    await A.page.getByText('On. Ola may search the web and download documents', { exact: false }).waitFor({ timeout: 15_000 })
    await A.page.getByRole('switch', { name: 'Search and download without asking' }).click()
    await A.page.getByText('Off. Ola asks before each web search or download.', { exact: false }).waitFor()
    const m = searchLines().length
    await webAsk()
    dialog = A.page.locator('dialog.approval[open]')
    await dialog.waitFor({ timeout: 60_000 })
    await dialog.getByRole('button', { name: 'Not now' }).click()
    await done()
    await sleep(1500)
    assert(searchLines().length === m, 'a search reached the gateway after Not now')
    const actions = auditRows(FA).map((r) => r.action)
    assert(actions.filter((x) => x === 'web_allowed').length >= 2 && actions.filter((x) => x === 'web_revoked').length >= 2, 'the audit log')
    // Neither the platform database nor the gateway's file holds the search words.
    const dbText = readFileSync(path.join(env.OLA_FD_DATA, 'platform.db')).toString('latin1') + (existsSync(path.join(env.OLA_FD_DATA, 'platform.db-wal')) ? readFileSync(path.join(env.OLA_FD_DATA, 'platform.db-wal')).toString('latin1') : '')
    assert(!dbText.includes('flood maps') && !readFileSync(webFile, 'utf8').includes('flood') && !gateway.log.includes('flood maps'), 'the search words were written down')
  })
}

await check("removing a member: their open stream is cut by the recheck, then the workspace gets new secrets", async () => {
  const old = secretsOf(FA)
  const veraPage = await grantOf(v) // a viewer may open a page; the link must end with her membership
  const gone = openStream(v.cookie, FA)
  const stays = openStream(a.cookie, FA)
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
    const now = secretsOf(FA)
    assert(now.OPENCODE_PASSWORD !== old.OPENCODE_PASSWORD && now.BOX_API_KEY !== old.BOX_API_KEY, 'the secrets did not change')
    // The gateway (not restarted) picks up the new token from its file; the old one is refused.
    await until(() => insideToken(FA, now.BOX_API_KEY) === '200', 15_000, 'the new token working through the door')
    const oldToken = insideToken(FA, old.BOX_API_KEY)
    const pw = [await deskStatus(FA, old.OPENCODE_PASSWORD), await deskStatus(FA, now.OPENCODE_PASSWORD)]
    assert(oldToken === '401' && pw[0] === 401 && pw[1] === 200, `old token ${oldToken}, old password ${pw[0]}, new password ${pw[1]}`)
    // Alice carries on through the front desk; the removed viewer's stream saw nothing after.
    const again = openStream(a.cookie, FA)
    await until(() => again.status === 200, 30_000, "alice's stream after the restart")
    const mark = `made-up after removal ${Date.now()}`
    const made = await api('/oc/api/session', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ title: mark }), headers: { 'content-type': 'application/json' } })
    await until(() => again.text.includes(mark), 15_000, "alice's stream getting the new session")
    again.stop()
    assert(made.status === 200 && !gone.text.includes(mark), 'the removed viewer saw a later event')
    assert(auditRows(FA).some((x) => x.action === 'secrets_rotated'), 'no secrets_rotated row')
    const veraAfter = (await viewGet(veraPage.grant, 'look.css', 'style')).status
    assert(veraPage.status === 200 && veraAfter === 404, `her open page: ${veraPage.status}, then ${veraAfter} after removal`)
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
  const plain = await api('/oc/api/session', { cookie: v.cookie, ws: FA })
  const other = await api('/oc/api/session?directory=/opt/ola', { cookie: v.cookie, ws: FA })
  assert(plain.status === 200 && ids(plain) && ids(other) === ids(plain), `plain ${plain.status} [${ids(plain)}], directory=/opt/ola ${other.status} [${ids(other)}]`)
  return `${plain.json.data.length} session(s), the same list either way`
})

// ---------------------------------------------------------------- CSRF and other origins
await check('CSRF: a write without our Origin and token is refused', async () => {
  const p = '/api/files?name=csrf.txt'
  const cases = {
    'no token': await api(p, { method: 'POST', cookie: a.cookie, ws: FA, body: 'x' }),
    'wrong token': await api(p, { method: 'POST', cookie: a.cookie, csrf: 'x'.repeat(43), ws: FA, body: 'x' }),
    "bob's token": await api(p, { method: 'POST', cookie: a.cookie, csrf: b.csrf, ws: FA, body: 'x' }),
    'other origin': await api(p, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, origin: `http://127.0.0.1:${PORT + 1}`, body: 'x' }),
    'no origin': await api(p, { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, origin: null, body: 'x' }),
    'cross-site fetch': await api('/api/me', { cookie: a.cookie, headers: { 'sec-fetch-site': 'cross-site' } }),
    'same-site fetch': await api('/api/me', { cookie: a.cookie, headers: { 'sec-fetch-site': 'same-site' } }),
  }
  const bad = Object.entries(cases).filter(([, r]) => r.status !== 403).map(([k, r]) => `${k} ${r.status}`)
  assert(!bad.length, bad.join(', '))
  const files = (await api('/api/files', { cookie: a.cookie, ws: FA })).json.files
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
  assert((await api('/api/files', { cookie: thief.cookie, ws: FA })).status === 200, 'the cookie did not work before revocation')
  const open = openStream(thief.cookie, FA)
  await until(() => open.status === 200, 30_000, "the thief's event stream opening")
  admin('revoke-sessions', 'alice')
  await until(() => !open.open, 10_000, "the thief's open event stream closing after revocation")
  const after = await Promise.all([api('/api/me', thief), api('/api/files', { ...thief, ws: FA }), api('/api/files?name=t.txt', { ...thief, method: 'POST', ws: FA, body: 'x' }), api('/oc/api/session', { ...thief, ws: FA })])
  assert(after.every((r) => r.status === 401), `after: ${after.map((r) => r.status)}`)
  // The open page notices on its next request and goes back to the sign-in screen.
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
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
  for (const r of [page, await api('/api/me'), await api('/api/project', { cookie: a.cookie, ws: FA })]) {
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
  const m = (await api('/api/project', { cookie: a.cookie, ws: FA })).json.machine
  assert(n1 === 3 && n2 === 3 && m.working === 2 && Object.keys(m).sort().join() === 'capacity,working' && m.capacity === 4, `windows: ${n1}, then ${n2} after bob's request, then ${JSON.stringify(m)}`)
  return `${n1} for the window of three people; still ${n2} after bob's request mid-window; ${m.working} at the next window`
})

// ---------------------------------------------------------------- Fallback to Claude
// Claude Code itself, inside alice's sealed VM, through her door and this suite's gateway, to a
// scripted Anthropic (no model call, no credential). alice owns team-a and is not an admin, so her
// project is in API-key mode; olga (an admin) shows the subscription mode.
const grantsFile = () => JSON.parse(readFileSync(path.join(env.OLA_HOME, 'gateway-claude'), 'utf8'))
/** POST /api/claude/run as a person, read to its end: the NDJSON lines; answers approvals with `decide`. */
async function claudeRun(who, body, { decide = null, onStarted = null } = {}) {
  const r = await fetch(`${ORIGIN}/api/claude/run`, { method: 'POST', headers: { cookie: `${CK}=${who.cookie}`, 'x-ola-csrf': who.csrf, 'x-ola-workspace': FA, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ context: '', conversation: 'ses_check1', autonomy: 'go', why: 'asked', ...body }) })
  if (r.status !== 200) return { status: r.status, json: await r.json().catch(() => null), lines: [] }
  const lines = []
  let buf = ''
  for await (const c of r.body) {
    buf += Buffer.from(c).toString('utf8')
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const e = JSON.parse(line)
      lines.push(e)
      if (e.ola === 'started' && onStarted) onStarted(e)
      if (e.ola === 'approval' && decide) await api('/api/claude/answer', { method: 'POST', cookie: who.cookie, csrf: who.csrf, ws: FA, body: JSON.stringify({ run: lines[0].run, request_id: e.request_id, decision: decide }), headers: { 'content-type': 'application/json' } })
    }
  }
  return { status: 200, lines, ended: lines.find((e) => e.ola === 'ended') }
}
const inVm = (cmd) => spawnSync(CTR, ['exec', `ola-${FA}`, 'sh', '-c', cmd], { encoding: 'utf8' }).stdout.trim()

await check('Fallback to Claude is off by default; only the owner may turn it on, with consent; the grants file follows', async () => {
  const i = await api('/api/claude', { cookie: a.cookie, ws: FA })
  assert(i.status === 200 && i.json.enabled === false && i.json.mode === 'api_key' && i.json.configured === true && i.json.canChange === true, JSON.stringify(i.json))
  assert(!grantsFile()[`ws-${FA}`], 'a grant before anyone turned it on')
  const vi = await api('/api/claude', { cookie: v.cookie, ws: FA })
  assert(vi.json.canChange === false, 'the viewer may change it')
  const post = (who, body) => api('/api/claude/settings', { method: 'POST', cookie: who.cookie, csrf: who.csrf, ws: FA, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  assert((await post(v, { enabled: true, consent: true })).status === 403, 'the viewer turned it on')
  assert((await post(a, { enabled: true })).status === 400, 'on without consent')
  const on = await post(a, { enabled: true, consent: true })
  assert(on.status === 200 && on.json.enabled === true, `on: ${on.status}`)
  const g = grantsFile()[`ws-${FA}`]
  assert(g?.mode === 'api_key' && g.cap_micro_usd === 25_000_000, `grant: ${JSON.stringify(g)}`)
  assert((await api('/api/claude/run', { method: 'POST', cookie: v.cookie, csrf: v.csrf, ws: FA, body: '{}', headers: { 'content-type': 'application/json' } })).status === 403, 'the viewer may run Claude')
  assert(auditRows(FA).some((r) => r.action === 'claude_enabled' && r.actor === 'alice'), 'no claude_enabled row')
  return 'api_key mode, $25.00 ceiling'
})
await check('a request handed to Claude runs Claude Code inside the sealed VM through the gateway, writes its file, and is audited with numbers only', async () => {
  const r = await claudeRun(a, { request: 'write claude-go.txt saying hi', context: 'The person asked: hello\nOla answered: hello' })
  assert(r.status === 200 && r.ended?.reason === 'done', `ended: ${JSON.stringify(r.ended ?? r.json)}`)
  const tools = r.lines.filter((e) => e.type === 'assistant').flatMap((e) => e.message.content.filter((c) => c.type === 'tool_use').map((c) => c.name))
  assert(tools.includes('Write'), `tools: ${tools}`)
  assert(inVm('cat /work/claude-go.txt') === 'hi', 'the file is not in /work')
  const used = auditRows(FA).find((x) => x.action === 'claude_used')
  const row = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'), { readOnly: true }).prepare("SELECT tokens_in, tokens_out, cost_micro_usd, name_ref FROM audit WHERE action = 'claude_used' ORDER BY id DESC LIMIT 1").get()
  assert(used && row.tokens_in > 0 && row.cost_micro_usd > 0 && row.name_ref === null, `audit: ${JSON.stringify(row)}`)
  const log = gateway.log.split('\n').filter((l) => l.includes('"route":"claude"'))
  assert(log.length >= 2 && log.every((l) => l.includes(`"caller":"ws-${FA}"`) && !l.includes('claude-go')), `${log.length} gateway lines`)
  return `${r.lines.length} lines; ${row.tokens_in} tokens in, ${row.tokens_out} out, $${(row.cost_micro_usd / 1e6).toFixed(4)}; ${log.length} gateway requests`
})
await check('under "Ask me first" Claude Code stops for a yes: no means no file, yes means the file', async () => {
  const no = await claudeRun(a, { request: 'write claude-no.txt saying no', autonomy: 'ask' }, { decide: 'reject' })
  const asked = no.lines.find((e) => e.ola === 'approval')
  assert(asked?.tool_name === 'Write' && no.ended?.reason === 'done', `no: ${JSON.stringify(asked)} ${JSON.stringify(no.ended)}`)
  assert(inVm('test -e /work/claude-no.txt && echo there || echo absent') === 'absent', 'the refused file was written')
  const yes = await claudeRun(a, { request: 'write claude-yes.txt saying yes', autonomy: 'ask' }, { decide: 'once' })
  assert(yes.lines.some((e) => e.ola === 'answered' && e.decision === 'once') && inVm('cat /work/claude-yes.txt') === 'yes', 'yes did not write the file')
})
await check('Stop ends a Claude run inside the VM, and nothing of it keeps running', async () => {
  let run = null
  setTimeout(async () => run && (await api('/api/claude/stop', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ run }), headers: { 'content-type': 'application/json' } })), 6000)
  const t0 = Date.now()
  const r = await claudeRun(a, { request: 'slow 40x1000' }, { onStarted: (e) => (run = e.run) })
  const ms = Date.now() - t0
  await sleep(1000)
  const left = inVm(`ls /tmp/ola-claude-${run}.pid 2>/dev/null; for p in /proc/[0-9]*; do tr '\\0' ' ' < $p/cmdline 2>/dev/null | grep -q '^claude ' && echo $p; done`)
  assert(r.ended?.reason === 'stopped' && ms < 25_000 && !left, `ended ${r.ended?.reason} after ${ms} ms; left: ${left}`)
  return `stopped after ${Math.round(ms / 1000)} s`
})
await check('in the page: the drawer hands a request to Claude, marks the reply, and shows it again after a reload', async () => {
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
  await A.page.waitForSelector('.project-title', { timeout: 60_000 })
  await A.page.locator('.askbar-open').click()
  await A.page.waitForSelector('fieldset.engine', { timeout: 20_000 }).catch(async (e) => {
    if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'claude-no-engine.png') })
    const info = await A.page.evaluate(() => fetch('/api/claude', { headers: { 'x-ola-workspace': new URLSearchParams(location.search).get('w') } }).then((r) => r.status + ' ' + r.statusText))
    throw new Error(`no Ola / Claude choice in the drawer (GET /api/claude from the page: ${info})`)
  })
  await A.page.locator('fieldset.engine label', { hasText: 'Claude' }).click()
  await A.page.fill('#ask-input', 'write page-claude.txt saying yes')
  await A.page.press('#ask-input', 'Enter')
  await A.page.waitForFunction(() => ['done', 'failed', 'stopped'].includes([...document.querySelectorAll('.drawer .turn')].pop()?.dataset.status), null, { timeout: 120_000 })
  const who = (await A.page.locator('.drawer .turn').last().locator('.said-ola .who').innerText()).replace(/\s+/g, ' ').trim()
  assert(who === 'Claude, outside this machine', `marked: ${who}`)
  const conv = await A.page.evaluate(() => [...document.querySelectorAll('.earlier button')].length)
  if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'claude-drawer.png') })
  // Opening the conversation again (a reload): the Claude turn comes back from its record in the VM.
  const sessions = await api('/oc/api/session?limit=5&order=desc', { cookie: a.cookie, ws: FA })
  const id = (sessions.json?.data ?? sessions.json ?? [])[0]?.id
  await A.page.goto(`${ORIGIN}/?w=${FA}#/?ask=${id}`)
  await A.page.waitForFunction(() => /outside this machine/.test(document.querySelector('.drawer .turn:last-child .said-ola .who')?.textContent ?? ''), null, { timeout: 30_000 })
  // An open page on a conversation resyncs (and so wakes the workspace) whenever its stream comes
  // back: leave it, so the rotation checks at the VM cap below see only their own requests.
  await A.page.goto('about:blank')
  return `conversation ${id ? 'reopened' : '?'} (${conv} earlier listed)`
})
await check('a role change that leaves only admins as owners moves the project to the subscription mode; turning it off removes the grant', async () => {
  admin('add-person', 'olga', '--name', 'Olga O.', '--admin')
  admin('add-member', 'team-a', 'olga', 'owner')
  assert(grantsFile()[`ws-${FA}`]?.mode === 'api_key', 'one owner is not an admin, yet oauth')
  admin('add-member', 'team-a', 'alice', 'member')
  assert(grantsFile()[`ws-${FA}`]?.mode === 'oauth', `after alice became a member: ${JSON.stringify(grantsFile())}`)
  const line = admin('claude', FA)
  assert(/ON, subscription/.test(line), line)
  admin('add-member', 'team-a', 'alice', 'owner')
  const off = await api('/api/claude/settings', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ enabled: false }), headers: { 'content-type': 'application/json' } })
  assert(off.status === 200 && !grantsFile()[`ws-${FA}`], 'the grant stayed after it was turned off')
  const refused = await claudeRun(a, { request: 'write x.txt saying x' })
  assert(refused.status === 403 && auditRows(FA).some((r) => r.action === 'claude_disabled'), `run after off: ${refused.status}`)
  return line.split(';')[0]
})

// ---------------------------------------------------------------- Fallback to a hosted open model
// The same opencode in alice's sealed VM, the model name `hosted` through her door and this suite's
// gateway, to a second scripted model (or, with OLA_CHECK_HOSTED_LIVE, the real one on Together).
const hostedFile = () => JSON.parse(readFileSync(path.join(env.OLA_HOME, 'gateway-hosted'), 'utf8'))
const jpost = (who, p, body) => api(p, { method: 'POST', cookie: who.cookie, csrf: who.csrf, ws: FA, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const dbRow = (sql) => new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'), { readOnly: true }).prepare(sql).get()
/** A new conversation in alice's project, a hosted run in it, and its end (the front desk's word). */
async function hostedRun(who, request, extra = {}) {
  const s = await jpost(who, '/oc/api/session', { title: 'hosted check', metadata: { autonomy: 'go' } })
  const id = s.json?.id ?? s.json?.data?.id
  if (typeof id !== 'string') throw new Error(`no conversation: ${s.status} ${s.text.slice(0, 160)}`)
  const r = await jpost(who, '/api/hosted/run', { request, conversation: id, ...extra })
  if (r.status !== 200) return { status: r.status, json: r.json, id }
  await until(async () => (await api('/api/fallback', { cookie: who.cookie, ws: FA })).json?.hosted?.running === null, HOSTED_LIVE ? 300_000 : 120_000, 'the hosted run ending')
  const msgs = (await api(`/oc/api/session/${id}/message?limit=200`, { cookie: who.cookie, ws: FA })).json
  const list = msgs?.data ?? msgs ?? []
  return { status: 200, id, list, models: [...new Set(list.filter((m) => m.type === 'assistant').map((m) => m.model?.id))], idle: list.filter((m) => m.type === 'idle').map((m) => m.outcome) }
}
// A chat request with model `hosted` from inside the VM, with its own token (from stdin): the gateway's answer.
const HOSTED_PROBE = 'import sys, json, urllib.request\nbody = json.dumps({"model": "hosted", "messages": [{"role": "user", "content": "hi"}]}).encode()\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/chat/completions", data=body, headers={"Authorization": "Bearer " + sys.stdin.read().strip(), "Content-Type": "application/json"})\ntry:\n    print(urllib.request.urlopen(req, timeout=30).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\n'
// Not spawnSync: the scripted hosted model answers from this process, so its event loop must run.
const hostedFromInside = () =>
  new Promise((resolve) => {
    const c = spawn(CTR, ['exec', '-i', `ola-${FA}`, 'python3', '-I', '-c', HOSTED_PROBE], { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.on('close', () => resolve(out.trim()))
    c.stdin.end(secretsOf(FA).BOX_API_KEY)
  })
const hostedLog = () => gateway.log.split('\n').filter((l) => l.includes('"model":"hosted"')).slice(-3).map((l) => l.replace(/"t":"[^"]*",/, '').slice(0, 220)).join(' | ')

await check('the hosted open model is off by default and independent of Claude; only the owner turns it on, with consent; the grants file follows', async () => {
  const f = await api('/api/fallback', { cookie: a.cookie, ws: FA })
  assert(f.status === 200 && f.json.hosted.enabled === false && f.json.hosted.configured === true && f.json.hosted.provider === HOSTED_UP.HOSTED_PROVIDER && f.json.stretch === 'suggest' && f.json.stretchTo === 'hosted' && f.json.claude.enabled === false, JSON.stringify(f.json).slice(0, 300))
  assert(!hostedFile()[`ws-${FA}`], 'a hosted grant before anyone turned it on')
  assert((await jpost(v, '/api/hosted/settings', { enabled: true, consent: true })).status === 403, 'the viewer turned it on')
  assert((await jpost(a, '/api/hosted/settings', { enabled: true })).status === 400, 'on without consent')
  const on = await jpost(a, '/api/hosted/settings', { enabled: true, consent: true })
  assert(on.status === 200 && on.json.enabled === true, `on: ${on.status}`)
  assert(hostedFile()[`ws-${FA}`]?.cap_micro_usd === 20_000_000 && hostedFile()[`ws-${FA}`].until === undefined, `hosted grant: ${JSON.stringify(hostedFile())}`)
  assert(!grantsFile()[`ws-${FA}`], 'turning the hosted model on gave a Claude grant')
  assert((await jpost(v, '/api/fallback/settings', { stretch: 'never' })).status === 403, 'the viewer changed "when a request looks like a stretch"')
  const s = await jpost(a, '/api/fallback/settings', { stretch: 'handover', stretchTo: 'claude' })
  assert(s.status === 200 && s.json.stretch === 'handover' && s.json.stretchTo === 'claude', JSON.stringify(s.json))
  await jpost(a, '/api/fallback/settings', { stretch: 'suggest', stretchTo: 'hosted' })
  assert(auditRows(FA).some((r) => r.action === 'hosted_enabled' && r.actor === 'alice'), 'no hosted_enabled row')
  assert((await jpost(v, '/api/hosted/run', { request: 'x', conversation: 'ses_x' })).status === 403, 'the viewer may run it')
  return `on, $20.00 ceiling, provider ${f.json.hosted.provider}`
})
const HOSTED_ASK = HOSTED_LIVE ? 'How many respondents are in survey.csv? Count the data rows with a short program (not the header), then write just that number to hosted-count.txt.' : 'Count the rows in survey.csv'
await check(`a request handed to the hosted model runs in the same sealed VM and conversation, marked by its model, audited with numbers only, and the conversation goes back to Ola's model${HOSTED_LIVE ? ` (LIVE: ${HOSTED_LIVE})` : ''}`, async () => {
  // The live run counts a made-up survey of 37 respondents (written in the VM, as the work user).
  if (HOSTED_LIVE) spawnSync(CTR, ['exec', '--user', '1000', `ola-${FA}`, 'python3', '-c', "import csv\nw = csv.writer(open('/work/survey.csv', 'w', newline=''))\nw.writerow(['respondent', 'building', 'rent_burden'])\nfor i in range(37): w.writerow([f'R{i + 1:03d}', ['North', 'Elm', 'Park'][i % 3], ['high', 'medium', 'low'][i % 3]])"], { encoding: 'utf8' })
  const before = HOSTED_LIVE ? 0 : fakeHosted.calls()
  const t0 = Date.now()
  const r = await hostedRun(a, HOSTED_ASK)
  assert(r.status === 200, `run: ${r.status} ${JSON.stringify(r.json)}`)
  assert(JSON.stringify(r.models) === '["hosted"]' && r.idle[0] === 'succeeded', `models ${r.models}, outcome ${r.idle}; gateway: ${hostedLog()}`)
  const file = HOSTED_LIVE ? inVm('cat /work/hosted-count.txt') : inVm('test -e /work/rows.md && echo there')
  const real = inVm("python3 -c \"import csv; print(sum(1 for _ in csv.reader(open('/work/survey.csv'))) - 1)\"")
  assert(HOSTED_LIVE ? real === '37' && file.trim() === real : file === 'there', `the file: ${file} (the survey has ${real})`)
  if (!HOSTED_LIVE) assert(fakeHosted.calls() > before, 'the hosted model was not asked')
  const row = dbRow("SELECT tokens_in, tokens_out, cost_micro_usd, name_ref FROM audit WHERE action = 'hosted_used' ORDER BY id DESC LIMIT 1")
  assert(row && row.tokens_in > 0 && row.name_ref === null && row.cost_micro_usd !== null, `audit: ${JSON.stringify(row)}`)
  const lines = gateway.log.split('\n').filter((l) => l.includes('"model":"hosted"') && l.includes(`"caller":"ws-${FA}"`))
  assert(lines.length >= 2 && lines.every((l) => !l.includes('survey') && !l.includes('rows.md')), `${lines.length} gateway lines`)
  // Back to Ola's own model: the next request in the same conversation runs on it.
  await jpost(a, `/oc/api/session/${r.id}/prompt`, { text: 'Say hello' })
  await until(async () => {
    const m = (await api(`/oc/api/session/${r.id}/message?limit=200`, { cookie: a.cookie, ws: FA })).json
    return (m?.data ?? m ?? []).filter((x) => x.type === 'idle').length >= 2
  }, 120_000, 'the next request')
  const m2 = (await api(`/oc/api/session/${r.id}/message?limit=200`, { cookie: a.cookie, ws: FA })).json
  const models = (m2?.data ?? m2 ?? []).filter((x) => x.type === 'assistant').map((x) => x.model?.id)
  // opencode lists a conversation's messages newest first: the newest reply is the first.
  assert(models[0] === 'general' && models.includes('hosted'), `after the hosted run the conversation runs on ${models[0]} (newest first: ${models.join(', ')})`)
  return `${Math.round((Date.now() - t0) / 1000)} s, ${lines.length} hosted requests; ${row.tokens_in} tokens in, ${row.tokens_out} out, $${(row.cost_micro_usd / 1e6).toFixed(4)}; ${HOSTED_LIVE ? `wrote ${file} (the survey has ${real})` : 'wrote rows.md'}; then Ola's model again`
})
await check('"Just this once": with the switches off the owner hands one request over; the gateway honors it for that run only, the next is refused from inside the VM; a member cannot; the same for Claude', async () => {
  const off = await jpost(a, '/api/hosted/settings', { enabled: false })
  assert(off.status === 200 && !hostedFile()[`ws-${FA}`] && auditRows(FA).some((r) => r.action === 'hosted_disabled'), 'not off')
  await sleep(2500) // the gateway reloads the grants file within 2 s
  const offInside = await hostedFromInside()
  assert(offInside === '403', `the hosted model from inside with the switch off: ${offInside} (${hostedLog()})`)
  const plain = await jpost(a, '/api/hosted/run', { request: 'x', conversation: 'ses_x' })
  assert(plain.status === 403 && plain.json.error === 'hosted_off', `a run with it off: ${plain.status}`)
  admin('add-member', 'team-a', 'vera', 'member')
  try {
    const member = await jpost(v, '/api/hosted/run', { request: 'x', conversation: 'ses_x', once: true })
    const memberClaude = await claudeRun(v, { request: 'x', once: true })
    assert(member.status === 403 && member.json.error === 'owner_only' && memberClaude.status === 403, `a member's just this once: ${member.status} / ${memberClaude.status}`)
  } finally {
    admin('add-member', 'team-a', 'vera', 'viewer')
  }
  const r = await hostedRun(a, 'Count the rows in survey.csv', { once: true })
  assert(r.status === 200 && JSON.stringify(r.models) === '["hosted"]' && r.idle[0] === 'succeeded', `once: ${r.status} ${r.models} ${r.idle}`)
  const after = { file: hostedFile()[`ws-${FA}`] ?? null, on: (await api('/api/fallback', { cookie: a.cookie, ws: FA })).json.hosted.enabled, rows: dbRow("SELECT count(*) AS n FROM fallback_once").n }
  assert(after.file === null && after.on === false && after.rows === 0, `after the run: ${JSON.stringify(after)}`)
  await sleep(2500) // the gateway reloads the grants file within 2 s
  const inside = await hostedFromInside()
  assert(inside === '403', `a second request from inside the VM: ${inside}`)
  const once = dbRow("SELECT tokens_in, cost_micro_usd, name_ref FROM audit WHERE action = 'hosted_once' ORDER BY id DESC LIMIT 1")
  assert(once && once.tokens_in > 0 && once.name_ref === null, `hosted_once: ${JSON.stringify(once)}`)
  // Claude, the same: one run with the switch left off, then nothing.
  const c = await claudeRun(a, { request: 'write claude-once.txt saying once', once: true })
  assert(c.status === 200 && c.ended?.reason === 'done' && inVm('cat /work/claude-once.txt') === 'once', `Claude once: ${c.status} ${JSON.stringify(c.ended ?? c.json)}`)
  const claudeOff = (await api('/api/fallback', { cookie: a.cookie, ws: FA })).json.claude.enabled
  assert(!grantsFile()[`ws-${FA}`] && claudeOff === false && auditRows(FA).some((x) => x.action === 'claude_once'), `after Claude once: ${JSON.stringify(grantsFile())}, on ${claudeOff}`)
  const again = await claudeRun(a, { request: 'write x.txt saying x' })
  assert(again.status === 403, `the next Claude request: ${again.status}`)
  // /claude in the page is this same one-time path. The reactions rule rides with every request,
  // and a compliment comes back as the reaction line alone (README, reactions).
  assert(fakeClaude.st.reactionsRule > 0, 'the reactions rule did not reach Claude Code')
  const thanks = await claudeRun(a, { request: 'Great job, thank you!', once: true })
  const said = thanks.lines.filter((e) => e.type === 'assistant').flatMap((e) => e.message.content.filter((c) => c.type === 'text').map((c) => c.text))
  assert(thanks.status === 200 && thanks.ended?.reason === 'done' && JSON.stringify(said) === '["[[ola:react thanks]]"]', `a compliment to Claude: ${JSON.stringify(said)}`)
  return 'hosted: one run, then 403 from inside; Claude: one run, then 403; the reactions rule reached Claude Code'
})
// The hosted grants are kept right by the admin CLI through a rotation and a close (the checks at the
// VM cap, at the end): turned on here, with a stale entry planted for the CLI to drop.
await jpost(a, '/api/hosted/settings', { enabled: true, consent: true })

// ---------------------------------------------------------------- one real request
if (LIVE) {
  await check('a real request runs in the drawer, inside the sealed workspace, through the gateway', async () => {
    const survey = path.join(run, 'survey')
    const truth = JSON.parse(spawnSync('python3', [path.join(AI, 'spike/make-survey.py'), survey], { encoding: 'utf8' }).stdout)
    const up = await api('/api/files?name=survey.csv', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: readFileSync(path.join(survey, 'survey.csv')), headers: { 'content-type': 'application/octet-stream' } })
    assert(up.status === 201, `upload ${up.status}`)
    await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
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
    const files = (await api('/api/files', { cookie: a.cookie, ws: FA })).json.files
    const n = truth.respondents ?? truth.rows ?? truth.count
    const rows = auditRows(FA)
    assert(rows.some((r) => r.action === 'run_started' && r.actor === 'alice'), 'no run_started in the audit log')
    const reads = rows.filter((r) => r.action === 'file_read_by_run').length
    const gw = gateway.log.split('\n').filter((l) => l.includes(`"caller":"ws-${FA}"`)).length
    assert(gw > 0, `the gateway saw no request from ws-${FA}`)
    return `answer: ${answer.slice(0, 90).replace(/\s+/g, ' ')}; truth ${n}; summary.md ${files.some((f) => f.path === 'summary.md' && f.origin === 'made') ? 'made' : 'not made'}; ${gw} gateway requests from ws-${FA}; ${reads} read-by-run rows`
  })
  // Bart's first request, as a first-time person makes it: "Ask me first", the approval answered
  // in its dialog, the reply's own Open, the page rendered. The reply must point at Files and
  // Open, never at a preview pane, a desktop app or a /work path (2026-11-16: it did).
  await check('a real "Make a hello world web page": approved, listed, opened from the reply, rendered; the reply says Files and Open', async () => {
    // The hostile page of the "Open" checks goes first, so the home shows what this run made.
    spawnSync(CTR, ['exec', `ola-${FA}`, 'python3', '-I', '-c', 'import os\nfor f in ["hostile.html", "look.css", "dot.svg", "data.json", "run.js", "index.html", "hello.html"]:\n    p = "/work/" + f\n    os.path.exists(p) and os.remove(p)'])
    await A.page.goto('about:blank')
    await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
    await A.page.waitForSelector('.project-title')
    await A.page.getByRole('button', { name: 'Ask Ola' }).first().click()
    if (await A.page.getByRole('button', { name: 'New conversation' }).count()) await A.page.getByRole('button', { name: 'New conversation' }).click()
    await A.page.locator('.autonomy label', { hasText: 'Ask me first' }).click()
    await A.page.fill('#ask-input', 'Make a hello world web page')
    await A.page.press('#ask-input', 'Enter')
    const last = A.page.locator('.drawer .turn').last()
    let approvals = 0
    const end = Date.now() + 300_000
    while (Date.now() < end) {
      const st = await last.getAttribute('data-status').catch(() => null)
      if (st && ['done', 'failed', 'stopped'].includes(st)) break
      if (await A.page.locator('dialog.approval[open]').count()) {
        if (SHOTS && !approvals) await A.page.screenshot({ path: path.join(SHOTS, 'hello-approval.png') })
        await A.page.getByRole('button', { name: 'Yes, this once' }).click()
        approvals++
      }
      await A.page.waitForTimeout(500)
    }
    const st = await last.getAttribute('data-status')
    const answer = (await last.locator('.answer').allInnerTexts()).join(' ').replace(/\s+/g, ' ')
    assert(st === 'done', `ended ${st}: ${answer.slice(0, 200)}`)
    const bad = /preview pane|desktop (app|browser)|\/work\b|open it in (a|your) browser/i.exec(answer)
    assert(!bad && /\bFiles\b/.test(answer) && /\bOpen\b/.test(answer), `the reply: ${answer.slice(0, 300)}`)
    const open = last.locator('.made-pages a').first()
    await open.waitFor({ timeout: 5_000 })
    const label = await open.innerText()
    if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'hello-reply.png') })
    const [tab] = await Promise.all([A.ctx.waitForEvent('page'), open.click()])
    await tab.waitForLoadState()
    let frame
    await until(() => (frame = tab.frames().find((f) => f.url().includes('/v/'))), 15_000, 'the page frame')
    await frame.waitForLoadState()
    const text = await frame.locator('body').innerText()
    assert(/hello/i.test(text), `the page says: ${text.slice(0, 120)}`)
    if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'hello-opened.png') })
    await tab.close()
    await A.page.keyboard.press('Escape')
    await A.page.goto('about:blank')
    await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
    const card = A.page.locator('.thing-slot[data-kind="site"]').first()
    await card.waitFor({ timeout: 30_000 })
    if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'hello-home.png') })
    return `${approvals} approval(s); "${label.replace(/\s+/g, ' ').trim()}" from the reply; page says "${text.slice(0, 40).replace(/\s+/g, ' ')}"; reply: ${answer.slice(0, 160)}`
  })
}
if (SHOTS) {
  // A fresh load of the home (the drawer closed), with what the run made among the things.
  await A.page.goto(`${ORIGIN}/?w=${FA}`)
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
  const PP = PORT + 2
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
  // These checks are about the idle stop and the run ceiling. The scripted slow run's folder
  // listings fail inside the VM ("ripgrep execution failed"), and three failed steps in a row is a
  // stretch: with a fallback set up, the page would stop Ola and show the card before the ceiling.
  // So this project says "Never suggest" here (the card has its own checks).
  await jpost(a, '/api/fallback/settings', { stretch: 'never' })
}
async function ask(text) {
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent === 'Made-up eviction report', null, { timeout: 60_000 })
  await A.page.locator('.ask-new, button:has-text("New conversation")').first().click({ timeout: 2000 }).catch(() => {})
  await A.page.fill('#askbar-input', text)
  await A.page.press('#askbar-input', 'Enter')
  const t0 = Date.now()
  await until(async () => (await executing(FA)).length > 0, 20_000, 'the run starting')
  return { t0, sid: (await executing(FA))[0] }
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
    if (!(await executing(FA)).length) break
    const st = wsState(FA)
    if (!(await executing(FA)).length) break
    states.add(st)
    lastSeen = Date.now()
    await sleep(500)
  }
  const ran = lastSeen - t0
  const msgs = JSON.stringify(await deskGet(FA, `/api/session/${sid}/message`))
  assert(states.size && [...states].every((s) => s === 'running'), `states during the run: ${[...states].join(', ')} (ran ${ran} ms)`)
  assert(ran > 6000, `the run lasted only ${ran} ms (idle limit 3 s)`)
  assert(msgs.includes('Done after 4 slow steps'), `the run did not reach its answer after ${ran} ms, ${fake.calls() - calls0} calls: ${msgs.slice(0, 900)}`)
  const ended = Date.now()
  await until(() => wsState(FA) !== 'running', 30_000, 'the idle stop after the run')
  return `ran ${(ran / 1000).toFixed(1)} s past a 3 s idle limit, running throughout, ${fake.calls() - calls0} model calls, answered; stopped ${((Date.now() - ended) / 1000).toFixed(1)} s after it ended`
})

await check('the run ceiling interrupts a run cleanly and the page says why', async () => {
  const { t0, sid } = await ask('List the folder, very slowly. slow 40x2000')
  const last = A.page.locator('.drawer .turn').last()
  await until(async () => (await last.getAttribute('data-status')) === 'stopped', 60_000, 'the run stopping at the ceiling')
  const at = Date.now() - t0
  await A.page.waitForFunction(() => /longest one request may run/.test(document.querySelector('.drawer .turn:last-of-type')?.textContent ?? ''), null, { timeout: 10_000 }).catch(async (e) => {
    const said = (await last.innerText()).replace(/\s+/g, ' ').slice(-300)
    const runs = await api('/api/runs', { cookie: a.cookie, ws: FA })
    throw new Error(`${e.message.split('\n')[0]}; the turn says: ${said}; /api/runs: ${runs.text.slice(0, 300)}`)
  })
  const text = (await last.innerText()).replace(/\s+/g, ' ')
  assert(at >= 23_000 && at < 50_000, `stopped after ${at} ms (ceiling 24 s)`)
  assert(!(await executing(FA)).length, 'the session is still executing')
  const c1 = fake.calls()
  await sleep(3000)
  assert(fake.calls() === c1, 'the model is still being called after the stop')
  const runs = await api('/api/runs', { cookie: a.cookie, ws: FA })
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
  const state = () => JSON.parse(node('workspace/ws.mjs', ['status', FA, '--json']).stdout)[0]?.state
  assert((await api('/api/files', { cookie: a.cookie, ws: FA })).status === 200, `a request to ${FA}`)
  const t0 = Date.now()
  await until(() => state() !== 'running', 30_000, 'the idle stop')
  const after = Date.now() - t0
  const ev = await fetch(`${ORIGIN}/oc/api/event`, { headers: { cookie: `${CK}=${a.cookie}`, 'x-ola-workspace': FA }, signal: AbortSignal.timeout(5000) }).then(async (r) => [r.status, (await r.json()).error], () => ['no answer'])
  await sleep(1500)
  assert(ev[0] === 503 && ev[1] === 'asleep' && state() !== 'running', `event stream: ${ev.join(' ')}, state ${state()}`)
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
  await A.page.getByText('Waking your workspace…').waitFor({ timeout: 10_000 })
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent === 'Made-up eviction report', null, { timeout: 60_000 })
  const back = state()
  assert(back === 'running', `after opening: ${back}`)
  return `stopped ${(after / 1000).toFixed(1)} s after its last request (limit 3 s, swept each second); event stream 503 asleep; the page said "Waking your workspace…", then opened it`
})

// ---------------------------------------------------------------- rotation with a full machine (2026-11-16)
// A member removed from a team of two workspaces while the machine runs as many VMs as it may: every
// workspace is revoked before any is restored, a restart that cannot happen leaves the workspace
// stopped and wakeable, and one that cannot be made safe is closed and refused in plain words.
{
  const gwAnswer = (id, token) =>
    new Promise((resolve) => {
      const r = http.request({ socketPath: path.join(env.OLA_HOME, 'gw', `ws-${id}.sock`), path: '/v1/models', headers: { authorization: `Bearer ${token}` }, timeout: 10_000 }, (res) => (res.resume(), resolve(res.statusCode)))
      r.on('error', () => resolve(0))
      r.on('timeout', () => (r.destroy(), resolve(-1)))
      r.end()
    })
  const wsRow = (id) => JSON.parse(node('workspace/ws.mjs', ['status', id, '--json']).stdout)[0]
  // /api/project until it is no longer "waking" (the wake answers within OLA_FD_WAKE_WAIT_MS, or says waking).
  // With busyToo, also past "machine busy" (a slot was just freed: the next ask starts it).
  async function project(ws, { busyToo = false, ms = 60_000 } = {}) {
    const end = Date.now() + ms
    let r
    do r = await api('/api/project', { cookie: a.cookie, ws })
    while (r.status === 503 && (r.json?.error === 'waking' || (busyToo && r.json?.error === 'machine_busy')) && Date.now() < end && (await sleep(500), true))
    return r
  }
  const since = (id, t0) => auditRows(id).filter((x) => x.at >= t0).map((x) => x.action)
  const removeVera = (extra) => spawnSync(process.execPath, [path.join(AI, 'frontdesk/admin.mjs'), 'remove-member', 'team-a', 'vera'], { env: { ...env, ...extra }, encoding: 'utf8' })
  const lineOf = (out, id) => out.split('\n').find((l) => l.startsWith(`${id}: `)) ?? ''
  const failing = path.join(run, 'container-failing')
  writeFileSync(failing, `#!/bin/sh\nif [ "$1" = "$FAIL_ON" ]; then for a in "$@"; do [ "$a" = "$FAIL_NAME" ] && { echo "Error: injected failure" >&2; exit 1; }; done; fi\nexec ${CTR} "$@"\n`, { mode: 0o700 })
  // The previous check left a 3 s idle stop; these want the workspaces to stay as they are put, so
  // no open tab's event stream wakes one meanwhile, and the front desk may run ONE of the check's
  // VMs: whatever else runs (bob's, or one started here with the check's own limit of 2) fills it.
  for (const p of [A, B, V]) await p.page.goto('about:blank')
  fd.kill('SIGTERM')
  await until(() => fd.exitCode !== null, 10_000, 'the front desk stopping')
  fd = start('frontdesk', 'frontdesk/server.mjs', { OLA_FD_IDLE_STOP_MIN: '0', OLA_MAX_RUNNING: '1' })
  await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
  admin('create-workspace', FC, '--name', 'Made-up second report', '--team', 'team-a', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  const full = await room()
  if (full) ok('the machine has room for the rotation checks', false, full)
  else {
  await check(`removing a member at the VM cap: both of the team's workspaces get new secrets, the old ones refused; the one that ran waits stopped ("machine busy"), and wakes once a slot frees`, async () => {
    const t0 = Date.now()
    // FB (bob's, through the front desk) and FA running: the check's two VMs, a full machine for this front desk.
    node('workspace/ws.mjs', ['stop', FA])
    let opened
    for (let i = 0; i < 120 && (opened = await api('/api/project', { cookie: b.cookie, ws: FB })).status !== 200; i++) await sleep(500)
    assert(opened.status === 200, `${FB} did not open: ${opened.status} ${opened.json?.error}`)
    assert(node('workspace/ws.mjs', ['start', FA]).status === 0, `${FA} did not start`)
    const old = { [FA]: secretsOf(FA), [FC]: secretsOf(FC) }
    // A stale hosted grant (a project that is not open, say): the admin CLI rewrites the file from the database.
    writeFileSync(path.join(env.OLA_HOME, 'gateway-hosted'), JSON.stringify({ ...hostedFile(), 'ws-gone-zz': { cap_micro_usd: 1 } }), { mode: 0o600 })
    // The admin's ws.mjs may run one VM (OLA_MAX_RUNNING=1): bob's workspace holds it, so FA cannot start again.
    const r = removeVera({ OLA_MAX_RUNNING: '1' })
    try {
      assert(r.status === 0, `remove-member exited ${r.status}: ${r.stderr.trim().split('\n').pop()}`)
      const hg = hostedFile()
      assert(hg[`ws-${FA}`]?.cap_micro_usd === 20_000_000 && !hg['ws-gone-zz'], `the hosted grants after the removal: ${JSON.stringify(hg)}`)
      assert(/left stopped/.test(lineOf(r.stdout, FA)) && /stopped, it starts on its next request/.test(lineOf(r.stdout, FC)), r.stdout.trim().replace(/\n/g, ' | '))
      for (const id of [FA, FC]) {
        const now = secretsOf(id)
        const got = [await gwAnswer(id, old[id].BOX_API_KEY), await deskStatus(id, old[id].OPENCODE_PASSWORD)]
        assert(now.BOX_API_KEY !== old[id].BOX_API_KEY && now.OPENCODE_PASSWORD !== old[id].OPENCODE_PASSWORD && got[0] === 401 && got[1] === 0, `${id}: old token ${got[0]}, old password ${got[1]}`)
      }
      const rows = { [FA]: since(FA, t0), [FC]: since(FC, t0) }
      assert(rows[FA].includes('secrets_rotated') && rows[FA].includes('restart_deferred') && rows[FC].includes('secrets_rotated') && !rows[FC].includes('restart_deferred'), JSON.stringify(rows))
      assert(wsRow(FA).state === 'stopped', `${FA} is ${wsRow(FA).state}`)
      // Bob's workspace holds the front desk's one slot: it says the machine is busy, and keeps FA stopped.
      const busy = [await project(FA), await api('/oc/api/session', { cookie: a.cookie, ws: FA })]
      assert(busy.every((x) => x.status === 503 && x.json?.error === 'machine_busy' && x.headers.get('retry-after')) && wsRow(FA).state === 'stopped', `while full: ${busy.map((x) => `${x.status} ${x.json?.error}`).join(', ')}, ${FA} ${wsRow(FA).state}`)
      node('workspace/ws.mjs', ['stop', FB]) // the slot frees
      const back = await project(FA, { busyToo: true })
      const now = secretsOf(FA)
      const after = { project: back.status, session: (await api('/oc/api/session', { cookie: a.cookie, ws: FA })).status, newPw: await deskStatus(FA, now.OPENCODE_PASSWORD), oldPw: await deskStatus(FA, old[FA].OPENCODE_PASSWORD), newToken: insideToken(FA, now.BOX_API_KEY), oldToken: insideToken(FA, old[FA].BOX_API_KEY) }
      assert(after.project === 200 && after.session === 200 && after.newPw === 200 && after.oldPw === 401 && after.newToken === '200' && after.oldToken === '401', JSON.stringify(after))
      return `old tokens 401 and old passwords unanswered for both; audit ${rows[FA].join('+')} / ${rows[FC].join('+')}; while full ${busy.map((x) => `${x.status} ${x.json.error}`).join(', ')}; a slot freed: project 200, opencode 200, new password and token 200, old 401`
    } finally {
      admin('add-member', 'team-a', 'vera', 'viewer')
    }
  })

  await check(`a workspace that cannot be made safe is closed and refused in plain words, the team's other one still gets new secrets, and reopen brings it back`, async () => {
    const t0 = Date.now()
    const old = { [FA]: secretsOf(FA), [FC]: secretsOf(FC) }
    const r = removeVera({ OLA_CONTAINER_BIN: failing, FAIL_ON: 'rm', FAIL_NAME: `ola-${FA}` })
    try {
      assert(r.status === 1, `remove-member exited ${r.status} (a person is needed: 1)`)
      assert(/CLOSED/.test(lineOf(r.stdout, FA)) && lineOf(r.stdout, FA).includes(`node admin.mjs reopen ${FA}`) && /new secrets in force/.test(lineOf(r.stdout, FC)), r.stdout.trim().replace(/\n/g, ' | '))
      const got = { aToken: await gwAnswer(FA, old[FA].BOX_API_KEY), aPw: await deskStatus(FA, old[FA].OPENCODE_PASSWORD), cToken: await gwAnswer(FC, old[FC].BOX_API_KEY), cNew: secretsOf(FC).BOX_API_KEY !== old[FC].BOX_API_KEY }
      assert(got.aToken === 401 && got.aPw === 0 && got.cToken === 401 && got.cNew, JSON.stringify(got))
      const rows = { [FA]: since(FA, t0), [FC]: since(FC, t0) }
      assert(rows[FA].includes('workspace_closed') && !rows[FA].includes('secrets_rotated') && rows[FC].includes('secrets_rotated'), JSON.stringify(rows))
      const refused = await api('/api/project', { cookie: a.cookie, ws: FA })
      assert(refused.status === 423 && refused.json?.error === 'closed' && /closed/.test(refused.json.message), `${refused.status} ${refused.text.slice(0, 100)}`)
      assert(wsRow(FA).closed === true, 'the workspace is not marked closed on the machine')
      assert(!hostedFile()[`ws-${FA}`], 'a closed project kept its hosted grant')
      admin('reopen', FA)
      assert(hostedFile()[`ws-${FA}`], 'the reopened project lost its hosted grant (it is still on)')
      const back = await project(FA)
      const now = secretsOf(FA)
      assert(back.status === 200 && (await deskStatus(FA, now.OPENCODE_PASSWORD)) === 200 && (await deskStatus(FA, old[FA].OPENCODE_PASSWORD)) === 401 && since(FA, t0).includes('workspace_reopened'), `after reopen: ${back.status}`)
      return `closed: 423 "${refused.json.message.slice(0, 60)}…"; its old token 401; ${FC} rotated; reopened, opens with the new password`
    } finally {
      admin('add-member', 'team-a', 'vera', 'viewer')
    }
  })

  await check(`the first workspace's container cannot be made again: the other is still rotated, and the next request makes the missing container`, async () => {
    const t0 = Date.now()
    const old = { [FA]: secretsOf(FA), [FC]: secretsOf(FC) }
    const r = removeVera({ OLA_CONTAINER_BIN: failing, FAIL_ON: 'create', FAIL_NAME: `ola-${FA}` })
    try {
      assert(r.status === 0, `remove-member exited ${r.status}: ${r.stdout.trim().replace(/\n/g, ' | ')}`)
      const got = { aToken: await gwAnswer(FA, old[FA].BOX_API_KEY), cToken: await gwAnswer(FC, old[FC].BOX_API_KEY), aState: wsRow(FA).state, cState: wsRow(FC).state }
      assert(got.aToken === 401 && got.cToken === 401 && got.aState === 'no container' && got.cState === 'stopped', JSON.stringify(got))
      const rows = { [FA]: since(FA, t0), [FC]: since(FC, t0) }
      assert(rows[FA].includes('secrets_rotated') && rows[FA].includes('restart_deferred') && rows[FC].includes('secrets_rotated'), JSON.stringify(rows))
      const back = await project(FA)
      assert(back.status === 200 && (await deskStatus(FA, secretsOf(FA).OPENCODE_PASSWORD)) === 200 && (await deskStatus(FA, old[FA].OPENCODE_PASSWORD)) === 401, `after: ${back.status}`)
      return `old tokens 401; ${FA} had no container, the next request made it and opened (200)`
    } finally {
      admin('add-member', 'team-a', 'vera', 'viewer')
    }
  })
  }
}

await browser.close()
ok('no request left the origin', foreign.size === 0, [...foreign].slice(0, 3).join(' '))
if (staleSockets) console.log(`(a GET sent again on a fresh socket after a stale keep-alive one: ${staleSockets} time(s))`)
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} of ${results.length} checks passed`)
if (failed) console.log(`front desk log (tail):\n${fd.log.split('\n').slice(-15).join('\n')}`)
cleanup()
process.exit(failed ? 1 : 0)
