#!/usr/bin/env node
// The same survey task as run-once.sh, driven the way our own page will drive it:
// `opencode serve` running headless in the workspace, and this script as the page,
// talking to it over HTTP with @opencode/client (create a session, send the request,
// follow the event stream, wait for the end), then the same 16 checks.
//
//   BOX_API_KEY=<gateway token> node spike/serve-drive.mjs <label> <gateway's model name> [gateway url]
//
// Prints: how long the server took to come up, what it answers with no, wrong and right credentials,
// the event types seen and how many of each, time to finish, the checks.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OpenCode } from '@opencode/client'

const here = path.dirname(fileURLToPath(import.meta.url))
const [label, model, base = 'http://127.0.0.1:4180/v1'] = process.argv.slice(2)
if (!label || !model || !process.env.BOX_API_KEY) {
  console.error('usage: BOX_API_KEY=<token> node spike/serve-drive.mjs <label> <model> [gateway url]')
  process.exit(2)
}
const stamp = new Date().toTimeString().slice(0, 8).replaceAll(':', '')
const run = path.join(process.env.SPIKE_DIR || path.join(process.env.TMPDIR || '/tmp', 'activist-ai-spike'), `${label}-serve-${stamp}`)
const work = path.join(run, 'work')
const home = path.join(run, 'home')
mkdirSync(work, { recursive: true })
mkdirSync(home, { recursive: true })
const made = spawnSync('python3', [path.join(here, 'make-survey.py'), work], { encoding: 'utf8' })
if (made.status !== 0) throw new Error(made.stderr)
writeFileSync(path.join(run, 'truth.json'), made.stdout)
writeFileSync(
  path.join(work, 'opencode.jsonc'),
  JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      providers: {
        box: {
          name: 'The box',
          env: ['BOX_API_KEY'],
          package: '@opencode/ai/providers/openai-compatible',
          settings: { baseURL: base },
          models: { m: { modelID: model, name: label, capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 131072, output: 16000 } } },
        },
      },
      model: 'box/m',
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

// opencode's server wants Basic auth (user `opencode`). The front desk will make one
// password per workspace like this and keep it; it is never printed.
const password = randomBytes(24).toString('base64url')
const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`
const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}`
const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(1)
const server = spawn(path.join(here, '../node_modules/.bin/opencode'), ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: work,
  env: {
    PATH: process.env.PATH,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'),
    XDG_STATE_HOME: path.join(home, '.local/state'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    BOX_API_KEY: process.env.BOX_API_KEY,
    OPENCODE_PASSWORD: password,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
const stop = (code) => {
  server.kill('SIGTERM')
  writeFileSync(path.join(run, 'server.log'), serverLog.replaceAll(password, '<password>'))
  console.log(`   files: ${run}`)
  process.exit(code)
}
const limit = setTimeout(() => {
  console.log(`== ${label}: stopped after ${secs()} s without finishing`)
  stop(1)
}, Number(process.env.SPIKE_LIMIT_S || 300) * 1000)

// Wait for the server, and note whether it answers a caller with no credentials.
let open = null
for (let i = 0; i < 100 && open === null; i++) {
  await new Promise((r) => setTimeout(r, 200))
  try {
    const res = await fetch(`${url}/api/info`)
    open = res.status
  } catch {}
}
const wrong = await fetch(`${url}/api/info`, { headers: { authorization: `Basic ${Buffer.from('opencode:wrong').toString('base64')}` } }).then((r) => r.status)
const right = await fetch(`${url}/api/info`, { headers: { authorization } }).then((r) => r.status)
console.log(`server up after ${secs()} s; /api/info answers ${open} with no credentials, ${wrong} with a wrong password, ${right} with ours`)

const client = OpenCode.make({ baseUrl: url, headers: { authorization } })
const seen = new Map()
const events = (async () => {
  try {
    for await (const ev of client.event.subscribe()) seen.set(ev.type, (seen.get(ev.type) || 0) + 1)
  } catch (e) {
    seen.set(`(stream ended: ${e?.name || e})`, 1)
  }
})()

try {
  const session = await client.session.create({ location: { directory: work } })
  console.log(`session ${session.id} created at ${secs()} s`)
  await client.session.prompt({ sessionID: session.id, text: readFileSync(path.join(here, 'task-survey.txt'), 'utf8') })
  console.log(`request accepted at ${secs()} s`)
  await client.session.wait({ sessionID: session.id })
  console.log(`== ${label} (${model}) in server mode: finished at ${secs()} s`)
  const context = await client.session.context({ sessionID: session.id })
  console.log(`   messages in the session: ${context.length} (${[...new Set(context.map((m) => m.type ?? m.role ?? '?'))].join(', ')})`)
} catch (e) {
  console.log(`== ${label}: the client call failed at ${secs()} s: ${e?.message || e}`)
  console.log(`   ${JSON.stringify(e, Object.getOwnPropertyNames(e || {})).slice(0, 400)}`)
  clearTimeout(limit)
  stop(1)
}
clearTimeout(limit)
void events
console.log(`   events: ${[...seen].map(([k, v]) => `${k}×${v}`).join(', ')}`)
const checked = spawnSync('python3', [path.join(here, 'check-survey.py'), work, path.join(run, 'truth.json')], { encoding: 'utf8' })
console.log(checked.stdout.trim().split('\n').slice(-Number(process.env.SPIKE_TAIL || 1)).join('\n'))
stop(checked.status ?? 1)
