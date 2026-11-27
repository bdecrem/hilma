#!/usr/bin/env node
// OLA-505 (Bart, Nov 27: "create a Tracker Issue feature in our issue tracker"): a tracker issue lists
// other issues (venture_issues.tracker, schema 013) and is not work itself. add --tracker makes one; link
// puts issues on its list with a note (again: replaces the note); unlink takes them off; linking to an
// ordinary issue is refused; show prints the list, and of a listed issue the tracker it is part of; list
// marks it. It is never on the plate, picked by the runner, listed by unchecked, started or done.
// On a copy of the tracker (VENTURE_TRACKER_FAKE), never the real one.   node scripts/venture/tracker-issue-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leadLine, openAt, pickTicket } from './_plate.mjs'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const dir = mkdtempSync(join(tmpdir(), 'tracker-issue-test-'))
try {
  const fake = join(dir, 'tracker.json')
  const T = (num, extra = {}) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area: 'model', priority: 'P1', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '', ...extra })
  writeFileSync(fake, JSON.stringify({ venture_issues: [T(1), T(2, { status: 'done', day: '2026-11-19' }), T(3)], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
  const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
  delete env.VENTURE_PRIVATE
  const issues = fileURLToPath(new URL('./issues.mjs', import.meta.url))
  const run = (...a) => spawnSync(process.execPath, [issues, ...a], { encoding: 'utf8', env, timeout: 60000 })
  const row = (id) => JSON.parse(readFileSync(fake, 'utf8')).venture_issues.find((r) => r.id === id)

  ok('add --tracker makes a tracker issue with an empty list, P2, open', () => {
    const r = run('add', 'Made-up ideas', '--tracker', '--area', 'model', '--what', 'a made-up list')
    assert.equal(r.status, 0, r.stderr)
    const t = row('OLA-4')
    assert.deepEqual(t.tracker, [])
    assert.equal(t.priority, 'P2')
    assert.equal(t.status, 'open')
    assert.equal(row('OLA-1').tracker, undefined)
  })
  ok('link puts issues on its list, with the note, in order', () => {
    const r = run('link', 'OLA-4', 'OLA-1', 'OLA-2', '--note', 'tried, kept')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(row('OLA-4').tracker, [{ id: 'OLA-1', note: 'tried, kept' }, { id: 'OLA-2', note: 'tried, kept' }])
  })
  ok('link again replaces the note and does not list it twice', () => {
    const r = run('link', 'OLA-4', 'OLA-2', '--note', 'measured: no gain, dropped')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(row('OLA-4').tracker, [{ id: 'OLA-1', note: 'tried, kept' }, { id: 'OLA-2', note: 'measured: no gain, dropped' }])
  })
  ok('linking to an issue that is not a tracker issue is refused in plain words', () => {
    const r = run('link', 'OLA-1', 'OLA-3')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /OLA-1 .* is not a tracker issue/)
    assert.equal(row('OLA-1').tracker, undefined)
  })
  ok('show of the tracker issue prints the list: id, status, title, note', () => {
    const r = run('show', 'OLA-4')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /lists 2 issue\(s\)/)
    assert.match(r.stdout, /OLA-1\s+next\s+a made-up ticket 1\n\s+tried, kept/)
    assert.match(r.stdout, /OLA-2\s+done\s+a made-up ticket 2\n\s+measured: no gain, dropped/)
  })
  ok('show of a listed issue says which tracker issue it is in', () => {
    assert.match(run('show', 'OLA-1').stdout, /part of: OLA-4 Made-up ideas/)
    assert.doesNotMatch(run('show', 'OLA-3').stdout, /part of:/)
  })
  ok('list marks a tracker issue as one', () => {
    const out = run('list').stdout
    assert.match(out, /OLA-4\s+P2 tracker \(2\)/)
    assert.match(out, /OLA-1\s+P1 next/)
  })
  ok('unlink takes it off the list', () => {
    const r = run('unlink', 'OLA-4', 'OLA-1')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(row('OLA-4').tracker, [{ id: 'OLA-2', note: 'measured: no gain, dropped' }])
    assert.equal(run('unlink', 'OLA-4', 'OLA-1').status, 1)
  })
  ok('a tracker issue is not on the plate', () => {
    const out = run('plate').stdout
    assert.doesNotMatch(out, /OLA-4/)
    assert.match(out, /OLA-1/)
  })
  ok('a tracker issue is never started, claimed, checked or done', () => {
    for (const a of [['start', 'OLA-4', '--who', 'builder'], ['claim', 'OLA-4'], ['done', 'OLA-4', '--proof', 'Bart: done'], ['check', 'OLA-4', 'internal', '--why', 'the project tracker only'], ['ready', 'OLA-4', '--on', 'x']]) {
      const r = run(...a)
      assert.equal(r.status, 1, `${a[0]}: ${r.stdout}`)
      assert.match(r.stderr, /is a tracker issue/)
    }
    assert.equal(row('OLA-4').status, 'open')
  })
  ok('unchecked never lists a tracker issue', () => {
    // even one forced into in_progress by hand
    const d = JSON.parse(readFileSync(fake, 'utf8'))
    d.venture_issues.find((r) => r.id === 'OLA-4').status = 'in_progress'
    writeFileSync(fake, JSON.stringify(d))
    const u = run('unchecked')
    assert.equal(u.status, 0, u.stderr)
    assert.doesNotMatch(u.stdout, /OLA-4\b/)
  })
  ok('the runner never picks a tracker issue, and it is not counted open', () => {
    const tracker = T(9, { priority: 'P0', tracker: [{ id: 'OLA-1', note: '' }] })
    const plain = T(10, { priority: 'P2' })
    assert.equal(pickTicket([tracker, plain]).pick.id, 'OLA-10')
    assert.equal(pickTicket([tracker]).pick, null)
    assert.equal(openAt([tracker, plain], Date.parse('2026-11-20T00:00:00Z')), 1)
    assert.match(leadLine([tracker, plain]).text ?? '', /0 P0/)
  })
  ok('tracker <id> turns an open issue into a tracker issue, with why, keeping its thread (OLA-348)', () => {
    assert.equal(run('tracker', 'OLA-3').status, 1, 'no --why is refused')
    const r = run('tracker', 'OLA-3', '--why', 'a batch of fixes, each its own ticket')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(row('OLA-3').tracker, [])
    assert.equal(row('OLA-3').status, 'open')
    assert.match(JSON.parse(readFileSync(fake, 'utf8')).venture_issue_activity.filter((a) => a.issue_id === 'OLA-3').map((a) => a.body).join('\n'), /made a tracker issue .*a batch of fixes/)
    assert.equal(run('link', 'OLA-3', 'OLA-1', '--note', 'built in the batch').status, 0)
    assert.match(run('done', 'OLA-3', '--proof', 'Bart: done').stderr, /is a tracker issue/)
  })
  ok('tracker refuses a done issue and a tracker issue', () => {
    const a = run('tracker', 'OLA-2', '--why', 'a batch of fixes, each its own ticket')
    assert.equal(a.status, 1)
    assert.match(a.stderr, /is done/)
    assert.equal(row('OLA-2').tracker, undefined)
    const b = run('tracker', 'OLA-3', '--why', 'a batch of fixes, each its own ticket')
    assert.equal(b.status, 1)
    assert.match(b.stderr, /already a tracker issue/)
  })
  console.log(`${n} of ${n} passed`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
