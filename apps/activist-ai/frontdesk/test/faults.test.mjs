// Ola counting its own failures (OLA-235, frontdesk/faults.mjs) without a workspace: refusals named
// from the answer, failed steps and stopped runs from opencode's message list, one row per kind per
// turn (a turn counted once), labels only (a planted request is in no file of the database), a kept
// local turn read the same way, "This was wrong" kept only with the person's yes and deleted when
// they take it back, and the summary the board reads. Run: node --test frontdesk/test/faults.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from '../db.mjs'
import { keptKinds, makeFaults, marks, readTurn, refusalOf, runKindOf, stepKindOf, summary } from '../faults.mjs'

const dir = () => mkdtempSync(path.join(tmpdir(), 'ola-faults-test-'))

function project(db) {
  const person = (h) => Number(db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES (?, ?, 'active', 0, randomblob(32), 0)").run(h, h).lastInsertRowid)
  const o = person('olive')
  const team = Number(db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('tm-f', 'F', 0)").run().lastInsertRowid)
  db.prepare("INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, ?, 'owner', 0)").run(team, o)
  const w = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('fa-a', 'A', ?, 'active', 0)").run(team).lastInsertRowid)
  return { ws: { id: w, slug: 'fa-a', role: 'owner' }, o }
}

// opencode 2.3's message list, as the front desk reads it (newest first, as it comes).
const conv = (request, { answer = '', tools = [], error = null, outcome = 'succeeded', turn = 'msg_u1', hosted = false } = {}) =>
  [
    { type: 'idle', id: 'i1', outcome, time: { created: 4 } },
    { type: 'assistant', id: 'a1', model: { id: hosted ? 'hosted' : 'general' }, content: [...tools.map((t, i) => ({ type: 'tool', id: `t${i}`, name: t.name, state: t.state })), { type: 'text', text: answer }], ...(error ? { error } : {}), time: { created: 3 } },
    { type: 'user', id: turn, text: request, time: { created: 2 } },
    { type: 'user', id: 'msg_u0', text: 'an earlier request', time: { created: 0 } },
    { type: 'assistant', id: 'a0', content: [{ type: 'text', text: 'I cannot do that from here.' }], time: { created: 1 } },
    { type: 'idle', id: 'i0', outcome: 'succeeded', time: { created: 1.5 } },
  ]

test('refusals are named from the answer; ordinary answers are not refusals', () => {
  const cases = [
    ['I can’t publish from here: press the Publish button.', 'cannot_here'],
    ['Publishing is not switched on yet on this server.', 'not_switched_on'],
    ['This workspace has no internet access, so I cannot download the file.', 'no_network'],
    ["I don't have a tool for sending text messages.", 'no_tool'],
    ["You'll need to upload it yourself from the Files screen.", 'do_it_yourself'],
    ["I'm unable to open password-protected PDFs.", 'cannot'],
    ['I cannot read that format.', 'cannot'],
    ['Done. The page is at https://sites.ola.cx/bart/ and says Bart.', null],
    ['I made the chart and saved it as chart.png. You can open it here.', null],
    ['', null],
  ]
  for (const [answer, kind] of cases) assert.equal(refusalOf(answer), kind, answer)
})

test('failed steps and stopped runs, by kind; the person saying no or pressing Stop is not a fault', () => {
  assert.equal(stepKindOf({ tool: 'shell', message: '', exit: 2 }), 'step_shell')
  assert.equal(stepKindOf({ tool: 'edit', message: 'Invalid arguments for tool edit' }), 'step_invalid')
  assert.equal(stepKindOf({ tool: 'read', message: 'ENOENT: no such file' }), 'step_not_found')
  assert.equal(stepKindOf({ tool: 'websearch', message: 'fetch failed' }), 'step_web')
  assert.equal(stepKindOf({ tool: 'shell', message: 'The user declined this' }), null)
  assert.equal(runKindOf({ status: 429, message: 'weekly allowance used up' }, 'failed'), 'run_quota')
  assert.equal(runKindOf({ status: 503 }, 'failed'), 'run_busy')
  assert.equal(runKindOf(null, 'interrupted'), null)
  assert.equal(runKindOf(null, 'succeeded'), null)
  assert.equal(runKindOf(null, 'failed'), 'run_stopped')
})

test('one turn of the message list: its refusal, its failed steps, its engine; not finished is null', () => {
  const t = readTurn(conv('send this as a text message to my phone', {
    answer: "I don't have a tool for sending texts.",
    tools: [{ name: 'shell', state: { status: 'completed', metadata: { exit: 1 } } }, { name: 'read', state: { status: 'error', error: { message: 'ENOENT' } } }, { name: 'write', state: { status: 'completed', metadata: {} } }],
    hosted: true,
  }))
  assert.deepEqual(t.kinds, ['no_tool', 'step_shell', 'step_not_found'])
  assert.equal(t.engine, 'hosted')
  assert.equal(t.turnId, 'msg_u1')
  assert.equal(readTurn(conv('x').filter((m) => m.type !== 'idle')), null, 'no idle message yet: not finished')
  assert.deepEqual(readTurn(conv('x', { answer: 'Done.' })).kinds, [])
  assert.deepEqual(readTurn(conv('x'), 'msg_u0').kinds, ['cannot_here'], 'an earlier turn, by its id')
})

test('a finished cloud run: labels only, counted once; the request is in no file of the database', async () => {
  const d = path.join(dir(), 'fd')
  const db = openDb(d)
  const { ws } = project(db)
  const PLANTED = 'Quennell Vashkin rent strike flyer for the Brandvold tenants'
  let list = conv(PLANTED, { answer: 'I cannot publish from here, Quennell Vashkin.', tools: [{ name: 'shell', state: { status: 'completed', metadata: { exit: 1 } } }] })
  const workspaces = { oc: async () => ({ status: 200, json: { data: list } }) }
  const f = makeFaults({ db, workspaces, settleMs: 0 })
  assert.equal(await f.fromRun(ws.slug, ws.id, 'ses_1'), 2)
  assert.equal(await f.fromRun(ws.slug, ws.id, 'ses_1'), 0, 'the same turn again: counted once')
  const rows = db.prepare('SELECT * FROM faults').all()
  assert.deepEqual(rows.map((r) => [r.runtime, r.engine, r.type, r.kind, r.work]), [['cloud', 'ola', 'refusal', 'cannot_here', 'design'], ['cloud', 'ola', 'step', 'step_shell', 'design']])
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  for (const name of readdirSync(d)) assert.ok(!readFileSync(path.join(d, name)).includes('Vashkin'), `${name} holds none of the request or the answer`)
  // A run that worked records nothing.
  list = conv('make a page', { answer: 'Done.', turn: 'msg_u9' })
  assert.equal(await f.fromRun(ws.slug, ws.id, 'ses_1'), 0)
  db.close()
})

test('a kept local turn is read the same way; a cloud kept turn is left to its run', () => {
  const db = openDb(path.join(dir(), 'fd'))
  const { o } = project(db)
  const keep = (runtime, turn, answer, steps, status = 'done') =>
    Number(db.prepare("INSERT INTO kept_turns (person_id, at, received_at, product, runtime, session, turn, engine, status, request, answer, steps) VALUES (?, ?, ?, 'mac', ?, 's1', ?, 'ola', ?, 'make a chart of the survey', ?, ?)").run(o, Date.now(), Date.now(), runtime, turn, status, answer, JSON.stringify(steps)).lastInsertRowid)
  const f = makeFaults({ db })
  assert.deepEqual(keptKinds({ answer: 'I am unable to read xlsx files.', steps: JSON.stringify([{ tool: 'shell', status: 'failed', error: 'The program stopped with an error. What it printed is under Show details.' }]), status: 'failed' }), ['cannot', 'step_shell', 'run_stopped'])
  assert.equal(f.fromKept(keep('local', 't1', 'I am unable to read xlsx files.', [])), 1)
  assert.equal(f.fromKept(keep('cloud', 't2', 'I cannot do that from here.', [])), 0)
  assert.deepEqual(db.prepare('SELECT runtime, kind, work FROM faults').all().map((r) => [r.runtime, r.kind, r.work]), [['local', 'cannot', 'data']])
  db.close()
})

test('"This was wrong": only with the yes, read from the project, once, and gone when taken back', async () => {
  const db = openDb(path.join(dir(), 'fd'))
  const { ws, o } = project(db)
  const workspaces = { oc: async () => ({ status: 200, json: { data: conv('make a page that says Bart and publish it', { answer: 'Press the Publish button yourself.' }) } }) }
  const f = makeFaults({ db, workspaces, settleMs: 0 })
  assert.equal((await f.mark(ws, o, { conversation: 'ses_1', turn: 'msg_u1' })).status, 400, 'no yes: nothing kept')
  assert.equal(db.prepare('SELECT count(*) AS n FROM wrong_marks').get().n, 0)
  assert.equal((await f.mark(ws, o, { conversation: 'ses_1', turn: 'msg_nope', yes: true })).status, 404)
  const r = await f.mark(ws, o, { conversation: 'ses_1', turn: 'msg_u1', yes: true, request: 'what the page claims', why: 'it did not publish' })
  assert.equal(r.status, 200)
  assert.equal((await f.mark(ws, o, { conversation: 'ses_1', turn: 'msg_u1', yes: true })).body.already, true, 'twice: kept once')
  const [m] = marks(db)
  assert.equal(m.request, 'make a page that says Bart and publish it', 'the request as the project has it, not as the page sent it')
  assert.equal(m.why, 'it did not publish')
  assert.deepEqual(f.marked(ws.id, o, 'ses_1'), ['msg_u1'])
  assert.equal(summary(db).wrong.marked, 1)
  assert.equal(f.unmark(ws, o, { conversation: 'ses_1', turn: 'msg_u1' }).body.deleted, 1)
  assert.equal(marks(db).length, 0)
  db.close()
})

test('the summary: requests, turns that went wrong per 100, by kind, by type, by day', async () => {
  const db = openDb(path.join(dir(), 'fd'))
  const { ws } = project(db)
  for (let i = 0; i < 10; i++) db.prepare("INSERT INTO audit (at, actor_kind, action, workspace_id) VALUES (?, 'run', 'run_started', ?)").run(Date.now(), ws.id)
  let n = 0
  const workspaces = { oc: async () => ({ status: 200, json: { data: conv('make a chart', { answer: 'I cannot do that from here.', turn: `msg_${n++}` }) } }) }
  const f = makeFaults({ db, workspaces, settleMs: 0 })
  await f.fromRun(ws.slug, ws.id, 'ses_1')
  await f.fromRun(ws.slug, ws.id, 'ses_2')
  const s = summary(db)
  assert.equal(s.requests, 10)
  assert.equal(s.turns, 2)
  assert.equal(s.per100, 20)
  assert.deepEqual(s.types, { refusal: 2, step: 0, run: 0 })
  assert.deepEqual(s.largest, { kind: 'cannot_here', words: 'said it cannot do this here', n: 2 })
  assert.equal(s.by_day.length, 14)
  assert.equal(s.by_day.at(-1).turns, 2)
  db.close()
})
