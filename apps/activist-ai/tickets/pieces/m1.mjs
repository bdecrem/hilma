// Piece check, ola-337 piece 1 (hostedConfig reads the picked choices). Run from the work folder.
import assert from 'node:assert/strict'
import { hostedConfig, PICKS, HOSTED_SETTINGS } from '../apps/activist-ai/gateway/hosted.mjs'
const base = { HOSTED_BASE_URL: 'https://api.example.com/v1', HOSTED_API_KEY: 'k'.repeat(20), HOSTED_MODEL: 'Big/Open-1', GATEWAY_HOSTED_FILE: '/tmp/none' }
const run = (env) => { const errs = []; const c = hostedConfig(env, (m) => errs.push(m)); return { c, errs } }
assert.ok(HOSTED_SETTINGS.includes('HOSTED_DEEPSEEK_MODEL') && HOSTED_SETTINGS.includes('HOSTED_DEEPSEEK_PRICES'), 'HOSTED_SETTINGS lists the two new settings')
assert.deepEqual(PICKS, { 'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', words: 'DeepSeek V4 Pro, an outside open model', model: 'HOSTED_DEEPSEEK_MODEL', prices: 'HOSTED_DEEPSEEK_PRICES' } })
let r = run({ ...base, HOSTED_DEEPSEEK_MODEL: 'Pick/Deep-4', HOSTED_DEEPSEEK_PRICES: 'in=2000,out=3000' })
assert.deepEqual(r.errs, [])
assert.deepEqual(r.c.picks.get('deepseek-v4-pro'), { name: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', words: 'DeepSeek V4 Pro, an outside open model', model: 'Pick/Deep-4', prices: { in: 2000, out: 3000 } })
r = run(base)
assert.deepEqual(r.errs, [])
assert.equal(r.c.picks.size, 0, 'no pick without HOSTED_DEEPSEEK_MODEL')
assert.deepEqual(r.c.prices, { in: 2, out: 2 })
assert.ok(run({ ...base, HOSTED_DEEPSEEK_MODEL: 'Big/Open-1' }).errs.some((e) => e.includes('never the hosted default')), 'same id as HOSTED_MODEL is refused')
assert.ok(run({ ...base, HOSTED_DEEPSEEK_PRICES: 'in=1,out=1' }).errs.includes('HOSTED_DEEPSEEK_PRICES is set but HOSTED_DEEPSEEK_MODEL is not'))
assert.ok(run({ ...base, HOSTED_DEEPSEEK_MODEL: 'Pick/D', HOSTED_DEEPSEEK_PRICES: 'in=x' }).errs.includes('HOSTED_DEEPSEEK_PRICES is in=,out= in dollars per million tokens'))
assert.ok(run({ ...base, GATEWAY_HOSTED_PRICES: 'bad' }).errs.includes('GATEWAY_HOSTED_PRICES is in=,out= in dollars per million tokens'))
assert.ok(run({ HOSTED_DEEPSEEK_MODEL: 'Pick/D' }).errs.includes('HOSTED_DEEPSEEK_MODEL is set but HOSTED_BASE_URL is not'))
console.log('ok piece m1')
