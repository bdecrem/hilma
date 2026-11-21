#!/usr/bin/env node
// OLA-324: the tools that write a time refuse one more than three minutes later than the clock.
// A time ahead, a time behind, and yesterday's date, for each kind of note and for issues.mjs on a
// copy of the tracker (VENTURE_TRACKER_FAKE).   node scripts/venture/clock-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aheadLine, noteAhead, textAhead } from './_clock.mjs'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const NOW = Date.parse('2026-11-21T02:09:00Z') // Nov 20, 6:09 pm Pacific
const AFTER_MIDNIGHT = Date.parse('2026-11-21T08:05:00Z') // Nov 21, 12:05 am Pacific

ok('LOG.md headings: ahead refused, within three minutes and behind kept, yesterday kept', () => {
  assert.deepEqual(noteAhead('LOG.md', '## 2026-11-20, 6:25 pm (M4 session)\nwork', NOW), [{ said: '2026-11-20, 6:25 pm', ahead: 16 }])
  assert.deepEqual(noteAhead('LOG.md', '## 2026-11-20, 6:12 pm (M1 session)\n', NOW), [], 'three minutes are allowed')
  assert.equal(noteAhead('LOG.md', '## 2026-11-20, 6:13 pm (M1 session)\n', NOW).length, 1, 'four are not')
  assert.deepEqual(noteAhead('LOG.md', '## 2026-11-20, 5:50 pm (M1 session)\n', NOW), [])
  assert.deepEqual(noteAhead('LOG.md', '## 2026-11-19, 11:50 pm (mini runner)\n## 2026-11-19, 9:00 am\n', NOW), [], "yesterday's date, at a clock time later than now")
  assert.equal(noteAhead('LOG.md', '## 2026-11-21, 9:00 am\n', NOW).length, 1, "tomorrow's date")
})

ok("NOW.md's updated line and a handoff's first line", () => {
  assert.equal(noteAhead('NOW.md', '# NOW (updated Nov 20, 6:25 pm)\n\nbody at 11:00 pm', NOW)[0].ahead, 16)
  assert.deepEqual(noteAhead('NOW.md', '# NOW (updated Nov 20, 6:05 pm)\n', NOW), [])
  assert.deepEqual(noteAhead('NOW.md', '# NOW (updated Nov 19, 11:30 pm)\n', NOW), [], "yesterday's date")
  const h = (d, t) => `# Handoff to the M1 session, Friday ${d}, 2026 (written by the M4 session at ${t}, read from the clock)\nBart at 9:00 pm said`
  assert.equal(noteAhead('HANDOFF-M4-2026-11-20.md', h('November 20', '6:20 pm'), NOW)[0].ahead, 11)
  assert.deepEqual(noteAhead('HANDOFF-M4-2026-11-20.md', h('November 20', '5:31 pm'), NOW), [])
  assert.deepEqual(noteAhead('HANDOFF-M1-2026-11-19.md', h('November 19', '10:31 pm'), NOW), [], "yesterday's date")
  assert.deepEqual(noteAhead('JOURNAL.md', '# x 11:59 pm', NOW), [], 'the journal has its own check')
})

ok('free text (comments, proofs): ahead refused, behind kept, plans kept, yesterday kept', () => {
  assert.deepEqual(textAhead('The update started at 6:25 pm and passed.', NOW), [{ said: '6:25 pm', ahead: 16 }])
  assert.deepEqual(textAhead('The update started at 6:01 pm and passed.', NOW), [])
  assert.deepEqual(textAhead('Checked on Nov 19, 9:40 pm and again at 2026-11-19, 10:15 pm.', NOW), [], "yesterday's date")
  assert.equal(textAhead('Checked Nov 20, 6:30 pm.', NOW).length, 1, "today's date ahead")
  assert.deepEqual(textAhead('The runner starts again tomorrow at 7:15 am. Paused until 9:00 pm.', NOW), [], 'plans')
  assert.equal(textAhead('Paused until 9:00 pm. Built at 6:40 pm.', NOW).length, 1, 'a plan in one sentence does not cover the next')
  assert.deepEqual(textAhead('The review ran at 11:50 pm.', AFTER_MIDNIGHT), [], 'written after midnight about the evening')
  assert.deepEqual(textAhead('The copy was made at 11:25 am, not 6:30 pm as the comment above says.', NOW), [], 'a wrong time quoted to correct it')
  assert.match(aheadLine([{ said: '6:25 pm', ahead: 16 }], 'the comment', NOW), /Refused: the comment gives "6:25 pm" \(16 min ahead\), later than the clock \(6:09 pm Pacific now; 3 minutes allowed\)/)
})

ok('issues.mjs comment and done on a copy of the tracker: a time ahead refused and not stored, a time behind stored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-test-'))
  try {
    const fake = join(dir, 'tracker.json')
    const T = { id: 'OLA-1', num: 1, project: 'ola', title: 'a made-up ticket', what: '', area: 'ops', priority: 'P2', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' }
    writeFileSync(fake, JSON.stringify({ venture_issues: [T], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
    const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
    delete env.VENTURE_PRIVATE
    const issues = fileURLToPath(new URL('./issues.mjs', import.meta.url))
    const run = (...a) => spawnSync(process.execPath, [issues, ...a], { encoding: 'utf8', env, timeout: 60000 })
    const at = (min) => new Date(Date.now() + min * 60e3).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).toLowerCase()
    const day = (min) => new Date(Date.now() + min * 60e3).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    // a time 20 minutes ahead, with its date so midnight cannot make it yesterday
    const ahead = `${day(20)}, ${at(20)}`
    const r1 = run('comment', 'OLA-1', `The check passed at ${ahead}.`)
    assert.equal(r1.status, 1, r1.stdout)
    assert.match(r1.stderr, /Refused: the comment gives .* later than the clock/)
    assert.equal(JSON.parse(readFileSync(fake, 'utf8')).venture_issue_activity.length, 0, 'nothing stored')
    const r2 = run('comment', 'OLA-1', `The check passed at ${at(-10)}.`)
    assert.equal(r2.status, 0, r2.stderr)
    const r3 = run('comment', 'OLA-1', 'Built Nov 19, 11:58 pm, on yesterday.')
    assert.equal(r3.status, 0, r3.stderr)
    assert.equal(JSON.parse(readFileSync(fake, 'utf8')).venture_issue_activity.length, 2)
    const r4 = run('done', 'OLA-1', '--proof', `bart: walked at ${ahead}`)
    assert.equal(r4.status, 1)
    assert.match(r4.stderr, /Refused: the proof gives/)
    assert.equal(JSON.parse(readFileSync(fake, 'utf8')).venture_issues[0].status, 'open')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

console.log(`${n} checks passed`)
