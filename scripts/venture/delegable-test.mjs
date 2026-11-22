#!/usr/bin/env node
// OLA-261: the evening review's model count is read from every machine the lead ran on, not only the
// one the review runs on. Run on the mini, the count once saw only the runner's own transcripts and
// printed "Opus 100%, no stretches" while the M4 had four. And sweep.mjs post never takes the entry's
// own models part (made-up shares, stretches emptied): it stores the count.
// Offline: made-up transcripts (--dir) and a stand-in tracker (VENTURE_TRACKER_FAKE) holding the
// counts other machines stored with --export, and what Bart typed on them.
//   node scripts/venture/delegable-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'delegable-'))
const DAY = '2026-11-20'
const tx = join(dir, 'transcripts')
mkdirSync(tx)
// this machine: only Opus (the runner), no stretch
const line = (i) => JSON.stringify({ type: 'assistant', timestamp: `${DAY}T20:0${i}:00Z`, uuid: `u${i}`, message: { id: `m${i}`, model: 'claude-opus-5-5', usage: { output_tokens: 1000 }, content: [{ type: 'tool_use', name: 'Bash', input: {} }] } })
writeFileSync(join(tx, 'runner.jsonl'), [0, 1, 2].map(line).join('\n') + '\n')
const stretch = (at, host) => ({ at, calls: 20, what: `20 Bash (session abcd1234, ${host})`, from: `${DAY}T${at}` })
const tracker = join(dir, 'tracker.json')
const fake = (state) => writeFileSync(tracker, JSON.stringify({ venture_issues: [], venture_state: state, venture_issue_activity: [], venture_commits: [] }))
const stored = { key: 'delegable_LEAD_MAC', value: { host: 'LEAD_MAC', days: { [DAY]: { out: { 'claude-fable-5-1': 1000, 'claude-opus-5-5': 0 }, stretches: [stretch('17:00:00Z', 'LEAD_MAC'), stretch('18:00:00Z', 'LEAD_MAC')], files: 3, at: `${DAY}T23:00:00Z` } } } }
const typedOther = { key: 'typed_OTHER_MAC', value: { days: { [DAY]: [{ at: `${DAY}T19:00:00Z` }, { at: `${DAY}T19:05:00Z` }] } } }
const typedLate = { key: 'typed_LEAD_MAC', value: { days: { [DAY]: [{ at: `${DAY}T23:30:00Z` }] } } }
const env = { ...process.env, VENTURE_TRACKER_FAKE: tracker }
const run = (...a) => {
  const r = spawnSync('node', [here('./delegable.mjs'), '--day', DAY, '--dir', tx, ...a], { encoding: 'utf8', env })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}
const json = (...a) => JSON.parse(run('--json', ...a).trim().split('\n').pop())

let pass = 0
const t = (name, fn) => { fn(); pass++; console.log(`ok ${pass}  ${name}`) }

fake([stored, typedOther])
t('this machine alone (--local) is the old wrong answer: Opus 100%, no stretch', () => {
  const m = json('--local')
  assert.deepEqual(m.shares, [{ model: 'Opus', share: 100 }])
  assert.equal(m.stretches.length, 0)
})
t("the review's count adds the other machine's stored count: its Fable share and both stretches", () => {
  const m = json()
  assert.deepEqual(m.shares, [{ model: 'Opus', share: 75 }, { model: 'Fable', share: 25 }])
  assert.equal(m.stretches.length, 2)
  assert.ok(m.machines.includes('LEAD_MAC'))
})
t('a machine where Bart typed that day and that stored no count is named missing', () => {
  const m = json()
  assert.deepEqual(m.missing, ['OTHER_MAC'])
  assert.match(m.note, /MISSING: OTHER_MAC \(Bart typed there 2 time/)
  assert.match(run(), /MISSING OTHER_MAC/)
})
fake([stored, typedLate])
t("a count stored before Bart's last message on that machine says it is counted only up to then", () => {
  assert.match(run(), /LEAD_MAC \(stored [^)]*before Bart's last message there at [^)]*counted only up to/)
})
fake([])
t('with no other machine stored, nothing is added and nothing is missing', () => {
  const m = json()
  assert.deepEqual(m.shares, [{ model: 'Opus', share: 100 }])
  assert.deepEqual(m.missing, [])
})

// sweep.mjs post, for real, into the stand-in tracker and a copy of the notes: an entry for a made-up quiet
// day (2020-01-01: no transcript, correction or commit here) whose models part says Opus 100% and no
// stretch is stored with the count instead (the other machine's Fable half and its stretch)
t("sweep.mjs post stores the count, not the entry's made-up models (Opus 100, stretches emptied)", () => {
  const D = '2020-01-01'
  const notes = join(dir, 'private')
  mkdirSync(join(notes, 'data'), { recursive: true })
  writeFileSync(join(notes, 'CORRECTIONS.md'), '# Corrections\n')
  writeFileSync(join(notes, 'RULES.md'), '# rules\n')
  writeFileSync(join(notes, 'data/weaknesses.json'), JSON.stringify([{ id: 'w1', side: 'kit', name: 'A', what: 'x', seen: [], guards: [] }]))
  const T = (n) => ({ id: `OLA-${n}`, num: n, project: 'ola', title: `ticket ${n}`, what: '', area: 'ops', status: 'open', priority: 'P1', who: 'lead', opened_at: `${D}T20:00:00Z`, updated_at: `${D}T20:00:00Z`, links: [], proof: '' })
  const internal = (n) => ({ key: `accept:OLA-${n}`, at: `${D}T20:00:00Z`, value: { checks: [], skips: [], internal: { why: 'a made-up ticket for delegable-test.mjs', by: 'kit', at: `${D}T20:00:00Z` }, ready: null } })
  writeFileSync(tracker, JSON.stringify({
    venture_issues: [T(1), T(2)], venture_issue_activity: [], venture_commits: [],
    venture_state: [
      internal(1), internal(2),
      { key: 'requests', at: `${D}T23:00:00Z`, value: { days: { [D]: { at: `${D}T23:00:00Z`, counts: { requests: 0, matched: 0, done: 0, answered: 0 }, opened: [] } } } },
      { key: 'delegable_LEAD_MAC', at: `${D}T23:00:00Z`, value: { host: 'LEAD_MAC', days: { [D]: { out: { 'claude-fable-5-1': 500, 'claude-opus-5-5': 500 }, stretches: [{ at: '9:00 am to 9:10 am', calls: 20, what: '20 Bash (session abcd1234, LEAD_MAC)', from: `${D}T17:00:00Z` }], files: 2, at: `${D}T23:00:00Z` } } } },
    ],
  }))
  const f = join(dir, 'entry.json')
  writeFileSync(f, JSON.stringify({ day: D, quiet: true, summary: 'a made-up day', read: [{ n: '1', what: 'messages' }], pattern: 'x', cleaned: [], kit: [], ola: [], open: [{ text: 'x' }], build: { text: 'x' }, ideas: { kit: { text: 'x', why: 'y', issue: 'OLA-1' }, ola: { text: 'x', why: 'y', issue: 'OLA-2' } }, models: { shares: [{ model: 'Opus', share: 100 }], rule: '', stretches: [] } }))
  const r = spawnSync('node', [here('./sweep.mjs'), 'post', f], { encoding: 'utf8', env: { ...env, VENTURE_PRIVATE: notes }, timeout: 120000 })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /models part differs from the count \(0 stretch\(es\) written, 1 counted\); the count is stored/)
  const m = JSON.parse(readFileSync(tracker, 'utf8')).venture_state.find((x) => x.key === 'sweeps').value.days.find((x) => x.day === D).models
  assert.equal(m.stretches.length, 1)
  assert.match(m.stretches[0].what, /LEAD_MAC/)
  assert.deepEqual(m.shares.map((s) => s.model).sort(), ['Fable', 'Opus'])
  assert.ok(!m.shares.some((s) => s.share === 100))
})

rmSync(dir, { recursive: true, force: true })
console.log(`${pass} of 6`)
