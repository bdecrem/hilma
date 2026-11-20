#!/usr/bin/env node
// Ola's dev server: a stand-in for the front desk, for one made-up workspace on this Mac.
//
//   node dev.mjs                  the app with Vite (hot reload), a live model through the gateway
//   node dev.mjs --dist           serve the built app (npm run build first), as production will
//   node dev.mjs --fake-model     a scripted model instead of Together (no model calls; the checks use it)
//   node dev.mjs --port 4620      default 4620; 0 picks a free port
//
// What it starts, all on 127.0.0.1:
//   - the model gateway (../gateway/server.mjs) with a fresh caller token, pointed at Together
//     (TOGETHER_API_KEY from the environment or the repo's .env.local) or at the fake model;
//   - `opencode serve` in a temp folder holding the made-up survey (../spike/make-survey.py),
//     with a fresh Basic-auth password that stays in this process;
//   - one HTTP server for the page: the app, /oc/api/* forwarded to opencode on a short list of
//     routes (server/proxy.mjs), and the front desk's own /api/project and /api/files.
// No secret is printed. The browser never sees the opencode password or the gateway token.
// Prints `ready <url>` when everything answers. Ctrl-C stops all of it.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeFiles, MAX_UPLOAD_BYTES } from './server/files.mjs'
import { makeProxy } from './server/proxy.mjs'
import { projectPayload } from './server/project.mjs'
import { startFakeModel } from './server/fake-model.mjs'
import { fixture } from './server/fixture.mjs'
import { makeClaudeStandin } from './server/claude-standin.mjs'
import { makeHostedStandin } from './server/hosted-standin.mjs'
import { makeCompareStandin } from './server/compare-standin.mjs'
import { openDb } from '../frontdesk/db.mjs'
import { makeJobs } from '../frontdesk/jobs.mjs'
import { ACCEPTABLE_USE, folderCtx, makeSites, sitesConfig } from '../frontdesk/sites.mjs'
import { startFakeVercel } from './server/fake-vercel.mjs'
const fixtureName = fixture.project.name

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.join(HERE, '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const DIST = flag('--dist')
const FAKE = flag('--fake-model')
const PORT = Number(opt('--port', process.env.PORT ?? 4620))
const MODEL = process.env.OLA_DEV_MODEL ?? 'zai-org/GLM-5.3-Flash'
const log = (m) => console.log(`[dev] ${m}`)

// ---------------------------------------------------------------- the workspace folder
const run = fs.mkdtempSync(path.join(process.env.OLA_DEV_DIR ?? os.tmpdir(), 'ola-web-'))
const work = path.join(run, 'work')
const home = path.join(run, 'home')
fs.mkdirSync(work, { recursive: true })
fs.mkdirSync(path.join(home, '.config/opencode'), { recursive: true })
const made = spawnSync('python3', [path.join(AI, 'spike/make-survey.py'), work], { encoding: 'utf8' })
if (made.status !== 0) throw new Error(`make-survey failed: ${made.stderr}`)
const files = makeFiles({ work, manifestPath: path.join(run, 'uploads.json') })
await files.markUploaded('survey.csv', new Date(Date.now() - 3 * 86400_000).toISOString())

// ---------------------------------------------------------------- children
const children = []
function child(name, cmd, argv, opts, secrets = []) {
  const p = spawn(cmd, argv, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
  let tail = ''
  const keep = (d) => {
    tail = (tail + d).slice(-4000)
  }
  p.stdout.on('data', keep)
  p.stderr.on('data', keep)
  p.on('exit', (code, sig) => {
    if (!stopping) {
      let t = tail
      for (const s of secrets) t = t.replaceAll(s, '<secret>')
      log(`${name} exited (${code ?? sig}). Last output:\n${t.trim().split('\n').slice(-8).join('\n')}`)
    }
  })
  children.push(p)
  return p
}
let stopping = false
function stopAll(code = 0) {
  stopping = true
  for (const p of children) p.kill('SIGTERM')
  if (!process.env.OLA_DEV_KEEP) fs.rmSync(run, { recursive: true, force: true })
  process.exit(code)
}
process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

async function waitFor(url, headers = {}, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers })
      if (r.status < 500) return r.status
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`${url} did not answer`)
}
const freePort = () =>
  new Promise((ok) => {
    const s = http.createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => ok(p))
    })
  })

// The model behind the gateway.
let fakeModel = null // the scripted one, when --fake-model: its batch answers are the jobs checks'
let upstream, upstreamKey, upstreamModel
if (FAKE) {
  const fake = await startFakeModel()
  fakeModel = fake
  upstream = `http://127.0.0.1:${fake.port}/v1`
  upstreamKey = 'fake-model-key-not-a-secret'
  upstreamModel = 'fake'
} else {
  upstreamKey = process.env.TOGETHER_API_KEY
  if (!upstreamKey) {
    try {
      const env = fs.readFileSync(path.join(AI, '../../.env.local'), 'utf8')
      upstreamKey = /^TOGETHER_API_KEY=["']?([^"'\n]+)/m.exec(env)?.[1]
    } catch {}
  }
  if (!upstreamKey) {
    console.error('TOGETHER_API_KEY is not set and not in the repo .env.local. Use --fake-model to run without a model.')
    process.exit(2)
  }
  upstream = 'https://api.together.xyz/v1'
  upstreamModel = MODEL
}

// The hosted open model (Fallback to a hosted open model): a second scripted model with --fake-model,
// else OLA_DEV_HOSTED_MODEL on Together. OLA_DEV_HOSTED=unset: none (the switch shows disabled).
let hostedEnv = {}
const HOSTED_PROVIDER = FAKE ? 'Made-up Cloud' : 'Together AI'
if (process.env.OLA_DEV_HOSTED !== 'unset' && (FAKE || process.env.OLA_DEV_HOSTED_MODEL)) {
  const h = FAKE ? await startFakeModel({ hosted: true }) : null
  hostedEnv = {
    HOSTED_BASE_URL: FAKE ? `http://127.0.0.1:${h.port}/v1` : 'https://api.together.xyz/v1',
    HOSTED_API_KEY: FAKE ? 'fake-hosted-key-not-a-secret' : upstreamKey,
    HOSTED_MODEL: FAKE ? 'fake-hosted' : process.env.OLA_DEV_HOSTED_MODEL,
    HOSTED_PROVIDER,
    GATEWAY_HOSTED_FILE: path.join(run, 'gateway-hosted'),
    ...(process.env.OLA_DEV_HOSTED_PRICES ? { GATEWAY_HOSTED_PRICES: process.env.OLA_DEV_HOSTED_PRICES } : {}),
  }
  fs.writeFileSync(hostedEnv.GATEWAY_HOSTED_FILE, '{}', { mode: 0o600 })
}

// The gateway, with one caller: this workspace (named as a workspace is, so the hosted grants apply).
const gwPort = await freePort()
const batchFile = path.join(run, 'gateway-batch')
fs.writeFileSync(batchFile, '{}', { mode: 0o600 })
const gwToken = randomBytes(24).toString('hex')
const usageToken = randomBytes(24).toString('hex')
child('gateway', process.execPath, [path.join(AI, 'gateway/server.mjs')], {
  env: {
    PATH: process.env.PATH,
    HOME: home,
    UPSTREAM_BASE_URL: upstream,
    UPSTREAM_API_KEY: upstreamKey,
    GATEWAY_TOKENS: `ws-dev:${gwToken}`,
    GATEWAY_MODELS: `general=${upstreamModel}`,
    GATEWAY_PORT: String(gwPort),
    GATEWAY_DB: path.join(run, 'gateway-usage.db'),
    GATEWAY_USAGE_TOKEN: usageToken,
    // Batch jobs: the grants file the jobs stand-in writes (frontdesk/jobs.mjs writeBatchGrants).
    GATEWAY_BATCH_FILE: batchFile,
    ...hostedEnv,
  },
}, [upstreamKey, gwToken, usageToken])
await waitFor(`http://127.0.0.1:${gwPort}/v1/models`, { authorization: `Bearer ${gwToken}` })
const gatewayUsage = () =>
  fetch(`http://127.0.0.1:${gwPort}/v1/usage`, { headers: { authorization: `Bearer ${usageToken}` } })
    .then((r) => r.json())
    .catch(() => null)

// opencode's config, as the workspace image has it, but pointed at this gateway.
const reactionsNote = path.join(home, '.config/opencode/REACTIONS.md')
fs.writeFileSync(reactionsNote, fs.readFileSync(path.join(AI, 'workspace/AGENTS.md'), 'utf8').split('\n# Reactions\n')[1].trim() + '\n')
fs.writeFileSync(
  path.join(home, '.config/opencode/opencode.jsonc'),
  JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      providers: {
        ola: {
          name: 'Ola',
          env: ['BOX_API_KEY'],
          package: '@opencode/ai/providers/openai-compatible',
          settings: { baseURL: `http://127.0.0.1:${gwPort}/v1` },
          models: {
            general: { modelID: 'general', name: 'general', capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 131072, output: 16000 } },
            hosted: { modelID: 'hosted', name: 'hosted', capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 262144, output: 32000 } },
          },
        },
      },
      model: 'ola/general',
      // The reactions rule from the image's AGENTS.md (README, "Slash commands and reactions"); the
      // rest of that file describes the sealed VM, which this dev folder is not.
      instructions: [reactionsNote],
      update: 'disable',
      permissions: [
        { action: '*', resource: '*', effect: 'allow' },
        { action: 'webfetch', resource: '*', effect: 'deny' },
        { action: 'websearch', resource: '*', effect: 'deny' },
        { action: 'external_directory', resource: '*', effect: 'deny' },
      ],
    },
    null,
    2,
  ),
)

const ocPort = await freePort()
const password = randomBytes(24).toString('base64url')
const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`
const ocBin = [path.join(HERE, 'node_modules/.bin/opencode'), path.join(AI, 'node_modules/.bin/opencode')].find((p) => fs.existsSync(p))
let opencode
function startOpencode() {
  opencode = child('opencode', ocBin, ['serve', '--hostname', '127.0.0.1', '--port', String(ocPort)], {
    cwd: work,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      XDG_DATA_HOME: path.join(home, '.local/share'),
      XDG_STATE_HOME: path.join(home, '.local/state'),
      XDG_CACHE_HOME: path.join(home, '.cache'),
      BOX_API_KEY: gwToken,
      OPENCODE_PASSWORD: password,
      OPENCODE_DISABLE_MODELS_FETCH: '1',
      OPENCODE_DISABLE_AUTOUPDATE: '1',
    },
  }, [password, gwToken])
}
startOpencode()
await waitFor(`http://127.0.0.1:${ocPort}/api/info`, { authorization })

// ---------------------------------------------------------------- the page's server
let devWeb = { always: false, changedAt: null, changedBy: null, provider: 'Brave Search' }
// Uploads in pieces (the dev stand-in of the front desk's /api/uploads): small pieces, each held a
// moment (OLA_DEV_PIECE_MS), so the page's progress can be seen.
const pieces = new Map()
const DEV_CHUNK = 1024 * 1024
const DEV_PIECE_MS = Number(process.env.OLA_DEV_PIECE_MS) || 0
const proxy = makeProxy({ target: `http://127.0.0.1:${ocPort}`, authorization, work, log, webMode: () => (devWeb.always ? 'always' : 'ask') })
let vite = null
if (!DIST) {
  const { createServer } = await import('vite')
  vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.ts'), server: { middlewareMode: true, hmr: { port: await freePort() } }, appType: 'spa' })
}
const DIST_DIR = path.join(HERE, 'dist')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
// The page may load and call only its own origin. Production sets the same header.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))

// The signed-in person's role in the dev workspace (the checks make them a member with /__dev/role).
let devRole = 'owner'
const claudeStandin = makeClaudeStandin({ work, role: () => devRole })
// "Compare with Claude" and the admins' Quality page, stood in for (server/compare-standin.mjs).
const compareStandin = makeCompareStandin({ dir: path.join(run, 'compare-standin'), role: () => devRole })
// One request to opencode from the stand-in itself (the hosted run), as the front desk's workspaces.oc.
function oc(method, pathname, body = null) {
  return fetch(`http://127.0.0.1:${ocPort}${pathname}`, { method, headers: { authorization, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))
    .catch(() => ({ status: 0, json: null }))
}
// Batch jobs (frontdesk/jobs.mjs): a platform database with the one dev project in it.
const batchEnv = { ...process.env, OLA_WORK: work, OLA_BATCH_GATEWAY: `http://127.0.0.1:${gwPort}`, BOX_API_KEY: gwToken }
const devDb = openDb(path.join(run, 'platform'))
const devPerson = Number(devDb.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES ('dev', 'You', 'active', 0, randomblob(16), ?)").run(Date.now()).lastInsertRowid)
const devTeam = Number(devDb.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('dev', 'Dev', ?)").run(Date.now()).lastInsertRowid)
const devWs = { id: Number(devDb.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('dev', 'Dev', ?, 'active', ?)").run(devTeam, Date.now()).lastInsertRowid), slug: 'dev' }
const pyJson = (args) =>
  new Promise((resolve, reject) => {
    const c = spawn('python3', [path.join(AI, 'workspace/ola-batch'), ...args], { env: batchEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let o = ''
    let e = ''
    c.stdout.on('data', (d) => (o += d))
    c.stderr.on('data', (d) => (e += d))
    c.on('close', (code) => {
      if (code !== 0) return reject(Object.assign(new Error(e.trim()), { code: /no such job/.test(e) ? 'NO_JOB' : 'JOB_FAILED' }))
      try {
        resolve(JSON.parse(o))
      } catch {
        reject(Object.assign(new Error('out of shape'), { code: 'JOB_FAILED' }))
      }
    })
  })
let devJobs = null
const hostedStandin = makeHostedStandin({ oc, grantsFile: hostedEnv.GATEWAY_HOSTED_FILE ?? path.join(run, 'gateway-hosted-unused'), provider: hostedEnv.HOSTED_BASE_URL ? HOSTED_PROVIDER : null, usage: gatewayUsage, claudeInfo: () => claudeStandin.info(), role: () => devRole })
devJobs = makeJobs({
  db: devDb,
  jc: { file: batchFile, tickMs: 1000, staleMs: 15_000, maxTokens: 100_000_000 },
  cc: { usageToken, gateway: `http://127.0.0.1:${gwPort}` },
  workspaces: { ensureRunning: async () => {}, holdBusy: () => () => {} },
  hostedInfo: () => hostedStandin.info(),
  claudeInfo: async () => claudeStandin.info(),
  log,
  tool: {
    api: (_slug, args) => pyJson(['api', ...args]),
    runner: (_slug, job, key) => {
      const c = spawn('python3', [path.join(AI, 'workspace/ola-batch'), 'run', job, '--key-stdin'], { env: batchEnv, stdio: ['pipe', 'ignore', 'pipe'] })
      c.stdin.end(key + '\n')
      return c
    },
  },
})
// Publish (../frontdesk/sites.mjs), against the stand-in for Vercel (server/fake-vercel.mjs): the
// same module as the front desk, over the dev folder; the "public" site is the stand-in's origin.
const fakeToken = randomBytes(16).toString('hex')
const fakeVercel = await startFakeVercel({ token: fakeToken })
fs.writeFileSync(path.join(run, 'sites.env'), `OLA_SITES_VERCEL_TOKEN=${fakeToken}\n`, { mode: 0o600 })
const devSites = makeSites({ cfg: sitesConfig({ OLA_FD_SITES_ORIGIN: fakeVercel.origin, OLA_FD_SITES_API: fakeVercel.api, OLA_FD_SITES_FILE: path.join(run, 'sites.env'), OLA_FD_SITES_POLL_MS: '50', OLA_FD_SITES_VERIFY_MS: '5000' }), dataDir: path.join(run, 'fd'), log })
const uploadedHere = new Set()
let pagePort = PORT
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const p = url.pathname
  // Only this machine, by name: refuses DNS rebinding.
  const host = (req.headers.host ?? '').replace(/:\d+$/, '')
  if (host !== '127.0.0.1' && host !== 'localhost') return json(res, 421, { error: 'wrong_host' })
  // Writes only from our own page.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'wrong_origin' })
  }
  try {
    if (p.startsWith('/oc/')) return await proxy(req, res, p.slice(3), url.search)
    // Fallback to Claude, stood in for (server/claude-standin.mjs; the real one is the front desk's).
    if ((p === '/api/claude' || p.startsWith('/api/claude/')) && (await claudeStandin(req, res, p, url))) return
    // Both fallbacks and the hosted open model, stood in for (server/hosted-standin.mjs).
    if ((p.startsWith('/api/fallback') || p.startsWith('/api/hosted/') || p === '/__dev/hosted') && (await hostedStandin(req, res, p, url))) return
    if ((p === '/api/compare' || p.startsWith('/api/compare/') || p.startsWith('/api/quality') || p === '/__dev/compare') && (await compareStandin(req, res, p, url))) return
    if (process.env.OLA_DEV_CONTROLS === '1' && p === '/__dev/role' && req.method === 'POST') {
      devRole = url.searchParams.get('to') === 'member' ? 'member' : 'owner'
      return json(res, 200, { role: devRole, claudeOnce: claudeStandin.st.onceRuns ?? 0 })
    }
    if (p === '/api/project' && req.method === 'GET') return json(res, 200, await projectPayload(files))
    if (p === '/api/site' && req.method === 'GET') return json(res, 200, { published: devSites.status('dev-project'), canPublish: devRole === 'owner', configured: true, origin: fakeVercel.origin, acceptableUse: ACCEPTABLE_USE })
    if (p.startsWith('/api/site/')) {
      if (devRole !== 'owner') return json(res, 403, { error: 'owner_only', message: 'Only the project’s owner can publish its pages, or take them down.' })
      for (const f of await files.list()) if (f.origin === 'uploaded') uploadedHere.add(f.path)
      const ctx = folderCtx('dev-project', work, { uploaded: (rel) => uploadedHere.has(rel) })
      if (p === '/api/site/preview' && req.method === 'GET') {
        const sel = url.searchParams.has('page') ? { page: url.searchParams.get('page') } : { folder: url.searchParams.get('folder') ?? '' }
        const r = await devSites.preview(ctx, sel)
        return json(res, r.status, r.body)
      }
      let raw = ''
      for await (const c of req) raw += c
      const body = JSON.parse(raw || '{}')
      if (p === '/api/site/publish' && req.method === 'POST') {
        if (body.confirm !== true) return json(res, 400, { error: 'confirm', message: 'Publishing needs your yes in the sheet.' })
        const r = await devSites.publish(ctx, typeof body.page === 'string' ? { page: body.page } : { folder: body.folder }, body.fingerprint)
        return json(res, r.status, r.body)
      }
      if (p === '/api/site/unpublish' && req.method === 'POST') {
        const r = await devSites.unpublish('dev-project')
        return json(res, r.status, r.body)
      }
    }
    if (p === '/api/files' && req.method === 'GET') return json(res, 200, { files: await files.list() })
    if (p === '/api/files' && req.method === 'POST') {
      const r = await files.upload(url.searchParams.get('name') ?? '', req, { replace: url.searchParams.get('replace') === '1' })
      return json(res, r.status, r.body)
    }
    if (p.startsWith('/api/files/')) {
      const rel = decodeURIComponent(p.slice('/api/files/'.length))
      if (req.method === 'GET') {
        const f = await files.open(rel)
        if (!f) return json(res, 404, { error: 'not_found' })
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(f.size),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(rel))}`,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        return f.stream().pipe(res)
      }
      if (req.method === 'DELETE') return (await files.remove(rel)) ? json(res, 200, { deleted: rel }) : json(res, 404, { error: 'not_found' })
    }
    if (p === '/api/health') return json(res, 200, { ok: true })
    // The front desk's /api/me, for one made-up person who owns the one dev workspace. The dev
    // server has no sign-in; the real one is ../frontdesk/server.mjs.
    if (p === '/api/me' && req.method === 'GET')
      return json(res, 200, {
        person: { handle: 'dev', name: 'You', ...(devRole === 'owner' ? { admin: true } : {}) },
        csrf: 'dev',
        workspaces: [{ slug: 'dev', name: fixtureName, team: 'Dev', role: devRole === 'member' ? 'member' : 'owner' }],
        machine: { working: 1, capacity: 4 },
        policy: { maxUpload: MAX_UPLOAD_BYTES, searchProvider: 'Brave Search', deleteNotice: 'It is removed from Ola’s computer, and Ola can no longer read it. This cannot be undone. Your own copy, if you have one, is not touched.' },
      })
    if (p === '/api/signout' && req.method === 'POST') return json(res, 200, { ok: true })
    // Settings and Data, as the front desk serves them: the web choice in memory, the project
    // database through the real ola-db (../workspace/ola-db) on the dev folder.
    if (p === '/api/settings' && req.method === 'GET') return json(res, 200, { web: devWeb, role: 'owner' })
    if (p === '/api/settings/web' && req.method === 'POST') {
      let raw = ''
      for await (const c of req) raw += c
      const always = JSON.parse(raw || '{}').always
      if (typeof always !== 'boolean') return json(res, 400, { error: 'bad_json' })
      devWeb = { ...devWeb, always, changedAt: new Date().toISOString(), changedBy: 'You' }
      return json(res, 200, { web: devWeb })
    }
    if (p.startsWith('/api/data') && req.method === 'GET') {
      const q = url.searchParams
      const opt = (k, flag) => (q.get(k) ? [flag, q.get(k)] : [])
      const args =
        p === '/api/data' ? ['tables']
        : p === '/api/data/table' ? ['browse', '--table', q.get('name') ?? '', ...opt('offset', '--offset'), ...opt('limit', '--limit'), ...opt('sort', '--sort'), ...opt('dir', '--dir'), ...opt('q', '--q')]
        : p === '/api/data/docs' ? ['docs', ...opt('offset', '--offset'), ...opt('q', '--q')]
        : p === '/api/data/download' ? ['backup']
        : p === '/api/data/xlsx' ? ['xlsx', '--table', q.get('name') ?? '']
        : null
      if (!args) return json(res, 404, { error: 'not_found' })
      const child = spawn('python3', [path.join(AI, 'workspace/ola-db'), 'api', ...args], { env: { ...process.env, OLA_WORK: work }, stdio: ['ignore', 'pipe', 'pipe'] })
      if (args[0] === 'backup' || args[0] === 'xlsx') {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${args[0] === 'backup' ? 'dev-data.db' : 'table.xlsx'}"`, 'cache-control': 'no-store' })
        return child.stdout.pipe(res)
      }
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      const code = await new Promise((r) => child.on('close', r))
      return code === 0 ? json(res, 200, JSON.parse(out)) : json(res, code === 4 ? 404 : 502, { error: 'data_failed', message: 'The project’s data could not be read just now.' })
    }
    // Batch jobs, as the front desk serves them: the front desk's own code (frontdesk/jobs.mjs) with a
    // small platform database for the one dev project, ola-batch run on the dev folder, its model
    // calls through this gateway's batch lane with the grant that code writes.
    if (p === '/api/jobs' || p.startsWith('/api/jobs/')) {
      const w = { ...devWs, role: devRole }
      if (p === '/api/jobs' && req.method === 'GET') return json(res, 200, await devJobs.list(w))
      if (p === '/api/jobs/job' && req.method === 'GET') {
        const q = url.searchParams
        const r = await devJobs.show(w, q.get('id'), { stage: q.get('stage'), offset: Number(q.get('offset') ?? 0) || 0, limit: Number(q.get('limit') ?? 50) || 50, problems: q.get('problems') === '1' })
        return json(res, r.status, r.body)
      }
      const what = p.slice('/api/jobs/'.length)
      if (req.method !== 'POST' || !['trial', 'start', 'pause', 'resume', 'cancel'].includes(what)) return json(res, 404, { error: 'not_found' })
      let raw = ''
      for await (const c of req) raw += c
      const r = await devJobs.act(w, devPerson, what, JSON.parse(raw || '{}'))
      return json(res, r.status, r.body)
    }
    // Dev-only: a made-up web page saved under sources/ and recorded with its address, as ola-fetch
    // does in the VM, so the home's Sources can be seen without the web.
    if (process.env.OLA_DEV_CONTROLS === '1' && p === '/__dev/source' && req.method === 'POST') {
      const env = { ...process.env, OLA_WORK: work }
      fs.mkdirSync(path.join(work, 'sources'), { recursive: true })
      fs.writeFileSync(path.join(work, 'sources', 'coastal-plans.html'), '<!doctype html><html><head><title>Coastal adaptation plans, a made-up overview</title></head><body><h1>Coastal adaptation plans</h1><p>Several made-up coastal districts restored mangrove belts.</p></body></html>')
      spawnSync('python3', [path.join(AI, 'workspace/ola-db'), 'init'], { env })
      const r = spawnSync('python3', [path.join(AI, 'workspace/ola-db'), 'add', 'sources/coastal-plans.html', '--by', 'web', '--source', 'https://www.example.org/coastal-plans', '--fetched', new Date().toISOString()], { env, encoding: 'utf8' })
      return json(res, r.status === 0 ? 200 : 500, { ok: r.status === 0 })
    }
    // Dev-only: made-up studies in the project database and a job proposed over them, as the agent
    // would (workspace/testdata/make-corpus.py, ola-db add, ola-batch propose); `delay` holds each
    // scripted batch answer back (ms), so a running job can be seen.
    if (process.env.OLA_DEV_CONTROLS === '1' && p === '/__dev/batch' && req.method === 'POST') {
      if (url.searchParams.get('delay')) fakeModel && (fakeModel.batch.delayMs = Number(url.searchParams.get('delay')))
      if (url.searchParams.get('corpus')) {
        const n = String(Number(url.searchParams.get('corpus')) || 30)
        const dir = path.join(work, 'studies')
        spawnSync('python3', [path.join(AI, 'workspace/ola-db'), 'init'], { env: { ...process.env, OLA_WORK: work } }) // as ola-init does in the VM
        spawnSync('python3', [path.join(AI, 'workspace/testdata/make-corpus.py'), dir, path.join(run, 'truth.json'), '--n', n])
        for (const f of fs.readdirSync(dir).sort()) spawnSync('python3', [path.join(AI, 'workspace/ola-db'), 'add', `studies/${f}`, '--by', 'upload'], { env: { ...process.env, OLA_WORK: work } })
        fs.writeFileSync(path.join(run, 'spec.json'), JSON.stringify({ name: 'decisions', title: 'Who makes the adaptation decision, and when the planning horizon ends', instructions: 'Code what each study itself found, not what it cites.', fields: [{ name: 'decider', type: 'category', question: 'Who makes the adaptation decision?', values: ['households', 'local government', 'national government', 'firms', 'other'] }, { name: 'horizon', type: 'number', question: 'In what year does the planning horizon end?' }], documents: 'all', trial: 10 }))
        const out = await new Promise((resolve) => {
          const c = spawn('python3', [path.join(AI, 'workspace/ola-batch'), 'propose', path.join(run, 'spec.json')], { env: batchEnv, stdio: ['ignore', 'pipe', 'pipe'] })
          let o = ''
          c.stdout.on('data', (d) => (o += d))
          c.stderr.on('data', (d) => (o += d))
          c.on('close', () => resolve(o))
        })
        return json(res, 200, { job: /Proposed job ([0-9a-f]{12})/.exec(out)?.[1] ?? null, out })
      }
      return json(res, 200, { planted: fakeModel?.batch.planted ?? [], calls: fakeModel?.batch.calls ?? 0, maxInflight: fakeModel?.batch.maxInflight ?? 0 })
    }
    // Open for every kind and uploads in pieces, stood in for (the real ones are the front desk's,
    // which run these tools inside the VM): a table's rows through the real ola-view, the disk
    // through ola-db, a picture for <img> only, and pieces gathered in memory into the dev folder.
    if (p === '/api/view/table' && req.method === 'GET') {
      const q = url.searchParams
      const opt = (k, flag) => (q.get(k) ? [flag, q.get(k)] : [])
      const child = spawn('python3', [path.join(AI, 'workspace/ola-view'), 'table', q.get('path') ?? '', ...opt('offset', '--offset'), ...opt('limit', '--limit'), ...opt('sort', '--sort'), ...opt('dir', '--dir'), ...opt('q', '--q'), ...opt('sheet', '--sheet')], { env: { ...process.env, OLA_WORK: work }, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      const code = await new Promise((r) => child.on('close', r))
      return code === 0 ? json(res, 200, JSON.parse(out)) : json(res, 404, { error: 'not_shown', message: 'That table could not be shown. Download the file instead.' })
    }
    if (p === '/api/disk' && req.method === 'GET') {
      const child = spawn('python3', [path.join(AI, 'workspace/ola-db'), 'api', 'disk'], { env: { ...process.env, OLA_WORK: work }, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      await new Promise((r) => child.on('close', r))
      const d = JSON.parse(out)
      return json(res, 200, { ...d, uploaded: Math.min(d.files, (await files.list()).filter((f) => f.origin === 'uploaded').reduce((n, f) => n + f.size, 0)), maxUpload: 4096 * 1024 * 1024 })
    }
    if (p === '/api/thumb' && req.method === 'GET') {
      const rel = url.searchParams.get('path') ?? ''
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[rel.split('.').pop().toLowerCase()]
      const f = type && req.headers['sec-fetch-dest'] === 'image' ? await files.open(rel) : null
      if (!f) return json(res, 404, { error: 'not_found' })
      res.writeHead(200, { 'content-type': type, 'content-length': String(f.size), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" })
      return f.stream().pipe(res)
    }
    if (p.startsWith('/api/uploads')) {
      const m = /^\/api\/uploads\/([0-9a-f]{32})(\/finish)?$/.exec(p)
      if (p === '/api/uploads' && req.method === 'POST') {
        let raw = ''
        for await (const c of req) raw += c
        const { name, size } = JSON.parse(raw || '{}')
        for (const [id, u] of pieces) if (u.name === name && u.size === size) return json(res, 200, { id, have: u.have, chunk: DEV_CHUNK })
        const id = randomBytes(16).toString('hex')
        pieces.set(id, { name, size, have: 0, bufs: [] })
        return json(res, 201, { id, have: 0, chunk: DEV_CHUNK })
      }
      const u = m && pieces.get(m[1])
      if (!u) return json(res, 404, { error: 'no_upload' })
      if (!m[2] && req.method === 'GET') return json(res, 200, { id: m[1], have: u.have, size: u.size })
      if (!m[2] && req.method === 'PUT') {
        if (Number(url.searchParams.get('offset')) !== u.have) return json(res, 409, { error: 'offset', have: u.have })
        for await (const c of req) u.bufs.push(c), (u.have += c.length)
        if (DEV_PIECE_MS) await new Promise((r) => setTimeout(r, DEV_PIECE_MS))
        return json(res, 200, { have: u.have })
      }
      if (m[2] && req.method === 'POST') {
        pieces.delete(m[1])
        const { Readable } = await import('node:stream')
        const r = await files.upload(u.name, Readable.from(u.bufs), { replace: false, maxBytes: Infinity })
        return json(res, r.status, { ...r.body, path: u.name, size: u.size })
      }
      return json(res, 404, { error: 'not_found' })
    }
    // Dev-only switches for the checks: stop and start the workspace's opencode.
    if (process.env.OLA_DEV_CONTROLS === '1' && p === '/__dev/opencode' && req.method === 'POST') {
      const want = url.searchParams.get('to')
      if (want === 'stop') {
        opencode.kill('SIGTERM')
        await new Promise((r) => opencode.once('exit', r))
      } else {
        startOpencode()
        await waitFor(`http://127.0.0.1:${ocPort}/api/info`, { authorization })
      }
      return json(res, 200, { opencode: want })
    }
    if (p.startsWith('/api/') || p.startsWith('/__dev/')) return json(res, 404, { error: 'not_found' })
    if (vite) return vite.middlewares(req, res)
    // The built app: files from dist/, and index.html for every other path (hash routes).
    let file = path.join(DIST_DIR, path.normalize(p))
    if (!file.startsWith(DIST_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html')
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
    res.writeHead(200, {
      'content-type': type,
      'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-store',
      'content-security-policy': CSP,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    })
    fs.createReadStream(file).pipe(res)
  } catch (e) {
    log(`error on ${req.method} ${p}: ${e?.message ?? e}`)
    if (!res.headersSent) json(res, 500, { error: 'server_error' })
    else res.destroy()
  }
})
server.listen(PORT, '127.0.0.1', () => {
  pagePort = server.address().port
  log(`workspace folder: ${work}`)
  log(`model: ${FAKE ? 'scripted fake' : `${upstreamModel} on Together, through the gateway`}`)
  console.log(`ready http://127.0.0.1:${pagePort}/`)
})
