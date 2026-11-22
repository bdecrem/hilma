#!/usr/bin/env node
// OLA-259: a check passed by a request-test case (--case <id>@<place>) is looked up in the request
// tests' result file by its exact name. `check pass --case` refuses a case the file does not hold (or
// spells differently) and one that is not working there; `say` never prints WORKS for a case that is
// missing, misspelled, not run, failing or 2 of 3. On a copy of the tracker (VENTURE_TRACKER_FAKE) and
// a made-up result file (VENTURE_ASKS_FILE), never the real ones.   node scripts/venture/case-pass-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const dir = mkdtempSync(join(tmpdir(), 'case-pass-test-'))
try {
  const fake = join(dir, 'tracker.json')
  const asks = join(dir, 'asks-latest.json')
  // an ops ticket: not about the test server, so no live release is read
  const T = (num) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area: 'ops', priority: 'P2', status: 'in_progress', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' })
  const pass = (n, kase) => ({ n, at: 'terminal', do: `run thing ${n}`, see: 'it answers', result: 'pass', by: 'checker-x', saw: 'it answered as the check says', on: 'abc1234', checked_at: '2026-11-20T05:00:00Z', evidence: `case ${kase}`, case: { key: kase } })
  const cases = {
    'share-link@cloud-web:chat': { status: 'passing', tries: '2 of 2 passed', release: 'aaaaaaaaaaaa' },
    'flaky@cloud-web:chat': { status: 'passing', tries: '2 of 3 passed', release: 'aaaaaaaaaaaa' },
    'broken@cloud-web:chat': { status: 'not working yet', tries: '0 of 2 passed', release: 'aaaaaaaaaaaa' },
    'skipped@cloud-web:chat': { status: 'not run', release: 'aaaaaaaaaaaa' },
  }
  writeFileSync(asks, JSON.stringify({ release: 'aaaaaaaaaaaa', cases }))
  const state = (id, checks) => ({ key: `accept:${id}`, value: { checks, skips: [], internal: null, ready: null }, at: '2026-11-20T05:00:00Z' })
  writeFileSync(fake, JSON.stringify({
    venture_issues: [1, 2, 3, 4, 5, 6, 7, 9].map(T),
    venture_state: [
      state('OLA-1', [pass(1, 'share-link@cloud-web:chat')]),
      state('OLA-2', [pass(1, 'share-link@cloud-web')]),
      state('OLA-3', [pass(1, 'share-link')]),
      state('OLA-4', [pass(1, 'made-up-case@nowhere')]),
      state('OLA-5', [pass(1, 'skipped@cloud-web:chat')]),
      state('OLA-6', [pass(1, 'broken@cloud-web:chat')]),
      state('OLA-7', [pass(1, 'flaky@cloud-web:chat')]),
      state('OLA-9', [{ n: 1, at: 'terminal', do: 'run thing', see: 'it answers' }]),
    ],
    venture_issue_activity: [], venture_commits: [],
  }))
  const env = { ...process.env, VENTURE_TRACKER_FAKE: fake, VENTURE_ASKS_FILE: asks }
  delete env.VENTURE_PRIVATE
  const issues = fileURLToPath(new URL('./issues.mjs', import.meta.url))
  const run = (...a) => spawnSync(process.execPath, [issues, ...a], { encoding: 'utf8', env, timeout: 60000 })
  const say = (id) => { const r = run('say', id); assert.equal(r.status, 0, r.stderr); return r.stdout }

  ok('say: the exact name of a working case prints WORKS', () => {
    const o = say('OLA-1')
    assert.match(o, /^\s+WORKS\s+terminal/m)
    assert.match(o, /may be told: it works/)
  })
  for (const [id, what] of [['OLA-2', 'share-link@cloud-web (no :chat)'], ['OLA-3', 'share-link (no place)'], ['OLA-4', 'made-up-case@nowhere']]) {
    ok(`say: a case spelled differently or made up is NOT CHECKED, never WORKS: ${what}`, () => {
      const o = say(id)
      assert.doesNotMatch(o, /^\s+WORKS\s/m)
      assert.match(o, /NOT CHECKED.*does not hold \(no such case, or spelled differently\)/)
      assert.match(o, /may NOT be told "it works"/)
    })
  }
  ok('say: a case not run on the last run is NOT CHECKED', () => {
    const o = say('OLA-5')
    assert.match(o, /NOT CHECKED.*was not run on the last run/)
    assert.match(o, /may NOT be told/)
  })
  ok('say: a failing case is DOES NOT WORK NOW; 2 of 3 is WORKS SOMETIMES', () => {
    assert.match(say('OLA-6'), /DOES NOT WORK NOW/)
    assert.match(say('OLA-7'), /WORKS SOMETIMES \(2 of 3\)/)
    assert.match(say('OLA-7'), /may NOT be told/)
  })

  const tracker = () => readFileSync(fake, 'utf8')
  const tryPass = (kase) => run('check', 'OLA-9', 'pass', '1', '--by', 'checker-x', '--saw', 'it answered as the check says', '--on', 'abc1234', '--case', kase)
  ok('check pass --case refuses a case the file does not hold, and names the near ones', () => {
    for (const k of ['share-link@cloud-web', 'share-link', 'made-up-case@nowhere']) {
      const r = tryPass(k)
      assert.equal(r.status, 1, `${k}: ${r.stdout}`)
      assert.ok(r.stderr.includes(`--case: there is no case "${k}"`), `${k}: ${r.stderr}`)
      if (k !== 'made-up-case@nowhere') assert.match(r.stderr, /share-link@cloud-web:chat/, 'the near name is shown')
    }
    assert.equal(JSON.parse(tracker()).venture_state.find((s) => s.key === 'accept:OLA-9').value.checks[0].result, undefined)
  })
  ok('check pass --case refuses a case that is not working, not run, or 2 of 3', () => {
    for (const k of ['broken@cloud-web:chat', 'skipped@cloud-web:chat', 'flaky@cloud-web:chat']) {
      const r = tryPass(k)
      assert.equal(r.status, 1, `${k}: ${r.stdout}`)
      assert.match(r.stderr, /does not show that it works/, `${k}: ${r.stderr}`)
    }
    assert.equal(JSON.parse(tracker()).venture_state.find((s) => s.key === 'accept:OLA-9').value.checks[0].result, undefined)
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)
