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
import { RUNNER_PEEK, TWIN_ATTACK } from './test/attacks.mjs'
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
import { startFakeVercel } from '../web/server/fake-vercel.mjs'
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
// One turn at a time on the machine's four VMs, deploys first (OLA-83, ops/turn.mjs); a deploy's
// suites inherit the deploy's turn.
await (await import('../ops/turn.mjs')).takeTurn(`frontdesk check${process.env.OLA_CHECK_TAG ? ` ${process.env.OLA_CHECK_TAG}` : ''}`)
const FC = `${TAG ? `${TAG}-` : ''}fd-c` // team-a's second workspace, made for the rotation checks at the end
const PORT = Number(process.env.OLA_CHECK_FD_PORT || 4790)
const ORIGIN = `http://localhost:${PORT}`
const GW_PORT = Number(process.env.OLA_CHECK_GW_PORT || 4182)
// The session cookie's name for this origin (auth.mjs sessionCookie: ola-local on http://localhost).
const CK = (await import('./auth.mjs')).sessionCookie(ORIGIN).name
const CK_RE = new RegExp(`${CK}=([^;]+)`)
const run = mkdtempSync(path.join(tmpdir(), 'ola-fdcheck-'))
// Publish (sites.mjs): a stand-in for Vercel's deploy API and the published site, in this process
// (so the admin CLI's unpublish goes through adminAsync, never the blocking admin()).
const SITES_TOKEN = randomBytes(16).toString('hex')
const vercel = await startFakeVercel({ token: SITES_TOKEN })
writeFileSync(path.join(run, 'sites.env'), `OLA_SITES_VERCEL_TOKEN=${SITES_TOKEN}\nOLA_SITES_PROJECT=ola-sites\n`, { mode: 0o600 })
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
  OLA_FD_CHUNK_MB: '1', // uploads in pieces: 1 MiB pieces, so a 2.6 MB zip goes in three
  // OLA_CHECK_ONLY=<regex>: only the checks whose names match (and the sign-ups they need), while working on them.
  OLA_FD_WORKING_WINDOW_S: '4', // "people working" changes once per window; 4 s so the check can watch it
  OLA_FD_SLOW_MS: '4000', // a download must move 32 KiB per window; 4 s here (30 s by default) so the check can watch it
  OLA_FD_GATEWAY_USAGE_TOKEN: randomBytes(24).toString('hex'), // Fallback to Claude: the front desk asks the gateway with it
  OLA_FD_JOB_TICK_MS: '1000', // batch jobs: looked after every second here (10 s by default)
  OLA_FD_JOB_STALE_S: '10',
  // Compare with Claude: this suite's scratch VMs are named <tag or fd>c-<hex>; the candidates queue in
  // the run's folder; an engine stopped after 3 minutes; the sampler left to its unit test.
  OLA_FD_COMPARE_PREFIX: `${TAG || 'fd'}c`,
  OLA_FD_CANDIDATES_DIR: path.join(run, 'candidates'),
  OLA_FD_COMPARE_ENGINE_MIN: '3',
  OLA_FD_COMPARE_TICK_MS: '3600000',
  // Devices (devices.mjs): a made-up pass key for this run only, and one-time codes that end after
  // 6 s (120 by default) so the check can watch one expire.
  OLA_GATE_PASS_KEY: randomBytes(32).toString('hex'),
  OLA_FD_DEVICE_CODE_SECONDS: '6',
  OLA_FD_SITES_API: vercel.api,
  OLA_FD_SITES_ORIGIN: vercel.origin,
  OLA_FD_SITES_FILE: path.join(run, 'sites.env'),
  OLA_FD_SITES_POLL_MS: '100',
  OLA_FD_SITES_VERIFY_MS: '8000',
  OLA_FD_SITES_SETTLE_MS: '300',
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
const ONLY = process.env.OLA_CHECK_ONLY ? new RegExp(process.env.OLA_CHECK_ONLY) : null
async function check(name, fn) {
  if (ONLY && !ONLY.test(name) && !/^alice: invitation|^bob and vera register/.test(name)) return
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
// OLA_CHECK_GENERAL_MODEL=<model id>: the live run's own model on Together instead (the machine's, for example).
// Fallback to a hosted open model: a second scripted model (web/server/fake-model.mjs, hosted), or
// with OLA_CHECK_HOSTED_LIVE=<model id> that model on Together (the one live hosted run; cents).
const HOSTED_LIVE = process.env.OLA_CHECK_HOSTED_LIVE || null
const fakeHosted = await startFakeModel({ hosted: true })
fakeHosted.server.unref()
const HOSTED_UP = HOSTED_LIVE
  ? { HOSTED_BASE_URL: 'https://api.together.xyz/v1', HOSTED_API_KEY: together(), HOSTED_MODEL: HOSTED_LIVE, HOSTED_PROVIDER: 'Together AI', GATEWAY_HOSTED_PRICES: process.env.OLA_CHECK_HOSTED_PRICES || 'in=1.4,out=4.4' }
  : { HOSTED_BASE_URL: `http://127.0.0.1:${fakeHosted.port}/v1`, HOSTED_API_KEY: 'fake-hosted-key-not-a-secret', HOSTED_MODEL: 'fake-hosted', HOSTED_PROVIDER: 'Made-up Cloud', HOSTED_DEEPSEEK_MODEL: 'fake-deepseek' }
const gwEnv = {
  HOME: homedir(),
  ...(LIVE ? { UPSTREAM_BASE_URL: 'https://api.together.xyz/v1', UPSTREAM_API_KEY: together(), GATEWAY_MODELS: `general=${process.env.OLA_CHECK_GENERAL_MODEL || 'zai-org/GLM-5.3-Flash'}` } : FAKE_UP),
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
  // batch jobs: the job grants the front desk writes (jobs.mjs, OLA_HOME/gateway-batch by default)
  GATEWAY_BATCH_FILE: path.join(env.OLA_HOME, 'gateway-batch'),
  // devices: the people file the front desk keeps (devices.mjs, OLA_HOME/gateway-people by default)
  GATEWAY_PEOPLE_TOKENS_FILE: path.join(env.OLA_HOME, 'gateway-people'),
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
  // The page remembers "Lots of permissions" per project (OLA-142). These checks were written for a
  // page that starts each load under Lots: forget the choice at every load, so one check's "Ask
  // before each step" never follows a later check (web/check.mjs covers the memory itself).
  await ctx.addInitScript(() => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('ola.permissions.')) localStorage.removeItem(k)
    } catch {}
  })
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
// Made-up passwords for this run's people (8 characters is the rule's floor; none has the person's
// name in it, which the rule refuses).
const PW = { alice: 'walks the dog', bob: 'tram9ride', vera: 'reads late', dina: 'draws maps', wade: 'red kites', wanda: 'quiet tea' }
/** An invitation, answered as a person would: choose a password, Make my account, the project opens. */
async function register(p, link, password) {
  await p.page.goto(link)
  await p.page.getByLabel('Choose a password').fill(password)
  await p.page.getByRole('button', { name: 'Make my account' }).click()
  await p.page.waitForSelector('.project-title', { timeout: 60_000 })
}
/** The quiet link under Sign In: there only in a browser that has used a passkey for Ola before. */
async function signInWithPasskey(p) {
  await p.page.goto(`${ORIGIN}/`)
  const btn = p.page.getByRole('button', { name: 'Use a passkey instead' })
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

await check('alice: invitation link → a password chosen (the page says nothing of passkeys) → her project opens; then she adds a passkey in Your account', async () => {
  await A.page.goto(invites.alice)
  await A.page.waitForSelector('.gate-name')
  const greet = await A.page.locator('.gate-name').innerText()
  assert(greet === 'Alice A.', `greeting: ${greet}`)
  await A.page.getByLabel('Choose a password').waitFor()
  const said = await A.page.locator('.gate-letter').innerText()
  assert(!/passkey/i.test(said) && /At least 8 characters/.test(said), `the invitation page says: ${said}`)
  if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'invite-1280.png') })
  await register(A, invites.alice, PW.alice)
  a = await signedIn(A)
  assert(a.me.status === 200 && a.me.json.workspaces.length === 1 && a.me.json.workspaces[0].slug === FA, JSON.stringify(a.me.json))
  assert(new URL(A.page.url()).search === `?w=${FA}`, A.page.url())
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent !== 'Your project')
  const title = await A.page.locator('.project-title').innerText()
  // A passkey is an option, in Your account (she uses it later in these checks).
  await A.page.goto(`${ORIGIN}/?w=${FA}#/account`)
  await A.page.waitForSelector('.account-card')
  await A.page.getByLabel('Current password', { exact: true }).fill(PW.alice)
  await A.page.getByRole('button', { name: 'Add a passkey', exact: true }).click()
  await A.page.waitForFunction(() => document.body.innerText.includes('A passkey added'))
  // A real load (about:blank first: a goto that changes only the hash is no load): her session hears
  // of the passkey once, as every other session of hers will.
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
  await A.page.waitForSelector('.project-title', { timeout: 30_000 })
  if (await A.page.locator('.notice-bar').count()) await A.page.getByRole('button', { name: 'I have read this' }).click()
  return `project "${title}"; a passkey added in Your account`
})
await check('"New project" is for admins only: a member is answered 404 and nothing is made; the shared code makes, refuses and leaves nothing on a failed VM (test/projects.test.mjs)', async () => {
  const count = () => {
    const d = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'))
    try {
      return d.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n
    } finally {
      d.close()
    }
  }
  const before = count()
  const r = await api('/api/projects', { method: 'POST', cookie: a.cookie, csrf: a.csrf, body: JSON.stringify({ name: 'Made-up new project' }), headers: { 'content-type': 'application/json' } })
  assert(r.status === 404, `a member's new project: ${r.status}`)
  assert(count() === before, 'a workspace was made')
  const u = spawnSync(process.execPath, ['--test', path.join(HERE, 'test/projects.test.mjs')], { encoding: 'utf8', timeout: 60_000 })
  assert(u.status === 0, u.stdout.split('\n').filter((l) => /not ok|Error/.test(l)).slice(0, 3).join(' | '))
  return `${/ℹ pass (\d+)/.exec(u.stdout)?.[1] ?? '?'} unit checks`
})
await check('a project opened on a full machine stops the longest-idle one (not one running something, not one in use) and starts; an update\'s restart keeps the idle clock (OLA-412, test/room.test.mjs)', async () => {
  const u = spawnSync(process.execPath, ['--test', path.join(HERE, 'test/room.test.mjs')], { encoding: 'utf8', timeout: 60_000 })
  assert(u.status === 0, u.stdout.split('\n').filter((l) => /not ok|Error/.test(l)).slice(0, 3).join(' | '))
  return `${/ℹ pass (\d+)/.exec(u.stdout)?.[1] ?? '?'} unit checks`
})
await check('bob and vera register from their own invitations', async () => {
  await register(B, invites.bob, PW.bob)
  await register(V, invites.vera, PW.vera)
  b = await signedIn(B)
  v = await signedIn(V)
  assert(b.me.json.workspaces.map((w) => w.slug).join() === FB, 'bob sees ' + JSON.stringify(b.me.json.workspaces))
  assert(v.me.json.workspaces.map((w) => `${w.slug}:${w.role}`).join() === `${FA}:viewer`, 'vera sees ' + JSON.stringify(v.me.json.workspaces))
})
await check('an invitation works once', async () => {
  const token = invites.alice.split('/').pop()
  const r = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ invite: token }), headers: { 'content-type': 'application/json' } })
  const info = await api('/api/auth/invite/info', { method: 'POST', body: JSON.stringify({ invite: token }), headers: { 'content-type': 'application/json' } })
  assert(r.status === 404 && info.status === 404, `second use answered ${r.status} / ${info.status}`)
  const rows = JSON.parse(admin('audit', '--limit', '500', '--json')).filter((x) => x.action === 'password_set')
  assert(rows.length === 3, `${rows.length} passwords set`)
})
// Safari did not keep the Secure session cookie over http://localhost, so Bart's first sign-in
// went in circles (2026-11-16). WebKit (Playwright's build, not Safari itself) makes a passkey from
// an invitation and makes an authenticated request. WebKit has no virtual authenticator, so the
// page's navigator.credentials is answered by the software passkey through an exposed function;
// everything else, the cookie above all, is WebKit's own.
await check('in WebKit, an invitation makes an account with an 8-character password, the sign-in sticks, and an authenticated request works', async () => {
  const { webkit } = await import('playwright')
  const wk = await webkit.launch()
  try {
    admin('add-person', 'wanda', '--name', 'Wanda W.')
    const link = admin('invite', 'wanda')
    const ctx = await wk.newContext()
    const page = await ctx.newPage()
    await page.goto(link)
    await page.getByLabel('Choose a password').fill(PW.wanda)
    await page.getByRole('button', { name: 'Make my account' }).click()
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
// ---------------------------------------------------------------- passwords (2026-11-17)
// A normal sign-in with a password, the passkey optional. nell is invited and chooses a password;
// signs out and in with her name and password in Chromium and in WebKit; adds a passkey in Your
// account and turns on "Ask for my passkey too"; then approves the Ola app on a Mac (#/device), whose
// key reaches the model through the front desk and stops working when she signs that Mac out. The
// rules themselves (hash, limits, timing, resets) are proven in test/signin.test.mjs.
const PIA_PW = 'paper lanterns over the river'
async function passwordSignIn(page, handle, password) {
  await page.goto(`${ORIGIN}/`)
  await page.getByLabel('Your name for Ola').fill(handle)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
let P
await check('passwords: nell’s invitation lets her choose a password (a weak one is refused in plain words), and she is in', async () => {
  admin('add-person', 'nell', '--name', 'Nell N.')
  const link = admin('invite', 'nell')
  P = await person()
  await P.page.goto(link)
  await P.page.waitForSelector('.gate-name')
  if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, 'invite-password-1280.png') })
  await P.page.getByLabel('Choose a password').fill('password12345678')
  await P.page.getByRole('button', { name: 'Make my account' }).click()
  await P.page.waitForSelector('.gate-problem')
  const said = await P.page.locator('.gate-problem').innerText()
  assert(/most common/.test(said), said)
  await P.page.getByLabel('Choose a password').fill(PIA_PW)
  await P.page.getByRole('button', { name: 'Make my account' }).click()
  await P.page.waitForSelector('.gate-title', { timeout: 30_000 })
  const s = await signedIn(P)
  assert(s.me.json.person.handle === 'nell', JSON.stringify(s.me.json))
  return 'weak refused, then in'
})

await check('passwords: sign out, then in with name and password in Chromium and in WebKit; a wrong one says so, the same words as an unknown name', async () => {
  const { webkit } = await import('playwright')
  const wk = await webkit.launch()
  try {
    for (const [engine, ctx] of [['chromium', P.ctx], ['webkit', await wk.newContext()]]) {
      const page = engine === 'chromium' ? P.page : await ctx.newPage()
      if (engine === 'chromium') await api('/api/signout', { method: 'POST', cookie: (await cookieOf(ctx)).value, csrf: (await signedIn(P)).csrf })
      await passwordSignIn(page, 'nell', 'not the password at all')
      await page.waitForSelector('.gate-problem')
      const wrong = await page.locator('.gate-problem').innerText()
      await passwordSignIn(page, 'nobody-by-that-name', PIA_PW)
      await page.waitForSelector('.gate-problem')
      const nobody = await page.locator('.gate-problem').innerText()
      assert(wrong === nobody && /did not match/.test(wrong), `${engine}: "${wrong}" / "${nobody}"`)
      if (SHOTS && engine === 'webkit') await page.screenshot({ path: path.join(SHOTS, 'signin-wrong-webkit-1280.png') })
      // A capitalized name, as a phone types it: the same account.
      await passwordSignIn(page, engine === 'webkit' ? 'Nell' : 'nell', PIA_PW)
      await page.waitForSelector('.gate-title', { timeout: 30_000 })
      const c = (await ctx.cookies(ORIGIN)).find((k) => k.name === CK)
      const me = await api('/api/me', { cookie: c?.value })
      assert(me.status === 200 && me.json.person.handle === 'nell', `${engine}: ${me.status}`)
    }
  } finally {
    await wk.close()
  }
  if (SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pg = await ctx.newPage()
    await pg.goto(`${ORIGIN}/`)
    await pg.waitForSelector('.gate-form')
    await pg.screenshot({ path: path.join(SHOTS, 'signin-390.png'), fullPage: true })
    await pg.setViewportSize({ width: 1280, height: 860 })
    await pg.screenshot({ path: path.join(SHOTS, 'signin-1280.png') })
    await ctx.close()
  }
  return 'chromium and webkit'
})

await check('the sign-in page, in a fresh browser (Chromium and WebKit, phone size): a name, a password, Sign in and the forgot line; nothing about passkeys; nothing asks for a passkey on load; the name field does not fight a phone', async () => {
  const { webkit } = await import('playwright')
  const wk = await webkit.launch()
  const out = []
  try {
    for (const [engine, b] of [['chromium', browser], ['webkit', wk]]) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      // Count every passkey request the page makes (none is allowed on load, conditional UI included).
      await page.addInitScript(() => {
        window.__asked = 0
        if (navigator.credentials) {
          const get = navigator.credentials.get.bind(navigator.credentials)
          navigator.credentials.get = (o) => (window.__asked++, get(o))
        }
      })
      const posted = []
      page.on('request', (r) => /\/api\/auth\/(login|register)\//.test(r.url()) && posted.push(r.url()))
      await page.goto(`${ORIGIN}/`)
      await page.waitForSelector('.gate-form')
      await page.waitForTimeout(800)
      const text = await page.locator('.gate-letter').innerText()
      const buttons = await page.locator('.gate-letter button').allInnerTexts()
      const field = await page.locator('#gate-handle').evaluate((e) => ({ cap: e.getAttribute('autocapitalize'), cor: e.getAttribute('autocorrect'), spell: e.getAttribute('spellcheck'), auto: e.getAttribute('autocomplete') }))
      const asked = await page.evaluate(() => window.__asked)
      assert(/Sign in to Ola/.test(text) && /Forgot your password\? Ask Bart/.test(text) && !/passkey/i.test(text), `${engine}: the page says: ${text}`)
      assert(buttons.map((x) => x.trim()).join('|') === 'Show|Sign in', `${engine}: buttons ${buttons.join('|')}`)
      assert(field.cap === 'none' && field.cor === 'off' && field.spell === 'false' && field.auto === 'username', `${engine}: name field ${JSON.stringify(field)}`)
      assert(asked === 0 && posted.length === 0, `${engine}: ${asked} passkey request(s) on load`)
      await ctx.close()
      out.push(engine)
    }
  } finally {
    await wk.close()
  }
  return out.join(' and ')
})

await check('passwords: in Your account nell adds a passkey and turns on “Ask for my passkey too”; then her password is followed by her passkey', async () => {
  await P.page.goto(`${ORIGIN}/#/account`)
  await P.page.waitForSelector('.account-card')
  await P.page.getByLabel('Current password', { exact: true }).fill(PIA_PW)
  await P.page.getByRole('button', { name: 'Add a passkey', exact: true }).click()
  await P.page.waitForSelector('.account-said')
  await P.page.waitForFunction(() => document.body.innerText.includes('A passkey added'))
  await P.page.getByLabel('Ask for my passkey too').check()
  await P.page.waitForFunction(() => document.querySelector('.account-said')?.textContent?.includes('followed by your passkey'))
  if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, 'account-1280.png'), fullPage: true })
  // Sign out, then the password alone is not enough: the page asks for the passkey, which lets her in.
  await api('/api/signout', { method: 'POST', cookie: (await cookieOf(P.ctx)).value, csrf: (await signedIn(P)).csrf })
  await passwordSignIn(P.page, 'nell', PIA_PW)
  await P.page.getByRole('button', { name: 'Use my passkey' }).waitFor({ timeout: 10_000 })
  assert(!(await cookieOf(P.ctx)) || (await api('/api/me', { cookie: (await cookieOf(P.ctx)).value })).status === 401, 'signed in before the passkey')
  if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, 'signin-passkey-step-1280.png') })
  await P.page.getByRole('button', { name: 'Use my passkey' }).click()
  await P.page.waitForSelector('.gate-title', { timeout: 30_000 })
  // And the passkey alone still works, from the quiet link this browser now shows (it has used one).
  await api('/api/signout', { method: 'POST', cookie: (await cookieOf(P.ctx)).value, csrf: (await signedIn(P)).csrf })
  await P.page.goto(`${ORIGIN}/`)
  const pk = P.page.getByRole('button', { name: 'Use a passkey instead' })
  await until(() => pk.isEnabled(), 10_000, 'the passkey button')
  await pk.click()
  await P.page.waitForSelector('.gate-title', { timeout: 30_000 })
  const rows = JSON.parse(admin('audit', '--limit', '500', '--json')).map((x) => x.action)
  for (const w of ['password_set', 'passkey_added', 'passkey_required_on']) assert(rows.includes(w), `no ${w} row`)
  return 'password, then passkey; passkey alone'
})

await check('the Mac app: nell signs in with her name and password (no browser); her computer’s pass reaches the model; signing it out refuses it at once', async () => {
  // No admin step: any active account may sign in a computer (2026-11-17).
  const login = (body, headers = {}) => fetch(`${ORIGIN}/api/device/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const wrong = await login({ handle: 'nell', password: 'not her password at all', name: 'Nell’s MacBook', kind: 'mac' })
  assert(wrong.status === 401, `a wrong password: ${wrong.status}`)
  const r = await login({ handle: 'nell', password: PIA_PW, name: 'Nell’s MacBook', kind: 'mac' })
  // She turned on "Ask for my passkey too" above: the app gets a passkey ceremony for her passkeys
  // alone, to answer in its own passkey sheet (never a browser), and no key yet.
  const rj = await r.json()
  assert(r.status === 200 && rj.passkey === true && rj.ceremony && rj.options?.allowCredentials?.length >= 1 && !rj.token, `with the switch on: ${r.status} ${Object.keys(rj)}`)
  admin('require-passkey', 'nell', 'off')
  const ok = await login({ handle: 'nell', password: PIA_PW, name: 'Nell’s MacBook', kind: 'mac' })
  const s = await ok.json()
  assert(ok.status === 200 && /^olap1\./.test(s.token) && s.person.handle === 'nell' && s.known, `sign-in: ${ok.status}`)
  const door = (p, init = {}) => fetch(`${ORIGIN}/api/device/gw/${p}`, { ...init, headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })
  await until(async () => (await door('v1/models')).status === 200, 8000, 'the gateway learning her caller')
  const chat = await door('v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'general', messages: [{ role: 'user', content: 'Say hello in five words.' }] }) })
  assert(chat.status === 200, `chat through the door: ${chat.status}`)
  for (const p of ['/api/me', '/api/files', '/oc/api/session', '/api/account']) assert((await fetch(`${ORIGIN}${p}`, { headers: { authorization: `Bearer ${s.token}`, 'x-ola-workspace': FA } })).status === 401, p)
  // Your account lists the computer; signing it out refuses the pass on its next request.
  await P.page.goto(`${ORIGIN}/#/account`)
  await P.page.waitForFunction(() => document.body.innerText.includes('Nell’s MacBook'), null, { timeout: 10_000 })
  if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, 'account-computer-1280.png'), fullPage: true })
  const list = await api('/api/devices', { cookie: (await cookieOf(P.ctx)).value })
  const dev = list.json.devices.find((d) => d.name === 'Nell’s MacBook')
  const rm = await api(`/api/devices/${dev.id}`, { method: 'DELETE', cookie: (await cookieOf(P.ctx)).value, csrf: (await signedIn(P)).csrf })
  assert(rm.status === 200, `remove: ${rm.status}`)
  assert((await door('v1/models')).status === 401, 'the pass still works after sign-out')
  // The browser way works for a person who signed in with a password too (the apps' existing path):
  // her session approves a computer, the code and its verifier give a pass that reaches the model.
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const g = await api('/api/device/grant', { method: 'POST', cookie: (await cookieOf(P.ctx)).value, csrf: (await signedIn(P)).csrf, body: JSON.stringify({ challenge, name: 'Nell’s iMac', kind: 'mac', port: 51999 }), headers: { 'content-type': 'application/json' } })
  assert(g.status === 200 && g.json.code, `grant: ${g.status}`)
  const t = await fetch(`${ORIGIN}/api/device/token`, { method: 'POST', headers: { authorization: `Bearer ${g.json.code}`, 'content-type': 'application/json' }, body: JSON.stringify({ verifier }) })
  const tj = await t.json()
  assert(t.status === 200 && /^olap1\./.test(tj.token), `token: ${t.status}`)
  // She has a live computer again: the gateway learns her caller anew (a second or two).
  await until(async () => (await fetch(`${ORIGIN}/api/device/gw/v1/models`, { headers: { authorization: `Bearer ${tj.token}` } })).status === 200, 8000, 'the browser-way pass reaching the model')
  return 'password sign-in in the app and the browser way, chat 200, refused after sign-out'
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
await check('sign out, then sign in again with the passkey (the quiet link, shown because this browser has used one)', async () => {
  const before = a.cookie
  await A.page.getByRole('button', { name: 'Sign out' }).click()
  await A.page.getByRole('button', { name: 'Use a passkey instead' }).waitFor()
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
// ---------------------------------------------------------------- the apps' cloud (OLA-150)
// The Mac and iPhone apps, signed in with a name and password, reach the person's projects through
// /api/device/ with their pass: the same conversations and files as the browser, the same checks.
await check("the apps' cloud: a device signed in as alice lists her project and sees the conversations her browser sees, makes one both see, reads the files; vera (viewer) reads but cannot ask; bob and no pass are refused; an open stream ends at sign-out", async () => {
  const signIn = async (handle) => {
    const r = await fetch(`${ORIGIN}/api/device/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle, password: PW[handle], name: 'Made-up iPhone', kind: 'mac' }) })
    const j = await r.json()
    assert(r.status === 200 && j.token, `${handle}'s device sign-in: ${r.status}`)
    return j.token
  }
  const dev = async (token, p, init = {}) => {
    const r = await fetch(`${ORIGIN}${p}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) } })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: r.status, json }
  }
  const [ta, tv, tb] = [await signIn('alice'), await signIn('vera'), await signIn('bob')]
  const W = `/api/device/w/${FA}`
  const pr = await dev(ta, '/api/device/projects')
  assert(pr.status === 200 && pr.json.projects.map((x) => `${x.slug}:${x.role}`).join() === `${FA}:owner`, `alice's projects: ${JSON.stringify(pr.json)}`)
  const info = await dev(ta, `${W}/oc/api/info`)
  assert(info.status === 200 && info.json.data.project === FA, `info ${info.status}`)
  const ids = (r) => (Array.isArray(r.json) ? r.json : r.json?.data ?? []).map((x) => x.id).sort().join()
  const web0 = await api('/oc/api/session', { cookie: a.cookie, ws: FA })
  const app0 = await dev(ta, `${W}/oc/api/session?limit=100`)
  assert(web0.status === 200 && app0.status === 200 && ids(web0) === ids(app0), `before: web ${web0.status} [${ids(web0)}], app ${app0.status} [${ids(app0)}]`)
  const made = await dev(ta, `${W}/oc/api/session`, { method: 'POST', body: JSON.stringify({ title: 'Made-up, from the app', metadata: { autonomy: 'ask' } }) })
  const id = made.json?.data?.id ?? made.json?.id
  assert(made.status === 200 && id, `a new conversation from the app: ${made.status}`)
  const web1 = await api('/oc/api/session', { cookie: a.cookie, ws: FA })
  const app1 = await dev(ta, `${W}/oc/api/session?limit=100`)
  assert(ids(web1) === ids(app1) && ids(web1).split(',').includes(id), `after: web [${ids(web1)}], app [${ids(app1)}]`)
  const active = await dev(ta, `${W}/oc/api/session/active`)
  assert(active.status === 200, `active ${active.status}`)
  const fw = await api('/api/files', { cookie: a.cookie, ws: FA })
  const fa = await dev(ta, `${W}/api/files`)
  assert(fa.status === 200 && JSON.stringify(fa.json.files.map((f) => f.path)) === JSON.stringify(fw.json.files.map((f) => f.path)), `files: app ${fa.status}`)
  // vera, a viewer: reads, cannot ask Ola.
  assert((await dev(tv, `${W}/oc/api/session`)).status === 200, "vera's list")
  const vp = await dev(tv, `${W}/oc/api/session/${id}/prompt`, { method: 'POST', body: JSON.stringify({ text: 'hello' }) })
  assert(vp.status === 403, `vera's prompt: ${vp.status}`)
  // bob: his own project only; alice's is not there for him at all.
  const bp = await dev(tb, '/api/device/projects')
  assert(bp.json.projects.map((x) => x.slug).join() === FB, `bob's projects: ${JSON.stringify(bp.json)}`)
  const wrong = []
  const cases = [
    [tb, 'GET', `${W}/oc/api/session`, 404], [tb, 'GET', `${W}/oc/api/info`, 404], [tb, 'GET', `${W}/api/files`, 404],
    [null, 'GET', '/api/device/projects', 401], [null, 'GET', `${W}/oc/api/session`, 401], ['olap1.made-up', 'GET', `${W}/oc/api/session`, 401],
    [ta, 'GET', `${W}/oc/api/config`, 403], [ta, 'GET', `${W}/api/project`, 404], [ta, 'DELETE', `${W}/api/files/x.csv`, 404], [ta, 'POST', '/api/device/projects', 405],
    // The project's fallbacks and a hosted run (OLA-337): its members only; the other routes stay shut.
    [tb, 'GET', `${W}/api/fallback`, 404], [tb, 'POST', `${W}/api/hosted/run`, 404], [ta, 'POST', `${W}/api/fallback`, 404], [ta, 'POST', `${W}/api/hosted/settings`, 404], [ta, 'POST', `${W}/api/claude/run`, 404],
    // The look at the files before a publish yes (OLA-325): the owner's only; publishing itself stays shut here.
    [tb, 'GET', `${W}/api/site/preview?page=x.html`, 404], [tv, 'GET', `${W}/api/site/preview?page=x.html`, 403], [ta, 'POST', `${W}/api/site/preview`, 404], [ta, 'POST', `${W}/api/site/publish`, 404], [ta, 'POST', `${W}/api/site/unpublish`, 404],
  ]
  for (const [t, m, p, want] of cases) {
    const r = await dev(t, p, { method: m })
    if (r.status !== want) wrong.push(`${m} ${p} ${r.status} (wanted ${want})`)
  }
  assert(!wrong.length, wrong.join(', '))
  // The Mac app in a cloud project (OLA-337): the project's fallbacks with the picked choices, a
  // viewer cannot hand a request over, and a model the machine does not offer is refused, nothing run.
  const fb = await dev(ta, `${W}/api/fallback`)
  assert(fb.status === 200 && fb.json.hosted.configured === true && JSON.stringify(fb.json.hosted.picks.map((x) => x.id)) === '["deepseek-v4-pro"]' && fb.json.canChange === true, `fallback through the device route: ${fb.status} ${JSON.stringify(fb.json?.hosted)}`)
  const vr = await dev(tv, `${W}/api/hosted/run`, { method: 'POST', body: JSON.stringify({ request: 'x', conversation: id, once: true, model: 'deepseek-v4-pro' }) })
  assert(vr.status === 403, `vera's hosted run: ${vr.status}`)
  const unk = await dev(ta, `${W}/api/hosted/run`, { method: 'POST', body: JSON.stringify({ request: 'x', conversation: id, once: true, model: 'some-other-model' }) })
  assert(unk.status === 400 && unk.json.error === 'unknown_model', `a model not offered: ${unk.status} ${JSON.stringify(unk.json)}`)
  // An open event stream through the device route ends within seconds of the device's sign-out.
  const ctl = new AbortController()
  const st = { open: true, status: null }
  fetch(`${ORIGIN}${W}/oc/api/event`, { headers: { authorization: `Bearer ${tv}`, accept: 'text/event-stream' }, signal: ctl.signal })
    .then(async (r) => {
      st.status = r.status
      for await (const _ of r.body);
    })
    .catch(() => {})
    .finally(() => (st.open = false))
  await until(() => st.status === 200, 15_000, "vera's event stream opening")
  assert((await dev(tv, '/api/device/signout', { method: 'POST', body: '{}' })).status === 200, "vera's sign-out")
  await until(() => !st.open, 8000, "vera's stream ending after her sign-out")
  ctl.abort()
  for (const t of [ta, tb]) await dev(t, '/api/device/signout', { method: 'POST', body: '{}' })
  return `the same ${ids(web1).split(',').length} conversation(s) on both paths, one made from the app; ${fa.json.files.length} file(s); viewer 403 on asking; ${cases.length} refusals as wanted; the stream cut at sign-out`
})

// ---------------------------------------------------------------- devices (devices.mjs)
// The Mac app and the command line sign in through the browser. Here a made-up app: a secret, its
// challenge, and a listener on 127.0.0.1 where the browser lands with the code. This front desk runs
// without the TLS front, so a device sends its pass as `Authorization: Bearer` (ops/tls-test.mjs
// proves the front's half: the pass arriving as X-Ola-Pass, and every refusal at the door).
const PEOPLE_FILE = path.join(env.OLA_HOME, 'gateway-people')
const dbRowDevices = (sql) => {
  const d = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'))
  try {
    return d.prepare(sql).get()
  } finally {
    d.close()
  }
}
async function madeUpApp() {
  const S = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(S).digest('base64url')
  const hits = []
  const server = http.createServer((req, res) => {
    hits.push(req.url)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><meta charset="utf-8"><title>Made-up app</title><p>Made-up app: signed in. You can close this tab.</p>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  return { S, challenge, hits, port, link: (name, kind = 'mac') => `${ORIGIN}/#/device?challenge=${challenge}&port=${port}&name=${encodeURIComponent(name)}&kind=${kind}`, close: () => (server.closeAllConnections(), server.close()) }
}
/** A request as the app sends it: its pass as a bearer, no cookie, no Origin. */
const asDevice = (pathname, pass, { method = 'GET', body, headers = {} } = {}) => api(pathname, { method, origin: '', body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(pass ? { authorization: `Bearer ${pass}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } })
const redeem = (code, verifier) => asDevice('/api/device/token', code, { method: 'POST', body: { verifier } })
const codeOf = (hits) => new URL(hits.find((h) => h.includes('code=')) ?? '/', 'http://x').searchParams.get('code')
async function chromiumContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  return { ctx, page }
}
let dina = null
let dinaToken = null
await check('devices, in Chromium: from the app’s link a signed-out person signs in with their name and password, is asked "Sign in to Ola on <name>?" (the name as text), says yes, and lands on the app’s loopback with a code the app redeems', async () => {
  admin('add-person', 'dina', '--name', 'Dina D.')
  dina = await chromiumContext()
  await dina.page.goto(admin('invite', 'dina'))
  await dina.page.getByLabel('Choose a password').fill(PW.dina)
  await dina.page.getByRole('button', { name: 'Make my account' }).click()
  await dina.page.getByRole('button', { name: 'Sign out' }).click()
  await dina.page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
  const app = await madeUpApp()
  try {
    const name = 'Dina’s <b>Mac</b>'
    await dina.page.goto(app.link(name))
    await dina.page.getByLabel('Your name for Ola').waitFor()
    const lede = await dina.page.locator('.gate-lede').innerText()
    assert(lede.includes(`let Ola on ${name} in`), `signed out, the page said: ${lede}`)
    if (SHOTS) await dina.page.screenshot({ path: path.join(SHOTS, 'device-signin-first-1280.png') })
    await dina.page.getByLabel('Your name for Ola').fill('dina')
    await dina.page.getByLabel('Password', { exact: true }).fill(PW.dina)
    await dina.page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await dina.page.waitForSelector('.device-title', { timeout: 30_000 })
    const title = await dina.page.locator('.device-title').innerText()
    assert(title === `Sign in to Ola on ${name}?` && (await dina.page.locator('.device-title b').count()) === 0, `title ${title}`)
    assert((await dina.page.locator('.device-warn').innerText()) === 'Only continue if you just asked Ola on that computer to sign in.', 'the caution line')
    if (SHOTS) {
      for (const [w, h] of [[1280, 860], [390, 844]]) {
        await dina.page.setViewportSize({ width: w, height: h })
        await dina.page.waitForTimeout(250)
        await dina.page.screenshot({ path: path.join(SHOTS, `device-ask-${w}.png`) })
      }
      await dina.page.setViewportSize({ width: 1280, height: 860 })
    }
    await dina.page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await until(() => app.hits.some((h) => h.includes('code=')), 15_000, 'the browser at the app’s loopback')
    await dina.page.waitForURL(`http://127.0.0.1:${app.port}/**`, { timeout: 10_000 })
    const code = codeOf(app.hits)
    const r = await redeem(code, app.S)
    assert(r.status === 200 && r.json.token?.startsWith('olap1.') && r.json.person?.handle === 'dina' && r.json.device?.name === name && r.json.device?.kind === 'mac' && Date.parse(r.json.expires_at) > Date.now() + 179 * 86_400_000, `redeem ${r.status} ${JSON.stringify({ ...r.json, token: r.json?.token ? '…' : null })}`)
    dinaToken = r.json.token
    const me = await asDevice('/api/device/me', dinaToken)
    assert(me.status === 200 && me.json.person.handle === 'dina' && me.json.device.id === r.json.device.id, `me ${me.status}`)
    // Back at Ola, the request is gone from the address: Back does not offer it again.
    await dina.page.goBack()
    await dina.page.waitForSelector('.gate-title', { timeout: 10_000 })
    assert(!(await dina.page.locator('.device-title').count()), 'the request was offered again after Back')
    return `landed on 127.0.0.1:${app.port}/?code=…; redeemed: device #${r.json.device.id} until ${r.json.expires_at.slice(0, 10)}; /api/device/me 200`
  } finally {
    app.close()
  }
})

await check('devices, in WebKit: the same question, yes lands on the app’s loopback (from http://localhost) and the code redeems; Cancel tells the app and signs nothing in', async () => {
  const { webkit } = await import('playwright')
  const wk = await webkit.launch()
  const app = await madeUpApp()
  const app2 = await madeUpApp()
  try {
    admin('add-person', 'wade', '--name', 'Wade W.')
    const link = admin('invite', 'wade')
    const ctx = await wk.newContext()
    const page = await ctx.newPage()
    await page.goto(link)
    await page.getByLabel('Choose a password').fill(PW.wade)
    await page.getByRole('button', { name: 'Make my account' }).click()
    await until(async () => (await page.evaluate(() => fetch('/api/me').then((r) => r.status))) === 200, 15_000, 'signed in in WebKit')
    await page.goto(app.link('Wade’s laptop', 'cli'))
    await page.waitForSelector('.device-title', { timeout: 15_000 })
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'device-ask-webkit-1280.png') })
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await until(() => app.hits.some((h) => h.includes('code=')), 15_000, 'WebKit at the app’s loopback')
    const r = await redeem(codeOf(app.hits), app.S)
    assert(r.status === 200 && r.json.device?.kind === 'cli' && r.json.person?.handle === 'wade', `redeem ${r.status}`)
    // Cancel: the app hears it, nothing is made.
    const before = JSON.parse(admin('devices', 'wade', '--json')).length
    await page.goto(app2.link('Wade’s other laptop'))
    await page.waitForSelector('.device-title', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await until(() => app2.hits.length > 0, 15_000, 'Cancel at the app’s loopback')
    assert(app2.hits[0] === '/?error=cancelled' && JSON.parse(admin('devices', 'wade', '--json')).length === before, `cancel: ${app2.hits[0]}`)
    await ctx.close()
    return 'yes: the code reached 127.0.0.1 and redeemed (cli); Cancel: ?error=cancelled, no device'
  } finally {
    app.close()
    app2.close()
    await wk.close()
  }
})

await check('devices: refused: a grant without CSRF, cross-site or from another origin, with a bad request; a wrong verifier (and the code is then spent), an expired code, a code from another key', async () => {
  const d = await signedIn(dina)
  const app = { S: randomBytes(32).toString('base64url') }
  app.challenge = createHash('sha256').update(app.S).digest('base64url')
  const body = (o = {}) => JSON.stringify({ challenge: app.challenge, name: 'Made-up Mac', kind: 'mac', ...o })
  const grant = (o = {}, { cookie = d.cookie, csrf = d.csrf, headers = {}, origin } = {}) => api('/api/device/grant', { method: 'POST', cookie, csrf, body: body(o), headers: { 'content-type': 'application/json', ...headers }, ...(origin !== undefined ? { origin } : {}) })
  const seen = {}
  seen.noCsrf = (await grant({}, { csrf: null })).status
  seen.crossSite = (await grant({}, { headers: { 'sec-fetch-site': 'cross-site' } })).status
  seen.otherOrigin = (await grant({}, { origin: 'https://evil.example' })).status
  seen.signedOut = (await grant({}, { cookie: null, csrf: null })).status
  for (const [k, o] of Object.entries({ shortChallenge: { challenge: 'abc' }, longName: { name: 'x'.repeat(61) }, controlName: { name: 'Mac\u0007' }, bidiName: { name: 'Mac‮niam' }, kind: { kind: 'ios' }, lowPort: { port: 80 }, textPort: { port: '5555' } })) seen[k] = (await grant(o)).status
  const want = { noCsrf: 403, crossSite: 403, otherOrigin: 403, signedOut: 401, shortChallenge: 400, longName: 400, controlName: 400, bidiName: 400, kind: 400, lowPort: 400, textPort: 400 }
  assert(JSON.stringify(seen) === JSON.stringify(want), `grants: ${JSON.stringify(seen)}`)
  // A wrong verifier spends the code: the right one after it is refused too.
  const c1 = (await grant()).json.code
  const wrong = await redeem(c1, randomBytes(32).toString('base64url'))
  const after = await redeem(c1, app.S)
  // Expired: good for 6 s in this check (120 by default).
  const c2 = (await grant()).json.code
  await sleep(6500)
  const late = await redeem(c2, app.S)
  // A code made with another key, a device token used as a code, no pass at all.
  const { makePass } = await import('../ops/pass.mjs')
  const forged = await redeem(makePass(randomBytes(32), 'code', Math.floor(Date.now() / 1000) + 60).pass, app.S)
  const tokenAsCode = await redeem(dinaToken, app.S)
  const none = await redeem(null, app.S)
  const got = [wrong, after, late, forged, tokenAsCode, none].map((r) => `${r.status} ${r.json?.error}`)
  assert(got.join(',') === Array(6).fill('401 invalid_code').join(','), got.join(', '))
  // dina signs her first computer out from the app (Sign Out), as the checks after this expect.
  assert((await asDevice('/api/device/signout', dinaToken, { method: 'POST', body: {} })).status === 200, 'sign out')
  assert((await asDevice('/api/device/me', dinaToken)).status === 401, 'a signed-out device still works')
  const refusedRows = JSON.parse(admin('audit', '--limit', '200', '--json')).filter((r) => r.action === 'device_refused').length
  assert(refusedRows >= 1, `device_refused rows: ${refusedRows}`)
  return `grants ${Object.values(seen).join(' ')}; redeems ${got.join(', ')}; ${refusedRows} device_refused rows`
})

let gwDevice = null
await check('devices: the token reaches the gateway as the person’s own caller (models, usage, web search under their standing grant, a streamed chat), only on the allowed routes, and works nowhere outside /api/device/', async () => {
  // A fresh device for dina.
  const out = node('frontdesk/admin.mjs', ['add-device', 'dina', '--name', 'Made-up Mac', '--kind', 'mac'])
  gwDevice = out.stdout.trim()
  const pid = dbRowDevices(`SELECT id FROM people WHERE handle = 'dina'`).id
  await sleep(3500) // the gateway reads the people file again within 3 s
  const models = await asDevice('/api/device/gw/v1/models', gwDevice)
  const usage = await asDevice('/api/device/gw/v1/usage', gwDevice)
  const search = await asDevice('/api/device/gw/web/search', gwDevice, { method: 'POST', body: { q: 'made-up tenant survey' } })
  assert(models.status === 200 && Array.isArray(models.json?.data), `models ${models.status} ${models.text.slice(0, 120)}`)
  assert(usage.status === 200 && usage.json.caller === `p-${pid}`, `usage ${usage.status} ${usage.json?.caller}`)
  assert(search.status === 200 && Array.isArray(search.json?.results), `search ${search.status} ${search.text.slice(0, 160)}`)
  let chat = 'skipped (the live run points the gateway at the outside model)'
  if (!LIVE) {
    const c = await asDevice('/api/device/gw/v1/chat/completions', gwDevice, { method: 'POST', body: { model: 'general', stream: true, messages: [{ role: 'user', content: 'say hi on one line' }] } })
    assert(c.status === 200 && c.headers.get('content-type')?.startsWith('text/event-stream') && c.text.includes('data: [DONE]'), `chat ${c.status} ${c.headers.get('content-type')} ${c.text.slice(0, 120)}`)
    chat = 'streamed chat 200 (text/event-stream, [DONE])'
    // OLA-303: the Mac's conversation id goes through to the gateway, and the Mac reads its own steps
    // (which model served each) for the record of who made each file. Until Nov 22 neither did.
    const since = Date.now() - 5000
    const sc = await asDevice('/api/device/gw/v1/chat/completions', gwDevice, { method: 'POST', body: { model: 'general', stream: true, messages: [{ role: 'user', content: 'say hi on one line' }] }, headers: { 'x-session-id': 'ses_madeupmac1' } })
    assert(sc.status === 200, `chat with a conversation id ${sc.status}`)
    const served = await asDevice(`/api/device/gw/v1/served?since=${since}&session=ses_madeupmac1&steps=1&caller=ws-x`, gwDevice)
    assert(served.status === 200 && served.json?.caller === `p-${pid}`, `served ${served.status} ${served.text.slice(0, 160)}`)
    assert(served.json.steps?.some((s) => s[1] === 'ses_madeupmac1' && s[2] === 'general'), `served steps ${JSON.stringify(served.json.steps)}`)
    assert((served.json.names?.general ?? 0) >= 1, `served names ${JSON.stringify(served.json.names)}`)
    assert((await asDevice('/api/device/gw/v1/served', gwDevice, { method: 'POST', body: {} })).status === 403, 'POST served')
    chat += '; its conversation id and served steps read back as the person’s own caller'
  }
  // Only the allowed routes, methods included; the device's own headers never reach the gateway's choice of lane.
  const embed = await asDevice('/api/device/gw/v1/embeddings', gwDevice, { method: 'POST', body: { input: 'x' } })
  const refused = {
    // allowed, and passed on: this check's gateway has no embedding server, and says so
    embeddings: `${embed.status} ${embed.json?.error?.type}`,
    anthropic: (await asDevice('/api/device/gw/anthropic/v1/messages', gwDevice, { method: 'POST', body: {} })).status,
    files: (await asDevice('/api/device/gw/v1/files', gwDevice, { method: 'POST', body: {} })).status,
    getChat: (await asDevice('/api/device/gw/v1/chat/completions', gwDevice)).status,
    postModels: (await asDevice('/api/device/gw/v1/models', gwDevice, { method: 'POST', body: {} })).status,
    bigSearch: (await asDevice('/api/device/gw/web/search', gwDevice, { method: 'POST', body: { q: 'x'.repeat(9000) } })).status,
    batchLane: (await asDevice('/api/device/gw/web/search', gwDevice, { method: 'POST', body: { q: 'x' }, headers: { 'x-ola-lane': 'batch', 'x-ola-job': 'abcdefabcdef' } })).status,
  }
  assert(refused.embeddings === '503 not_configured' && refused.anthropic === 403 && refused.files === 403 && refused.getChat === 403 && refused.postModels === 403 && refused.bigSearch === 413 && refused.batchLane === 200, JSON.stringify(refused))
  // The apps' probe with no credential: 401 while sign-in is open.
  const probe = await api('/api/device/me')
  assert(probe.status === 401 && probe.json?.error === 'signed_out', `probe ${probe.status}`)
  // The token outside /api/device/: as a bearer or an X-Ola-Pass, on the API, the opencode door and the page's own device list.
  const outside = []
  for (const p of ['/api/me', '/api/project', '/oc/api/session', '/api/devices', '/api/device/../me']) {
    outside.push((await asDevice(p, gwDevice, { headers: { 'x-ola-workspace': FA } })).status)
    outside.push((await api(p, { headers: { 'x-ola-pass': gwDevice, 'x-ola-workspace': FA } })).status)
  }
  assert(outside.every((s) => s === 401), `outside /api/device/: ${outside}`)
  // Without the TLS front a client's X-Ola-Pass is not read at all (only the front's would be).
  assert((await api('/api/device/me', { headers: { 'x-ola-pass': gwDevice } })).status === 401, 'X-Ola-Pass was read without the TLS front')
  return `models 200, usage as p-${pid}, search 200 (standing grant), ${chat}; refused ${JSON.stringify(refused)}; outside /api/device/ all 401`
})

await check('devices and the hosted open model: refused until the admin lets the person (app-hosted), then served as their own caller, on their weekly allowance and their own ceiling; their usage names the provider; off again refuses', async () => {
  assert(gwDevice, 'no device from the check before')
  const pid = dbRowDevices(`SELECT id FROM people WHERE handle = 'dina'`).id
  const ask = () => asDevice('/api/device/gw/v1/chat/completions', gwDevice, { method: 'POST', body: { model: 'hosted', messages: [{ role: 'user', content: 'Count the rows in survey.csv' }] } })
  const before = fakeHosted.calls()
  const off = await ask()
  assert(off.status === 403 && /hosted open model is off/.test(off.json?.error?.message ?? ''), `off: ${off.status} ${off.text.slice(0, 160)}`)
  assert(fakeHosted.calls() === before, 'a refused request reached the hosted model')
  const u0 = await asDevice('/api/device/gw/v1/usage', gwDevice)
  assert(u0.json?.hosted?.provider === HOSTED_UP.HOSTED_PROVIDER && u0.json?.hosted_month?.granted === false, `usage before: ${u0.text.slice(0, 200)}`)
  const said = admin('app-hosted', 'dina', 'on', '--cap-usd', '3')
  assert(/ON/.test(said) && /\$3\.00/.test(said), said)
  await until(async () => (await asDevice('/api/device/gw/v1/usage', gwDevice)).json?.hosted_month?.granted === true, 8000, 'the gateway taking dina’s hosted grant')
  let served = 'skipped (the live run points the hosted model outside)'
  if (!HOSTED_LIVE) {
    const ok = await ask()
    assert(ok.status === 200 && ok.json?.model === 'hosted' && fakeHosted.calls() > before, `on: ${ok.status} ${ok.text.slice(0, 160)}`)
    const u1 = await asDevice('/api/device/gw/v1/usage', gwDevice)
    assert(u1.json.hosted_month.requests >= 1 && u1.json.hosted_month.cap_micro_usd === 3_000_000 && u1.json.tokens_used > u0.json.tokens_used, `usage after: ${u1.text.slice(0, 260)}`)
    served = `served (${u1.json.hosted_month.requests} request, weekly tokens ${u0.json.tokens_used} -> ${u1.json.tokens_used})`
  }
  const audited = JSON.parse(admin('audit', '--limit', '50', '--json')).filter((r) => r.action === 'hosted_enabled' && r.subject === 'dina' && r.workspace == null).length
  assert(audited >= 1, 'app-hosted on was not audited')
  admin('app-hosted', 'dina', 'off')
  await until(async () => (await asDevice('/api/device/gw/v1/usage', gwDevice)).json?.hosted_month?.granted === false, 8000, 'the gateway dropping dina’s hosted grant')
  const again = await ask()
  assert(again.status === 403, `off again: ${again.status}`)
  // OLA-337: the grant follows the person's computers. Turned on with no Mac signed in, there is none;
  // their Mac signing in writes it at once (the Mac app asks right after, and offered only Ola when it
  // came later); signing out drops it.
  const bobId = dbRowDevices(`SELECT id FROM people WHERE handle = 'bob'`).id
  const bobGrant = () => Boolean(JSON.parse(readFileSync(path.join(env.OLA_HOME, 'gateway-hosted'), 'utf8'))[`p-${bobId}`])
  admin('app-hosted', 'bob', 'on')
  try {
    assert(!bobGrant(), 'a hosted grant for bob with no computer signed in')
    const r = await fetch(`${ORIGIN}/api/device/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'bob', password: PW.bob, name: 'Made-up Mac', kind: 'mac' }) })
    const tb = (await r.json()).token
    assert(r.status === 200 && tb, `bob's sign-in: ${r.status}`)
    assert(bobGrant(), 'bob signing in his Mac did not write his hosted grant')
    await fetch(`${ORIGIN}/api/device/signout`, { method: 'POST', headers: { authorization: `Bearer ${tb}`, 'content-type': 'application/json' }, body: '{}' })
    assert(!bobGrant(), 'bob signing out kept his hosted grant')
  } finally {
    admin('app-hosted', 'bob', 'off')
  }
  return `off 403, p-${pid} ${served}, off again 403; a Mac signing in writes its person's grant, signing out drops it`
})

await check('devices, behind the real TLS front with its gate switched on (https, a site passcode, the PROXY protocol; the gate is off by default) the code and the token pass the door as X-Ola-Pass and nowhere else; a bearer sent straight to the front desk is not read; Chromium and WebKit approve on https and land on http://127.0.0.1', async () => {
  // A second front desk on the same database, on the PROXY protocol, behind ops/tls.mjs serving
  // app.localhost with a made-up CA: the same path a device takes from outside.
  const dir = mkdtempSync(path.join(run, 'tls-'))
  const ssl = (...x) => {
    const r = spawnSync('openssl', x, { cwd: dir, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`openssl ${x[0]}: ${r.stderr.trim().split('\n').pop()}`)
  }
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key')
  ssl('req', '-x509', '-new', '-sha256', '-key', 'ca.key', '-subj', '/CN=Made-up test CA', '-days', '2', '-out', 'ca.pem')
  ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'key.pem')
  ssl('req', '-new', '-sha256', '-key', 'key.pem', '-subj', '/CN=app.localhost', '-out', 'csr.pem')
  writeFileSync(path.join(dir, 'ext.cnf'), 'subjectAltName=DNS:app.localhost\nextendedKeyUsage=serverAuth\n')
  ssl('x509', '-req', '-sha256', '-in', 'csr.pem', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '2', '-extfile', 'ext.cnf', '-out', 'leaf.pem')
  writeFileSync(path.join(dir, 'cert.pem'), readFileSync(path.join(dir, 'leaf.pem'), 'utf8') + readFileSync(path.join(dir, 'ca.pem'), 'utf8'))
  const FD2 = PORT + 1
  const TLSP = PORT + 2
  const O2 = `https://app.localhost:${TLSP}`
  const door = randomBytes(18).toString('base64url') // a made-up door passcode for this run
  const fd2 = start('frontdesk-tls', 'frontdesk/server.mjs', { OLA_FD_ORIGIN: O2, OLA_FD_PORT: String(FD2), OLA_FD_PROXY_PROTOCOL: '1', OLA_FD_IDLE_STOP_MIN: '0' })
  const front = start('tls', 'ops/tls.mjs', { OLA_TLS_LISTEN: `127.0.0.1:${TLSP}`, OLA_TLS_UPSTREAM: `127.0.0.1:${FD2}`, OLA_TLS_CERT_DIR: dir, OLA_TLS_SERVERNAME: 'app.localhost', OLA_TLS_PROXY_IN: '0', OLA_TLS_GATE: '1', OLA_TLS_GATE_PASSCODE: door })
  const CA = readFileSync(path.join(dir, 'ca.pem'))
  const { default: https } = await import('node:https')
  const viaFront = (p, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const r = https.request({ host: '127.0.0.1', port: TLSP, servername: 'app.localhost', ca: CA, path: p, method, headers: { host: `app.localhost:${TLSP}`, ...headers, ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}) } }, (res) => {
        let t = ''
        res.on('data', (d) => (t += d))
        res.on('end', () => {
          let j = null
          try {
            j = JSON.parse(t)
          } catch {}
          resolve({ status: res.statusCode, json: j, text: t })
        })
      })
      r.on('error', reject)
      r.end(body)
    })
  // Straight to the front desk's port with a PROXY line, as only the TLS front should.
  const straight = (p, headers) =>
    new Promise((resolve) => {
      const s = net.connect(FD2, '127.0.0.1', () => s.write(`PROXY TCP4 100.64.9.9 127.0.0.1 5000 ${FD2}\r\nGET ${p} HTTP/1.1\r\nHost: app.localhost:${TLSP}\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')}Connection: close\r\n\r\n`))
      let got = ''
      s.on('data', (d) => (got += d))
      s.on('close', () => resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(got)?.[1] ?? 0)))
      s.on('error', () => resolve(0))
    })
  const basic = { authorization: `Basic ${Buffer.from(`ola:${door}`).toString('base64')}` }
  const apps = []
  try {
    await until(async () => (await viaFront('/api/health', { headers: basic }).catch(() => ({}))).status === 200, 15_000, 'the TLS front and its front desk')
    // dina's session (the same database), with the https cookie's name.
    const ck = (await import('./auth.mjs')).sessionCookie(O2).name
    const cookie = `${ck}=${(await signedIn(dina)).cookie}`
    const me = await viaFront('/api/me', { headers: { ...basic, cookie } })
    assert(me.status === 200 && me.json?.devices?.allowed, `me through the front ${me.status}`)
    const app = await madeUpApp()
    apps.push(app)
    const g = await viaFront('/api/device/grant', { method: 'POST', headers: { ...basic, cookie, origin: O2, 'x-ola-csrf': me.json.csrf }, body: JSON.stringify({ challenge: app.challenge, name: 'Made-up Mac (production path)', kind: 'mac' }) })
    // The app's half carries no passcode: only its pass.
    const t = await viaFront('/api/device/token', { method: 'POST', headers: { authorization: `Bearer ${g.json?.code}` }, body: JSON.stringify({ verifier: app.S }) })
    assert(g.status === 200 && t.status === 200 && t.json.token, `grant ${g.status}, token ${t.status}`)
    const tok = t.json.token
    const got = {
      me: (await viaFront('/api/device/me', { headers: { authorization: `Bearer ${tok}` } })).status,
      apiMe: (await viaFront('/api/me', { headers: { authorization: `Bearer ${tok}` } })).status,
      page: (await viaFront('/', { headers: { authorization: `Bearer ${tok}` } })).status,
      forgedHeader: (await viaFront('/api/device/me', { headers: { ...basic, 'x-ola-pass': tok } })).status,
      straightBearer: await straight('/api/device/me', { authorization: `Bearer ${tok}` }),
      straightPass: await straight('/api/device/me', { 'x-ola-pass': tok }),
    }
    // With the passcode, the client's own X-Ola-Pass is removed at the door, so the front desk sees no pass.
    assert(got.me === 200 && got.apiMe === 401 && got.page === 401 && got.forgedHeader === 401 && got.straightBearer === 401 && got.straightPass === 200, JSON.stringify(got))
    // The browsers, on https, approving and landing on http://127.0.0.1.
    const engines = []
    const { webkit } = await import('playwright')
    // WebKit uses the system's resolver, which does not know app.localhost: a tiny proxy on loopback
    // tunnels it to the TLS front (Chromium resolves *.localhost to loopback itself).
    const proxy = net.createServer((c) => {
      c.once('data', (d) => {
        const m = /^CONNECT app\.localhost:(\d+) HTTP\/1\.[01]\r\n/.exec(d.toString('latin1'))
        if (!m || Number(m[1]) !== TLSP) return c.end('HTTP/1.1 403 Forbidden\r\n\r\n')
        const up = net.connect(TLSP, '127.0.0.1', () => (c.write('HTTP/1.1 200 Connection Established\r\n\r\n'), c.pipe(up), up.pipe(c)))
        up.on('error', () => c.destroy())
      })
      c.on('error', () => {})
    })
    await new Promise((r) => proxy.listen(0, '127.0.0.1', r))
    try {
      for (const [engine, launch] of [['Chromium', () => browser], ['WebKit', () => webkit.launch({ proxy: { server: `http://127.0.0.1:${proxy.address().port}`, bypass: '127.0.0.1' } })]]) {
        const b = await launch()
        const appB = await madeUpApp()
        apps.push(appB)
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, httpCredentials: { username: 'ola', password: door } })
        try {
          await ctx.addCookies([{ name: ck, value: cookie.slice(ck.length + 1), url: O2, secure: true, httpOnly: true, sameSite: 'Strict' }])
          const page = await ctx.newPage()
          await page.goto(appB.link(`Made-up ${engine}`).replace(ORIGIN, O2))
          await page.waitForSelector('.device-title', { timeout: 20_000 })
          await page.getByRole('button', { name: 'Sign in', exact: true }).click()
          await until(() => appB.hits.some((h) => h.includes('code=')), 15_000, `${engine} at the app’s loopback from https`)
          const r = await viaFront('/api/device/token', { method: 'POST', headers: { authorization: `Bearer ${codeOf(appB.hits)}` }, body: JSON.stringify({ verifier: appB.S }) })
          assert(r.status === 200, `${engine}: redeem ${r.status}`)
          engines.push(engine)
        } finally {
          await ctx.close()
          if (b !== browser) await b.close()
        }
      }
    } finally {
      proxy.close()
    }
    return `through the front: grant 200, token 200 with no passcode, ${JSON.stringify(got)}; from ${O2}: ${engines.join(' and ')} landed on http://127.0.0.1 and redeemed`
  } finally {
    // The computers this check signed in are signed out again, so the checks after it start clean.
    for (const x of JSON.parse(admin('devices', 'dina', '--json'))) if (!x.revoked && /production path|^Made-up (Chromium|WebKit)$/.test(x.name)) admin('revoke-device', String(x.id))
    for (const a2 of apps) a2.close()
    fd2.kill('SIGTERM')
    front.kill('SIGTERM')
  }
})

await check('devices: an open model request is cut within two seconds when the device is removed in the page; the person sees their devices and removes one', async () => {
  const shots = []
  // dina has no project: her devices are on the projects page.
  await dina.page.goto(`${ORIGIN}/#/`)
  await dina.page.reload()
  await dina.page.locator('.your-devices .device-row-name', { hasText: /^Made-up Mac$/ }).waitFor({ timeout: 15_000 })
  const rows = await dina.page.locator('.your-devices .device-row-name').allInnerTexts()
  assert(rows.includes('Made-up Mac'), `the list: ${rows}`)
  if (SHOTS) {
    for (const [w, h] of [[1280, 860], [390, 844]]) {
      await dina.page.setViewportSize({ width: w, height: h })
      await dina.page.waitForTimeout(250)
      await dina.page.screenshot({ path: path.join(SHOTS, `devices-projects-${w}.png`), fullPage: true })
    }
    await dina.page.setViewportSize({ width: 1280, height: 860 })
  }
  let cut = 'skipped (live run)'
  if (!LIVE) {
    // A request the model holds 8 s, then Remove: the stream must end within two seconds.
    const ctl = new AbortController()
    const st = { status: null, ended: null }
    fetch(`${ORIGIN}/api/device/gw/v1/chat/completions`, { method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${gwDevice}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'general', stream: true, messages: [{ role: 'user', content: 'slow 1x8000' }], tools: [{ type: 'function', function: { name: 'noop', description: 'nothing', parameters: { type: 'object', properties: {} } } }] }) })
      .then(async (r) => {
        st.status = r.status
        for await (const _ of r.body);
      })
      .catch(() => {})
      .finally(() => (st.ended = Date.now()))
    await sleep(1500)
    assert(st.ended === null, 'the request ended before the removal')
    const t0 = Date.now()
    await dina.page.getByRole('button', { name: 'Remove Made-up Mac', exact: true }).click()
    await until(() => st.ended !== null, 5000, 'the cut')
    assert(st.ended - t0 < 2500, `cut after ${st.ended - t0} ms`)
    cut = `cut ${st.ended - t0} ms after Remove`
  } else await dina.page.getByRole('button', { name: 'Remove Made-up Mac', exact: true }).click()
  await until(async () => !(await dina.page.locator('.your-devices .device-row-name', { hasText: /^Made-up Mac$/ }).count()), 5000, 'the row gone')
  assert((await asDevice('/api/device/me', gwDevice)).status === 401, 'the removed device still works')
  shots.push(cut)
  // In a project, the list is under Settings: alice, a device added by the admin.
  const tok = node('frontdesk/admin.mjs', ['add-device', 'alice', '--name', 'Alice’s made-up Mac', '--kind', 'mac']).stdout.trim()
  try {
    await A.page.goto(`${ORIGIN}/?w=${FA}#/settings`)
    await A.page.reload()
    await A.page.waitForSelector('.settings .your-devices .device-row', { timeout: 20_000 })
    if (SHOTS) await A.page.locator('.settings .your-devices').screenshot({ path: path.join(SHOTS, 'devices-settings-1280.png') })
    await A.page.getByRole('button', { name: 'Remove Alice’s made-up Mac' }).click()
    await until(async () => (await asDevice('/api/device/me', tok)).status === 401, 5000, 'alice’s device signed out')
  } finally {}
  return `${cut}; the projects page and Settings list the devices; Remove signs one out`
})

await check('devices: add-device writes only the token to stdout; the people file is 600, replaced by rename, and untouched by ws.mjs rewriting the tokens file; revoke-device, revoke-sessions and suspend sign devices out and take the person out of the file', async () => {
  const add = node('frontdesk/admin.mjs', ['add-device', 'dina', '--name', 'Made-up CLI', '--kind', 'cli'])
  assert(add.status === 0 && /^olap1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/.test(add.stdout), `stdout is not exactly one token line (${add.stdout.split('\n').length - 1} lines)`)
  const tok = add.stdout.trim()
  assert(!add.stderr.includes(tok.slice(6, 30)), 'the token is on stderr too')
  const st1 = statSync(PEOPLE_FILE)
  const pid = dbRowDevices(`SELECT id FROM people WHERE handle = 'dina'`).id
  const text = readFileSync(PEOPLE_FILE, 'utf8')
  assert((st1.mode & 0o777) === 0o600 && new RegExp(`^GATEWAY_TOKENS=(p-\\d+:[0-9a-f]{48},)*p-${pid}:[0-9a-f]{48}(,p-\\d+:[0-9a-f]{48})*\\n$`).test(text), `the people file: mode ${(st1.mode & 0o777).toString(8)}, shape ${text.replace(/[0-9a-f]{48}/g, '…')}`)
  // ws.mjs rewrites its own file (as a workspace's create or rotation does): the people file is not touched.
  const tokens = path.join(env.OLA_HOME, 'gateway-tokens')
  const before = statSync(tokens).ino
  const w = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(path.join(AI, 'workspace/ws.mjs'))}); m.writeGatewayTokens()`], { env, encoding: 'utf8' })
  assert(w.status === 0 && statSync(tokens).ino !== before, `ws.mjs did not rewrite its file (${w.status})`)
  const st2 = statSync(PEOPLE_FILE)
  assert(st2.ino === st1.ino && readFileSync(PEOPLE_FILE, 'utf8') === text, 'the people file changed when ws.mjs wrote its own')
  await sleep(3500)
  assert((await asDevice('/api/device/gw/v1/models', tok)).status === 200, 'the person’s caller was lost after the ws.mjs rewrite')
  // revoke-device: refused at once; and with no live device the person leaves the file (replaced by rename).
  const id = JSON.parse(admin('devices', 'dina', '--json')).find((x) => x.name === 'Made-up CLI' && !x.revoked).id
  admin('revoke-device', String(id))
  assert((await asDevice('/api/device/me', tok)).status === 401, 'revoke-device')
  const st3 = statSync(PEOPLE_FILE)
  assert(st3.ino !== st1.ino && !readFileSync(PEOPLE_FILE, 'utf8').includes(`p-${pid}:`) && (st3.mode & 0o777) === 0o600, 'the person is still in the file')
  // revoke-sessions and suspend end devices too.
  const t2 = node('frontdesk/admin.mjs', ['add-device', 'dina', '--name', 'Made-up CLI 2', '--kind', 'cli']).stdout.trim()
  admin('revoke-sessions', 'dina')
  const afterRevoke = (await asDevice('/api/device/me', t2)).status
  admin('add-person', 'sam', '--name', 'Sam S.')
  dbRowDevices(`UPDATE people SET status = 'active' WHERE handle = 'sam' RETURNING id`)
  const t3 = node('frontdesk/admin.mjs', ['add-device', 'sam', '--name', 'Made-up Mac', '--kind', 'mac']).stdout.trim()
  const samOk = (await asDevice('/api/device/me', t3)).status
  admin('suspend', 'sam')
  const afterSuspend = (await asDevice('/api/device/me', t3)).status
  assert(afterRevoke === 401 && samOk === 200 && afterSuspend === 401, `revoke-sessions ${afterRevoke}, sam ${samOk} then suspended ${afterSuspend}`)
  // An app signs itself out.
  const t4 = node('frontdesk/admin.mjs', ['add-device', 'dina', '--name', 'Made-up CLI 3', '--kind', 'cli']).stdout.trim()
  const out = await asDevice('/api/device/signout', t4, { method: 'POST', body: {} })
  assert(out.status === 200 && (await asDevice('/api/device/me', t4)).status === 401, `signout ${out.status}`)
  const words = new Set(JSON.parse(admin('audit', '--limit', '400', '--json')).map((r) => r.action))
  assert(['device_signed_in', 'device_signed_out', 'device_revoked', 'device_refused'].every((x) => words.has(x)), `audit words: ${[...words].filter((x) => x.startsWith('device_'))}`)
  // The database holds the token's sha256 only, never the token.
  const raw = readFileSync(path.join(env.OLA_FD_DATA, 'platform.db'))
  assert(![tok, t2, t3, t4].some((t) => raw.includes(Buffer.from(t))), 'a device token is in the database file')
  return `one stdout line; people file 600, same inode across a ws.mjs rewrite, new inode after revoke-device; revoke-sessions, suspend, signout all 401 after`
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
  // OLA-371: a file Ola writes over after the upload is Ola's, not "you uploaded".
  {
    const page = { name: 'ola371-page.html', bytes: Buffer.from('<!doctype html><title>Made-up page</title><p>uploaded</p>\n') }
    const pageFile = path.join(run, page.name)
    writeFileSync(pageFile, page.bytes)
    await A.page.setInputFiles('#file-picker', pageFile)
    await A.page.locator('table.files', { hasText: page.name }).first().waitFor({ timeout: 30_000 })
    const before = (await api('/api/files', { cookie: a.cookie, ws: FA })).json.files.find((f) => f.path === page.name)
    assert(before?.origin === 'uploaded', `just uploaded: ${JSON.stringify(before)}`)
    spawnSync(CTR, ['exec', `ola-${FA}`, 'python3', '-I', '-c', `open("/work/${page.name}", "w").write("<!doctype html><title>Made-up page</title><p>rewritten by Ola</p>\\n")`])
    const after = (await api('/api/files', { cookie: a.cookie, ws: FA })).json.files.find((f) => f.path === page.name)
    assert(after?.origin === 'made' && after.uploaded === null, `rewritten by Ola, still listed as: ${JSON.stringify(after)}`)
    await api(`/api/files/${page.name}`, { method: 'DELETE', cookie: a.cookie, csrf: a.csrf, ws: FA })
  }
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
await check('a project home shows the links the admin set (OLA-103), https only, and loses one when it is removed', async () => {
  const bad = node('frontdesk/admin.mjs', ['link', FA, '--label', 'Plain', '--url', 'http://example.org/'])
  assert(bad.status !== 0 && /https/.test(bad.stderr), `http accepted: ${bad.status} ${bad.stderr}`)
  admin('link', FA, '--label', 'Made-up almanac', '--url', 'https://example.org/almanac/', '--note', 'Runs on Claude, outside Ola')
  admin('link', FA, '--label', 'Made-up library', '--url', 'https://example.org/mrd')
  try {
    const r = await api('/api/project', { cookie: a.cookie, ws: FA })
    const got = JSON.stringify(r.json?.links)
    assert(r.status === 200 && got === JSON.stringify([{ label: 'Made-up almanac', url: 'https://example.org/almanac/', note: 'Runs on Claude, outside Ola' }, { label: 'Made-up library', url: 'https://example.org/mrd' }]), `${r.status} ${got}`)
    const first = /^#(\d+) Made-up almanac/m.exec(admin('links', FA))
    admin('unlink', FA, first[1])
    const after = await api('/api/project', { cookie: a.cookie, ws: FA })
    assert(after.json?.links?.length === 1 && after.json.links[0].label === 'Made-up library', JSON.stringify(after.json?.links))
    return 'two links in the payload, in order, with the note; http refused; one removed'
  } finally {
    for (const m of admin('links', FA).matchAll(/^#(\d+) /gm)) admin('unlink', FA, m[1])
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

await check('"Open": a grant answers only the address that opened it (a leaked link from elsewhere gets a 404), learns a second address only with the opener\'s cookie, and ends after 2 hours (OLA-96, test/views.test.mjs)', async () => {
  const u = spawnSync(process.execPath, ['--test', path.join(HERE, 'test/views.test.mjs')], { encoding: 'utf8', timeout: 60_000 })
  assert(u.status === 0, u.stdout.split('\n').filter((l) => /not ok|Error|✖/.test(l)).slice(0, 3).join(' | '))
  return `${/ℹ pass (\d+)/.exec(u.stdout)?.[1] ?? '?'} unit checks`
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
// Reading real documents and Open for every kind (check-docs.mjs), in Chromium and WebKit.
await (await import('./check-docs.mjs')).docChecks({ check, assert, api, A, a, v, FA, CTR, ORIGIN, CK, SHOTS, sleep, until, auditRows, dataDir: env.OLA_FD_DATA, live: LIVE })

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

// ---------------------------------------------------------------- Publish (OLA-209)
// Pages written inside alice's sealed VM, published through the front desk to the stand-in for
// Vercel (web/server/fake-vercel.mjs), whose own origin plays sites.ola.cx.
const plantFiles = (files) => {
  const py = 'import json, os, sys\nfor k, v in json.loads(sys.stdin.read()).items():\n    os.makedirs(os.path.dirname("/work/" + k), exist_ok=True)\n    open("/work/" + k, "w").write(v)\n'
  const w = spawnSync(CTR, ['exec', '-i', `ola-${FA}`, 'python3', '-I', '-c', py], { input: JSON.stringify(files), encoding: 'utf8' })
  assert(w.status === 0, `could not write inside the workspace: ${w.stderr}`)
}
const flyerPage = (title) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="look.css"></head>` +
  `<body><h1 id="h">${title}</h1><p>Thursday at 7, the community room.</p><img id="pic" src="pics/dot.svg" alt="A dot" width="9" height="9">` +
  `<script>try { localStorage.setItem('x', '1'); document.body.dataset.storage = 'open' } catch { document.body.dataset.storage = 'blocked' }</script></body></html>`
const auditOf = (actions) => JSON.parse(admin('audit', '--workspace', FA, '--json', '--limit', '200')).filter((r) => actions.includes(r.action))
await check('Publish: the owner gets exactly the files that go public and the address; a member, a viewer and bob are refused; nothing leaves on a look', async () => {
  plantFiles({ 'flyer/flyer.html': flyerPage('Made-up tenants flyer'), 'flyer/look.css': 'h1 { color: rgb(1, 2, 3) } body { margin: 16px }', 'flyer/pics/dot.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><rect width="9" height="9"/></svg>', 'flyer/notes.txt': 'not used by the page' })
  const calls = vercel.calls.length
  const r = await api('/api/site/preview?page=flyer%2Fflyer.html', { cookie: a.cookie, ws: FA })
  assert(r.status === 200, `owner preview ${r.status} ${r.text.slice(0, 200)}`)
  const names = r.json.items.map((i) => i.as)
  assert(JSON.stringify(names) === JSON.stringify(['index.html', 'look.css', 'pics/dot.svg']), `files ${JSON.stringify(names)}`)
  assert(r.json.url === `${vercel.origin}/${FA}/` && /takes down/.test(r.json.acceptableUse), `${r.json.url}`)
  const st = await api('/api/site', { cookie: v.cookie, ws: FA })
  assert(st.status === 200 && st.json.canPublish === false && st.json.published === null, `viewer status ${st.status} ${st.text}`)
  const viewer = await api('/api/site/preview?page=flyer%2Fflyer.html', { cookie: v.cookie, ws: FA })
  const viewerPub = await api('/api/site/publish', { method: 'POST', cookie: v.cookie, csrf: v.csrf, ws: FA, body: JSON.stringify({ page: 'flyer/flyer.html', fingerprint: r.json.fingerprint, confirm: true }) })
  const bobs = await api('/api/site/preview?page=flyer%2Fflyer.html', { cookie: b.cookie, ws: FA })
  admin('add-member', 'team-a', 'vera', 'member')
  let member
  try {
    member = await api('/api/site/publish', { method: 'POST', cookie: v.cookie, csrf: v.csrf, ws: FA, body: JSON.stringify({ page: 'flyer/flyer.html', fingerprint: r.json.fingerprint, confirm: true }) })
  } finally {
    admin('add-member', 'team-a', 'vera', 'viewer')
  }
  assert(viewer.status === 403 && viewerPub.status === 403 && member.status === 403 && /owner/.test(member.json?.message) && bobs.status === 404, `viewer ${viewer.status}/${viewerPub.status}, member ${member.status}, bob ${bobs.status}`)
  const noYes = await api('/api/site/publish', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ page: 'flyer/flyer.html', fingerprint: r.json.fingerprint }) })
  assert(noYes.status === 400, `a publish without the yes: ${noYes.status}`)
  assert(vercel.calls.length === calls, 'something was sent to the host')
  return `${names.length} files at ${r.json.url}; notes.txt left out`
})
await check('Publish: a key in what a page uses, the workspace’s own key, a .env in a folder, the database: refused in plain words, nothing leaves, audited', async () => {
  const own = secretsOf(FA).BOX_API_KEY
  plantFiles({ 'leak/index.html': '<!doctype html><title>Made-up leaky page</title><script src="app.js"></script>', 'leak/app.js': 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"', 'mine/index.html': `<!doctype html><title>Mine</title><p>${own}</p>`, 'envy/index.html': '<p>hi</p>', 'envy/.env': 'TOKEN=abc', 'dbpage/index.html': '<img src="../project.db">' })
  const calls = vercel.calls.length
  const before = auditOf(['site_refused']).length
  const tries = [['page=leak%2Findex.html', /leak\/app\.js/], ['page=mine%2Findex.html', /own keys/], ['folder=envy', /\.env/], ['page=dbpage%2Findex.html', null]]
  const bad = []
  for (const [q, re] of tries) {
    const r = await api(`/api/site/preview?${q}`, { cookie: a.cookie, ws: FA })
    if (re ? r.status !== 422 || !re.test(r.json?.message) : r.status !== 200 || r.json.items.length !== 1 || !r.json.warnings.some((w) => /outside/.test(w))) bad.push(`${q}: ${r.status} ${r.json?.message ?? r.json?.warnings}`)
    if (/sk-ant|abc/.test(r.text) || (own && r.text.includes(own))) bad.push(`${q}: the secret was echoed`)
  }
  const pub = await api('/api/site/publish', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ page: 'leak/index.html', fingerprint: 'x', confirm: true }) })
  if (pub.status !== 422) bad.push(`publish ${pub.status}`)
  if (vercel.calls.length !== calls) bad.push('something was sent to the host')
  const refused = auditOf(['site_refused']).length - before
  if (refused !== 4) bad.push(`${refused} site_refused rows`)
  assert(!bad.length, bad.join('; '))
  return 'four refusals, one database left out as outside its folder'
})
let publicUrl = null
await check('Publish through the page: the sheet lists the files and the address, a yes publishes; signed out at 390 px the page loads with its own style and picture, sandboxed (no storage)', async () => {
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
  const card = A.page.locator('.thing-slot[data-kind="site"]', { hasText: 'Made-up tenants flyer' })
  await card.waitFor({ timeout: 30_000 })
  await card.getByRole('button', { name: /^Publish/ }).click()
  const sheet = A.page.locator('dialog.publish-sheet')
  await sheet.locator('.publish-files li').first().waitFor({ timeout: 30_000 })
  const names = await sheet.locator('.publish-name').allInnerTexts()
  assert(JSON.stringify(names) === JSON.stringify(['index.html', 'look.css', 'pics/dot.svg']), `files ${JSON.stringify(names)}`)
  await sheet.getByRole('button', { name: 'Publish these three files', exact: true }).click()
  await sheet.locator('.publish-done').waitFor({ timeout: 30_000 })
  publicUrl = await sheet.locator('.publish-done a').getAttribute('href')
  assert(publicUrl === `${vercel.origin}/${FA}/`, publicUrl)
  if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'publish-sheet.png') })
  await A.page.keyboard.press('Escape')
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const p = await visitor.newPage()
    const res = await p.goto(publicUrl)
    const s = await p.evaluate(() => ({ title: document.title, color: getComputedStyle(document.getElementById('h')).color, img: document.getElementById('pic').naturalWidth, storage: document.body.dataset.storage, wide: document.documentElement.scrollWidth > innerWidth }))
    const csp = res.headers()['content-security-policy'] ?? ''
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'published-390.png') })
    assert(res.status() === 200 && s.title === 'Made-up tenants flyer' && s.color === 'rgb(1, 2, 3)' && s.img === 9 && !s.wide, JSON.stringify(s))
    assert(s.storage === 'blocked' && /^sandbox allow-scripts/.test(csp) && !csp.includes('allow-same-origin'), `storage ${s.storage}, csp ${csp}`)
  } finally {
    await visitor.close()
  }
  const rows = auditOf(['site_published'])
  assert(rows.length === 1 && rows[0].actor === 'alice' && rows[0].size > 0 && rows[0].sha256, JSON.stringify(rows))
  return publicUrl
})
await check('Publish again updates the public page (audited as an update); Unpublish in the sheet takes it down: 404, and the host keeps no older deployment', async () => {
  plantFiles({ 'flyer/flyer.html': flyerPage('Made-up tenants flyer, new time') })
  const pre = await api('/api/site/preview?page=flyer%2Fflyer.html', { cookie: a.cookie, ws: FA })
  assert(pre.json?.published?.url === publicUrl, `published ${JSON.stringify(pre.json?.published)}`)
  const r = await api('/api/site/publish', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ page: 'flyer/flyer.html', fingerprint: pre.json.fingerprint, confirm: true }) })
  assert(r.status === 200 && r.json.again === true && r.json.live === true, `republish ${r.status} ${r.text.slice(0, 200)}`)
  assert((await (await fetch(publicUrl)).text()).includes('new time'), 'not updated')
  assert(vercel.deployments().length === 1, `${vercel.deployments().length} deployments kept`)
  await A.page.goto('about:blank')
  await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
  const card = A.page.locator('.thing-slot[data-kind="site"]', { hasText: 'Made-up tenants flyer, new time' })
  await card.waitFor({ timeout: 30_000 })
  await card.getByRole('button', { name: /^Published/ }).click()
  const sheet = A.page.locator('dialog.publish-sheet')
  await sheet.getByRole('button', { name: 'Unpublish' }).click({ timeout: 30_000 })
  await sheet.getByRole('button', { name: 'Yes, take it down now' }).click()
  await sheet.locator('.publish-done', { hasText: 'Taken down' }).waitFor({ timeout: 30_000 })
  await A.page.keyboard.press('Escape')
  assert((await fetch(publicUrl)).status === 404, 'still up')
  assert(auditOf(['site_updated']).length === 1 && auditOf(['site_unpublished']).length === 1, 'audit rows')
})
await check('Publish: admin.mjs unpublish takes a project down (a takedown), audited as the admin’s', async () => {
  const pre = await api('/api/site/preview?page=flyer%2Fflyer.html', { cookie: a.cookie, ws: FA })
  const r = await api('/api/site/publish', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ page: 'flyer/flyer.html', fingerprint: pre.json.fingerprint, confirm: true }) })
  assert(r.status === 200 && (await fetch(publicUrl)).status === 200, `publish ${r.status}`)
  const listed = await adminAsync('sites')
  assert(listed.out.includes(FA), listed.out)
  const down = await adminAsync('unpublish', FA)
  assert(down.code === 0 && /taken down/.test(down.out), `${down.code} ${down.err}`)
  assert((await fetch(publicUrl)).status === 404, 'still up')
  const rows = auditOf(['site_unpublished'])
  assert(rows.length === 2 && rows[0].actor_kind === 'admin', JSON.stringify(rows.map((x) => x.actor_kind)))
  return down.out.trim()
})
await check('the sign-in cookie is host-only: no Domain attribute, so sites.ola.cx never gets it (and __Host- on https, test/sites.test.mjs)', async () => {
  const r = await fetch(`${ORIGIN}/api/auth/password`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'nell', password: 'wrong-password-here' }) })
  const signIn = await api('/api/signout', { method: 'POST', cookie: 'x', origin: ORIGIN })
  const set = [r.headers.get('set-cookie') ?? '', signIn.headers.get('set-cookie') ?? ''].join('\n')
  const c = await cookieOf(A.ctx)
  assert(!/domain=/i.test(set) && c && !c.domain.startsWith('.'), `${set} ${c?.domain}`)
})
// The planted pages go, so the checks below see the project as before.
spawnSync(CTR, ['exec', `ola-${FA}`, 'rm', '-rf', '/work/flyer', '/work/leak', '/work/mine', '/work/envy', '/work/dbpage'])
{
  // Publish's rules without a VM (test/sites.test.mjs), and Publish from a Mac (OLA-223,
  // test/sites-device.test.mjs: a real front desk in that process, two people's device passes, the
  // stand-in host): the exact list, secrets refused with a .env's bytes never sent, the yes and the
  // fingerprint, live, publish again, names nobody else can take (another person's, a project's, a
  // reserved word, and a project never taking a Mac site's address), unpublish, an admin's takedown
  // holding the name until site-release, not set up said plainly.
  for (const [file, what] of [['sites.test.mjs', 'Publish’s rules without a VM'], ['sites-device.test.mjs', 'Publish from a Mac: the list, secrets, the yes, live, names owned, unpublish, a takedown held'], ['chatpublish.test.mjs', 'Publish from the conversation: the yes publishes exactly the list, no and a member’s yes publish nothing, the apps’ list must match']]) {
    const u = spawnSync(process.execPath, ['--test', path.join(HERE, 'test', file)], { encoding: 'utf8', timeout: 180_000 })
    ok(`${what} (test/${file})`, u.status === 0, `${/ℹ pass (\d+)/.exec(u.stdout)?.[1] ?? '?'} passed${u.status ? `: ${u.stdout.split('\n').filter((l) => /not ok|Error/.test(l)).slice(0, 3).join(' | ')}` : ''}`)
  }
}

// Publish from the conversation (OLA-230): the waiting `ola-publish` in a real VM. Without the
// front desk's note it publishes nothing and says to run it on its own; with the note for exactly
// its folder and list it waits and prints the address; the same outcome is not a second yes.
await check('ola-publish in the VM: no yes, no publish; the front desk’s outcome for exactly its list is printed once, with the address', async () => {
  const run = (...a) => spawnSync(CTR, ['exec', `ola-${FA}`, '/opt/ola/bin/ola-publish', ...a], { encoding: 'utf8', timeout: 60_000, env: { ...process.env } })
  const no = run('site', '--files', 'index.html')
  assert(no.status === 1 && /no yes from the person/.test(no.stdout), `without a yes: ${no.status} ${no.stdout}`)
  assert(await wsLib.publishResult(FA, { state: 'publishing', target: 'site', files: ['index.html', 'style.css'] }), 'the VM took the publishing note')
  const later = wsLib.publishResult.bind(null, FA, { state: 'done', target: 'site', files: ['index.html', 'style.css'], url: 'https://sites.example/fd-a/', count: 2, live: true })
  setTimeout(() => void later(), 1500)
  const yes = await new Promise((r) => {
    const c = spawn(CTR, ['exec', `ola-${FA}`, '/opt/ola/bin/ola-publish', 'site', '--files', 'style.css,index.html'])
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.on('close', (code) => r({ code, out }))
  })
  assert(yes.code === 0 && yes.out.includes('Published: https://sites.example/fd-a/ (2 file(s))'), `with the yes: ${yes.code} ${yes.out}`)
  const again = run('site', '--files', 'index.html,style.css')
  assert(again.status === 1, `the same outcome again: ${again.status} ${again.stdout}`)
  const st = run('status')
  // Once shown, status is only a record, never a claim about the address now (OLA-421, image 2.3.2-71): exit 5.
  assert(st.status === 5 && /^Record only: /.test(st.stdout) && st.stdout.includes('https://sites.example/fd-a/'), `status: ${st.status} ${st.stdout}`)
  spawnSync(CTR, ['exec', `ola-${FA}`, 'rm', '-rf', '/work/.ola/publish'])
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
  // `how`: the conversation's switch, "Ask before each step" or "Lots of permissions" (OLA-139:
  // under Lots a web search goes ahead with no question, on a one-time grant the front desk writes).
  async function webAsk(how = 'Ask before each step') {
    await A.page.goto('about:blank')
    await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
    await A.page.waitForSelector('.project-title')
    // A phone opens on the conversation itself (OLA-128); a laptop has the Ask Ola bar.
    // (The bar can show for a moment before a phone opens its conversation: a short try, then the drawer.)
    await A.page.locator('.drawer.open #ask-input, .askbar').locator('visible=true').first().waitFor({ timeout: 30_000 })
    if (!(await A.page.locator('.drawer.open').count())) await A.page.getByRole('button', { name: 'Ask Ola' }).first().click({ timeout: 3000 }).catch(() => {})
    await A.page.waitForSelector('.drawer.open #ask-input', { timeout: 15_000 })
    await A.page.locator('button:has-text("New conversation")').first().click({ timeout: 2000 }).catch(() => {})
    await A.page.locator('#lots-switch').setChecked(how === 'Lots of permissions')
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
    assert((await dialog.locator('.web-leaves').innerText()).includes('The words of the search go to a made-up search (for checks). Nothing from your files is sent.'), 'the line under it names the gateway’s provider (mock here), not a fixed one')
    await dialog.getByRole('button', { name: 'Allow once' }).click()
    await done()
    await until(() => searchLines().length > n, 10_000, 'the search at the gateway')
    const l = searchLines().at(-1)
    assert(l.status === 200 && l.grant === 'once', JSON.stringify(l))
    assert((await api('/api/settings', { cookie: a.cookie, ws: FA })).json.web.always === false, 'once was remembered as always')
  })
  await check('Lots of permissions: a web search goes ahead with no question, on a one-time grant for exactly it, and nothing is remembered', async () => {
    const n = searchLines().length
    // At a phone's width (iPhone 14), as Bart would use it.
    await A.page.setViewportSize({ width: 390, height: 844 })
    try {
      await webAsk('Lots of permissions')
      const asked = A.page.locator('dialog.approval[open]').waitFor({ timeout: 25_000 }).then(() => true, () => false)
      await done()
      await until(() => searchLines().length > n, 10_000, 'the search at the gateway')
      assert(!(await asked) && !(await A.page.locator('dialog.approval[open]').count()), 'a question was shown under Lots of permissions')
      if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'lots-web-search-390.png') })
    } finally {
      await A.page.setViewportSize({ width: 1280, height: 860 })
    }
    const l = searchLines().at(-1)
    assert(l.status === 200 && l.grant === 'once', JSON.stringify(l))
    assert((await api('/api/settings', { cookie: a.cookie, ws: FA })).json.web.always === false, 'Lots turned on Always in this project')
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
    await webAsk('Lots of permissions')
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
  // Review 4, H2: opencode 2.3.0's own "always" is a durable project-wide rule (it outlived the
  // conversation and a restart). The front desk keeps "for the rest of this conversation" itself.
  await check('"Yes, for the rest of this conversation" lasts that conversation only: the next request in it is not asked again, a new conversation is', async () => {
    const dialogs = async (answers) => {
      const seen = []
      const last = A.page.locator('.drawer .turn').last()
      const end = Date.now() + 90_000
      while (Date.now() < end) {
        const st = await last.getAttribute('data-status').catch(() => null)
        if (st && ['done', 'failed', 'stopped'].includes(st)) break
        const d = A.page.locator('dialog.approval[open]')
        if (await d.count()) {
          const title = await d.locator('h2').innerText().catch(() => '')
          const n = seen.push(title)
          await d.getByRole('button', { name: answers[n - 1] ?? 'Yes, this once' }).click().catch(() => {})
          await A.page.waitForTimeout(800)
        }
        await A.page.waitForTimeout(300)
      }
      return seen
    }
    const ask = async (fresh) => {
      if (fresh) {
        await A.page.goto('about:blank')
        await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
        await A.page.waitForSelector('.project-title')
        await A.page.getByRole('button', { name: 'Ask Ola' }).first().click()
        await A.page.locator('button:has-text("New conversation")').first().click({ timeout: 2000 }).catch(() => {})
        await A.page.locator('#lots-switch').setChecked(false)
      }
      await A.page.fill('#ask-input', 'Count the rows of survey.csv (made up)')
      await A.page.press('#ask-input', 'Enter')
    }
    const csv = 'name,city\nAnn,Springfield\nBo,Shelbyville\n'
    spawnSync(CTR, ['exec', '-i', '--user', '1000', `ola-${FA}`, 'sh', '-c', 'cat > /work/survey.csv'], { input: csv })
    await ask(true)
    const first = await dialogs(['Yes, for the rest of this conversation', 'Yes, this once'])
    assert(first.length >= 2 && /run code/.test(first[0]), `conversation 1: ${JSON.stringify(first)}`)
    await ask(false)
    const again = await dialogs(['Yes, this once'])
    assert(!again.some((t) => /run code/.test(t)), `the same conversation asked about code again: ${JSON.stringify(again)}`)
    await ask(true)
    const other = await dialogs(['No, don’t', 'No, don’t'])
    assert(other.length >= 1 && /run code/.test(other[0]), `a new conversation did not ask first: ${JSON.stringify(other)}`)
    return `conversation 1 asked ${first.length}, its next request ${again.length} (no code question), a new one ${other.length}`
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
  await A.page.getByRole('button', { name: 'Use a passkey instead' }).waitFor({ timeout: 15_000 })
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
  // The viewer always counts themself: v made no request in the last window (only a and b did).
  const n3 = (await api('/api/me', { cookie: v.cookie })).json.machine.working
  assert(n1 === 3 && n2 === 3 && m.working === 2 && n3 === 3 && Object.keys(m).sort().join() === 'capacity,working' && m.capacity === 4, `windows: ${n1}, then ${n2} after bob's request, then ${JSON.stringify(m)}, then ${n3} for a viewer not in it`)
  return `${n1} for the window of three people; still ${n2} after bob's request mid-window; ${m.working} at the next window; ${n3} for a viewer who was quiet (they count themself)`
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
// A request to the Claude route from inside the VM, as the agent's user, with the VM's own token:
// what Ola's agent, or anything left running in the VM, could send. The gateway's status.
const CLAUDE_PROBE = 'import sys, json, urllib.request\nbody = json.dumps({"model": "claude-opus-5-5", "max_tokens": 16, "messages": [{"role": "user", "content": "hi"}]}).encode()\nreq = urllib.request.Request("http://127.0.0.1:4180/anthropic/v1/messages", data=body, headers={"Authorization": "Bearer " + sys.stdin.read().strip(), "Content-Type": "application/json", "anthropic-version": "2023-06-01"})\ntry:\n    print(urllib.request.urlopen(req, timeout=30).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\n'
const claudeFromInside = () =>
  new Promise((resolve) => {
    const c = spawn(CTR, ['exec', '-i', '--user', '1000', `ola-${FA}`, 'python3', '-I', '-c', CLAUDE_PROBE], { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.on('close', () => resolve(out.trim()))
    c.stdin.end(secretsOf(FA).BOX_API_KEY)
  })

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
  assert(on.status === 200 && on.json.enabled === true && on.json.mode === 'api_key', `on: ${on.status}`)
  // Review 5 follow-up: the switch alone grants the VM nothing; a grant exists only while a run goes on.
  assert(!grantsFile()[`ws-${FA}`], `a standing grant with no run: ${JSON.stringify(grantsFile())}`)
  await sleep(2500) // the gateway reloads the grants file within 2 s
  const inside = await claudeFromInside()
  assert(inside === '403', `with the switch on and no run, a request from inside the VM got ${inside}`)
  assert((await api('/api/claude/run', { method: 'POST', cookie: v.cookie, csrf: v.csrf, ws: FA, body: '{}', headers: { 'content-type': 'application/json' } })).status === 403, 'the viewer may run Claude')
  assert(auditRows(FA).some((r) => r.action === 'claude_enabled' && r.actor === 'alice'), 'no claude_enabled row')
  return 'api_key mode; no grant and 403 from inside the VM until a run starts'
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
// Which engine made a file (OLA-224, frontdesk/madeby.mjs): Bart asked "which agent built
// index.html: hosted or claude?" and the open model said it built it, though Claude had rewritten it.
// Here Ola's model makes index.html, Claude (the stand-in) rewrites it in the same conversation, and
// Ola's model is asked who made it, under "Ask before each step" so that any step it takes besides
// reading the record would stop for a yes. Live: the open model really answers.
const mpost = (who, p, body) => api(p, { method: 'POST', cookie: who.cookie, csrf: who.csrf, ws: FA, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
/** A prompt to Ola's model as the page sends it, and the run's end (a new `idle` in the conversation). */
async function olaTurn(who, id, text, ms = LIVE ? 300_000 : 120_000) {
  const msgs = async () => {
    const m = (await api(`/oc/api/session/${id}/message?limit=200`, { cookie: who.cookie, ws: FA })).json
    return m?.data ?? m ?? []
  }
  const idles = (await msgs()).filter((m) => m.type === 'idle').length
  const r = await mpost(who, `/oc/api/session/${id}/prompt`, { text })
  if (r.status >= 300) throw new Error(`prompt: ${r.status} ${r.text.slice(0, 160)}`)
  let asked = null
  await until(async () => {
    const q = (await api(`/oc/api/session/${id}/permission`, { cookie: who.cookie, ws: FA })).json
    const pending = Array.isArray(q) ? q : q?.data ?? []
    if (pending.length) asked = pending
    return asked || (await msgs()).filter((m) => m.type === 'idle').length > idles
  }, ms, 'the Ola run ending')
  if (asked) throw new Error(`Ola stopped to ask: ${JSON.stringify(asked).slice(0, 300)}`)
  const list = await msgs()
  const last = [...list].sort((x, y) => (x.time?.created ?? 0) - (y.time?.created ?? 0))
  // Everything Ola said after the last request (an answer can come in more than one message, around its steps).
  const mine = last.slice(last.map((m) => m.type).lastIndexOf('user') + 1).filter((m) => m.type === 'assistant')
  const answer = mine.map((m) => (m.content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join('')).filter((t) => t.trim()).join('\n')
  const shells = mine.flatMap((m) => (m.content ?? []).filter((p) => p.type === 'tool')).map((p) => String(p.state?.input?.command ?? p.name))
  return { list: last, answer, shells }
}
await check('who made a file: Ola makes index.html, Claude rewrites it, and asked who made it Ola names Claude, from the record, without asking anything', async () => {
  const s = await mpost(a, '/oc/api/session', { title: 'made-by check', metadata: { autonomy: 'go' } })
  const id = s.json?.id ?? s.json?.data?.id
  assert(typeof id === 'string', `no conversation: ${s.status}`)
  // The scripted model cannot write a named file: without --no-live the real one does; with it, the
  // file is put there and recorded as Ola's by hand, and the turns only carry the conversation.
  if (LIVE) await olaTurn(a, id, 'Write index.html: a one-line HTML page that says Hello. Just write the file, nothing else.')
  else (await olaTurn(a, id, 'say hi on one line'), inVm("echo '<p>hello</p>' > /work/index.html && /opt/ola/bin/ola-db made-by add index.html --engine ola --how created"))
  assert(inVm('test -e /work/index.html && echo there') === 'there', 'Ola did not write index.html')
  const c = await claudeRun(a, { request: 'write index.html saying nicer', conversation: id })
  assert(c.ended?.reason === 'done' && inVm('cat /work/index.html') === 'nicer', `Claude: ${JSON.stringify(c.ended)}`)
  const rec = JSON.parse(inVm('/opt/ola/bin/ola-db made-by index.html --json'))
  assert(rec[0]?.engine === 'claude' && rec[0].how === 'changed' && rec.at(-1).engine === 'ola' && rec.at(-1).how === 'created', `record: ${JSON.stringify(rec)}`)
  const mb = await api('/api/made-by', { cookie: a.cookie, ws: FA })
  assert(mb.status === 200 && mb.json.files.find((f) => f.path === 'index.html')?.engine === 'claude', `/api/made-by: ${mb.status} ${mb.text.slice(0, 200)}`)
  assert((await api('/api/made-by', { cookie: b.cookie, ws: FA })).status === 404, 'another team read the record')
  // OLA-515: the page changed since a time is found in the VM and pressed all over (a page with no
  // controls: nothing dead); since a time after every change: no page, nothing pressed; another team cannot.
  const poke = (who, since) => api('/api/poke', { method: 'POST', cookie: who.cookie, csrf: who.csrf, ws: FA, body: JSON.stringify({ since }), headers: { 'content-type': 'application/json' } })
  const pk = await poke(a, Date.now() - 30 * 60_000)
  assert(pk.status === 200 && pk.json?.page === 'index.html' && Array.isArray(pk.json?.dead) && pk.json.dead.length === 0, `/api/poke: ${pk.status} ${pk.text.slice(0, 200)}`)
  const none = await poke(a, Date.now() + 60_000)
  assert(none.status === 200 && none.json?.page === null && none.json.dead.length === 0, `/api/poke, nothing changed: ${none.status} ${none.text.slice(0, 200)}`)
  assert((await poke(b, Date.now() - 30 * 60_000)).status !== 200, 'another team pressed the page')
  // Under "Ask before each step": reading the record must not stop for a yes.
  const p = await api(`/oc/api/session/${id}`, { method: 'PATCH', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ metadata: { autonomy: 'ask' } }), headers: { 'content-type': 'application/json' } })
  assert(p.status < 300, `autonomy: ${p.status}`)
  const q = await olaTurn(a, id, LIVE ? 'Who made index.html?' : 'Who made index.html? say hi on one line')
  const user = q.list.filter((m) => m.type === 'user').pop()
  assert(String(user?.text ?? '').startsWith('<ola-engines>') && /Claude, asked "write index\.html saying nicer", changed index\.html/.test(user.text) && /\n\nWho made index\.html\?/.test(user.text), `the prompt opencode got: ${String(user?.text).slice(0, 300)}`)
  if (LIVE) assert(/claude/i.test(q.answer) && !/\bI (built|made|wrote|created)\b/i.test(q.answer), `the answer: ${q.answer.slice(0, 400)}`)
  return `answer: ${JSON.stringify(q.answer.trim().slice(0, 400))}; shell: ${JSON.stringify(q.shells)}`
})
await check('under "Ask before each step" Claude Code stops for a yes: no means no file, yes means the file', async () => {
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
await check('the Claude grant lives only while a run the front desk started goes on: from inside the VM it works during the run, and is refused after Stop and after the front desk is killed', async () => {
  // Review 5 follow-up (medium): before, "Fallback to Claude" on gave the whole VM a standing grant.
  const during = async () => {
    let run = null
    const p = claudeRun(a, { request: 'slow 40x1000' }, { onStarted: (e) => (run = e.run) })
    p.catch(() => {}) // the second run's stream ends with the front desk killed under it
    await until(() => run !== null && grantsFile()[`ws-${FA}`]?.until > Date.now(), 20_000, 'the run and its lease')
    await sleep(2500)
    return { run, p, inside: await claudeFromInside(), lease: grantsFile()[`ws-${FA}`] }
  }
  const one = await during()
  assert(one.inside === '200' && one.lease.until - Date.now() <= 95_000, `during a run: ${one.inside}, lease ${JSON.stringify(one.lease)}`)
  await api('/api/claude/stop', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ run: one.run }), headers: { 'content-type': 'application/json' } })
  const r = await one.p
  await sleep(2500)
  const afterStop = await claudeFromInside()
  assert(r.ended?.reason === 'stopped' && !grantsFile()[`ws-${FA}`] && afterStop === '403', `after Stop: ${r.ended?.reason}, file ${JSON.stringify(grantsFile())}, inside ${afterStop}`)
  // A front desk killed mid-run: its lease is dropped when the next one starts (and would end on
  // its own within 90 s): the run's leftovers in the VM get 403.
  const two = await during()
  assert(two.inside === '200', `the second run: ${two.inside}`)
  fd.kill('SIGKILL')
  await until(() => fd.exitCode !== null || fd.signalCode !== null, 10_000, 'the front desk dying')
  fd = start('frontdesk', 'frontdesk/server.mjs')
  await until(async () => (await fetch(`${ORIGIN}/api/health`).catch(() => ({ ok: false }))).ok, 15_000, 'the front desk start')
  await sleep(2500)
  const afterKill = await claudeFromInside()
  assert(!grantsFile()[`ws-${FA}`] && afterKill === '403', `after the kill: file ${JSON.stringify(grantsFile())}, inside ${afterKill}`)
  // Nothing of the orphaned run may keep going in the VM.
  inVm('for p in /proc/[0-9]*; do tr "\\0" " " < $p/cmdline 2>/dev/null | grep -q "^claude " && kill $(basename $p); done; true')
  return `during a run 200; after Stop ${afterStop}; after a killed front desk ${afterKill}`
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
  assert((await api('/api/claude', { cookie: a.cookie, ws: FA })).json.mode === 'api_key', 'one owner is not an admin, yet oauth')
  admin('add-member', 'team-a', 'alice', 'member')
  const line = admin('claude', FA)
  assert(/ON, subscription/.test(line), line)
  // Review 4, open: a member of a team the admin owns does not get Bart's subscription.
  const member = await claudeRun(a, { request: 'write x.txt saying x' })
  assert(member.status === 403 && member.json?.error === 'owner_only' && /subscription/.test(member.json.message), `a member in subscription mode: ${member.status} ${JSON.stringify(member.json)}`)
  admin('add-member', 'team-a', 'alice', 'owner')
  const off = await api('/api/claude/settings', { method: 'POST', cookie: a.cookie, csrf: a.csrf, ws: FA, body: JSON.stringify({ enabled: false }), headers: { 'content-type': 'application/json' } })
  assert(off.status === 200 && !grantsFile()[`ws-${FA}`], 'the grant stayed after it was turned off')
  const refused = await claudeRun(a, { request: 'write x.txt saying x' })
  assert(refused.status === 403 && auditRows(FA).some((r) => r.action === 'claude_disabled'), `run after off: ${refused.status}`)
  return line.split(';')[0]
})

// ---------------------------------------------------------------- Compare with Claude
// README, "Compare with Claude". In alice's sealed VM (image 2.3.0-18, ola-twin) with the scripted
// model making the made-up copy (web/server/fake-twin.mjs), then two scratch sealed VMs: Ola's
// (opencode, the scripted model) and Claude's (Claude Code against the scripted Anthropic, through
// the gateway with a grant for that VM alone), the copy's checks scored in each, the scripted judge
// twice with the order swapped. Asserted at the gateway's upstream: nothing of alice's project
// reached the Claude route. Skipped with a live model (the copy is then the model's own).
{
  // Without a VM (test/compare.test.mjs): the judge's order swap and evidence rule, outcomes, the
  // sampler stopped by its budgets, a member and the real-task switch, a candidate the eval runner runs.
  const u = spawnSync(process.execPath, ['--test', path.join(HERE, 'test/compare.test.mjs')], { encoding: 'utf8', timeout: 300_000 })
  ok('Compare with Claude without a VM: order swap, evidence, outcomes, budgets stop the sampler, a member, the real-task switch, a candidate run by the eval runner (test/compare.test.mjs)', u.status === 0, `${/ℹ pass (\d+)/.exec(u.stdout)?.[1] ?? '?'} passed${u.status ? `: ${u.stdout.split('\n').filter((l) => /not ok|Error/.test(l)).slice(0, 3).join(' | ')}` : ''}`)
}
{
  // Switches to Claude (OLA-157, switches.mjs, test/switches.test.mjs): labels and counts only, the
  // request in no table or file, a made-up copy only where the owner has them made on their own, the
  // sampler takes a switched request first, kept drafts go when the person deletes them, the summary.
  const u = spawnSync(process.execPath, ['--test', path.join(HERE, 'test/switches.test.mjs')], { encoding: 'utf8', timeout: 120_000 })
  ok('Switches to Claude: labels and counts only, a made-up copy only where allowed, taken first by the sampler, kept drafts deleted with the turns, the summary (test/switches.test.mjs)', u.status === 0, `${/ℹ pass (\d+)/.exec(u.stdout)?.[1] ?? '?'} passed${u.status ? `: ${u.stdout.split('\n').filter((l) => /not ok|Error/.test(l)).slice(0, 3).join(' | ')}` : ''}`)
}
if (!LIVE) {
  const PLANTED =['Quennell', 'Vashkin', 'Brandvold', 'Ostrander', 'harbor_roster']
  const cpost = (who, p, body) => api(p, { method: 'POST', cookie: who.cookie, csrf: who.csrf, ws: FA, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  /** A conversation in alice's project through the front desk's door, run to its end: its id and the person's message id. */
  async function conversation(text) {
    const s = await cpost(a, '/oc/api/session', { title: 'compare check', metadata: { autonomy: 'go' } })
    const sid = (s.json?.data ?? s.json)?.id
    assert(sid, `session: ${s.status} ${s.text.slice(0, 200)}`)
    const p = await cpost(a, `/oc/api/session/${sid}/prompt`, { text })
    assert(p.status < 300, `prompt: ${p.status}`)
    let list = []
    await until(async () => {
      const m = await api(`/oc/api/session/${sid}/message?limit=200`, { cookie: a.cookie, ws: FA })
      list = Array.isArray(m.json?.data) ? m.json.data : Array.isArray(m.json) ? m.json : []
      return list.some((x) => x.type === 'idle')
    }, 120_000, 'the conversation to end')
    return { conversation: sid, message: list.find((x) => x.type === 'user').id }
  }
  const item = async (id) => (await api(`/api/compare/item?id=${id}`, { cookie: a.cookie, ws: FA })).json
  const scratchLeft = () => spawnSync(CTR, ['list', '--all', '--format', 'json'], { encoding: 'utf8' }).stdout.includes(`ola-${env.OLA_FD_COMPARE_PREFIX}-`)
  // The one VM the machine lets this suite run beside alice's is the scratch VM's: bob's is stopped.
  spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'stop', FB], { env, encoding: 'utf8' })
  inVm(`test -f /work/survey.csv || printf 'name,joined\\nAna,2026-01-02\\nBo,2026-02-03\\n' > /work/survey.csv; printf 'volunteer,shift,notes\\nMarisol Quennell,Harbor kitchen,until the thaw\\nTeodor Vashkin,Harbor kitchen,\\nIlse Brandvold,Night patrol,Ostrander memo\\n' > /work/harbor_roster.csv`)
  let cmpId = null
  let conv = null
  const bodies0 = fakeClaude.st.bodies.length
  await check('Compare with Claude: off for everyone but the owner; the real task with its switch off is refused and nothing reaches Claude', async () => {
    const vi = await api('/api/compare', { cookie: v.cookie, ws: FA })
    assert(vi.status === 200 && vi.json.canCompare === false && Object.keys(vi.json).length === 1, `viewer: ${vi.text}`)
    assert((await cpost(v, '/api/compare/start', { conversation: 'ses_x', message: 'msg_x', mode: 'twin' })).status === 403, 'the viewer started one')
    const i = await api('/api/compare', { cookie: a.cookie, ws: FA })
    assert(i.json.canCompare === true && i.json.configured === true && i.json.real === false && i.json.auto === 'ask', i.text)
    conv = await conversation('How many rows does survey.csv have?')
    const calls = fakeClaude.st.calls
    const lines = gateway.log.split('\n').filter((l) => l.includes('"route":"claude"')).length
    const off = await cpost(a, '/api/compare/start', { ...conv, mode: 'real' })
    assert(off.status === 403 && off.json.error === 'real_off', `real with the switch off: ${off.status} ${off.text}`)
    assert((await cpost(a, '/api/compare/start', { ...conv, mode: 'real', once: true })).status === 400, 'just this once without the confirming click')
    assert(fakeClaude.st.calls === calls && gateway.log.split('\n').filter((l) => l.includes('"route":"claude"')).length === lines, 'something reached the Claude route')
    return 'viewer: nothing; real task: refused, no request to Claude'
  })
  await check('a made-up copy is made in the sealed VM, clean, kept for the owner to read before it goes, and holds nothing of the project; a process the agent left running cannot touch it', async () => {
    // Review 5 follow-up (medium): the agent's user leaves a process that stops the copy-maker and
    // rewrites every file of the copy it can reach. The copy is made by a user of its own: nothing
    // of it can be signalled, read or written from there.
    spawnSync(CTR, ['exec', '-i', '--user', '1000', `ola-${FA}`, 'sh', '-c', 'cat > /tmp/fx-attack.py; (nohup setsid python3 -I /tmp/fx-attack.py >/dev/null 2>&1 &)'], { input: TWIN_ATTACK, encoding: 'utf8' })
    await sleep(500)
    const r = await cpost(a, '/api/compare/start', { ...conv, mode: 'twin' })
    assert(r.status === 200 && r.json.state === 'ready', `start: ${r.status} ${r.text}`)
    cmpId = r.json.id
    const it = await item(cmpId)
    assert(it.verdict === 'clean' && it.twin?.request && it.twin.files?.[0]?.name === 'data.csv' && it.twin.checks?.length >= 4, JSON.stringify(it).slice(0, 300))
    const kept = readFileSync(path.join(env.OLA_HOME, 'compare', cmpId, 'twin.json'), 'utf8')
    assert(!PLANTED.some((w) => kept.includes(w)), 'a planted word in the copy on the host')
    inVm('for p in /proc/[0-9]*; do grep -q fx-attack.py $p/cmdline 2>/dev/null && kill ${p#/proc/} 2>/dev/null; done; true')
    const log = inVm('cat /tmp/fx-attack.log 2>/dev/null').split('\n').filter(Boolean)
    const touched = Buffer.from(JSON.parse(kept).files.map((f) => f.b64).join(''), 'base64').toString('latin1').includes('FXMARK') || kept.includes('FXMARK')
    const saw = log.filter((l) => l.startsWith('maker '))
    assert(!touched && saw.length > 0 && saw.every((l) => / stop refused/.test(l)) && !log.some((l) => l.startsWith('wrote ')), `the attacker: ${log.slice(0, 6).join(' | ')}; the copy carries its mark: ${touched}`)
    assert(auditRows(FA).some((x) => x.action === 'compare_twin_made'), 'not audited')
    return `${it.twin.files[0].size} bytes of made-up data, ${it.twin.checks.length} checks`
  })
  await check('sent: Ola and Claude each do the copy in a scratch sealed VM; checks, then the judge twice; Claude did better, and why', async () => {
    const s = await cpost(a, '/api/compare/send', { id: cmpId })
    assert(s.status === 200, `send: ${s.status} ${s.text}`)
    let it = null
    await until(async () => ((it = await item(cmpId)), ['done', 'failed'].includes(it?.state)), 420_000, 'the comparison to finish')
    assert(it.state === 'done' && it.outcome === 'claude_better', `${it.state} ${it.outcome} ${JSON.stringify(it.result?.engines?.claude?.score ?? null)}`)
    const e = it.result.engines
    assert(e.claude.score.all && !e.ola.score.all && e.claude.outputs.some((o) => o.name === 'clean.csv'), JSON.stringify({ ola: e.ola.score, claude: e.claude.score }))
    assert(it.result.judge.verdict === 'y' && /^Claude /.test(it.result.judge.difference), JSON.stringify(it.result.judge))
    assert(fakeClaude.st.judged >= 2, `the judge ran ${fakeClaude.st.judged} times`)
    const line = (await api(`/api/compare?conversation=${conv.conversation}`, { cookie: a.cookie, ws: FA })).json.results[conv.message]
    assert(line?.outcome === 'claude_better' && line.sentence, JSON.stringify(line))
    return `Ola ${e.ola.score.passed}/${e.ola.score.total}, Claude ${e.claude.score.passed}/${e.claude.score.total}; "${line.sentence}"`
  })
  await check('at the gateway: every Claude request came from the scratch VM, none from the project, and no planted word of the project reached Anthropic', async () => {
    const lines = gateway.log.split('\n').filter((l) => l.includes('"route":"claude"'))
    const mine = lines.filter((l) => l.includes(`"caller":"ws-${env.OLA_FD_COMPARE_PREFIX}-`))
    assert(mine.length >= 3 && !lines.slice(-mine.length).some((l) => l.includes(`"caller":"ws-${FA}"`)), `${mine.length} scratch lines`)
    const sent = fakeClaude.st.bodies.slice(bodies0).join('\n')
    const found = PLANTED.filter((w) => sent.includes(w))
    assert(sent.length > 0 && !found.length, `planted words that reached Anthropic: ${found}`)
    assert(!scratchLeft(), 'a scratch VM is left')
    assert(!Object.keys(grantsFile()).some((k) => k.startsWith(`ws-${env.OLA_FD_COMPARE_PREFIX}-`)), 'a scratch grant is left')
    return `${mine.length} requests from scratch VMs, ${fakeClaude.st.bodies.length - bodies0} bodies read for planted words`
  })
  await check('the lost copy is a candidate eval task (its selftest passes Claude’s result and fails Ola’s), with a note for the lead; the audit has numbers only', async () => {
    const cand = path.join(env.OLA_FD_CANDIDATES_DIR, `t-${cmpId}`)
    const st = spawnSync('python3', [path.join(AI, 'evals/lib/task.py'), 'selftest', cand, '0'], { encoding: 'utf8' })
    assert(st.status === 0 && /solve/.test(st.stdout), st.stdout + st.stderr)
    assert(/Not applied: queued for the lead\./.test(readFileSync(path.join(cand, 'skill-note.md'), 'utf8')), 'no note')
    const listed = admin('compare', 'candidates')
    assert(listed.includes(`t-${cmpId}`), listed)
    const row = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'), { readOnly: true }).prepare("SELECT tokens_in, cost_micro_usd, name_ref FROM audit WHERE action = 'compare_done' ORDER BY id DESC LIMIT 1").get()
    assert(row && row.tokens_in > 0 && row.cost_micro_usd > 0 && row.name_ref === null, JSON.stringify(row))
    return listed.split('\n').find((l) => l.includes(cmpId))
  })
  await check('a copy that carries a name from the project stays in the VM; one that carries a rare word is held, its findings shown to the owner, refused if it changed, and not sent on "Don’t send"', async () => {
    const leak = await cpost(a, '/api/compare/start', { ...(await conversation('Count the rows. PLANT-LEAK:Quennell')), mode: 'twin' })
    assert(leak.json?.state === 'refused' && !existsSync(path.join(env.OLA_HOME, 'compare', leak.json.id)), `leak: ${leak.text}`)
    const held = await cpost(a, '/api/compare/start', { ...(await conversation('Count the rows. PLANT-UNSURE:thaw')), mode: 'twin' })
    assert(held.json?.state === 'held', `held: ${held.text}`)
    const it = await item(held.json.id)
    assert(it.findings?.some((f) => f.text === 'thaw') && it.twin?.request.includes('thaw'), JSON.stringify(it.findings))
    assert((await cpost(a, '/api/compare/send', { id: held.json.id })).status === 400, 'sent without the owner’s yes')
    inVm(`sed -i 's/Note: thaw/Note: thaw Quennell/' /work/.ola/twins/${held.json.id}/copy.json`)
    const changed = await cpost(a, '/api/compare/send', { id: held.json.id, release: true })
    assert(changed.status === 409 && changed.json.error === 'changed', `a changed copy: ${changed.status} ${changed.text}`)
    assert((await cpost(a, '/api/compare/discard', { id: held.json.id })).status === 200, 'discard')
    assert(!existsSync(path.join(env.OLA_HOME, 'compare', held.json.id)), 'a held copy reached the host')
    return 'refused, held, changed refused, not sent'
  })
  // OLA-131: a design run's conversation passed 256 KB, the front desk read only that much of it, and
  // Compare with Claude refused the owner's "Just this once" as "not in this conversation".
  await check('Compare with Claude finds the request in a conversation larger than 256 KB', async () => {
    const big = await conversation('Give me a long answer of 300 KB about the made-up survey.')
    const m = await api(`/oc/api/session/${big.conversation}/message?limit=200`, { cookie: a.cookie, ws: FA })
    assert(m.text.length > 300 * 1024, `the conversation is only ${m.text.length} bytes`)
    const r = await cpost(a, '/api/compare/start', { ...big, mode: 'twin' })
    assert(r.status === 200 && ['ready', 'held', 'refused'].includes(r.json?.state), `start: ${r.status} ${r.text.slice(0, 200)}`)
    if (r.json.state !== 'refused') assert((await cpost(a, '/api/compare/discard', { id: r.json.id })).status === 200, 'discard')
    assert(!/compare start refused \((404|502)/.test(fd.log), 'this start was refused')
    // A refused start leaves a line with its status and code, and nothing of the request.
    assert((await cpost(a, '/api/compare/start', { ...big, mode: 'real' })).status === 403, 'the real task with its switch off')
    await sleep(300)
    assert(fd.log.includes(`${FA}: compare start refused (403 real_off)`) && !fd.log.includes('long answer'), 'the refusal left no line, or its words')
    return `${Math.round(m.text.length / 1024)} KB, ${r.json.state}; refusals logged by code`
  })
}

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
  assert(f.status === 200 && f.json.hosted.enabled === false && f.json.hosted.configured === true && f.json.hosted.provider === HOSTED_UP.HOSTED_PROVIDER && f.json.hosted.model === HOSTED_UP.HOSTED_MODEL && f.json.stretch === 'suggest' && f.json.stretchTo === 'hosted' && f.json.claude.enabled === false, JSON.stringify(f.json).slice(0, 300))
  assert(!hostedFile()[`ws-${FA}`], 'a hosted grant before anyone turned it on')
  assert((await jpost(v, '/api/hosted/settings', { enabled: true, consent: true })).status === 403, 'the viewer turned it on')
  assert((await jpost(a, '/api/hosted/settings', { enabled: true })).status === 400, 'on without consent')
  const on = await jpost(a, '/api/hosted/settings', { enabled: true, consent: true })
  assert(on.status === 200 && on.json.enabled === true, `on: ${on.status}`)
  // Review 5 follow-up: on means runs may start without asking; the VM itself holds no grant.
  assert(!hostedFile()[`ws-${FA}`], `a standing hosted grant: ${JSON.stringify(hostedFile())}`)
  await sleep(2500)
  const inside = await hostedFromInside()
  assert(inside === '403', `the hosted model from inside the VM with the switch on and no run: ${inside}`)
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
  await sleep(2500)
  const after = await hostedFromInside()
  assert(!hostedFile()[`ws-${FA}`] && after === '403', `after the hosted run, from inside the VM: ${after}`)
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
// A picked choice (OLA-337): DeepSeek V4 Pro, for one request the owner picks it for, with the switch
// off ("just this once", as the Mac app sends it): the session runs on `deepseek-v4-pro`, the gateway
// sends its own model id to the hosted provider, it is audited like a hosted run, and the
// conversation goes back to Ola's model.
await check('a request the owner picks DeepSeek V4 Pro for runs on it, marked by its model, audited as a hosted run, then back to Ola', async () => {
  const before = fakeHosted.calls()
  const r = await hostedRun(a, 'Count the rows in survey.csv', { once: true, model: 'deepseek-v4-pro' })
  assert(r.status === 200 && JSON.stringify(r.models) === '["deepseek-v4-pro"]' && r.idle[0] === 'succeeded', `the run: ${r.status} ${JSON.stringify(r.json ?? r.models)} ${r.idle}`)
  assert(fakeHosted.calls() > before, 'the hosted provider was not asked')
  const lines = gateway.log.split('\n').filter((l) => l.includes('"model":"deepseek-v4-pro"') && l.includes(`"caller":"ws-${FA}"`))
  assert(lines.length >= 1 && lines.every((l) => l.includes('"pick":"deepseek-v4-pro"')), `${lines.length} gateway lines`)
  const once = dbRow("SELECT tokens_in, name_ref FROM audit WHERE action = 'hosted_once' ORDER BY id DESC LIMIT 1")
  assert(once && once.tokens_in > 0 && once.name_ref === null, `hosted_once: ${JSON.stringify(once)}`)
  const s = await api(`/oc/api/session/${r.id}`, { cookie: a.cookie, ws: FA })
  assert((s.json?.data ?? s.json)?.model?.id === 'general' && !hostedFile()[`ws-${FA}`], `after: ${(s.json?.data ?? s.json)?.model?.id}`)
  return `${lines.length} requests on deepseek-v4-pro, audited hosted_once, back on general`
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
    await A.page.locator('#lots-switch').setChecked(false)
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
// Asynchronous on purpose (OLA-295): the fake model answers from this process, and `ws.mjs status`
// takes about 2 s (it asks `container`). A spawnSync here held every model answer behind it: each
// 0.7 s document of the batch job took 2.7 s, which looked like an 85 s stall after the restart.
const wsState = (id) =>
  new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'status', id, '--json'], { env, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.on('close', () => {
      try {
        resolve(JSON.parse(out)[0]?.state)
      } catch {
        resolve(undefined)
      }
    })
  })
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
  const { t0, sid } = await ask('List the folder, slowly. slow 6x1500')
  await A.page.goto('about:blank') // no request from any browser while it runs
  const states = new Set()
  let lastSeen = Date.now()
  // The workspace's state, sampled only between two sightings of the run executing.
  while (Date.now() - t0 < 90_000) {
    if (!(await executing(FA)).length) break
    const st = await wsState(FA)
    if (!(await executing(FA)).length) break
    states.add(st)
    lastSeen = Date.now()
    await sleep(500)
  }
  const ran = lastSeen - t0
  const msgs = JSON.stringify(await deskGet(FA, `/api/session/${sid}/message`))
  assert(states.size && [...states].every((s) => s === 'running'), `states during the run: ${[...states].join(', ')} (ran ${ran} ms)`)
  // Six steps of 1.5 s, about 9 s, seen running for more than 6 s (OLA-295: four steps passed only
  // while a blocking status poll here slowed every model answer).
  assert(ran > 6000, `the run lasted only ${ran} ms (idle limit 3 s)`)
  assert(msgs.includes('Done after 6 slow steps'), `the run did not reach its answer after ${ran} ms, ${fake.calls() - calls0} calls: ${msgs.slice(0, 900)}`)
  const ended = Date.now()
  await until(async () => (await wsState(FA)) !== 'running', 30_000, 'the idle stop after the run')
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

// ---------------------------------------------------------------- batch jobs (jobs.mjs, ola-batch)
// 60 made-up studies in fd-a's project database; the scripted model answers each form from the
// document and plants wrong quotes in some answers (web/server/fake-batch.mjs). The front desk runs
// here with a 3 s idle stop and a 24 s run ceiling (restartForLongRuns): a job outlives both.
const pyInVm = (script, input = '') =>
  new Promise((resolve) => {
    const c = spawn(CTR, ['exec', '-i', `ola-${FA}`, 'python3', '-I', '-c', script], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (err += d))
    c.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }))
    c.stdin.end(input)
  })
const SPEC = {
  name: 'decisions',
  title: 'Who makes the adaptation decision, and when the planning horizon ends',
  instructions: 'Code what each study itself found.',
  documents: 'all',
  trial: 15,
  fields: [
    { name: 'decider', type: 'category', question: 'Who makes the adaptation decision?', values: ['households', 'local government', 'national government', 'firms', 'other'] },
    { name: 'horizon', type: 'number', question: 'In what year does the planning horizon end?' },
  ],
}
// Writes the files (JSON on stdin), indexes them, and proposes the job, as the agent would.
const SEED = 'import json, os, subprocess, sys\nd = json.load(sys.stdin)\nos.makedirs("/work/" + d["dir"], exist_ok=True)\nfor n, t in d["files"].items():\n    open("/work/" + d["dir"] + "/" + n, "w").write(t)\n    subprocess.run(["/opt/ola/bin/ola-db", "add", d["dir"] + "/" + n, "--by", "upload"], check=True, capture_output=True)\nopen("/work/.ola/spec.json", "w").write(json.dumps(d["spec"]))\nprint(subprocess.run(["/opt/ola/bin/ola-batch", "propose", "/work/.ola/spec.json"], capture_output=True, text=True).stdout)\n'
const laneProbe = (job) => `import sys, json, urllib.request\nbody = json.dumps({"model": "general", "messages": [{"role": "user", "content": "hi"}]}).encode()\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/chat/completions", data=body, headers={"Authorization": "Bearer " + sys.stdin.read().strip(), "Content-Type": "application/json", "X-Ola-Lane": "batch", "X-Ola-Job": "${job}"})\ntry:\n    print(urllib.request.urlopen(req, timeout=30).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\n`
const CONVERSATION_PROBE = 'import sys, json, time, urllib.request\nbody = json.dumps({"model": "general", "messages": [{"role": "user", "content": "hi"}]}).encode()\nt = time.time()\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/chat/completions", data=body, headers={"Authorization": "Bearer " + sys.stdin.read().strip(), "Content-Type": "application/json"})\ntry:\n    s = urllib.request.urlopen(req, timeout=60).status\nexcept urllib.error.HTTPError as e:\n    s = e.code\nprint(s, round(time.time() - t, 2))\n'
async function seedStudies(dir, n, spec) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'ola-studies-'))
  spawnSync('python3', [path.join(AI, 'workspace/testdata/make-corpus.py'), path.join(tmp, 'f'), path.join(tmp, 'truth.json'), '--n', String(n)])
  const names = spawnSync('ls', [path.join(tmp, 'f')], { encoding: 'utf8' }).stdout.trim().split('\n')
  const files = Object.fromEntries(names.map((f) => [f, readFileSync(path.join(tmp, 'f', f), 'utf8')]))
  const truth = JSON.parse(readFileSync(path.join(tmp, 'truth.json'), 'utf8'))
  rmSync(tmp, { recursive: true, force: true })
  // The seed stands in for the agent, whose commands run inside a run the front desk counts as
  // active. A bare `container exec` is not a request, so with the 3 s idle stop the sweep stopped the
  // VM in the middle of the 60 `ola-db add`s (about 1.5 to 3 s) whenever they ran long: the deploy of
  // 818e86e2 failed on "no job proposed: Traceback" (OLA-138). Keep it awake while the seed runs.
  await wake()
  const awake = setInterval(() => wake().catch(() => {}), 1000)
  const r = await pyInVm(SEED, JSON.stringify({ dir, files, spec })).finally(() => clearInterval(awake))
  return { job: /Proposed job ([0-9a-f]{12})/.exec(r.out)?.[1] ?? null, out: r.out || r.err, truth }
}
// The idle stop is 3 s here: a request first, so the VM is up for an exec.
const wake = () => api('/api/files', { cookie: a.cookie, ws: FA })
const jobGet = async (who, job, q = '') => (await api(`/api/jobs/job?id=${job}${q}`, { cookie: who.cookie, ws: FA })).json
const batchGrants = () => JSON.parse(readFileSync(path.join(env.OLA_HOME, 'gateway-batch'), 'utf8'))
let job60 = null
let truth60 = null

await check('batch jobs: the agent proposes a job over 60 studies in the sealed VM; it is listed, with the form, the estimate and the trial, and nothing runs', async () => {
  const s = await seedStudies('studies', 60, SPEC)
  job60 = s.job
  truth60 = s.truth
  assert(job60, `no job proposed: ${s.out.slice(-1500)}`)
  const list = (await api('/api/jobs', { cookie: a.cookie, ws: FA })).json
  const j = list.jobs.find((x) => x.id === job60)
  assert(j && j.state === 'proposed' && j.progress.total === 60 && j.progress.trial_total === 15 && j.estimate.tokens > 0 && j.estimate.weekShare > 0, JSON.stringify(j).slice(0, 300))
  assert(fake.batch.calls === 0, 'the model was asked before anyone said yes')
  assert(!batchGrants()[`ws-${FA}`], 'a grant before anyone said yes')
  return `estimate ${j.estimate.tokens} tokens, ${j.estimate.seconds} s, ${(j.estimate.weekShare * 100).toFixed(1)}% of the week; budget offered ${j.estimate.budget}`
})

await check('batch jobs: from inside the VM, the batch lane is refused without the person’s yes (no grant), even naming the job', async () => {
  await wake()
  const r = await pyInVm(laneProbe(job60), secretsOf(FA).BOX_API_KEY)
  assert(r.out === '403', `the gateway answered ${r.out} ${r.err.slice(0, 120)}`)
  return 'refused with 403'
})

await check('batch jobs: a member who is not the owner cannot start a job on an outside model, nor the whole job; a viewer starts nothing', async () => {
  // The hosted switch as the checks before left it, put back after (the rotation checks rely on it).
  const hostedWas = (await api('/api/fallback', { cookie: a.cookie, ws: FA })).json?.hosted?.enabled === true
  admin('add-member', 'team-a', 'vera', 'member')
  try {
    if (!hostedWas) assert((await jpost(a, '/api/hosted/settings', { enabled: true, consent: true })).status === 200, 'the owner turning the hosted model on')
    const out = await jpost(v, '/api/jobs/trial', { job: job60, model: 'hosted', consent: true })
    assert(out.status === 403 && out.json.error === 'owner_only', `a member's outside trial: ${out.status} ${out.text.slice(0, 120)}`)
    const full = await jpost(v, '/api/jobs/start', { job: job60, budget: 1_000_000, confirm: true })
    assert(full.status === 403, `a member's whole job: ${full.status}`)
    const opts = (await api('/api/jobs', { cookie: v.cookie, ws: FA })).json.options
    assert(opts.find((o) => o.model === 'hosted')?.allowed === false, `options for the member: ${JSON.stringify(opts)}`)
  } finally {
    if (!hostedWas) await jpost(a, '/api/hosted/settings', { enabled: false })
    admin('add-member', 'team-a', 'vera', 'viewer')
  }
  const viewer = await jpost(v, '/api/jobs/trial', { job: job60 })
  assert(viewer.status === 403, `a viewer's trial: ${viewer.status}`)
  assert(fake.batch.calls === 0 && !batchGrants()[`ws-${FA}`], 'something ran')
  return 'member: 403 owner_only for the hosted trial and for the whole job; viewer: 403'
})

await check('batch jobs: the trial codes 15 documents in the VM and stops for a yes; its rows carry quotes, pages and checks', async () => {
  const r = await jpost(a, '/api/jobs/trial', { job: job60 })
  assert(r.status === 200, `trial: ${r.status} ${r.text.slice(0, 200)}`)
  await until(() => batchGrants()[`ws-${FA}`]?.job === job60 && /^[0-9a-f]{64}$/.test(batchGrants()[`ws-${FA}`].key_sha256 ?? ''), 30_000, 'the trial’s grant, bound to its runner’s key')
  await until(async () => (await jobGet(a, job60)).job.approved?.state === 'trial_done', 120_000, 'the trial finishing')
  const g = await jobGet(a, job60, '&stage=trial')
  assert(g.results.total === 15 && g.job.progress.pending === 45, `trial rows ${g.results.total}, pending ${g.job.progress.pending}`)
  assert(!batchGrants()[`ws-${FA}`], 'the grant outlived the trial')
  const cols = g.results.columns
  assert(['decider', 'decider_quote', 'decider_page', 'decider_check', 'model', 'coded_at', 'machine_coded'].every((c) => cols.includes(c)), cols.join(','))
  return `15 rows; ${fake.batch.calls} model calls`
})

await check('batch jobs: the whole job runs past the 24 s run ceiling and the 3 s idle stop, survives a kill -9 of the front desk without redoing a document, pauses and resumes, keeps a conversation answered, and every planted quote is caught', async () => {
  fake.batch.delayMs = 700
  const t0 = Date.now()
  const r = await jpost(a, '/api/jobs/start', { job: job60, budget: 2_000_000, confirm: true })
  assert(r.status === 200, `start: ${r.status} ${r.text.slice(0, 200)}`)
  await until(async () => (await jobGet(a, job60)).job.progress.done >= 22, 60_000, 'the job under way')
  // A conversation's request while the job holds its one batch slot: answered at once.
  const conv = await pyInVm(CONVERSATION_PROBE, secretsOf(FA).BOX_API_KEY)
  const [cs, csec] = conv.out.split(' ')
  assert(cs === '200' && Number(csec) < 3, `a conversation during the job: ${conv.out} ${conv.err.slice(0, 100)}`)
  // Review 5 follow-up (low): while the job runs, another process in the VM (the agent's user) knows
  // the job's id but cannot spend its budget, and cannot read the runner's key from it.
  const lane = await pyInVm(laneProbe(job60), secretsOf(FA).BOX_API_KEY)
  const peek = await pyInVm(RUNNER_PEEK)
  assert(lane.out === '403' && /^runner \d+: environ refused, fd refused, mem refused, maps refused$/.test(peek.out), `during the job: lane ${lane.out}; ${peek.out} ${peek.err.slice(0, 200)}`)
  // Pause: the grant goes, the count stops.
  assert((await jpost(a, '/api/jobs/pause', { job: job60 })).status === 200, 'pause')
  assert(!batchGrants()[`ws-${FA}`], 'the grant outlived the pause')
  await sleep(5000)
  const p1 = (await jobGet(a, job60)).job.progress.done
  await sleep(4000)
  const p2 = (await jobGet(a, job60)).job.progress.done
  assert(p1 === p2, `still coding while paused: ${p1} then ${p2}`)
  assert((await jpost(a, '/api/jobs/resume', { job: job60 })).status === 200, 'resume')
  await until(async () => (await jobGet(a, job60)).job.progress.done > p2 + 2, 60_000, 'the job going again')
  // kill -9 the front desk mid-job; a new one picks the job up.
  const before = (await jobGet(a, job60)).job.progress.done
  const callsAtKill = fake.batch.calls
  fd.kill('SIGKILL')
  await until(() => fd.exitCode !== null || fd.signalCode !== null, 10_000, 'the front desk dying')
  await sleep(2000)
  fd = start('frontdesk', 'frontdesk/server.mjs', { OLA_FD_IDLE_STOP_MIN: '0.05', OLA_FD_RUN_CEILING_MIN: '0.4', OLA_FD_WAKE_WAIT_MS: '0' })
  await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
  const states = new Set()
  await until(async () => (states.add(await wsState(FA)), (await jobGet(a, job60)).job.approved?.state === 'done'), 240_000, 'the job finishing after the restart')
  const ran = Date.now() - t0
  const g = await jobGet(a, job60, '&limit=200')
  assert(g.results.total === 60, `${g.results.total} rows`)
  assert([...states].every((x) => x === 'running'), `the workspace during the job: ${[...states].join(', ')}`)
  assert(ran > 30_000, `the job took only ${ran} ms`)
  // Documents with a planted first answer (a call in flight at the kill may be asked again: counted once)
  const firsts = new Set(fake.batch.planted.filter((x) => !x.retry).map((x) => x.title)).size
  await wake()
  const tries = (await pyInVm(`import sqlite3\nprint(*sqlite3.connect("/work/project.db").execute("SELECT sum(tries), count(*) FROM batch_items WHERE job = '${job60}'").fetchone())`)).out
  const sumTries = Number(tries.split(' ')[0])
  assert(sumTries <= 60 + firsts + 2, `tries ${tries} for 60 documents and ${firsts} planted quotes: something was coded twice`)
  assert(fake.batch.calls - callsAtKill <= 60 - before + firsts + 2, `calls after the kill: ${fake.batch.calls - callsAtKill} for ${60 - before} documents left`)
  assert(fake.batch.maxInflight === 1, `${fake.batch.maxInflight} batch requests at once`)
  // The checker: every quote planted again on the retry is marked, and only those.
  const rows = g.results.rows.map((x) => Object.fromEntries(g.results.columns.map((c, i) => [c, x[i]])))
  const again = new Set(fake.batch.planted.filter((x) => x.retry).map((x) => x.title))
  const bad = rows.filter((x) => x.decider_check === 'quote not found').map((x) => x.document)
  assert(firsts === 10 && again.size === 5, `planted: ${firsts} first, ${again.size} again`)
  assert(bad.length === again.size && bad.every((d) => again.has(d)), `marked: ${bad.join(', ')}; planted again: ${[...again].join(', ')}`)
  for (const x of rows) if (x.decider_check === 'found') assert(x.decider === truth60[x.document].decider, `${x.document}: ${x.decider}`)
  assert(rows.every((x) => x.machine_coded === 1), 'a row not marked machine-coded')
  assert(!batchGrants()[`ws-${FA}`], 'the grant outlived the job')
  const data = (await api('/api/data', { cookie: a.cookie, ws: FA })).json
  const t = data.tables.find((x) => x.name === 'decisions')
  assert(t && t.rows === 60 && /^machine-coded/.test(t.source), `Data: ${JSON.stringify(t)}`)
  const xl = await fetch(`${ORIGIN}/api/data/xlsx?w=${FA}&name=decisions`, { headers: { cookie: `${CK}=${a.cookie}` } })
  assert(xl.status === 200 && (await xl.arrayBuffer()).byteLength > 2000, `Excel: ${xl.status}`)
  const pdb = new DatabaseSync(path.join(env.OLA_FD_DATA, 'platform.db'), { readOnly: true })
  const acts = pdb.prepare("SELECT action FROM audit WHERE action LIKE 'job_%' ORDER BY id").all().map((x) => x.action)
  pdb.close()
  for (const want of ['job_trial_started', 'job_started', 'job_paused', 'job_resumed', 'job_finished']) assert(acts.includes(want), `audit: ${acts.join(', ')}`)
  fake.batch.delayMs = 0
  return `${(ran / 1000).toFixed(0)} s (ceiling 24 s, idle stop 3 s), workspace running throughout; ${before} done at the kill; ${sumTries} tries for 60 documents (10 planted, 5 planted again); marked: ${bad.length}; a conversation answered in ${csec} s mid-job`
})

await check('batch jobs: cancel keeps what was coded and takes the grant away; a budget too small pauses a job and says so', async () => {
  const s = await seedStudies('studies2', 12, { ...SPEC, name: 'second', trial: 10 })
  assert(s.job, s.out)
  fake.batch.delayMs = 500
  assert((await jpost(a, '/api/jobs/trial', { job: s.job })).status === 200, 'trial')
  await until(async () => (await jobGet(a, s.job)).job.progress.done >= 2, 60_000, 'the trial under way')
  assert((await jpost(a, '/api/jobs/cancel', { job: s.job })).status === 200, 'cancel')
  await sleep(4000)
  const g = await jobGet(a, s.job)
  assert(g.job.approved.state === 'cancelled' && g.job.progress.done >= 2 && !batchGrants()[`ws-${FA}`], JSON.stringify(g.job.approved))
  const d1 = g.job.progress.done
  await sleep(3000)
  assert((await jobGet(a, s.job)).job.progress.done === d1, 'still coding after the cancel')
  // A third job with a budget too small for it: paused by the gateway's refusal, with a sentence.
  const t = await seedStudies('studies3', 12, { ...SPEC, name: 'third', trial: 10 })
  fake.batch.delayMs = 0
  assert((await jpost(a, '/api/jobs/trial', { job: t.job })).status === 200, 'trial 3')
  await until(async () => (await jobGet(a, t.job)).job.approved?.state === 'trial_done', 60_000, 'trial 3')
  assert((await jpost(a, '/api/jobs/start', { job: t.job, budget: 1000, confirm: true })).status === 200, 'start 3')
  await until(async () => (await jobGet(a, t.job)).job.approved?.state === 'paused', 60_000, 'the budget pausing it')
  const j3 = (await jobGet(a, t.job)).job
  assert(/budget/.test(j3.note ?? ''), `note: ${j3.note}`)
  return `cancelled at ${d1} of 10; the third paused at ${j3.progress.done} of 12: "${j3.note}"`
})

await check('an idle workspace stops, its event stream does not wake it, and opening the project does ("Waking your project…")', async () => {
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
  await A.page.getByText("Waking your project. This takes a few seconds…").waitFor({ timeout: 10_000 })
  await A.page.waitForFunction(() => document.querySelector('.project-title')?.textContent === 'Made-up eviction report', null, { timeout: 60_000 })
  const back = state()
  assert(back === 'running', `after opening: ${back}`)
  return `stopped ${(after / 1000).toFixed(1)} s after its last request (limit 3 s, swept each second); event stream 503 asleep; the page said "Waking your project…", then opened it`
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
      assert(!hg[`ws-${FA}`] && !hg['ws-gone-zz'], `the hosted grants after the removal (no run going on, so none): ${JSON.stringify(hg)}`)
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
      assert(!hostedFile()[`ws-${FA}`] && dbRow(`SELECT hosted_enabled AS h FROM workspaces WHERE slug = '${FA}'`).h === 1, 'the reopened project: its switch kept, no standing grant')
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
