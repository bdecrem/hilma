// OLA-279: which lines of the test server's deploys.log went around runner.mjs deploy.
// node --test scripts/venture/deploys-gate-test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { ungatedDeploys } from './_overrides.mjs'

const since = '2026-11-20T00:00:00Z'
test('a line with an allowed start in the 90 minutes before is gated; one without is not', () => {
  const log = ['2026-11-21T10:30:00.000Z deployed aaaaaaaaaaaa (origin/main) UNSIGNED; web 1 of 1', '2026-11-21T14:00:00.000Z refused bbbbbbbbbbbb (origin/main): x'].join('\n')
  const out = ungatedDeploys(log, [{ at: '2026-11-21T10:05:00.000Z' }], since)
  assert.deepEqual(out.map((x) => x.at), ['2026-11-21T14:00:00.000Z'])
})
test('since the gate is in ola.mjs, a line naming another caller is outside the gate even right after an allowed start', () => {
  const log = [
    '2026-11-22T10:30:00.000Z deployed aaaaaaaaaaaa (origin/main) UNSIGNED; web 1 of 1; picked via runner.mjs deploy',
    '2026-11-22T10:40:00.000Z deployed cccccccccccc (origin/main) UNSIGNED; web 1 of 1 via studio setup.sh',
  ].join('\n')
  const out = ungatedDeploys(log, [{ at: '2026-11-22T10:05:00.000Z' }, { at: '2026-11-22T10:35:00.000Z' }], since)
  assert.deepEqual(out.map((x) => x.at), ['2026-11-22T10:40:00.000Z'])
})
test('a line that says via runner.mjs deploy with no allowed start (the variable typed by hand) is still caught', () => {
  const out = ungatedDeploys('2026-11-22T12:00:00.000Z deployed aaaaaaaaaaaa (origin/main) UNSIGNED via runner.mjs deploy', [], since)
  assert.equal(out.length, 1)
})
test('lines before the gate are not counted', () => {
  assert.equal(ungatedDeploys('2026-11-19T12:00:00.000Z deployed aaaaaaaaaaaa (origin/main) via by hand', [], since).length, 0)
})
