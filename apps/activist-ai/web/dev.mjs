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
let upstream, upstreamKey, upstreamModel
if (FAKE) {
  const fake = await startFakeModel()
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

// The gateway, with one caller: this workspace.
const gwPort = await freePort()
const gwToken = randomBytes(24).toString('hex')
child('gateway', process.execPath, [path.join(AI, 'gateway/server.mjs')], {
  env: {
    PATH: process.env.PATH,
    HOME: home,
    UPSTREAM_BASE_URL: upstream,
    UPSTREAM_API_KEY: upstreamKey,
    GATEWAY_TOKENS: `web:${gwToken}`,
    GATEWAY_MODELS: `general=${upstreamModel}`,
    GATEWAY_PORT: String(gwPort),
    GATEWAY_DB: path.join(run, 'gateway-usage.db'),
  },
}, [upstreamKey, gwToken])
await waitFor(`http://127.0.0.1:${gwPort}/v1/models`, { authorization: `Bearer ${gwToken}` })

// opencode's config, as the workspace image has it, but pointed at this gateway.
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
          models: { general: { modelID: 'general', name: 'general', capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 131072, output: 16000 } } },
        },
      },
      model: 'ola/general',
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
const proxy = makeProxy({ target: `http://127.0.0.1:${ocPort}`, authorization, work, log, webMode: () => (devWeb.always ? 'always' : 'ask') })
let vite = null
if (!DIST) {
  const { createServer } = await import('vite')
  vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.ts'), server: { middlewareMode: true, hmr: { port: await freePort() } }, appType: 'spa' })
}
const DIST_DIR = path.join(HERE, 'dist')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' }
// The page may load and call only its own origin. Production sets the same header.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))

const claudeStandin = makeClaudeStandin({ work })
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
    if (p === '/api/project' && req.method === 'GET') return json(res, 200, await projectPayload(files))
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
        person: { handle: 'dev', name: 'You' },
        csrf: 'dev',
        workspaces: [{ slug: 'dev', name: fixtureName, team: 'Dev', role: 'owner' }],
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
