#!/usr/bin/env node
// OLA-263: who may pass a check. A checker that holds the ticket's claim as a checker (--who checker, as
// CHECKER.md says) passes under its own name; the builder is refused under any name it types (builder-2,
// kit-check, checker), because the test is by the caller (_who.mjs), not the name. On a copy of the
// tracker (VENTURE_TRACKER_FAKE) and a made-up callers file, never the real ones.
//   node scripts/venture/checker-pass-test.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenHash } from './_who.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'checker-pass-test-'))
const db = join(dir, 'tracker.json')
const callers = join(dir, 'callers.jsonl')
const shot = join(dir, 'shot.log')
writeFileSync(shot, 'the check was done on the live thing and this is its output.\n'.repeat(10))
const T = (num) => ({ id: `OLA-${num}`, num, project: 'ola', title: `a made-up ticket ${num}`, what: '', area: 'ops', priority: 'P2', status: 'open', who: 'lead', opened_at: '2026-11-19T05:00:00Z', updated_at: '2026-11-19T05:00:00Z', links: [], proof: '' })
writeFileSync(db, JSON.stringify({ venture_issues: [T(1)], venture_state: [], venture_issue_activity: [], venture_commits: [] }))

const rows = []
const cmds = {}
const record = (agent, tok, cmd) => { cmds[tok] = cmd; rows.push(JSON.stringify({ at: Date.now() / 1000, session: 'lead-session', agent, agent_type: 'general-purpose', tok: tokenHash(tok), cmd })); writeFileSync(callers, rows.join('\n') + '\n') }
const run = (tok, ...args) => {
  const env = { ...process.env, VENTURE_TRACKER_FAKE: db, VENTURE_CALLERS_FILE: callers }
  for (const k of ['VENTURE_CALLER', 'VENTURE_TEST_SHELL', 'VENTURE_PRIVATE', 'VENTURE_RUNNER']) delete env[k]
  env.VENTURE_CALLER = tok
  env.VENTURE_TEST_SHELL = `export VENTURE_CALLER=${tok}; ${cmds[tok] ?? ''}`
  const r = spawnSync(process.execPath, [join(here, 'issues.mjs'), ...args], { env, encoding: 'utf8', timeout: 60000 })
  return { code: r.status, out: (r.stdout + r.stderr).trim() }
}
let fails = 0
let n = 0
const expect = (name, ok, detail) => { n++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${detail}`}`); if (!ok) fails++ }
const passed = () => JSON.parse(readFileSync(db, 'utf8')).venture_state.find((s) => s.key === 'accept:OLA-1')?.value?.checks?.[0]?.result === 'pass'
const BUILT = /built OLA-1|is its builder|is not passed as/
const pass = (tok, by) => run(tok, 'check', 'OLA-1', 'pass', '1', '--by', by, '--saw', 'it answered the way the check says it should', '--on', 'abc1234', '--log', shot)

try {
  // B builds: claims as a builder, writes the check, marks it ready
  const tb = 'b'.repeat(32)
  record('bbbbbbbb', tb, 'node scripts/venture/issues.mjs claim OLA-1 --who builder')
  let r = run(tb, 'claim', 'OLA-1', '--who', 'builder')
  expect('the builder claims OLA-1', r.code === 0, r.out)
  r = run(tb, 'check', 'OLA-1', 'add', '--at', 'terminal', '--do', 'types "node scripts/venture/issues.mjs list" in the terminal', '--see', 'the words "OLA-1" and "a made-up ticket 1" appear')
  expect('the builder writes the check', r.code === 0, r.out)
  r = run(tb, 'ready', 'OLA-1', '--on', 'abc1234')
  expect('the builder marks it ready', r.code === 0, r.out)

  // the builder grading its own work, under any name, is refused (OLA-263: "builder-2 or kit-check is not refused")
  for (const by of ['builder-2', 'kit-check', 'checker', 'checker-m4']) {
    r = pass(tb, by)
    expect(`the builder passing its own check as "${by}" is refused`, r.code !== 0 && !passed() && BUILT.test(r.out), r.out)
  }
  r = run(tb, 'release', 'OLA-1')
  expect('the builder releases its claim', r.code === 0, r.out)
  for (const by of ['builder-2', 'checker']) {
    r = pass(tb, by)
    expect(`after releasing, the builder passing as "${by}" is still refused`, r.code !== 0 && !passed() && BUILT.test(r.out), r.out)
  }

  // C, a fresh checker, claims as CHECKER.md says and passes under its own name
  const tc = 'c'.repeat(32)
  record('cccccccc', tc, 'node scripts/venture/issues.mjs claim OLA-1 --who checker --role checker')
  r = run(tc, 'claim', 'OLA-1', '--who', 'checker', '--role', 'checker')
  expect('the checker claims OLA-1 as checker', r.code === 0, r.out)
  r = pass(tc, 'builder')
  expect('the checker cannot pass under the builder\'s name', r.code !== 0 && !passed() && BUILT.test(r.out), r.out)
  r = pass(tc, 'checker')
  expect('the checker holding the claim passes as "checker" (OLA-263: was refused as "its builder")', r.code === 0 && passed(), r.out)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n - fails} of ${n}`)
process.exit(fails ? 1 : 0)
