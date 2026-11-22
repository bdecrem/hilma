// Piece check, ola-337 piece 2 (makeHosted serves the picks and records them at their own prices).
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hostedConfig, makeHosted } from '../apps/activist-ai/gateway/hosted.mjs'
const dir = mkdtempSync(path.join(tmpdir(), 'm2-'))
const file = path.join(dir, 'grants')
writeFileSync(file, '{}', { mode: 0o600 }); chmodSync(file, 0o600)
const errs = []
const cfg = hostedConfig({ HOSTED_BASE_URL: 'https://api.example.com/v1', HOSTED_API_KEY: 'k'.repeat(20), HOSTED_MODEL: 'Big/Open-1', GATEWAY_HOSTED_FILE: file, HOSTED_DEEPSEEK_MODEL: 'Pick/Deep-4', HOSTED_DEEPSEEK_PRICES: 'in=2000,out=3000' }, (m) => errs.push(m))
assert.deepEqual(errs, [])
const h = makeHosted({ cfg, db: new DatabaseSync(':memory:') })
assert.ok(h.picks instanceof Map && h.picks.has('deepseek-v4-pro'), 'h.picks is the Map of picks')
assert.deepEqual(h.pickList(), [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', words: 'DeepSeek V4 Pro, an outside open model' }])
assert.equal(h.record('ws', 2, 1, 'deepseek-v4-pro'), 7000, 'a pick at its own prices: 2*2000 + 1*3000')
assert.equal(h.record('ws', 1, 1), 4, 'hosted at the hosted prices (default in=2,out=2)')
assert.equal(h.record('ws', 0, 0, 'deepseek-v4-pro'), 0)
assert.deepEqual([h.monthOf('ws').requests, h.monthOf('ws').cost_micro_usd], [2, 7004], 'one month record for both')
const none = makeHosted({ cfg: { ...cfg, picks: undefined }, db: new DatabaseSync(':memory:') })
assert.deepEqual(none.pickList(), [], 'no picks: an empty list')
console.log('ok piece m2')
process.exit(0)
