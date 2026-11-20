// Switches to Claude (OLA-157, frontdesk/switches.mjs) without a workspace: the kind of work, the
// ladder, labels and counts only for a web run (the request is in no table and no file), a made-up
// copy only where the owner has them made on their own, the sampler taking a switched request first
// and dropping its ids after, kept conversations as drafts that go when the person deletes them, and
// the summary the board reads. Run: node --test frontdesk/test/switches.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { openDb } from '../db.mjs'
import { compareConfig, makeCompare } from '../compare.mjs'
import { drafts, isSwitch, kindOf, makeSwitches, summary } from '../switches.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const dir = () => mkdtempSync(path.join(tmpdir(), 'ola-sw-test-'))

function project(db, auto = 'ask') {
  const person = (h) => Number(db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES (?, ?, 'active', 0, randomblob(32), 0)").run(h, h).lastInsertRowid)
  const o = person('olive')
  const team = Number(db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('tm-s', 'S', 0)").run().lastInsertRowid)
  db.prepare("INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, ?, 'owner', 0)").run(team, o)
  const w = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('sw-a', 'A', ?, 'active', 0)").run(team).lastInsertRowid)
  db.prepare('UPDATE workspaces SET compare_auto = ? WHERE id = ?').run(auto, w)
  return { ws: { id: w, slug: 'sw-a', role: 'owner' }, o }
}

test('the kind of work, from the request alone, as one fixed word', () => {
  const cases = [
    ['build me a smart app that uses ai to generate a crossword puzzle on demand', 'app'],
    ['make a simple memory game where you flip tiles to find matching pairs', 'app'],
    ['make a one-page site for our building meeting, with the date big', 'design'],
    ['the page looks ugly, make the colors and fonts nicer', 'design'],
    ['clean this spreadsheet: remove the duplicate rows and give me the totals per program', 'data'],
    ['make a chart of the survey answers by month', 'data'],
    ['write a two-page report summarizing the interviews as a docx and a pdf', 'document'],
    ['translate this letter to Spanish', 'document'],
    ['find the laws on detention and cite the articles', 'research'],
    ['hello there', 'other'],
    ['', 'other'],
  ]
  for (const [text, kind] of cases) assert.equal(kindOf(text), kind, text)
  assert.ok(isSwitch('ola', 'claude') && isSwitch('ola', 'hosted') && isSwitch('hosted', 'claude'))
  assert.ok(!isSwitch('claude', 'hosted') && !isSwitch('claude', 'ola') && !isSwitch('ola', 'ola') && !isSwitch(undefined, 'claude') && !isSwitch('gpt', 'claude'))
})

test('a web run after Ola: labels and counts only; the request is in no table and no file; a copy only with "A few each day, on their own"', () => {
  const d = path.join(dir(), 'fd')
  const db = openDb(d)
  const { ws } = project(db, 'ask')
  const sw = makeSwitches({ db })
  const PLANTED = 'Quennell Vashkin crossword app for the Brandvold tenants'
  assert.equal(sw.fromRun(ws, { request: PLANTED, why: 'asked' }, 'claude'), null, 'no last turn named: not a switch')
  assert.equal(sw.fromRun(ws, { request: PLANTED, switchedFrom: 'claude' }, 'hosted'), null, 'down the ladder: not a switch')
  const id = sw.fromRun(ws, { request: PLANTED, why: 'stuck', switchedFrom: 'ola', conversation: 'ses_abc', fromMessage: 'msg_1' }, 'claude')
  const row = db.prepare('SELECT * FROM switches WHERE id = ?').get(id)
  assert.deepEqual([row.product, row.runtime, row.from_engine, row.to_engine, row.reason, row.kind, row.copy_state, row.copy_session, row.copy_message], ['web', 'cloud', 'ola', 'claude', 'stuck', 'app', 'labels_only', null, null], 'the owner did not choose copies on their own')
  db.close()
  for (const f of readdirSync(d)) {
    const bytes = readFileSync(path.join(d, f)).toString('latin1')
    for (const w of ['Quennell', 'Vashkin', 'Brandvold']) assert.ok(!bytes.includes(w), `${w} found in ${f}`)
  }
  const db2 = openDb(d)
  db2.prepare("UPDATE workspaces SET compare_auto = 'daily'").run()
  const sw2 = makeSwitches({ db: db2 })
  const id2 = sw2.fromRun(ws, { request: 'make a chart of the survey', why: 'asked', switchedFrom: 'hosted', conversation: 'ses_abc', fromMessage: 'msg_2' }, 'claude')
  assert.deepEqual(Object.values(db2.prepare('SELECT copy_state, copy_session, copy_message, kind FROM switches WHERE id = ?').get(id2)), ['waiting', 'ses_abc', 'msg_2', 'data'])
  const id3 = sw2.fromRun(ws, { request: 'x', switchedFrom: 'ola', conversation: 'ses_abc', fromMessage: 'local-1763600000000' }, 'hosted')
  assert.equal(db2.prepare('SELECT copy_state FROM switches WHERE id = ?').get(id3).copy_state, 'labels_only', 'a turn the page has no id for yet cannot be copied')
  assert.throws(() => db2.prepare("INSERT INTO switches (at, product, runtime, from_engine, to_engine, reason, kind, copy_state, copy_session) VALUES (0, 'web', 'cloud', 'ola', 'claude', 'asked', 'app', 'made', 'ses_x')").run(), /CHECK/, 'ids are kept only while a copy waits')
})

test('the sampler takes a switched request first, then drops its ids; a waiting copy expires after a week or when the owner stops copies', async () => {
  const db = openDb(path.join(dir(), 'fd'))
  const { ws } = project(db, 'daily')
  const sw = makeSwitches({ db })
  const id = sw.fromRun(ws, { request: 'build me a to-do app', why: 'asked', switchedFrom: 'ola', conversation: 'ses_sw1', fromMessage: 'msg_sw1' }, 'claude')
  const calls = []
  const workspaces = { oc: async (...a) => (calls.push(a), { status: 200, json: { data: [] } }), ocCall: async (...a) => (calls.push(a), { status: 200, json: { data: [] } }), ensureRunning: async () => {}, executing: async () => new Set(), isReady: () => true, holdBusy: () => () => {}, peek: async () => new Map() }
  const claude = { info: async () => ({ configured: true, unavailable: null, mode: 'api_key' }), writeGrants: () => {} }
  const c = makeCompare({ db, xc: compareConfig({ OLA_HOME: dir(), OLA_FD_COMPARE_TICK_MS: '3600000' }), cc: {}, claude, hosted: { writeGrants: () => {}, info: async () => ({ configured: false }) }, workspaces, container: '/nonexistent', log: () => {}, switches: sw })
  const r = await c.sampleOnce()
  assert.equal(r.status, 404, 'the stand-in project has no such turn')
  assert.ok(calls.some((a) => a.join(' ').includes('ses_sw1')), `the switched conversation was read first: ${JSON.stringify(calls)}`)
  assert.ok(!calls.some((a) => a[1] === 'GET' && String(a[2]).startsWith('/api/session?')), 'no random pick was looked for')
  assert.deepEqual(Object.values(db.prepare('SELECT copy_state, copy_session, copy_message FROM switches WHERE id = ?').get(id)), ['failed', null, null])
  c.close()
  // expiry
  const old = sw.fromRun(ws, { request: 'x', switchedFrom: 'ola', conversation: 'ses_o', fromMessage: 'msg_o' }, 'claude')
  db.prepare('UPDATE switches SET at = ? WHERE id = ?').run(Date.now() - 8 * 86400_000, old)
  const fresh = sw.fromRun(ws, { request: 'x', switchedFrom: 'ola', conversation: 'ses_f', fromMessage: 'msg_f' }, 'claude')
  assert.equal(sw.nextCopy(ws.id).id, fresh)
  assert.equal(db.prepare('SELECT copy_state FROM switches WHERE id = ?').get(old).copy_state, 'labels_only')
  db.prepare("UPDATE workspaces SET compare_auto = 'ask'").run()
  assert.equal(sw.nextCopy(ws.id), null)
  assert.deepEqual(Object.values(db.prepare('SELECT copy_state, copy_session FROM switches WHERE id = ?').get(fresh)), ['labels_only', null])
})

test('kept conversations: a switch is recorded once, its draft is the request with both attempts, and both go when the person deletes them; the summary counts', () => {
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  const { ws, o } = project(db)
  const sw = makeSwitches({ db })
  const keep = (turn, engine, switched, answer, at) =>
    Number(
      db
        .prepare(
          `INSERT INTO kept_turns (person_id, at, received_at, product, runtime, session, turn, engine, status, request, answer, steps, switched_from) VALUES (?, ?, ?, 'mac', 'local', 'ses_k', ?, ?, 'done', ?, ?, ?, ?)
           ON CONFLICT(person_id, session, turn) DO UPDATE SET answer = excluded.answer RETURNING id`,
        )
        .get(o, at, at, turn, engine, 'build me a smart app that uses ai to generate a crossword puzzle on demand', answer, JSON.stringify([{ tool: 'write', words: 'Wrote index.html', status: 'done' }]), switched).id,
    )
  const now = Date.now()
  keep('m1', 'ola', null, 'Here it is.', now - 60_000)
  const k2 = keep('m2', 'claude', 'ola', 'A working crossword.', now)
  assert.ok(sw.fromKept(k2))
  assert.equal(keep('m2', 'claude', 'ola', 'A working crossword, fixed.', now), k2, 'the same turn again keeps its id')
  assert.equal(sw.fromKept(k2), null, 'and is not counted twice')
  assert.equal(sw.fromKept(keep('m3', 'ola', null, 'x', now)), null, 'not a switch')
  const [draft] = drafts(db, {})
  assert.equal(draft.kind, 'app')
  assert.match(draft.request, /crossword puzzle on demand/)
  assert.deepEqual([draft.attempts.ola.answer, draft.attempts.claude.answer, draft.attempts.ola.steps[0]], ['Here it is.', 'A working crossword, fixed.', 'Wrote index.html'])
  // the requests: one Ola run in the cloud, one Claude run, and three local kept turns
  db.prepare("INSERT INTO audit (at, actor_kind, action, workspace_id) VALUES (?, 'person', 'run_started', ?), (?, 'person', 'claude_used', ?), (?, 'person', 'run_started', ?)").run(now, ws.id, now, ws.id, now - 30 * 86400_000, ws.id)
  sw.fromRun(ws, { request: 'clean the spreadsheet rows', switchedFrom: 'ola', why: 'stuck' }, 'hosted')
  const s = summary(db, { days: 7 })
  assert.deepEqual([s.requests, s.switches, s.per100, s.largest.words, s.to.claude, s.to.hosted, s.reasons.stuck, s.products.mac, s.products.web, s.tasks.kept], [5, 2, 40, 'apps', 1, 1, 1, 1, 1, 1])
  assert.equal(s.by_day.length, 14)
  assert.equal(s.by_day.at(-1).switches, 2)
  assert.ok(!JSON.stringify(s).includes('crossword') && !JSON.stringify(s).includes('spreadsheet'), 'the summary holds no request')
  // the person deletes their kept turns (devices.mjs): the draft goes, the labels stay
  db.prepare('DELETE FROM kept_turns WHERE person_id = ?').run(o)
  assert.deepEqual(drafts(db, {}), [])
  const after = summary(db, { days: 7 })
  assert.deepEqual([after.switches, after.tasks.kept, after.tasks.labels_only], [2, 0, 2])
  // the admin's view, from the same database (labels; and the drafts only on this machine)
  const env = { ...process.env, OLA_FD_DATA: path.join(d, 'fd'), OLA_HOME: d }
  const out = spawnSync(process.execPath, [path.join(HERE, '../admin.mjs'), 'switches', '--json'], { env, encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  assert.equal(JSON.parse(out.stdout.trim().split('\n').pop()).switches, 2)
})
