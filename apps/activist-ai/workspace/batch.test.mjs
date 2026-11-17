// ola-batch on the host, against the scripted model (no VM, no gateway): the quote check's rules,
// a job of 60 made-up studies with planted wrong quotes, the trial, the full run, a runner killed
// in the middle and started again, pause and cancel. `node --test workspace/batch.test.mjs`
// (workspace/check.mjs runs it too; the same tool is then proven inside the sealed VM).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from '../web/server/fake-model.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const work = mkdtempSync(path.join(tmpdir(), 'ola-batch-test-'))
const truthFile = path.join(mkdtempSync(path.join(tmpdir(), 'ola-batch-truth-')), 'truth.json')
const fake = await startFakeModel()
fake.server.unref()
const env = { ...process.env, OLA_WORK: work, OLA_BATCH_GATEWAY: `http://127.0.0.1:${fake.port}`, BOX_API_KEY: 'test-token-not-a-secret-000000' }
const py = (tool, args, opts = {}) => spawnSync('python3', [path.join(HERE, tool), ...args], { env, encoding: 'utf8', ...opts })
// ola-batch runs as a child that talks to the fake model in this process: never spawnSync it.
const pyAsync = (args) =>
  new Promise((resolve) => {
    const c = spawn('python3', [path.join(HERE, 'ola-batch'), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    c.stdout.on('data', (d) => (stdout += d))
    c.stderr.on('data', (d) => (stderr += d))
    c.on('close', (status) => resolve({ status, stdout, stderr }))
  })
const batch = async (...a) => {
  const r = await pyAsync(a)
  if (r.status !== 0) throw new Error(`ola-batch ${a.join(' ')}: ${r.stderr}`)
  return r.stdout
}
const api = async (...a) => JSON.parse(await batch('api', ...a))
const sqlite = (sql) => spawnSync('sqlite3', ['-json', path.join(work, 'project.db'), sql], { encoding: 'utf8' }).stdout

// The fake model answers to its upstream path, /v1/chat/completions, as the gateway's does.
const SPEC = {
  name: 'decisions',
  title: 'Who makes the adaptation decision, and when the planning horizon ends',
  instructions: 'Code what each study itself found.',
  fields: [
    { name: 'decider', type: 'category', question: 'Who makes the adaptation decision?', values: ['households', 'local government', 'national government', 'firms', 'other'] },
    { name: 'horizon', type: 'number', question: 'In what year does the planning horizon end?' },
  ],
  documents: 'all',
  trial: 15,
}

test('setup: 60 made-up studies in the project database', () => {
  assert.equal(py('ola-db', ['init']).status, 0)
  const dir = path.join(work, 'studies')
  assert.equal(spawnSync('python3', [path.join(HERE, 'testdata/make-corpus.py'), dir, truthFile], { encoding: 'utf8' }).status, 0)
  for (const f of readdirSync(dir).sort()) assert.equal(py('ola-db', ['add', `studies/${f}`, '--by', 'upload']).status, 0)
  const n = JSON.parse(sqlite('SELECT count(*) AS n, sum(pages) AS p FROM documents'))[0]
  assert.equal(n.n, 60)
  assert.ok(n.p >= 120, `pages: ${n.p}`)
})

test('the quote check: exact after whitespace, ligatures and line-break hyphens; short, ellipsis and invented quotes refused', async () => {
  const id = JSON.parse(sqlite("SELECT id FROM documents WHERE path = 'studies/study-004.txt'"))[0].id // hyphen + ligature
  // study 4 (n % 5 == 4): "The adap-\ntation decision is made by the other." on page 1
  const chk = async (page, q) => JSON.parse(await batch('check', String(id), page, q))
  assert.deepEqual((await chk('-', 'The adaptation decision is made by the other.')).result, 'found') // "adap-\ntation", any page
  assert.equal((await chk('1', 'The adaptation decision is made by the other.')).result, 'found')
  assert.equal((await chk('2', 'The adaptation decision is made by the other.')).result, 'found on another page')
  assert.equal((await chk('2', 'The planning horizon of the fisheries measures runs to')).result, 'found') // "ﬁ" in the text
  assert.equal((await chk('2', 'The   planning\nhorizon of the fisheries')).result, 'found') // white space
  assert.equal((await chk('1', 'the adaptation decision is made by the other.')).result, 'quote not found') // case
  assert.equal((await chk('1', 'decision is made')).result, 'quote not found') // three words
  assert.equal((await chk('1', 'The adaptation decision ... local government.')).result, 'quote not found')
  assert.equal((await chk('1', 'The adaptation decision is made by the firms.')).result, 'quote not found')
  // A curly apostrophe in the quote, a straight one in the text.
  const w = JSON.parse(sqlite("SELECT doc_id AS id FROM doc_text WHERE text LIKE '%Women''s groups ran savings circles%' LIMIT 1"))[0].id
  assert.equal(JSON.parse(await batch('check', String(w), '-', 'Women’s groups ran savings circles that met')).result, 'found')
})

let jid
test('propose: the form, the documents and an estimate; nothing runs', async () => {
  const spec = path.join(work, 'spec.json')
  writeFileSync(spec, JSON.stringify(SPEC))
  const out = await batch('propose', spec)
  jid = /Proposed job ([0-9a-f]{12})/.exec(out)[1]
  const j = await api('show', '--job', jid)
  assert.equal(j.state, 'proposed')
  assert.equal(j.progress.total, 60)
  assert.equal(j.progress.trial_total, 15)
  assert.ok(j.estimate.tokens > 60 * 1000 && j.estimate.budget > j.estimate.tokens, JSON.stringify(j.estimate))
  assert.equal(fake.batch.calls, 0)
  // A spec out of shape is refused in plain words.
  writeFileSync(spec, JSON.stringify({ ...SPEC, fields: [{ name: 'x', type: 'colour', question: 'what?' }] }))
  assert.match((await pyAsync(['propose', spec])).stderr, /type: one of/)
})

test('the trial codes 15 documents and stops for a yes', async () => {
  await api('set', '--job', jid, '--state', 'trial', '--budget', '2000000')
  await batch('run', jid)
  const j = await api('show', '--job', jid, '--stage', 'trial')
  assert.equal(j.state, 'trial_done')
  assert.equal(j.results.total, 15)
  assert.equal(j.progress.pending, 45)
})

test('the full run: killed in the middle and started again, no document coded twice; every planted quote caught', async () => {
  await api('set', '--job', jid, '--state', 'running')
  fake.batch.delayMs = 150
  const p = spawn('python3', [path.join(HERE, 'ola-batch'), 'run', jid], { env, stdio: 'ignore' })
  const pClosed = new Promise((r) => p.on('close', r))
  await new Promise((r) => setTimeout(r, 2500))
  p.kill('SIGKILL')
  await pClosed
  const mid = await api('status', '--job', jid)
  assert.ok(mid.progress.done > 15 && mid.progress.pending > 0, `after the kill: ${JSON.stringify(mid.progress)}`)
  const callsAtKill = fake.batch.calls
  fake.batch.delayMs = 0
  await batch('run', jid)
  const j = await api('show', '--job', jid, '--limit', '200')
  assert.equal(j.state, 'done')
  assert.equal(j.results.total, 60)
  // No document coded twice: one call per document, plus one retry for each planted quote (and at
  // most the one call in flight at the kill).
  const firsts = fake.batch.planted.filter((x) => !x.retry).length
  const tries = JSON.parse(sqlite(`SELECT sum(tries) AS t FROM batch_items WHERE job = '${jid}'`))[0].t
  assert.ok(tries <= 60 + firsts + 1, `tries ${tries}`)
  assert.ok(fake.batch.calls - callsAtKill <= 60 - mid.progress.done + firsts + 1)
  // Every planted quote: the first ones retried; those planted again are marked, never "found".
  const cols = j.results.columns
  const rows = j.results.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])))
  const byDoc = new Map(rows.map((r) => [r.document, r]))
  const truth = JSON.parse(readFileSync(truthFile, 'utf8'))
  const again = new Set(fake.batch.planted.filter((x) => x.retry).map((x) => x.title))
  assert.equal(firsts, 10)
  assert.equal(again.size, 5)
  for (const x of fake.batch.planted) {
    const r = byDoc.get(x.title)
    if (again.has(x.title)) assert.equal(r.decider_check, 'quote not found', `${x.title}: ${r.decider_check}`)
    else assert.equal(r.decider_check, 'found', `${x.title} after its retry`)
  }
  let found = 0
  for (const r of rows) {
    const t = truth[r.document]
    assert.equal(r.machine_coded, 1)
    if (r.decider_check === 'found') assert.equal(r.decider, t.decider, r.document)
    if (t.horizon === 'not stated') assert.equal(r.horizon_check, 'not stated', r.document)
    else if (r.horizon_check.startsWith('found')) assert.equal(r.horizon, t.horizon, r.document)
    if (r.checked === 'all quotes found') found++
    assert.notEqual(r.checked === 'all quotes found', again.has(r.document))
  }
  assert.equal(found, 55)
  // The table is in the Data tab's list, marked as machine-coded.
  const tables = JSON.parse(py('ola-db', ['api', 'tables']).stdout).tables
  const t = tables.find((x) => x.name === 'decisions')
  assert.ok(t && t.rows === 60 && /^machine-coded/.test(t.source) && /not source data/.test(t.description), JSON.stringify(t))
  assert.ok(!tables.some((x) => x.name.startsWith('batch_')))
  assert.equal(fake.batch.maxInflight, 1)
})

test('pause stops the runner within seconds; cancel keeps what was coded', async () => {
  const spec = path.join(work, 'spec2.json')
  writeFileSync(spec, JSON.stringify({ ...SPEC, name: 'second' }))
  const id = /Proposed job ([0-9a-f]{12})/.exec(await batch('propose', spec))[1]
  await api('set', '--job', id, '--state', 'running', '--budget', '2000000')
  fake.batch.delayMs = 400
  const p = spawn('python3', [path.join(HERE, 'ola-batch'), 'run', id], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let perr = ''
  p.stderr.on('data', (d) => (perr += d))
  const pClosed = new Promise((r) => p.on('close', r))
  await new Promise((r) => setTimeout(r, 2000))
  assert.equal(p.exitCode, null, `the runner ended early: ${perr}`)
  await api('set', '--job', id, '--state', 'paused')
  const t0 = Date.now()
  await pClosed
  assert.ok(Date.now() - t0 < 5000, 'the runner did not stop')
  const done = (await api('status', '--job', id)).progress.done
  await new Promise((r) => setTimeout(r, 1000))
  assert.equal((await api('status', '--job', id)).progress.done, done)
  // A second runner while one holds the job exits at once (the front desk may start one again).
  await api('set', '--job', id, '--state', 'running')
  const a = spawn('python3', [path.join(HERE, 'ola-batch'), 'run', id], { env, stdio: 'ignore' })
  const aClosed = new Promise((r) => a.on('close', r))
  await new Promise((r) => setTimeout(r, 700))
  assert.equal((await pyAsync(['run', id])).status, 3)
  await api('set', '--job', id, '--state', 'cancelled')
  await aClosed
  const s = await api('status', '--job', id)
  assert.equal(s.state, 'cancelled')
  assert.ok(s.progress.done >= done)
  fake.batch.delayMs = 0
})

test.after(() => {
  rmSync(work, { recursive: true, force: true })
  rmSync(path.dirname(truthFile), { recursive: true, force: true })
})
