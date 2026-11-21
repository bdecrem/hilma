#!/usr/bin/env node
// OLA-331: sweep.mjs post refuses while a daily idea of an earlier review is neither done nor
// dropped, and names it; and while the day's own ideas are not P1 tickets with their checks.
// On a copy of the tracker (VENTURE_TRACKER_FAKE), never the real one, and with --dry: nothing
// is stored and nobody is texted.
//   node scripts/venture/sweep-ideas-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sweep = fileURLToPath(new URL('./sweep.mjs', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sweep-ideas-'))
const fake = join(dir, 'tracker.json')
const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
delete env.VENTURE_PRIVATE
const run = (...a) => spawnSync(process.execPath, [sweep, ...a], { encoding: 'utf8', env, timeout: 60000 })
const T = (n, status) => ({ id: `OLA-${n}`, num: n, project: 'ola', title: `ticket ${n}`, status, priority: 'P1', opened_at: '2026-11-19T05:00:00Z' })
const tracker = (st) => ({
  venture_issues: [T(213, st[213]), T(214, st[214]), T(324, st[324]), T(325, st[325])],
  venture_state: [{ key: 'sweeps', at: '2026-11-21T05:00:00Z', value: { at: '2026-11-21T05:00:00Z', since: '2026-11-19', days: [
    { day: '2026-11-20', ideas: { kit: { issue: 'OLA-324' }, ola: { issue: 'OLA-325' } } },
    { day: '2026-11-19', ideas: { kit: { issue: 'OLA-213' }, ola: { issue: 'OLA-214' } } },
  ] } }],
  venture_issue_activity: [],
  venture_commits: [],
})
let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }

try {
  writeFileSync(fake, JSON.stringify(tracker({ 213: 'open', 214: 'done', 324: 'in_progress', 325: 'dropped' })))
  const before = readFileSync(fake, 'utf8')

  ok('ideas names the two unbuilt ideas and exits 1', () => {
    const r = run('ideas', '--day', '2026-11-21')
    assert.equal(r.status, 1, r.stderr)
    assert.match(r.stdout, /OLA-213 \(the Kit idea of 2026-11-19, open\)/)
    assert.match(r.stdout, /OLA-324 \(the Kit idea of 2026-11-20, in_progress\)/)
    assert.doesNotMatch(r.stdout, /OLA-214|OLA-325/, 'done and dropped are built')
  })

  ok('post refuses the next review and names them; nothing is stored', () => {
    const entry = join(dir, 'entry.json')
    writeFileSync(entry, JSON.stringify({ day: '2026-11-21', summary: 'a made-up day', ideas: { kit: { text: 'x', why: 'y', issue: 'OLA-400' }, ola: { text: 'x', why: 'y', issue: 'OLA-401' } } }))
    const r = run('post', entry, '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /the entry was not stored: 2 daily idea\(s\) of an earlier review are neither done nor dropped/)
    assert.match(r.stderr, /OLA-213/)
    assert.match(r.stderr, /OLA-324/)
    assert.doesNotMatch(r.stderr, /OLA-214|OLA-325/)
    assert.equal(readFileSync(fake, 'utf8'), before, 'the copy of the tracker is unchanged')
  })

  ok("the review's own day is not held by its own ideas", () => {
    const r = run('ideas', '--day', '2026-11-20')
    assert.equal(r.status, 1)
    assert.match(r.stdout, /OLA-213/)
    assert.doesNotMatch(r.stdout, /OLA-324/, 'a repost of Nov 20 is held only by Nov 19')
  })

  ok('when every idea is done or dropped, nothing holds the post', () => {
    writeFileSync(fake, JSON.stringify(tracker({ 213: 'done', 214: 'done', 324: 'dropped', 325: 'done' })))
    const r = run('ideas', '--day', '2026-11-21')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /every idea of the reviews before 2026-11-21 is done or dropped/)
  })
  ok("the day's own ideas: refused while a ticket is P2 or has no checks", () => {
    const t = tracker({ 213: 'done', 214: 'done', 324: 'done', 325: 'done' })
    t.venture_issues.push({ ...T(400, 'open'), priority: 'P2' }, T(401, 'open'))
    t.venture_state.push({ key: 'accept:OLA-401', at: '2026-11-21T05:00:00Z', value: { checks: [], skips: [], internal: { why: 'nothing a person sees; test x', by: 'lead', at: '2026-11-21T05:00:00Z' }, ready: null } })
    writeFileSync(fake, JSON.stringify(t))
    const entry = join(dir, 'entry.json')
    writeFileSync(entry, JSON.stringify({ day: '2026-11-21', summary: 'a made-up day', ideas: { kit: { text: 'x', why: 'y', issue: 'OLA-400' }, ola: { text: 'x', why: 'y', issue: 'OLA-401' } } }))
    const r = run('post', entry, '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /OLA-400 is P2: a daily idea is P1 work/)
    assert.match(r.stderr, /OLA-400 has no checks/)
    assert.doesNotMatch(r.stderr, /OLA-401/, 'a P1 marked internal with its test is ready for a builder')
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)
