// The model check's tests (OLA-214): node --test ops/models-test.mjs (seconds, no VM, no model call).
// The real gateway (gateway/server.mjs) runs against a fake model server on loopback, and the real
// alarm (ops/watch.mjs --once, a child process) runs the check through it, with the clock faked by
// OLA_WATCH_NOW and its other checks off. The board's status and any text go to a fake server here.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DAY_BUDGET_USD, MODEL_DEFAULTS, dayCost, everyFor, judgeReply, plan } from './models.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const T = mkdtempSync(path.join(tmpdir(), 'ola-models-test-'))
const OLA = path.join(T, 'ola')
const LOGS = path.join(T, 'logs')
const STAGING = path.join(T, 'staging')
const UPSTREAM_KEY = 'up-fake-0d9c8b7a6f5e4d3c2b1a09f8e7d6c5b4'
const VENTURE_KEY = 'VK-fake-1a2b3c4d5e6f708192a3b4c5d6e7f8091'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ the fake model server
// mode per upstream model id: ok (a tool call), text, empty, 429, 503, slow (no answer for 5 s)
const mode = {}
const seen = []
let usageIn = 11000 // what the fake reports a try used
let upstream, board, gw
const statuses = []
const texts = []
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)))
before(async () => {
  mkdirSync(OLA, { recursive: true, mode: 0o700 })
  mkdirSync(LOGS)
  mkdirSync(STAGING)
  upstream = http.createServer(async (req, res) => {
    let b = ''
    for await (const c of req) b += c
    const body = JSON.parse(b)
    seen.push({ model: body.model, tools: (body.tools || []).length, chars: JSON.stringify(body.messages).length, maxTokens: body.max_tokens })
    const m = mode[body.model] ?? 'ok'
    const json = (status, o) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)))
    if (m === 'slow') {
      await sleep(5000)
      if (res.destroyed) return
    }
    if (m === '429') return json(429, { error: { message: 'Your account has used its allowance for this model. Add credits to continue.', type: 'rate_limit' } })
    if (m === '503') return json(503, { error: { message: 'Model is launching soon. Please try again later.' } })
    const message =
      m === 'empty' ? { role: 'assistant', content: '' } : m === 'text' || body.tools === undefined ? { role: 'assistant', content: 'At the library on Elm Street.' } : { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{"filePath":"members.csv"}' } }] }
    json(200, { id: 'x', model: body.model, choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: usageIn, completion_tokens: 120 } })
  })
  board = http.createServer((req, res) => {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => {
      const j = JSON.parse(b)
      assert.equal(j.key, VENTURE_KEY)
      if (req.url === '/api/venture/status') statuses.push(j.status)
      else texts.push(j.text)
      res.writeHead(200)
      res.end('{}')
    })
  })
  const up = await listen(upstream)
  const bp = await listen(board)
  writeFileSync(path.join(OLA, 'gateway-tokens'), `GATEWAY_TOKENS=ws-one:${'w'.repeat(32)}\n`, { mode: 0o600 })
  writeFileSync(path.join(T, 'venture.env'), `VENTURE_KEY=${VENTURE_KEY}\n`, { mode: 0o600 })
  gw = spawn(process.execPath, [path.join(HERE, '../gateway/server.mjs')], {
    env: {
      PATH: process.env.PATH,
      HOME: T,
      UPSTREAM_BASE_URL: `http://127.0.0.1:${up}/v1`,
      UPSTREAM_API_KEY: UPSTREAM_KEY,
      GATEWAY_MODELS: 'general=up/general-1,see=up/glimmer,read=up/glimmer',
      GATEWAY_BACKUP_MODELS: 'general=up/backup-1',
      GATEWAY_TOKENS_FILE: path.join(OLA, 'gateway-tokens'),
      GATEWAY_PORT: '0',
      GATEWAY_DB: path.join(T, 'usage.db'),
      GATEWAY_PROBE_WEEKLY_TOKENS: '3000000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  gw.stdout.on('data', (d) => (out += d))
  gw.stderr.on('data', (d) => (out += d))
  gw.out = () => out
  const end = Date.now() + 5000
  while (!/"event":"start"/.test(out)) {
    if (Date.now() > end) throw new Error(`the gateway did not start: ${out}`)
    await sleep(20)
  }
  gw.port = JSON.parse(out.split('\n').find((l) => l.includes('"event":"start"'))).port
  board.port = bp
})
after(() => {
  gw?.kill('SIGKILL')
  upstream?.close()
  board?.close()
  rmSync(T, { recursive: true, force: true })
})
beforeEach(() => {
  for (const k of Object.keys(mode)) delete mode[k]
  rmSync(path.join(OLA, 'watch-state.json'), { force: true })
  rmSync(path.join(OLA, 'models-state.json'), { force: true })
  statuses.length = 0
})

// ------------------------------------------------------------------ running the alarm
const at = (min) => new Date(Date.UTC(2026, 10, 20, 22, 0) + min * 60_000).toISOString() // 2 pm Pacific + min
function watch(now, extra = {}) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(HERE, 'watch.mjs'), '--once'], {
      env: {
        PATH: process.env.PATH,
        HOME: T,
        OLA_HOME: OLA,
        OLA_WATCH_LOGS: LOGS,
        OLA_WATCH_STAGING: STAGING,
        OLA_WATCH_NOW: now,
        OLA_WATCH_OFF: 'disk,memory,web,public,almanac,vms,nightly', // only the model check runs
        OLA_WATCH_GW_PORT: String(gw.port),
        OLA_WATCH_KEY_FROM: path.join(T, 'venture.env'),
        OLA_WATCH_SEND_BASE: `http://127.0.0.1:${board.port}`,
        OLA_WATCH_PUSH_EVERY_MIN: '1',
        OLA_WATCH_MODELS_TIMEOUT_S: '3',
        ...extra,
      },
    })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (out += d))
    c.on('close', (code) => {
      // No key and no token ever reaches the output or a file of the check's.
      const token = readFileSync(path.join(OLA, 'gateway-probe'), 'utf8').trim()
      const files = [path.join(OLA, 'watch-state.json'), path.join(OLA, 'models-state.json'), ...readdirSync(LOGS).map((f) => path.join(LOGS, f))].filter(existsSync)
      for (const [name, blob] of [['output', out], ['board', JSON.stringify(statuses)], ['gateway log', gw.out()], ...files.map((f) => [f, readFileSync(f, 'utf8')])]) {
        for (const secret of [UPSTREAM_KEY, VENTURE_KEY, token]) assert.ok(!blob.includes(secret), `a secret leaked into ${name}`)
      }
      resolve({ code, out, board: statuses.at(-1) })
    })
  })
}
const models = () => JSON.parse(readFileSync(path.join(OLA, 'models-state.json'), 'utf8'))
const watchState = () => JSON.parse(readFileSync(path.join(OLA, 'watch-state.json'), 'utf8'))
/** Waits until the gateway knows the check's token (it reads the file within seconds). */
async function known() {
  const token = readFileSync(path.join(OLA, 'gateway-probe'), 'utf8').trim()
  for (let i = 0; i < 100; i++) {
    const r = await fetch(`http://127.0.0.1:${gw.port}/v1/models`, { headers: { authorization: `Bearer ${token}` } })
    if (r.status === 200) return
    await sleep(100)
  }
  throw new Error('the gateway never read the token file')
}

// ------------------------------------------------------------------ the tests (in order: the first makes the token)
test('first run: the check makes its own token (mode 600), the gateway learns it, and it is a quiet warning meanwhile', async () => {
  const r = await watch(at(0))
  assert.equal(r.code, 0, r.out)
  const f = path.join(OLA, 'gateway-probe')
  assert.equal(statSync(f).mode & 0o777, 0o600)
  assert.match(r.out, /model check: the model connection does not know the check yet/)
  assert.deepEqual(texts, [], 'never texted')
  await known()
})

test('a model that passes: every model is tried once, the agent ones with tools at real size, and the board says nothing', async () => {
  await known()
  const n = seen.length
  const r = await watch(at(0))
  assert.equal(r.code, 0, r.out)
  const tried = seen.slice(n)
  assert.deepEqual(tried.map((s) => s.model).sort(), ['up/backup-1', 'up/general-1', 'up/glimmer'], 'one try per model: general, its backup, the specialists\' model once')
  const g = tried.find((s) => s.model === 'up/general-1')
  assert.equal(g.tools, 10)
  assert.ok(g.chars >= MODEL_DEFAULTS.MODELS_AGENT_CHARS, 'a real-size first step')
  assert.equal(g.maxTokens, 32000, 'a real output allowance, room for reasoning')
  assert.equal(tried.find((s) => s.model === 'up/glimmer').tools, 0)
  const st = models()
  assert.deepEqual(Object.values(st.models).map((m) => [m.upstream, m.ok, m.kind]).sort(), [['up/backup-1', true, 'tool call'], ['up/general-1', true, 'tool call'], ['up/glimmer', true, 'text']])
  assert.deepEqual(st.models['up/glimmer'].names, ['see', 'read'])
  assert.match(r.out, /model general ok/)
  assert.equal(r.board.alarm.state, 'ok')
  assert.deepEqual(r.board.alarm.says, [])
  // Two minutes later nothing is due: no request at all.
  const m = seen.length
  await watch(at(2))
  assert.equal(seen.length, m, 'nothing tried before it is due')
  // 15 minutes later only the everyday model (its backup hourly, the specialists every 30 minutes).
  await watch(at(15))
  assert.deepEqual(seen.slice(m).map((s) => s.model), ['up/general-1'])
})

test('an empty answer: one failure is not an alarm, two in a row are, on the board and in the record, never texted; it clears by itself', async () => {
  await known()
  await watch(at(0))
  mode['up/general-1'] = 'empty'
  let r = await watch(at(15))
  assert.equal(models().models['up/general-1'].fails, 1)
  assert.deepEqual(r.board.alarm.says, [], 'one failure is not an alarm')
  assert.match(r.out, /model general failed once/)
  r = await watch(at(30))
  const m = models().models['up/general-1']
  assert.equal(m.fails, 2)
  assert.equal(r.board.alarm.state, 'alarm')
  assert.equal(r.board.alarm.says.length, 1)
  const say = r.board.alarm.says[0]
  assert.match(say, /^Ola's model up\/general-1 \(general\) has refused real-size requests since Nov 20, 2:15 pm, 2 checks in a row: "the model produced an empty reply, 3 times"$/)
  assert.ok(!/model connection/i.test(say), 'the board drops lines about the model connection while it answers')
  assert.deepEqual(watchState().lastRun.alarms, ['model-up-general-1'])
  assert.match(r.out, /ALARM model-up-general-1/)
  assert.deepEqual(texts, [], 'never texted')
  // Still failing: the same line, the same since.
  r = await watch(at(45))
  assert.match(r.board.alarm.says[0], /since Nov 20, 2:15 pm, 3 checks in a row/)
  // It works again: the next pass clears it.
  delete mode['up/general-1']
  r = await watch(at(60))
  assert.equal(models().models['up/general-1'].ok, true)
  assert.deepEqual(r.board.alarm.says, [])
  assert.deepEqual(watchState().lastRun.alarms, [])
  assert.deepEqual(texts, [])
})

test('a 429 from the provider: kept with the provider\'s words; a failed model is tried again 15 minutes later whatever its interval', async () => {
  await known()
  await watch(at(0))
  mode['up/backup-1'] = '429'
  await watch(at(60)) // the backup's hourly turn
  let b = models().models['up/backup-1']
  assert.equal(b.ok, false)
  assert.match(b.said, /Your account has used its allowance for this model\. Add credits to continue\./)
  assert.match(b.said, /the model server answered 429, 3 times/)
  const n = seen.filter((s) => s.model === 'up/backup-1').length
  const r = await watch(at(75)) // 15 minutes later, not an hour
  assert.equal(seen.filter((s) => s.model === 'up/backup-1').length, n + 3, 'tried again (three tries in the gateway)')
  b = models().models['up/backup-1']
  assert.equal(b.fails, 2)
  assert.match(r.board.alarm.says.join('\n'), /^Ola's model up\/backup-1 \(backup of general\) has refused real-size requests since Nov 20, 3:00 pm, 2 checks in a row: ".*Add credits to continue\./m)
  assert.deepEqual(texts, [])
})

test('a 503 "launching soon" and a model that does not answer in time', async () => {
  await known()
  await watch(at(0))
  mode['up/general-1'] = '503'
  mode['up/glimmer'] = 'slow'
  await watch(at(30))
  const st = models().models
  assert.match(st['up/general-1'].said, /Model is launching soon\. Please try again later\./)
  assert.equal(st['up/glimmer'].ok, false)
  assert.equal(st['up/glimmer'].said, 'no answer within 3 s')
  assert.equal(st['up/glimmer'].status, 0)
  // The gateway finishes what it started after the check stopped waiting; nobody else is held up.
  await sleep(2500) // the slow reply ends 5 s after it began
})

test('the check\'s own allowance used up: a quiet warning about the check, no model blamed, nothing texted', async () => {
  await known()
  await watch(at(0))
  // Fill the check's week (3 million tokens): the fake now reports a million a try.
  usageIn = 1_000_000
  for (let i = 1; i <= 3; i++) await watch(at(i * 15))
  usageIn = 11000
  const st = models()
  assert.ok(st.own, 'the check knows its allowance is used up')
  assert.ok(Object.values(st.models).every((m) => m.ok !== false), 'no model blamed for it')
  const r = await watch(at(4 * 15))
  assert.match(r.board.alarm.warns.join('\n'), /the model check's own weekly allowance is used up/)
  assert.deepEqual(r.board.alarm.says, [])
  assert.deepEqual(texts, [])
})

test('the plan: one try per model through its first name, backups and the hosted slot included, other kinds left out', () => {
  const p = plan([
    { id: 'general', kind: 'chat', upstream: 'n/nemo' },
    { id: 'see', kind: 'chat', upstream: 'm/glimmer' },
    { id: 'translate', kind: 'chat', upstream: 'm/glimmer' },
    { id: 'design', kind: 'chat', upstream: 't/inkling' },
    { id: 'embed', kind: 'embed', upstream: 'e/x' },
    { id: 'backup:general', kind: 'chat', upstream: 'o/oss', backup_of: 'general' },
    { id: 'hosted', kind: 'chat', upstream: 'n/nemo', provider: 'Other Cloud' },
  ])
  assert.deepEqual(p.targets.map((t) => [t.key, t.via, t.shape, t.names.join('+')]), [
    ['n/nemo', 'general', 'agent', 'general'],
    ['t/inkling', 'design', 'agent', 'design'],
    ['m/glimmer', 'see', 'reader', 'see+translate'],
    ['o/oss', 'backup:general', 'agent', 'backup of general'],
    ['hosted:n/nemo', 'hosted', 'agent', 'hosted'],
  ])
  assert.deepEqual(p.skipped, ['embed'])
  assert.equal(judgeReply({ choices: [{ message: { content: 'x' }, finish_reason: 'content_filter' }] }, 'agent'), 'the provider refused the request (content filter)')
  assert.equal(judgeReply({ choices: [{ message: { content: null, tool_calls: [{ function: { name: 'nope', arguments: '{}' } }] } }] }, 'agent'), 'a call to a tool that was not offered')
})

test('cost: the models served on Nov 20 at their measured sizes stay under 50 cents a day at the default intervals', () => {
  const S = { ...MODEL_DEFAULTS }
  // Measured by a live pass on the mini, Nov 20, through a gateway of its own (README, "The model check").
  const measured = [
    ['nvidia/NVIDIA-Nemotron-3.5-Super-VL', 'general', 11441, 100],
    ['meta-models/Muse-Glimmer-30B', 'see', 2693, 259],
    ['openai/gpt-oss-120b', 'backup:general', 10383, 1704],
    ['thinkingmachines/Inkling-2-Small', 'design', 12255, 89],
    ['zai-org/GLM-5.3', 'hosted', 10887, 60],
  ]
  const st = { models: Object.fromEntries(measured.map(([upstream, via, tin, tout]) => [upstream, { upstream, via, names: [via], every: everyFor(S, via), okTokensIn: tin, okTokensOut: tout }])) }
  const { total, rows } = dayCost(S, st)
  assert.ok(rows.every((r) => r.priced))
  assert.ok(total < DAY_BUDGET_USD, `a day costs $${total.toFixed(3)}`)
})
