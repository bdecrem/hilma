#!/usr/bin/env node
// OLA-338 (Bart, Nov 21: "Ola-338 yes"): a ticket for the project's own tools (marked internal) gets no
// second agent. It closes with done --proof "no user path: <why>; lead ran <test>: n of n" and is refused
// without that line, or when not every test passed; `unchecked` does not list it. On a copy of the
// tracker (VENTURE_TRACKER_FAKE), never the real one.   node scripts/venture/internal-close-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const dir = mkdtempSync(join(tmpdir(), 'internal-close-test-'))
try {
  const fake = join(dir, 'tracker.json')
  const T = (num, area) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area, priority: 'P2', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' })
  writeFileSync(fake, JSON.stringify({ venture_issues: [T(1, 'ops'), T(2, 'ops')], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
  const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
  delete env.VENTURE_PRIVATE
  const issues = fileURLToPath(new URL('./issues.mjs', import.meta.url))
  const run = (...a) => spawnSync(process.execPath, [issues, ...a], { encoding: 'utf8', env, timeout: 60000 })
  const status = (id) => JSON.parse(readFileSync(fake, 'utf8')).venture_issues.find((r) => r.id === id).status

  ok('an internal ticket says no checker is asked for', () => {
    const r = run('check', 'OLA-1', 'internal', '--why', 'the project tracker only; nothing a person does or sees changes')
    assert.equal(r.status, 0, r.stderr)
    assert.match(run('check', 'OLA-1').stdout, /no checker is asked for/)
  })
  ok('refused without the lead line', () => {
    const r = run('done', 'OLA-1', '--proof', 'no user path: the tracker only; builder ran the tests')
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stderr, /lead ran <test>: <n> of <n>/)
    assert.equal(status('OLA-1'), 'open')
  })
  ok('refused when not every test passed', () => {
    const r = run('done', 'OLA-1', '--proof', 'no user path: the tracker only; lead ran internal-close-test: 3 of 4')
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stderr, /not every test passed: lead ran internal-close-test: 3 of 4/)
    assert.equal(status('OLA-1'), 'open')
  })
  ok('refused with no proof on the real thing at all', () => {
    const r = run('done', 'OLA-1', '--proof', 'lead ran internal-close-test: 4 of 4')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /needs proof on the real thing/)
  })
  ok('closes with "no user path: ...; lead ran <test>: n of n"', () => {
    const r = run('done', 'OLA-1', '--proof', 'no user path: the tracker only; lead ran internal-close-test: 6 of 6, runner-test: 23 of 23')
    assert.equal(r.status, 0, r.stderr)
    assert.equal(status('OLA-1'), 'done')
  })
  ok('unchecked does not list it, and a ticket with no checks still cannot close on a lead line', () => {
    const u = run('unchecked')
    assert.equal(u.status, 0, u.stderr)
    assert.doesNotMatch(u.stdout, /OLA-1\b/)
    const r = run('done', 'OLA-2', '--proof', 'no user path: x; lead ran a: 1 of 1')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /cannot be closed yet/)
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)
