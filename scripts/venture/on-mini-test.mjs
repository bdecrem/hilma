#!/usr/bin/env node
// OLA-293 (fixed in OLA-264's commit fa2122e5): on the Mac mini the tracker reads the test server's files
// itself. ssh from the mini to its own addresses is refused (no key to itself), so before that every
// `check pass --case` there was refused and `say` printed the live version as unknown. Here a made-up
// HOME holds ~/ola-staging (current -> a release, asks-latest.json, deploys.log) and `ssh` on PATH is a
// stub that records every call and fails: `say`, `check pass --case` and `unchecked` must read the files
// and never call ssh. On a copy of the tracker (VENTURE_TRACKER_FAKE).   node scripts/venture/on-mini-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenHash } from './_who.mjs'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const dir = mkdtempSync(join(tmpdir(), 'on-mini-test-'))
try {
  const home = join(dir, 'home')
  const staging = join(home, 'ola-staging')
  const rel = 'bbbbbbbbbbbb'
  mkdirSync(join(staging, 'releases', rel), { recursive: true })
  symlinkSync(join(staging, 'releases', rel), join(staging, 'current'))
  writeFileSync(join(staging, 'asks-latest.json'), JSON.stringify({ release: rel, cases: { 'share-link@cloud-web:chat': { status: 'passing', tries: '2 of 2 passed', release: rel } } }))
  writeFileSync(join(staging, 'deploys.log'), '')
  const bin = join(dir, 'bin')
  const sshLog = join(dir, 'ssh-calls.log')
  mkdirSync(bin)
  writeFileSync(join(bin, 'ssh'), `#!/bin/sh\necho "$@" >> '${sshLog}'\necho 'Permission denied (publickey).' >&2\nexit 255\n`)
  chmodSync(join(bin, 'ssh'), 0o755)

  const fake = join(dir, 'tracker.json')
  const T = (num, area) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area, priority: 'P2', status: 'in_progress', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' })
  const state = (id, checks) => ({ key: `accept:${id}`, value: { checks, skips: [], internal: null, ready: null }, at: '2026-11-20T05:00:00Z' })
  writeFileSync(fake, JSON.stringify({
    venture_issues: [T(1, 'web'), T(2, 'ops')],
    venture_state: [
      state('OLA-1', [{ n: 1, at: 'cloud-web:chat', do: 'ask for the link', see: 'a live link', result: 'pass', by: 'checker-x', saw: 'a live link', on: rel, checked_at: '2026-11-20T05:00:00Z', evidence: 'shot' }]),
      state('OLA-2', [{ n: 1, at: 'terminal', do: 'run thing', see: 'it answers' }]),
    ],
    venture_issue_activity: [], venture_commits: [],
  }))
  // a checker who did not build it, recorded as the hook would record it (as in checker-pass-test.mjs)
  const callers = join(dir, 'callers.jsonl')
  const tok = 'tok-checker'
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, VENTURE_TRACKER_FAKE: fake, VENTURE_CALLERS_FILE: callers }
  for (const k of ['VENTURE_PRIVATE', 'VENTURE_ASKS_FILE', 'VENTURE_LIVE_RELEASE', 'VENTURE_CALLER', 'VENTURE_TEST_SHELL', 'VENTURE_RUNNER']) delete env[k]
  const issues = fileURLToPath(new URL('./issues.mjs', import.meta.url))
  const run = (...a) => {
    const cmd = `node scripts/venture/issues.mjs ${a.join(' ')}`
    writeFileSync(callers, JSON.stringify({ at: Date.now() / 1000, session: 'lead-session', agent: 'checker-agent', agent_type: 'general-purpose', tok: tokenHash(tok), cmd }) + '\n')
    return spawnSync(process.execPath, [issues, ...a], { encoding: 'utf8', env: { ...env, VENTURE_CALLER: tok, VENTURE_TEST_SHELL: `export VENTURE_CALLER=${tok}; ${cmd}` }, timeout: 60000 })
  }
  const noSsh = () => assert.ok(!existsSync(sshLog), `ssh was called: ${existsSync(sshLog) ? readFileSync(sshLog, 'utf8') : ''}`)

  ok('say reads the live release from ~/ola-staging/current, without ssh', () => {
    const r = run('say', 'OLA-1')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, new RegExp(`the test server is on release ${rel} now`))
    assert.doesNotMatch(r.stdout, /could not be read|unknown/)
    noSsh()
  })
  ok('check pass --case reads asks-latest.json on the mini and records the pass, without ssh', () => {
    const r = run('check', 'OLA-2', 'pass', '1', '--by', 'checker-x', '--saw', 'it answered as the check says', '--on', rel, '--case', 'share-link@cloud-web:chat')
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`)
    assert.equal(JSON.parse(readFileSync(fake, 'utf8')).venture_state.find((s) => s.key === 'accept:OLA-2').value.checks[0].result, 'pass')
    noSsh()
  })
  ok('unchecked reads deploys.log on the mini, without ssh', () => {
    const r = run('unchecked')
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.stdout, /its list could not be read/)
    noSsh()
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)
