#!/usr/bin/env node
// OLA-278: the ways checker-m4b found for a builder's own agent to pass its own checks, or to turn
// "worked on an earlier version" into WORKS, each tried on a copy of the tracker treated as the real one
// (VENTURE_FAKE_AS_REAL) where it matters:
//   --by bart / BART / Bart / kit / lead from the command line; VENTURE_CALLERS_FILE naming another agent;
//   VENTURE_LIVE_RELEASE=<the old release> in front of say; a hand-written venture-live-release.json in
//   the temp folder with the current time and the mini's name.
// Never the real tracker: VENTURE_TRACKER_FAKE always points at a file in a temp folder.
//   node scripts/venture/selfgrade-test.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenHash } from './_who.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'selfgrade-test-'))
const db = join(dir, 'tracker.json')
const callers = join(dir, 'callers.jsonl')
const shot = join(dir, 'shot.log')
writeFileSync(shot, 'the check was done on the live thing and this is its output.\n'.repeat(10))
const OLD = 'aaaaaaaaaaaa'
const T = (num) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area: 'web', priority: 'P2', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' })
writeFileSync(db, JSON.stringify({ venture_issues: [T(1)], venture_state: [], venture_issue_activity: [], venture_commits: [] }))

const rows = []
const cmds = {}
const record = (agent, tok, cmd) => { cmds[tok] = cmd; rows.push(JSON.stringify({ at: Date.now() / 1000, session: 'lead-session', agent, agent_type: 'general-purpose', tok: tokenHash(tok), cmd })); writeFileSync(callers, rows.join('\n') + '\n') }
const run = (tok, args, extra = {}) => {
  const env = { ...process.env, VENTURE_TRACKER_FAKE: db, VENTURE_CALLERS_FILE: callers, ...extra }
  for (const k of ['VENTURE_CALLER', 'VENTURE_TEST_SHELL', 'VENTURE_PRIVATE', 'VENTURE_RUNNER', 'VENTURE_LIVE_RELEASE']) if (!(k in extra)) delete env[k]
  env.VENTURE_CALLER = tok
  env.VENTURE_TEST_SHELL = `export VENTURE_CALLER=${tok}; ${cmds[tok] ?? ''}`
  const r = spawnSync(process.execPath, [join(here, 'issues.mjs'), ...args], { env, encoding: 'utf8', timeout: 90000 })
  return { code: r.status, out: (r.stdout + r.stderr).trim() }
}
let fails = 0
let n = 0
const expect = (name, ok, detail) => { n++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${detail}`}`); if (!ok) fails++ }
const result = (k) => JSON.parse(readFileSync(db, 'utf8')).venture_state.find((s) => s.key === 'accept:OLA-1')?.value?.checks?.[k - 1]?.result
const pass = (tok, k, by, extra) => run(tok, ['check', 'OLA-1', 'pass', String(k), '--by', by, '--saw', 'it answered the way the check says it should', '--on', OLD, '--log', shot], extra)

// the tracker's own cache of the live release, moved aside while the test writes a fake one
const cache = join(tmpdir(), 'venture-live-release.json')
const aside = existsSync(cache) ? `${cache}.selfgrade-aside` : null
if (aside) renameSync(cache, aside)
try {
  const tb = 'b'.repeat(32)
  record('bbbbbbbb', tb, 'node scripts/venture/issues.mjs claim OLA-1 --who builder')
  let r = run(tb, ['claim', 'OLA-1', '--who', 'builder'])
  expect('the builder claims OLA-1', r.code === 0, r.out)
  for (const k of [1, 2]) {
    r = run(tb, ['check', 'OLA-1', 'add', '--at', 'cloud-web:chat', '--do', `asks Ola in the cloud chat for thing number ${k}`, '--see', `the answer to thing number ${k} appears`])
    expect(`the builder writes check #${k}`, r.code === 0, r.out)
  }
  r = run(tb, ['ready', 'OLA-1', '--on', OLD])
  expect('the builder marks it ready', r.code === 0, r.out)

  // 1. a pass named bart (any case), kit or lead is refused, from anyone (it skipped both tests before)
  for (const by of ['bart', 'BART', 'Bart', 'bart-m4', 'kit', 'lead']) {
    r = pass(tb, 1, by)
    expect(`the builder passing as "${by}" is refused`, r.code !== 0 && result(1) !== 'pass' && /is not passed as|built OLA-1/.test(r.out), r.out)
  }

  // 2. a callers file the caller names is not read on the real tracker: the caller is then unknown
  const other = join(dir, 'other.jsonl')
  writeFileSync(other, JSON.stringify({ at: Date.now() / 1000, session: 'other-session', agent: 'xxxxxxxx', agent_type: 'general-purpose', tok: tokenHash(tb), cmd: cmds[tb] }) + '\n')
  r = pass(tb, 1, 'checker-x', { VENTURE_CALLERS_FILE: other, VENTURE_FAKE_AS_REAL: '1' })
  expect('VENTURE_CALLERS_FILE naming another agent does not pass on the real tracker', r.code !== 0 && result(1) !== 'pass', r.out)
  expect('... and is named as ignored', /VENTURE_CALLERS_FILE was set on the real tracker/.test(JSON.stringify(JSON.parse(readFileSync(db, 'utf8')))) || /VENTURE_CALLERS_FILE/.test(r.out), r.out)

  // a real checker passes both, on the old release
  r = run(tb, ['release', 'OLA-1'])
  expect('the builder releases its claim', r.code === 0, r.out)
  const tc = 'c'.repeat(32)
  record('cccccccc', tc, 'node scripts/venture/issues.mjs claim OLA-1 --who checker --role checker')
  r = run(tc, ['claim', 'OLA-1', '--who', 'checker', '--role', 'checker'])
  expect('a checker claims OLA-1', r.code === 0, r.out)
  for (const k of [1, 2]) {
    r = pass(tc, k, 'checker')
    expect(`the checker passes #${k} on ${OLD}`, r.code === 0 && result(k) === 'pass', r.out)
  }

  // 3. VENTURE_LIVE_RELEASE=<old release> in front of say: honored on a copy, ignored on the real tracker
  r = run(tc, ['say', 'OLA-1'], { VENTURE_LIVE_RELEASE: OLD })
  expect('on a copy, VENTURE_LIVE_RELEASE is honored (the test can tell the two apart)', new RegExp(`on release ${OLD} now`).test(r.out), r.out)
  r = run(tc, ['say', 'OLA-1'], { VENTURE_LIVE_RELEASE: OLD, VENTURE_FAKE_AS_REAL: '1' })
  expect('on the real tracker, VENTURE_LIVE_RELEASE=<old> does not make it WORKS', !new RegExp(`on release ${OLD} now`).test(r.out) && !/\bWORKS\b(?! SOMETIMES)/.test(r.out.replace(/LIVE VERSION UNKNOWN/g, '')), r.out)

  // 4. a hand-written cache with the current time and the mini's name (it passed the time and file checks)
  for (const from of ['admin@100.95.51.98', 'admin@171.66.240.175', 'local']) {
    writeFileSync(cache, JSON.stringify({ at: Date.now(), value: OLD, from }))
    r = run(tc, ['say', 'OLA-1'], { VENTURE_FAKE_AS_REAL: '1' })
    expect(`a hand-written live-release cache (from ${from}) is not used`, !new RegExp(`on release ${OLD} now`).test(r.out) && !/\bWORKS\b(?! SOMETIMES)/.test(r.out.replace(/LIVE VERSION UNKNOWN/g, '')), r.out)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
  rmSync(cache, { force: true })
  if (aside) renameSync(aside, cache)
}
console.log(`${n - fails} of ${n}`)
process.exit(fails ? 1 : 0)
