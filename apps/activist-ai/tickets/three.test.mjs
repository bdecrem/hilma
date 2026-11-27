// three.mjs's picking rule and test parsing (OLA-520).   node apps/activist-ai/tickets/three.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { pick, parseTests } from './three.mjs'

const base = { pass: 50, failed: ['a', 'b', 'c', 'd'] }

test('most tests passing wins', () => {
  assert.equal(pick([{ pass: 51, failed: ['b', 'c', 'd'], size: 10 }, { pass: 53, failed: ['d'], size: 90 }, { pass: 52, failed: ['c', 'd'], size: 5 }], base), 1)
})

test('a try that broke a test that passed before is not picked', () => {
  assert.equal(pick([{ pass: 53, failed: ['x'], size: 10 }, { pass: 51, failed: ['b', 'c', 'd'], size: 10 }], base), 1)
})

test('a tie goes to the smaller change', () => {
  assert.equal(pick([{ pass: 53, failed: ['d'], size: 40 }, { pass: 53, failed: ['c'], size: 12 }, { pass: 53, failed: ['a'], size: 30 }], base), 1)
})

test('none better than the untouched code: -1 (start from the untouched code)', () => {
  assert.equal(pick([{ pass: 50, failed: base.failed, size: 3 }, { pass: 50, failed: base.failed, size: 9 }, { pass: 49, failed: [...base.failed, 'x'], size: 1 }], base), -1)
})

test('parseTests: top-level failures, the failing block without stack lines', () => {
  const out = '✔ one (1.2ms)\n✖ two words (5011.5ms)\n  ✖ nested (1ms)\nℹ tests 3\nℹ pass 1\n\n✖ failing tests:\n\ntest at t.mjs:1:1\n✖ two words (5011.5ms)\n  Error: timed out\n      at waitFor (x.mjs:32:33)\n'
  const p = parseTests(out)
  assert.deepEqual(p.failed, ['two words'])
  assert.ok(p.report.includes('Error: timed out') && !p.report.includes('waitFor'))
})

test('whyEnded names the step cap, the allowance and no edit', async () => {
  const { whyEnded } = await import('./three.mjs')
  assert.equal(whyEnded({ end: 'done', requests: 60, size: 0 }, 60), 'stopped at the 60-step cap with no edit')
  assert.equal(whyEnded({ end: 'model_error', requests: 50, size: 0 }, 60, '{"type":"insufficient_quota"}'), "cut off: the model connection's allowance is used up")
  assert.equal(whyEnded({ end: 'done', requests: 12, size: 0 }, 60), 'stopped with no edit')
  assert.equal(whyEnded({ end: 'done', requests: 30, size: 40 }, 60), 'done')
})
