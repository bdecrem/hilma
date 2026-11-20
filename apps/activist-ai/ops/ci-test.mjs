// The automatic checks' decisions (OLA-84, ops/ci.mjs): node --test ops/ci-test.mjs. No git, no VM.
import assert from 'node:assert/strict'
import test from 'node:test'
import { coveredByDeploy, decide, ghStatus, opensIssue, parseDeploys, parseSuites } from './ci.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const now = Date.parse('2026-11-20T12:00:00Z')
const LOG = `2026-11-20T09:07:38.003Z refused ${B.slice(0, 12)} (origin/main): the workspace image ola-workspace:2.3.0-37 carries skills c119, this release's are d739: a skills change needs a new image tag (workspace/ws.mjs IMAGE)
2026-11-20T09:31:50.593Z deployed ${A.slice(0, 12)} (origin/main) UNSIGNED; turn 10 of 10, gateway 47 of 47, workspace 141 of 141`

test('deploys.log is read: passed with counts, refused with the reason', () => {
  const d = parseDeploys(LOG)
  assert.equal(d[A.slice(0, 12)].ok, true)
  assert.deepEqual(parseSuites(d[A.slice(0, 12)].suitesText), { turn: '10 of 10', gateway: '47 of 47', workspace: '141 of 141' })
  assert.equal(d[B.slice(0, 12)].ok, false)
  assert.match(d[B.slice(0, 12)].why, /^the workspace image/)
})

test('a tip with a check result is known; one with a deploy is known from the deploy and recorded', () => {
  const r = decide({ tip: A, tipAt: now, now, runs: [{ commit: A, ok: true, by: 'check' }], deploys: {} })
  assert.equal(r.do, 'known')
  const d = decide({ tip: A, tipAt: now, now, runs: [], deploys: parseDeploys(LOG), appsSame: true })
  assert.equal(d.do, 'known')
  assert.equal(d.record, true)
  assert.equal(d.result.by, 'deploy')
  assert.equal(d.result.suites.gateway, '47 of 47')
  const f = decide({ tip: B, tipAt: now, now, runs: [], deploys: parseDeploys(LOG) })
  assert.equal(f.result.ok, false)
  // A deployed tip that changed the apps' code still needs the check (a deploy runs no swift test).
  assert.equal(decide({ tip: A, tipAt: 0, now, runs: [], deploys: parseDeploys(LOG), appsSame: false }).do, 'check')
  // A check that gave its turn away (ok null) is not a result.
  assert.equal(decide({ tip: A, tipAt: 0, now, runs: [{ commit: A, ok: null }], deploys: {} }).do, 'check')
})

test('a tip that changes nothing in Ola carries the result of the commit before it', () => {
  const r = decide({ tip: B, tipAt: now, now, runs: [{ commit: A, ok: true, suites: { web: '1 of 1' } }], deploys: {}, base: A, baseSame: true })
  assert.equal(r.do, 'same')
  assert.equal(r.result.ok, true)
  assert.equal(r.result.same, A)
  const f = decide({ tip: B, tipAt: now, now, runs: [{ commit: A, ok: false, why: 'suite web failed (1 of 2)' }], deploys: {}, base: A, baseSame: true })
  assert.equal(f.result.ok, false)
})

test('a young tip that changes Ola waits for its deploy; an old one is checked', () => {
  const young = decide({ tip: B, tipAt: now - 5 * 60e3, now, runs: [{ commit: A, ok: true }], deploys: {}, base: A, baseSame: false, settleMin: 20 })
  assert.deepEqual(young, { do: 'wait', minutes: 15 })
  const old = decide({ tip: B, tipAt: now - 25 * 60e3, now, runs: [{ commit: A, ok: true }], deploys: {}, base: A, baseSame: false, settleMin: 20 })
  assert.equal(old.do, 'check')
  // A yielded check (ok null) is no result: the tip is checked again.
  assert.equal(decide({ tip: B, tipAt: 0, now, runs: [{ commit: A, ok: null }], deploys: {}, base: A, baseSame: true }).do, 'check')
})

test('the GitHub status says the counts, or the reason', () => {
  assert.deepEqual(ghStatus({ ok: true, by: 'check', suites: { web: '158 of 158', apps: '103 of 103' } }), { state: 'success', description: '261 of 261 checks passed' })
  assert.equal(ghStatus({ ok: true, by: 'same', same: A, suites: {} }).description, `passed (no Ola change since ${A.slice(0, 8)})`)
  assert.equal(ghStatus({ ok: false, by: 'check', why: 'suite web failed (150 of 158)' }).state, 'failure')
  assert.ok(ghStatus({ ok: false, why: 'x'.repeat(300) }).description.length <= 140)
})

test('an issue opens when main goes from passing to failing, not on every failing run', () => {
  const fail = { commit: B, ok: false }
  assert.equal(opensIssue(fail, [fail, { commit: A, ok: true }]), true)
  assert.equal(opensIssue(fail, [fail, { commit: A, ok: false }]), false)
  assert.equal(opensIssue(fail, [fail, { commit: A, ok: null }, { commit: 'c', ok: true }]), true)
  assert.equal(opensIssue({ commit: B, ok: true }, []), false)
})

test('a check behind a passed deploy of its own commit takes the deploy suites plus its own apps run', () => {
  const c = coveredByDeploy(LOG, A.slice(0, 12), { apps: '103 of 103' })
  assert.deepEqual(c, { apps: '103 of 103', turn: '10 of 10', gateway: '47 of 47', workspace: '141 of 141', at: '2026-11-20T09:31:50.593Z' })
  // A refused deploy, or none, is not taken: the check runs its suites.
  assert.equal(coveredByDeploy(LOG, B.slice(0, 12), {}), null)
  assert.equal(coveredByDeploy(LOG, 'c'.repeat(12), {}), null)
  assert.match(ghStatus({ ok: true, by: 'check+deploy', suites: { apps: '1 of 1', web: '2 of 2' } }).description, /^3 of 3 checks passed \(apps here/)
})
