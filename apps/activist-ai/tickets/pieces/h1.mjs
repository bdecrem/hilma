// Piece check, ola-283 piece 1 (select.mjs: the tables, unchecked, treeFiles, lanes).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ALWAYS, ENTRY, OWNS, LANES, ALL_IF, PARTS, unchecked, treeFiles, lanes } from '../apps/activist-ai/ops/select.mjs'
assert.deepEqual(ALWAYS, ['turn', 'backup', 'ci', 'signers', 'restart', 'asks', 'select'])
assert.equal(ENTRY.frontdesk, 'frontdesk/check.mjs')
assert.equal(ENTRY.asks, 'evals/asks/test.mjs')
assert.ok(OWNS.frontdesk.includes('web/src/') && OWNS.workspace.includes('skills/'))
assert.deepEqual(LANES[0], ['workspace', 'frontdesk'])
assert.deepEqual(ALL_IF, ['package.json', 'package-lock.json'])
for (const f of ['README.md', 'evals/run.mjs', 'site/x.js', 'ops/watch.mjs', 'apple/A.swift']) assert.ok(unchecked(f), `${f} is unchecked`)
for (const f of ['workspace/README.md', 'skills/sound/SKILL.md', 'gateway/server.mjs', 'ops/ola.mjs']) assert.ok(!unchecked(f), `${f} is not unchecked`)
const readme = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../apps/activist-ai/README.md'), 'utf8')
assert.ok((PARTS['README.md'](readme) ?? '').length > 40, 'PARTS finds the standing instruction in the README')
const R = mkdtempSync(path.join(tmpdir(), 'h1-'))
for (const f of ['b/x.mjs', 'a.txt', 'node_modules/p/i.js', 'dist/o.js', '.hidden/h', 'c/.git/k', 'c/d/e.md', 'c/.build/z']) { mkdirSync(path.dirname(path.join(R, f)), { recursive: true }); writeFileSync(path.join(R, f), '') }
assert.deepEqual(treeFiles(R), ['a.txt', 'b/x.mjs', 'c/d/e.md'])
const l = lanes(['turn', 'gateway', 'workspace', 'web', 'frontdesk', 'tls', 'select', 'mystery'])
assert.deepEqual(l, [['workspace', 'frontdesk'], ['web'], ['gateway'], ['tls'], ['turn', 'select'], ['mystery']])
console.log('ok piece h1')
