#!/usr/bin/env node
// OLA-213: a made-up day with Bart's requests. requests.mjs gives each one outcome (on a ticket, done
// that day, answered, or new), opens a ticket only for a new one, stores the counts, and a rerun opens
// nothing twice; the day's messages pass through a file (a 200 KB day arrives whole); a --dry run
// writes nothing anywhere; a failure of the tool is stored, and sweep.mjs post names it and the two
// ways on; a day not matched is refused. On a copy of the tracker (VENTURE_TRACKER_FAKE), with a
// stand-in collector (VENTURE_STEERS_SCRIPT) and the matcher's answer given (--answer): no model call.
//   node scripts/venture/requests-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'requests-test-'))
const fake = join(dir, 'tracker.json')
const log = join(dir, 'collector.log')
const file = (name, v) => (writeFileSync(join(dir, name), typeof v === 'string' ? v : JSON.stringify(v)), join(dir, name))
// the stand-in for steers.mjs: logs each call, writes the day's messages to --out, or fails
const stub = file('steers-stub.mjs', `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync(process.env.STUB_LOG, a.join(' ') + '\\n')
if (process.env.STUB_FAIL) { console.error('the transcripts could not be read'); process.exit(1) }
const machines = process.env.STUB_MACHINES ? JSON.parse(process.env.STUB_MACHINES) : []
if (a.includes('--out')) writeFileSync(a[a.indexOf('--out') + 1], JSON.stringify({ messages: JSON.parse(readFileSync(process.env.STUB_MESSAGES, 'utf8')), machines, host: 'here' }))
`)
const baseEnv = { ...process.env, VENTURE_TRACKER_FAKE: fake, VENTURE_STEERS_SCRIPT: stub, STUB_LOG: log }
delete baseEnv.VENTURE_PRIVATE
const node = (envX, script, ...a) => spawnSync(process.execPath, [here(script), ...a], { encoding: 'utf8', env: { ...baseEnv, ...envX }, timeout: 60000 })
const db = () => JSON.parse(readFileSync(fake, 'utf8'))
const DAY = '2026-11-19'
const T = (n, title) => ({ id: `OLA-${n}`, num: n, project: 'ola', title, what: '', area: 'ops', priority: 'P1', status: 'open', who: 'lead', opened_at: '2026-11-18T18:00:00Z', updated_at: '2026-11-18T18:00:00Z', links: [], proof: '' })
const reset = () => writeFileSync(fake, JSON.stringify({ venture_issues: [T(1, 'The Mac app gets a Cloud setting'), T(2, 'The board shows the open count')], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
// a 200 KB day: six real messages and long pastes between them
const pad = 'x'.repeat(40000)
const msgs = [
  { id: 1, at: '2026-11-19T17:05:00Z', source: 'terminal', where: 'm1', text: 'add a cloud setting to the mac app' },
  { id: 2, at: '2026-11-19T17:30:00Z', source: 'terminal', where: 'm1', text: `here is the log ${pad}` },
  { id: 3, at: '2026-11-19T18:10:00Z', source: 'text', where: 'imessage', text: `is the test server up? ${pad}` },
  { id: 4, at: '2026-11-19T19:20:00Z', source: 'terminal', where: 'm1', text: `the board should say how many issues are open ${pad}` },
  { id: 5, at: '2026-11-19T20:00:00Z', source: 'terminal', where: 'm1', text: `rename the button to Send ${pad}` },
  { id: 6, at: '2026-11-19T21:45:00Z', source: 'voice', where: 'call', text: `and the phone app needs a dark mode ${pad}` },
]
const messages = file('messages.json', msgs)
assert.ok(readFileSync(messages).length > 200e3, 'the made-up day is over 200 KB')
const R = (m, request, outcome, ticket, why, extra = {}) => ({ messages: [m], request, outcome, ticket, why, title: null, area: null, ...extra })
const answer = (dark) => file('answer.json', { requests: [
  R(1, 'A Cloud setting in the Mac app.', 'ticket', 'OLA-1', 'OLA-1 is that setting.'),
  R(3, 'Is the test server up?', 'answered', null, 'Kit answered at 10:12 am that it was up.'),
  R(4, 'The board says how many issues are open.', 'ticket', 'OLA-2', 'OLA-2 is that count.'),
  R(5, 'Rename the button to Send.', 'done', null, 'Commit 1234abcd renamed it that afternoon.'),
  R(6, 'A dark mode in the phone app.', dark ? 'ticket' : 'new', dark, dark ? `${dark} is it.` : 'No ticket is about a dark mode.', { title: 'The phone app gets a dark mode', area: 'apps' }),
] })
let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [])

try {
  reset()
  ok('sweep.mjs post refuses a day whose requests were not matched', () => {
    const r = node({}, 'sweep.mjs', 'post', file('entry.json', { day: DAY, summary: 'a made-up day' }), '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /Bart's requests of 2026-11-19 are not matched to tickets yet. Run node scripts\/venture\/requests.mjs --day 2026-11-19/)
  })

  ok('--dry writes nothing anywhere: no ticket, no state, no export, and the 200 KB day arrives whole', () => {
    const before = readFileSync(fake, 'utf8')
    const r = node({ STUB_MESSAGES: messages }, 'requests.mjs', '--day', DAY, '--answer', answer(null), '--dry')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /2026-11-19: 5 requests in 6 messages: 2 on a ticket, 1 done that day, 1 answered, 1 would be opened/)
    assert.match(r.stdout, /would open "The phone app gets a dark mode" \(apps\)/)
    assert.equal(readFileSync(fake, 'utf8'), before, 'the copy of the tracker is byte for byte the same')
    assert.deepEqual(calls().map((c) => c.split(' ')[0]), ['--collect'], 'the collector was asked to collect, never to export')
    assert.match(calls()[0], /--json --out \S+ --day 2026-11-19/)
  })

  ok('a real run: a question answered and a job done that day get no ticket; only the new request is opened', () => {
    const r = node({ STUB_MESSAGES: messages }, 'requests.mjs', '--day', DAY, '--answer', answer(null))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /1 opened \(OLA-3\)/)
    assert.equal(db().venture_issues.length, 3)
    const t = db().venture_issues.find((i) => i.id === 'OLA-3')
    assert.equal(t.title, 'The phone app gets a dark mode')
    assert.equal(t.area, 'apps')
    assert.equal(t.priority, 'P1')
    assert.match(t.what, /^Bart, Nov 19, 1:45 pm \(voice\): 'and the phone app needs a dark mode x+'\. Opened by the nightly request match/)
    const s = db().venture_state.find((x) => x.key === 'requests').value.days[DAY]
    assert.deepEqual(s.counts, { requests: 5, matched: 2, done: 1, answered: 1, opened: 1 })
    assert.deepEqual(s.requests.map((x) => `${x.outcome} ${x.ticket}`), ['ticket OLA-1', 'answered null', 'ticket OLA-2', 'done null', 'new OLA-3'])
  })

  ok('a rerun matches the opened ticket and opens nothing twice', () => {
    const r = node({ STUB_MESSAGES: messages }, 'requests.mjs', '--day', DAY, '--answer', answer('OLA-3'))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(db().venture_issues.length, 3)
    assert.deepEqual(db().venture_state.find((x) => x.key === 'requests').value.days[DAY].counts, { requests: 5, matched: 3, done: 1, answered: 1, opened: 1 })
  })

  ok('a ticket id the matcher made up counts as no ticket', () => {
    const r = node({ STUB_MESSAGES: messages }, 'requests.mjs', '--day', DAY, '--answer', answer('OLA-99'), '--dry')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /1 would be opened/)
    assert.match(r.stdout, /the matcher named OLA-99, which is not in the list/)
  })

  ok('a failure of the tool: --dry stores nothing; a real run stores it; post names it and the two ways on', () => {
    reset()
    const before = readFileSync(fake, 'utf8')
    const d = node({ STUB_FAIL: '1' }, 'requests.mjs', '--day', DAY, '--dry')
    assert.equal(d.status, 1)
    assert.match(d.stderr, /Bart's messages could not be read \(steers.mjs --collect\): the transcripts could not be read/)
    assert.equal(readFileSync(fake, 'utf8'), before, 'a failed dry run writes nothing either')
    const r = node({ STUB_FAIL: '1' }, 'requests.mjs', '--day', DAY)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /stored as failed for 2026-11-19/)
    const p = node({}, 'sweep.mjs', 'post', join(dir, 'entry.json'), '--dry')
    assert.equal(p.status, 1)
    assert.match(p.stderr, /requests.mjs failed for 2026-11-19 at .*: Bart's messages could not be read/)
    assert.match(p.stderr, /Either fix the cause and rerun it \(node scripts\/venture\/requests.mjs --day 2026-11-19\), or post with --requests-failed/)
    const short = node({}, 'sweep.mjs', 'post', join(dir, 'entry.json'), '--dry', '--requests-failed', 'eh')
    assert.match(short.stderr, /requests.mjs failed/, 'a reason of under 10 characters is not one')
    // a rerun that works replaces the failure
    const ok2 = node({ STUB_MESSAGES: messages }, 'requests.mjs', '--day', DAY, '--answer', answer(null))
    assert.equal(ok2.status, 0, ok2.stderr)
    assert.equal(db().venture_state.find((x) => x.key === 'requests').value.days[DAY].failed, undefined)
  })

  ok('every machine with a session that day: two made-up machines, one stale, fails named; zero messages fails, never "0 requests"', () => {
    reset()
    const fresh = { host: 'm4', messages: 3, newest: '2026-11-20T05:00:00Z', exportedAt: '2026-11-20T06:30:00Z', session: '2026-11-20T07:00:00Z' }
    const stale = { host: 'mini', messages: 2, newest: '2026-11-19T20:00:00Z', exportedAt: '2026-11-19T22:00:00Z', session: '2026-11-20T06:00:00Z' }
    const none = { host: 'here', messages: 0, newest: null, exportedAt: '2026-11-20T07:00:00Z', session: '2026-11-20T07:10:00Z' }
    const r = node({ STUB_MESSAGES: messages, STUB_MACHINES: JSON.stringify([fresh, stale]) }, 'requests.mjs', '--day', DAY, '--answer', answer(null))
    assert.equal(r.status, 1)
    assert.match(r.stdout, /machine m4: 3 message\(s\), newest 9:00 pm; export 2026-11-20T06:30Z; session that day until 11:00 pm/)
    assert.match(r.stdout, /machine mini: 2 message\(s\), newest 12:00 pm/)
    assert.match(r.stderr, /mini's export \(2026-11-19T22:00Z, newest message 12:00 pm\) is older than its session's last hour \(until 10:00 pm\): run node scripts\/venture\/steers.mjs --export on mini/)
    assert.doesNotMatch(r.stderr, /m4's export/, 'the fresh one is fine')
    assert.match(r.stderr, /stored as failed/)
    assert.equal(db().venture_issues.length, 2, 'nothing opened')
    const z = node({ STUB_MESSAGES: file('empty.json', []), STUB_MACHINES: JSON.stringify([fresh, none]) }, 'requests.mjs', '--day', DAY, '--answer', answer(null))
    assert.equal(z.status, 1)
    assert.match(z.stderr, /here had a session that day until 11:10 pm and its export holds no message from Bart/)
    assert.ok(db().venture_state.find((x) => x.key === 'requests').value.days[DAY].failed, 'stored as failed, not as 0 requests')
    const fine = node({ STUB_MESSAGES: messages, STUB_MACHINES: JSON.stringify([fresh, { ...stale, exportedAt: '2026-11-20T05:30:00Z' }]) }, 'requests.mjs', '--day', DAY, '--answer', answer(null))
    assert.equal(fine.status, 0, fine.stderr)
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)
