// The speed check's own test (OLA-456): its rules, no model, no VM, a second.
//   node evals/speed/test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { freshBaseline, judge, olaLimit, overall, shouldRun, upstreamFrom } from './lib.mjs'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok ${name}`))

ok('a change to the instructions, a skill, a tool or the gateway runs it', () => {
  for (const f of ['workspace/AGENTS.md', 'skills/designer/SKILL.md', 'workspace/ola-page', 'gateway/server.mjs', 'frontdesk/examples.mjs', 'evals/speed/run.mjs']) assert.equal(shouldRun([f]).run, true, f)
})
ok('a change elsewhere does not', () => {
  assert.equal(shouldRun(['web/src/App.tsx', 'README.md', 'frontdesk/server.mjs', 'apple/Mac/App.swift']).run, false)
  assert.equal(shouldRun([]).run, false)
})
ok('an update that cannot say what changed runs it', () => assert.equal(shouldRun(null).run, true))
ok('within twice plain passes', () => assert.equal(judge({ seconds: 100, made: true }, { seconds: 200, status: 'done', page: 'a.html' }).pass, true))
ok('over twice plain fails, with both times', () => {
  const v = judge({ seconds: 298, made: true }, { seconds: 922, status: 'done', page: 'kite.html' })
  assert.equal(v.pass, false)
  assert.equal(v.ratio, 3.09)
  assert.match(v.why, /15 min 22 s.*4 min 58 s/)
})
ok('fast but no page fails', () => assert.equal(judge({ seconds: 100, made: true }, { seconds: 50, status: 'done', page: null }).pass, false))
ok('not finished fails', () => assert.equal(judge({ seconds: 100, made: true }, { seconds: 600, status: 'not finished in 600 s', page: null }).pass, false))
ok('no baseline is no verdict, not a pass', () => assert.equal(judge({ seconds: 30, made: false }, null).pass, null))
ok('the run passes only when every request passed', () => {
  assert.equal(overall([{ verdict: { pass: true } }, { verdict: { pass: true } }]), true)
  assert.equal(overall([{ verdict: { pass: true } }, { verdict: { pass: null } }]), false)
  assert.equal(overall([]), false)
})
ok('a baseline is kept a week', () => {
  const now = Date.parse('2026-11-27T12:00:00Z')
  assert.equal(freshBaseline({ made: true, at: '2026-11-22T12:00:00Z' }, now), true)
  assert.equal(freshBaseline({ made: true, at: '2026-11-19T12:00:00Z' }, now), false)
  assert.equal(freshBaseline({ made: false, at: '2026-11-27T11:00:00Z' }, now), false)
})
ok("Ola's walk is stopped at three times plain, between 10 and 30 minutes", () => {
  assert.equal(olaLimit(15), 600)
  assert.equal(olaLimit(298), 894)
  assert.equal(olaLimit(1000), 1800)
})
ok("the model is the gateway's general one", () => {
  const u = upstreamFrom('# x\nUPSTREAM_BASE_URL=https://api.together.xyz/v1\nUPSTREAM_API_KEY=zzz\nGATEWAY_MODELS=general=nvidia/N,see=meta/M\n')
  assert.deepEqual(u, { baseURL: 'https://api.together.xyz/v1', model: 'nvidia/N' })
})
ok('requests.json holds more than one kind, each with words to type', () => {
  const r = JSON.parse(readFileSync(fileURLToPath(new URL('./requests.json', import.meta.url)), 'utf8')).requests
  assert.ok(new Set(r.map((x) => x.kind)).size >= 2)
  for (const x of r) assert.ok(x.id && x.ask.length > 10)
})
ok('every update that serves starts it (ops/ola.mjs)', () => {
  const src = readFileSync(fileURLToPath(new URL('../../ops/ola.mjs', import.meta.url)), 'utf8')
  assert.match(src, /evals\/speed\/run\.mjs/)
  assert.match(src, /'--after-deploy', '--changed'/)
})
console.log(`speed: ${n} of ${n} passed`)
