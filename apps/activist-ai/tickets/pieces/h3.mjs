// Piece check, ola-283 piece 3 (toolFiles).
import assert from 'node:assert/strict'
import path from 'node:path'
import { toolFiles } from '../apps/activist-ai/ops/select.mjs'
const AI = path.join(path.dirname(new URL(import.meta.url).pathname), '../apps/activist-ai')
const t = toolFiles(AI)
for (const f of ['ops/ola.mjs', 'ops/clean.mjs', 'ops/signers.mjs', 'ops/select.mjs']) assert.ok(t.includes(f), `${f} in ${t}`)
assert.ok(t.every((f) => f.startsWith('ops/')), `only ops/ files: ${t}`)
assert.deepEqual(t, [...t].sort(), 'sorted')
assert.equal(new Set(t).size, t.length, 'no repeats')
console.log('ok piece h3')
