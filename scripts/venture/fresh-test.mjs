#!/usr/bin/env node
// OLA-273: a copy of the tracker older than origin/main (its own files changed there since) refuses the
// commands that apply a rule, and only warns on reading and comments. Built in a throwaway pair of git
// repos (an "origin" and a clone of it, plus a worktree) holding this checkout's scripts/venture, on a
// copy of the tracker (VENTURE_TRACKER_FAKE); nothing here touches the real tracker or this repo's git.
//   node scripts/venture/fresh-test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const here = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fresh-test-')))
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const commitIn = (cwd, msg) => { git(cwd, 'add', '-A'); git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg) }
try {
  const origin = join(dir, 'origin')
  const work = join(dir, 'work')
  git(dir, 'init', '-q', '-b', 'main', origin)
  for (const f of readdirSync(here).filter((f) => f.endsWith('.mjs'))) cpSync(join(here, f), join(origin, 'scripts/venture', f))
  writeFileSync(join(origin, '.gitignore'), 'node_modules\n')
  commitIn(origin, 'the tracker as it is')
  git(dir, 'clone', '-q', origin, work)
  symlinkSync(join(repo, 'node_modules'), join(work, 'node_modules'))
  const fake = join(dir, 'tracker.json')
  const T = (num) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area: 'ops', priority: 'P2', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' })
  writeFileSync(fake, JSON.stringify({ venture_issues: [T(1), T(2)], venture_state: [], venture_issue_activity: [], venture_commits: [] }))
  const env = { ...process.env, VENTURE_TRACKER_FAKE: fake, VENTURE_TRACKER_MAIN_REF: 'origin/main' }
  delete env.VENTURE_PRIVATE
  const run = (cwd, ...a) => spawnSync(process.execPath, [join(cwd, 'scripts/venture/issues.mjs'), ...a], { cwd, encoding: 'utf8', env, timeout: 60000 })
  const internal = (cwd, id) => run(cwd, 'check', id, 'internal', '--why', 'a made-up tools ticket; nothing a person does or sees changes')
  const marked = (id) => JSON.parse(readFileSync(fake, 'utf8')).venture_state.some((s) => s.key.includes(id) && JSON.stringify(s.value).includes('internal'))
  const OLD = /older than origin\/main/

  ok('a copy level with origin/main runs a command that applies a rule', () => {
    const r = internal(work, 'OLA-1')
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.stderr, OLD)
  })

  appendFileSync(join(origin, 'scripts/venture/_plate.mjs'), '\n// a new rule on main\n')
  commitIn(origin, 'a new lane rule [OLA-1]')
  git(work, 'fetch', '-q', 'origin')

  ok('origin/main changed one of its files: a rule command is refused, names the file and the commit, and changes nothing', () => {
    const before = readFileSync(fake, 'utf8')
    const r = internal(work, 'OLA-2')
    assert.equal(r.status, 1)
    assert.match(r.stderr, OLD)
    assert.match(r.stderr, /_plate\.mjs/)
    assert.match(r.stderr, /a new lane rule/)
    assert.match(r.stderr, /git pull --rebase/)
    assert.equal(readFileSync(fake, 'utf8'), before)
  })
  for (const c of [['ready', 'OLA-2', '--on', 'x'], ['done', 'OLA-2', '--proof', 'x'], ['start', 'OLA-2'], ['claim', 'OLA-2'], ['check', 'OLA-2', 'pass', '1', '--by', 'checker', '--on', 'x', '--saw', 'y']]) {
    ok(`... and so is ${c.slice(0, c[0] === 'check' ? 3 : 1).join(' ')}`, () => {
      const r = run(work, ...c)
      assert.equal(r.status, 1)
      assert.match(r.stderr, OLD)
    })
  }
  ok('reading still works, with a warning line', () => {
    const r = run(work, 'show', 'OLA-2')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /OLA-2/)
    assert.match(r.stderr, /^warning: .*older than origin\/main/m)
  })
  ok('a comment still goes on, with a warning line (the runner\'s comment after a run is not lost)', () => {
    const r = run(work, 'comment', 'OLA-2', 'a made-up comment')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stderr, /^warning: .*older than origin\/main/m)
  })
  ok('the tracker fetches by itself when the last fetch is old: a change on origin not yet fetched is seen', () => {
    git(work, 'pull', '-q', '--rebase')
    assert.equal(internal(work, 'OLA-2').status, 0)
    appendFileSync(join(origin, 'scripts/venture/issues.mjs'), '\n// another rule on main\n')
    commitIn(origin, 'another rule')
    rmSync(join(work, '.git/FETCH_HEAD'), { force: true })
    const r = run(work, 'start', 'OLA-2')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /another rule/)
    git(work, 'pull', '-q', '--rebase')
  })
  ok('a change on main to a file the tracker does not import does not make it old', () => {
    writeFileSync(join(origin, 'scripts/venture/not-the-tracker.mjs'), '// unrelated\n')
    commitIn(origin, 'unrelated')
    git(work, 'fetch', '-q', 'origin')
    const r = run(work, 'start', 'OLA-2')
    assert.doesNotMatch(r.stderr, OLD)
  })
  ok('local edits and an unpushed commit ahead of main are not old', () => {
    appendFileSync(join(work, 'scripts/venture/issues.mjs'), '\n// work in progress\n')
    commitIn(work, 'local work')
    appendFileSync(join(work, 'scripts/venture/_who.mjs'), '\n// uncommitted\n')
    const r = run(work, 'claim', 'OLA-2')
    assert.doesNotMatch(r.stderr, OLD)
    git(work, 'checkout', '-q', '--', 'scripts/venture/_who.mjs')
  })
  ok('an agent worktree made before a change on main is refused, and is told the main checkout\'s copy', () => {
    git(work, 'worktree', 'add', '-q', '-b', 'agent', join(work, '.claude/worktrees/agent-1'), 'origin/main~2')
    const wt = join(work, '.claude/worktrees/agent-1')
    const r = internal(wt, 'OLA-2')
    assert.equal(r.status, 1)
    assert.match(r.stderr, OLD)
    assert.match(r.stderr, new RegExp(`node ${work.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/scripts/venture/issues\\.mjs check OLA-2 internal`))
    git(wt, 'rebase', '-q', 'origin/main')
    assert.doesNotMatch(internal(wt, 'OLA-2').stderr, OLD)
  })
  ok('on a copy of the tracker without VENTURE_TRACKER_MAIN_REF the check is skipped (the other tests run as they are)', () => {
    git(work, 'reset', '-q', '--hard', 'origin/main~2')
    const r = spawnSync(process.execPath, [join(work, 'scripts/venture/issues.mjs'), 'start', 'OLA-1'], { cwd: work, encoding: 'utf8', env: { ...env, VENTURE_TRACKER_MAIN_REF: '' }, timeout: 60000 })
    assert.doesNotMatch(r.stderr, OLD)
  })
  console.log(`${n} of ${n}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
