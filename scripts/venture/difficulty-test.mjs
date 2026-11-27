#!/usr/bin/env node
// OLA-485 (Bart, Nov 27: "Does our issue tracker have a difficulty feature? If not, add it now."): an issue has
// an optional difficulty, easy, medium or hard (venture_issues.difficulty, schema 015; empty = not rated).
// add --difficulty sets it, edit --difficulty changes it and `none` clears it, show and list print it, list
// --difficulty filters (with --pri, "the open P1 easy ones" is one command), any other value is refused.
// On a copy of the tracker (VENTURE_TRACKER_FAKE), never the real one.   node scripts/venture/difficulty-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const dir = mkdtempSync(join(tmpdir(), 'difficulty-test-'))
try {
  const fake = join(dir, 'tracker.json')
  const T = (num, extra = {}) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area: 'web', priority: 'P1', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '', ...extra })
  writeFileSync(fake, JSON.stringify({ venture_issues: [T(1), T(2, { priority: 'P2' }), T(3)], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
  const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
  delete env.VENTURE_PRIVATE
  const issues = fileURLToPath(new URL('./issues.mjs', import.meta.url))
  const run = (...a) => spawnSync(process.execPath, [issues, ...a], { encoding: 'utf8', env, timeout: 60000 })
  const row = (id) => JSON.parse(readFileSync(fake, 'utf8')).venture_issues.find((r) => r.id === id)
  const listed = (...a) => { const r = run('list', ...a); assert.equal(r.status, 0, r.stderr); return r.stdout.split('\n').filter((l) => l.startsWith('OLA-')).map((l) => l.split(/\s+/)[0]) }

  ok('a new or old issue starts unrated', () => {
    assert.equal(row('OLA-1').difficulty ?? null, null)
    const r = run('add', 'Made-up new ticket', '--area', 'web')
    assert.equal(r.status, 0, r.stderr)
    assert.equal(row('OLA-4').difficulty ?? null, null)
  })
  ok('add --difficulty sets it', () => {
    const r = run('add', 'Made-up easy ticket', '--area', 'web', '--difficulty', 'easy')
    assert.equal(r.status, 0, r.stderr)
    assert.equal(row('OLA-5').difficulty, 'easy')
  })
  ok('edit sets, changes and clears it; show and list print it', () => {
    assert.equal(run('edit', 'OLA-1', '--difficulty', 'hard').status, 0)
    assert.equal(row('OLA-1').difficulty, 'hard')
    assert.match(run('show', 'OLA-1').stdout, /· P1 · hard ·/)
    assert.equal(run('edit', 'OLA-1', '--difficulty', 'medium').status, 0)
    assert.equal(row('OLA-1').difficulty, 'medium')
    assert.match(run('list').stdout, /a made-up ticket 1 {2}\{medium\}/)
    assert.equal(run('edit', 'OLA-1', '--difficulty', 'none').status, 0)
    assert.equal(row('OLA-1').difficulty, null)
    assert.match(run('show', 'OLA-1').stdout, /^area .* · P1 · next ·/m)
  })
  ok('list --difficulty filters, together with --pri and --status', () => {
    run('edit', 'OLA-2', '--difficulty', 'easy')
    assert.deepEqual(listed('--difficulty', 'easy'), ['OLA-2', 'OLA-5'])
    assert.deepEqual(listed('--status', 'next', '--pri', 'P1', '--difficulty', 'easy'), ['OLA-5'])
    assert.deepEqual(listed('--difficulty', 'none'), ['OLA-1', 'OLA-3', 'OLA-4'])
  })
  ok('a value that is not easy, medium, hard or none is refused, and nothing changes', () => {
    const r = run('edit', 'OLA-2', '--difficulty', 'trivial')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr + r.stdout, /difficulty must be one of: easy, medium, hard/)
    assert.equal(row('OLA-2').difficulty, 'easy')
    assert.notEqual(run('add', 'Made-up bad', '--area', 'web', '--difficulty', 'Hard').status, 0)
    assert.notEqual(run('list', '--difficulty', 'x').status, 0)
  })
  console.log(`${n} checks passed`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
