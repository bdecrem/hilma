#!/usr/bin/env node
// One live batch job with the real everyday model, on made-up studies (never real data):
//
//   node workspace/batch-live.mjs [--n 20] [--model zai-org/GLM-5.3-Flash]
//
// The gateway (gateway/server.mjs) with Together as the stand-in (TOGETHER_API_KEY, or the repo's
// .env.local; never printed) and a job grant, then ola-batch on a scratch project folder on this
// machine: 20 studies from testdata/make-corpus.py, a proposal, a trial of 10, the rest. Prints what
// the quote check found, how the values agree with the made-up truth, the tokens and the time. A few
// cents at most. The same tool runs in the sealed VM; here only the folder is on the host.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const N = Number(arg('--n', 20))
const MODEL = arg('--model', 'zai-org/GLM-5.3-Flash')
const key = process.env.TOGETHER_API_KEY || readFileSync(path.join(homedir(), 'Documents/code/hilma/.env.local'), 'utf8').split('\n').find((l) => l.startsWith('TOGETHER_API_KEY='))?.slice(17).replace(/^["']|["']$/g, '').trim()
if (!key) throw new Error('no TOGETHER_API_KEY')
const run = mkdtempSync(path.join(tmpdir(), 'ola-batch-live-'))
const work = path.join(run, 'work')
mkdirSync(work)
const token = randomBytes(24).toString('hex')
const usage = randomBytes(24).toString('hex')
const grants = path.join(run, 'gateway-batch')
writeFileSync(grants, '{}', { mode: 0o600 })
const port = 4000 + Math.floor(Math.random() * 900)
const gw = spawn(process.execPath, [path.join(HERE, '../gateway/server.mjs')], {
  env: { PATH: process.env.PATH, HOME: run, UPSTREAM_BASE_URL: 'https://api.together.xyz/v1', UPSTREAM_API_KEY: key, GATEWAY_TOKENS: `ws-live:${token}`, GATEWAY_MODELS: `general=${MODEL}`, GATEWAY_PORT: String(port), GATEWAY_DB: path.join(run, 'usage.db'), GATEWAY_USAGE_TOKEN: usage, GATEWAY_BATCH_FILE: grants },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
gw.stdout.on('data', (d) => (log += d))
gw.stderr.on('data', (d) => (log += d))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 50 && !log.includes('"event":"start"'); i++) await sleep(100)
const env = { ...process.env, OLA_WORK: work, OLA_BATCH_GATEWAY: `http://127.0.0.1:${port}`, BOX_API_KEY: token }
const py = (tool, args) => spawnSync('python3', [path.join(HERE, tool), ...args], { env, encoding: 'utf8' })
const batch = (args) =>
  new Promise((resolve) => {
    const c = spawn('python3', [path.join(HERE, 'ola-batch'), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => process.stderr.write(d))
    c.on('close', () => resolve(out))
  })
try {
  py('ola-db', ['init'])
  const truthFile = path.join(run, 'truth.json')
  spawnSync('python3', [path.join(HERE, 'testdata/make-corpus.py'), path.join(work, 'studies'), truthFile, '--n', String(N)])
  for (const f of readdirSync(path.join(work, 'studies')).sort()) py('ola-db', ['add', `studies/${f}`, '--by', 'upload'])
  writeFileSync(path.join(run, 'spec.json'), JSON.stringify({
    name: 'decisions', title: 'Who makes the adaptation decision, and when the planning horizon ends', instructions: 'Code what each study itself found.', documents: 'all', trial: 10,
    fields: [{ name: 'decider', type: 'category', question: 'Who makes the adaptation decision?', values: ['households', 'local government', 'national government', 'firms', 'other'] }, { name: 'horizon', type: 'number', question: 'In what year does the planning horizon end?' }],
  }))
  const proposed = await batch(['propose', path.join(run, 'spec.json')])
  const job = /Proposed job ([0-9a-f]{12})/.exec(proposed)[1]
  console.log(proposed.trim())
  writeFileSync(grants, JSON.stringify({ 'ws-live': { job, tokens: 2_000_000 } }), { mode: 0o600 })
  await sleep(2500)
  const t0 = Date.now()
  await batch(['api', 'set', '--job', job, '--state', 'trial', '--budget', '2000000'])
  await batch(['run', job])
  const t1 = Date.now()
  await batch(['api', 'set', '--job', job, '--state', 'running'])
  await batch(['run', job])
  const t2 = Date.now()
  const j = JSON.parse(await batch(['api', 'show', '--job', job, '--limit', '200']))
  const rows = j.results.rows.map((r) => Object.fromEntries(j.results.columns.map((c, i) => [c, r[i]])))
  const truth = JSON.parse(readFileSync(truthFile, 'utf8'))
  const tally = {}
  let right = 0
  let values = 0
  for (const r of rows) {
    for (const f of ['decider', 'horizon']) {
      tally[r[`${f}_check`]] = (tally[r[`${f}_check`]] ?? 0) + 1
      values++
      const want = truth[r.document][f]
      if (String(r[f]) === String(want) || (want === 'not stated' && r[`${f}_check`] === 'not stated')) right++
    }
  }
  const tries = rows.length ? JSON.parse(await batch(['api', 'status', '--job', job])).progress : null
  const u = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/v1/usage`, { headers: { authorization: `Bearer ${usage}` } })).text()).data[0].batch_job
  console.log(JSON.stringify({ model: MODEL, state: j.state, documents: rows.length, checks: tally, valuesRight: `${right} of ${values}`, trialSeconds: Math.round((t1 - t0) / 1000), restSeconds: Math.round((t2 - t1) / 1000), gatewayCount: { requests: u.requests, tokens_in: u.tokens_in, tokens_out: u.tokens_out }, progress: tries }))
  for (const r of rows.filter((x) => x.checked !== 'all quotes found').slice(0, 5)) console.log(`not all found: ${r.document}: decider=${r.decider} [${r.decider_check}] horizon=${r.horizon} [${r.horizon_check}]`)
} finally {
  gw.kill('SIGTERM')
  rmSync(run, { recursive: true, force: true })
}
