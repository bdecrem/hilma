// A suite under its time limit, and a failed suite's rerun (ops/suite.mjs; OLA-334, OLA-335).
// No VM, a few seconds.   node --test ops/suite-test.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LIMITS, limitMs, outcome, runLimited } from './suite.mjs'
import { acquire, holder, turnPaths } from './turn.mjs'

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const sink = () => {
  let text = ''
  return { write: (d) => (text += d), get text() { return text } }
}

test('a suite that hangs is stopped at its limit, with what it started, and the turn goes back', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ola-suite-'))
  const P = turnPaths(dir)
  const turn = await acquire({ P, poll: 20, label: 'a check' })
  assert.ok(holder(P), 'the check holds the turn')
  // a suite that starts a child of its own and then never ends, ignoring SIGTERM (like the engine on Nov 21)
  const kidFile = path.join(dir, 'kid')
  const hang = `const { spawn } = require('node:child_process'); const k = spawn('/bin/sleep', ['600'], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(kidFile)}, String(k.pid)); process.on('SIGTERM', () => {}); console.log('ℹ pass 3'); setInterval(() => {}, 1000)`
  const out = sink()
  const t0 = Date.now()
  const r = await runLimited(process.execPath, ['-e', hang], { out, limit: 1500, killGrace: 500 })
  const took = Date.now() - t0
  assert.equal(r.timedOut, true)
  assert.equal(r.code, 124)
  assert.ok(took < 1500 + 500 + 1500, `stopped within the limit and the grace (${took} ms)`)
  assert.match(out.text, /stopped at its time limit \(2 s\)/)
  const kid = Number(readFileSync(kidFile, 'utf8'))
  await new Promise((res) => setTimeout(res, 200))
  assert.equal(alive(kid), false, 'the child it started is stopped too')
  // what ola.mjs does next: the update is refused, and refuse() gives the turn back
  const o = outcome('apps', { code: r.code, timedOut: r.timedOut, count: '?', kept: '/x/check-abc-apps-first.txt' })
  assert.equal(o.ok, false)
  assert.match(o.line, /suite apps stopped at its time limit and counted as failed \(\?; output kept in \/x\/check-abc-apps-first\.txt\)/)
  turn.release()
  assert.equal(holder(P), null, 'the turn is free')
  const next = await Promise.race([acquire({ P, poll: 20, label: 'the update' }), new Promise((res) => setTimeout(() => res(null), 3000))])
  assert.ok(next, 'the next one gets the turn at once')
  next.release()
})

test('a suite that fails once and passes on the rerun is recorded with both', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ola-suite-'))
  const mark = path.join(dir, 'ran-once')
  // fails the first time (writes the mark), passes the second
  const flaky = `const fs = require('node:fs'); if (!fs.existsSync(${JSON.stringify(mark)})) { fs.writeFileSync(${JSON.stringify(mark)}, '1'); console.log('ℹ pass 40\\nℹ fail 1'); process.exit(1) } console.log('ℹ pass 41\\nℹ fail 0')`
  const count = (t) => `${/ℹ pass (\d+)/.exec(t)[1]} of ${Number(/ℹ pass (\d+)/.exec(t)[1]) + Number(/ℹ fail (\d+)/.exec(t)[1])}`
  const a = await runLimited(process.execPath, ['-e', flaky], { out: sink(), limit: 10000 })
  const kept = path.join(dir, 'deploy-abc-web-first.txt')
  writeFileSync(kept, a.tail)
  const first = { code: a.code, timedOut: a.timedOut, count: count(a.tail), kept }
  assert.equal(first.code, 1)
  const b = await runLimited(process.execPath, ['-e', flaky], { out: sink(), limit: 10000 })
  const o = outcome('web', first, { code: b.code, timedOut: b.timedOut, count: count(b.tail), kept: null })
  assert.equal(o.ok, true)
  assert.equal(o.flaky, true)
  assert.equal(o.count, '41 of 41')
  assert.equal(o.line, `web failed once (40 of 41; output kept in ${kept}) and passed on the rerun (41 of 41)`)
  assert.ok(existsSync(kept) && /pass 40/.test(readFileSync(kept, 'utf8')), 'the first output is kept')
})

test('a suite that fails twice is refused naming both runs; one stopped at its limit is not rerun', () => {
  const o = outcome('web', { code: 1, count: '40 of 41', kept: '/k/first.txt' }, { code: 1, count: '39 of 41', kept: '/k/rerun.txt' })
  assert.equal(o.ok, false)
  assert.equal(o.line, 'suite web failed twice (40 of 41, then 39 of 41; output kept in /k/first.txt and /k/rerun.txt)')
  assert.equal(outcome('web', { code: 0, count: '41 of 41' }).ok, true)
  assert.equal(outcome('web', { code: 124, timedOut: true, count: '?', kept: '/k/f.txt' }, { code: 0, count: '41 of 41' }).ok, false, 'a timeout is never rerun into a pass')
})

test('every suite has a limit; the override is for tests', () => {
  for (const n of ['frontdesk', 'web', 'workspace', 'gateway', 'tls', 'apps']) assert.ok(LIMITS[n] > 0, n)
  assert.equal(limitMs('frontdesk', {}), 25 * 60000)
  assert.equal(limitMs('turn', {}), 5 * 60000, 'a seconds-long suite gets the default')
  assert.equal(limitMs('apps', { OLA_SUITE_LIMIT_MIN: '0.5' }), 30000)
})
