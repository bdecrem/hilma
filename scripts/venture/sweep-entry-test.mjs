#!/usr/bin/env node
// OLA-260: the evening review's entry is checked against the files and the day's record, not the
// author's word. Each of the four ways round it the OLA-251 checker found is refused, and its honest
// counterpart passes that line:
//   1. quiet: true with cleaned empty on a day with corrections or commits
//   2. enforced: true on a change whose where is RULES.md (a note), or a code file no commit changed that day
//   3. a line added to SWEEP.md or CLAUDE.md (or any .md) counted as a written rule, even with no "rule N"
//   4. a cleaned item whose where is no file, a note not touched that day, or a git file no commit changed that day
// On a copy of the notes (VENTURE_PRIVATE) with `sweep.mjs check`, which runs only the entry's checks.
//   node scripts/venture/sweep-entry-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sweep-entry-'))
const notes = join(dir, 'private')
mkdirSync(join(notes, 'data'), { recursive: true })
// two corrections on Nov 21; none on Jan 1, 2020 (and the repo has no commit that day)
writeFileSync(join(notes, 'CORRECTIONS.md'), '# Corrections\n\n## 1. November 21, 2026, 9:00 am: one\n\ntext\n\n## 2. November 21, 2026, 10:00 am: two\n\ntext\n')
writeFileSync(join(notes, 'data/weaknesses.json'), JSON.stringify([{ id: 'w1', side: 'kit', name: 'A weakness with a fix', what: 'x', seen: [], guards: [{ day: '2026-11-01', level: 3, enforced: true }] }]))
writeFileSync(join(notes, 'RULES.md'), '# rules\n')
writeFileSync(join(notes, 'OLD.md'), 'old\n')
utimesSync(join(notes, 'OLD.md'), new Date('2026-11-01T12:00:00Z'), new Date('2026-11-01T12:00:00Z'))
const env = { ...process.env, VENTURE_PRIVATE: notes, VENTURE_TRACKER_FAKE: join(dir, 'tracker.json') }
writeFileSync(env.VENTURE_TRACKER_FAKE, JSON.stringify({ venture_issues: [], venture_state: [], venture_issue_activity: [], venture_commits: [] }))

const DAY = '2026-11-21' // a commit changed scripts/venture/sweep.mjs that day; none changed scripts/venture/_fakedb.mjs
const base = (over = {}) => ({
  day: DAY, summary: 'a made-up day', read: [{ n: '1', what: 'messages' }], pattern: 'x',
  cleaned: [{ did: 'removed', what: 'a stale line', where: 'RULES.md' }],
  kit: [], ola: [], open: [{ text: 'x' }], build: { text: 'x' },
  ideas: { kit: { text: 'x', why: 'y', issue: 'OLA-1' }, ola: { text: 'x', why: 'y', issue: 'OLA-2' } },
  learning: { changed: 'x', why: 'y', where: 'z' }, ...over,
})
const check = (e) => {
  const f = join(dir, 'entry.json')
  writeFileSync(f, JSON.stringify(e))
  const r = spawnSync(process.execPath, [here('sweep.mjs'), 'check', f], { encoding: 'utf8', env, timeout: 60000 })
  return { status: r.status, out: r.stdout + r.stderr }
}
const change = (o) => ({ weakness: 'w1', saw: 'x', changed: 'x', where: 'x', ...o })
let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }

try {
  ok('the honest entry passes', () => {
    const r = check(base())
    assert.equal(r.status, 0, r.out)
  })

  // 1
  ok('quiet: true with cleaned empty on a day with 2 corrections is refused', () => {
    const r = check(base({ quiet: true, cleaned: [] }))
    assert.equal(r.status, 1)
    assert.match(r.out, /quiet: true, but 2026-11-21 was not quiet: 2 correction\(s\)/)
    assert.match(r.out, /cleaned is empty/)
  })
  ok('quiet: true on a day with no correction and no commit is accepted', () => {
    const r = check(base({ day: '2020-01-01', quiet: true, cleaned: [], learning: undefined }))
    assert.doesNotMatch(r.out, /quiet: true, but|cleaned is empty/, r.out)
  })

  // 2
  ok('enforced: true on a change to RULES.md is refused', () => {
    const r = check(base({ kit: [change({ weakness: 'w0', where: 'apps/venture/private/RULES.md', changed: 'a sharper line', enforced: true })] }))
    assert.equal(r.status, 1)
    assert.match(r.out, /kit\[0\] says enforced: true, but where \(apps\/venture\/private\/RULES\.md\) is not a code file/)
  })
  ok('enforced: true on a code file no commit changed that day is refused', () => {
    const r = check(base({ kit: [change({ where: 'scripts/venture/_fakedb.mjs', enforced: true })] }))
    assert.match(r.out, /no commit on main changed scripts\/venture\/_fakedb\.mjs on 2026-11-21/)
  })
  ok('enforced: true on a code file a commit changed that day is accepted', () => {
    const r = check(base({ kit: [change({ where: 'scripts/venture/sweep.mjs', enforced: true })] }))
    assert.equal(r.status, 0, r.out)
  })

  // 3
  for (const where of ['apps/venture/SWEEP.md', 'CLAUDE.md', 'apps/venture/private/NOW.md'])
    ok(`a line in ${where} telling the lead what to do counts as a written rule (weakness already has a fix: refused)`, () => {
      const r = check(base({ kit: [change({ where, changed: 'the lead now checks the clock before posting' })] }))
      assert.equal(r.status, 1)
      assert.match(r.out, /kit\[0\] adds a written rule for "A weakness with a fix"/)
    })
  ok('a line whose changed text names SWEEP.md counts too, whatever where says', () => {
    const r = check(base({ kit: [change({ where: 'the review', changed: 'SWEEP.md now tells the lead to read the log' })] }))
    assert.match(r.out, /adds a written rule/)
  })

  // 4
  ok('a cleaned file that does not exist is refused', () => {
    const r = check(base({ cleaned: [{ did: 'removed', what: 'x', where: 'NOPE-2026.md' }] }))
    assert.equal(r.status, 1)
    assert.match(r.out, /cleaned\[0\]\.where: "NOPE-2026\.md" is no file or folder/)
  })
  ok('a cleaned note not touched since before the day is refused', () => {
    const r = check(base({ cleaned: [{ did: 'corrected', what: 'x', where: 'OLD.md' }] }))
    assert.match(r.out, /cleaned\[0\]\.where: OLD\.md has not changed since before 2026-11-21/)
  })
  ok('a cleaned file in git that no commit changed that day is refused, whatever its time on disk', () => {
    const r = check(base({ cleaned: [{ did: 'corrected', what: 'x', where: 'scripts/venture/_fakedb.mjs' }] }))
    assert.match(r.out, /cleaned\[0\]\.where: scripts\/venture\/_fakedb\.mjs is in git and no commit on main changed it on 2026-11-21/)
  })
  ok('a cleaned file in git that a commit changed that day is accepted', () => {
    const r = check(base({ cleaned: [{ did: 'corrected', what: 'x', where: 'scripts/venture/sweep.mjs' }] }))
    assert.equal(r.status, 0, r.out)
  })

  console.log(`${n} of ${n}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
