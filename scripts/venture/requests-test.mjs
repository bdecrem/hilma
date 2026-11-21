#!/usr/bin/env node
// OLA-213: a made-up day with three requests from Bart, one of them with no ticket. requests.mjs
// matches each to a ticket, opens one for the request that has none, stores the counts, and a rerun
// opens nothing twice; sweep.mjs post refuses a day that was not matched. On a copy of the tracker
// (VENTURE_TRACKER_FAKE) with the matcher's answer given (--answer), so no model is called.
//   node scripts/venture/requests-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'requests-test-'))
const fake = join(dir, 'tracker.json')
const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
delete env.VENTURE_PRIVATE
const node = (script, ...a) => spawnSync(process.execPath, [here(script), ...a], { encoding: 'utf8', env, timeout: 60000 })
const file = (name, v) => (writeFileSync(join(dir, name), JSON.stringify(v)), join(dir, name))
const db = () => JSON.parse(readFileSync(fake, 'utf8'))
const DAY = '2026-11-19'
const T = (n, title) => ({ id: `OLA-${n}`, num: n, project: 'ola', title, what: '', area: 'ops', priority: 'P1', status: 'open', who: 'lead', opened_at: '2026-11-18T18:00:00Z', updated_at: '2026-11-18T18:00:00Z', links: [], proof: '' })
writeFileSync(fake, JSON.stringify({ venture_issues: [T(1, 'The Mac app gets a Cloud setting'), T(2, 'The board shows the open count')], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
const messages = file('messages.json', [
  { id: 1, at: '2026-11-19T17:05:00Z', source: 'terminal', where: 'm1', text: 'add a cloud setting to the mac app' },
  { id: 2, at: '2026-11-19T18:10:00Z', source: 'text', where: 'imessage', text: 'thanks' },
  { id: 3, at: '2026-11-19T19:20:00Z', source: 'terminal', where: 'm1', text: 'the board should say how many issues are open' },
  { id: 4, at: '2026-11-19T21:45:00Z', source: 'voice', where: 'call', text: 'and the phone app needs a dark mode' },
])
const answer = (third) => file('answer.json', { requests: [
  { messages: [1], request: 'A Cloud setting in the Mac app.', ticket: 'OLA-1', why: 'OLA-1 is that setting.', title: null, area: null },
  { messages: [3], request: 'The board says how many issues are open.', ticket: 'OLA-2', why: 'OLA-2 is that count.', title: null, area: null },
  { messages: [4], request: 'A dark mode in the phone app.', ticket: third, why: third ? `${third} is it.` : 'No ticket is about a dark mode.', title: 'The phone app gets a dark mode', area: 'apps' },
] })
let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }

try {
  ok('sweep.mjs post refuses a day whose requests were not matched', () => {
    const entry = file('entry.json', { day: DAY, summary: 'a made-up day' })
    const r = node('sweep.mjs', 'post', entry, '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /Bart's requests of 2026-11-19 are not matched to tickets yet. Run node scripts\/venture\/requests.mjs --day 2026-11-19/)
  })

  ok('three requests, one without a ticket: two matched, one opened, the counts stored', () => {
    const r = node('requests.mjs', '--day', DAY, '--messages', messages, '--answer', answer(null))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /2026-11-19: 3 requests in 4 messages, 2 already had a ticket, 1 opened \(OLA-3\)/)
    const t = db().venture_issues.find((i) => i.id === 'OLA-3')
    assert.equal(t.title, 'The phone app gets a dark mode')
    assert.equal(t.area, 'apps')
    assert.equal(t.priority, 'P1')
    assert.match(t.what, /^Bart, Nov 19, 1:45 pm \(voice\): 'and the phone app needs a dark mode'\. Opened by the nightly request match/)
    const s = db().venture_state.find((x) => x.key === 'requests').value.days[DAY]
    assert.deepEqual(s.counts, { requests: 3, matched: 2, opened: 1 })
    assert.deepEqual(s.opened, ['OLA-3'])
    assert.deepEqual(s.requests.map((x) => x.ticket), ['OLA-1', 'OLA-2', 'OLA-3'])
  })

  ok('a rerun matches the opened ticket and opens nothing twice', () => {
    const r = node('requests.mjs', '--day', DAY, '--messages', messages, '--answer', answer('OLA-3'))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(db().venture_issues.length, 3)
    assert.deepEqual(db().venture_state.find((x) => x.key === 'requests').value.days[DAY].counts, { requests: 3, matched: 2, opened: 1 })
  })

  ok('a ticket id the matcher made up counts as no ticket', () => {
    const r = node('requests.mjs', '--day', DAY, '--messages', messages, '--answer', answer('OLA-99'), '--dry')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /1 would be opened/)
    assert.match(r.stdout, /the matcher named OLA-99, which is not in the list/)
    assert.equal(db().venture_issues.length, 3, '--dry opens nothing')
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)
