// Piece check, ola-283 piece 2 (suiteFiles): the made-up tree from the ticket's own test, plus two
// cases on the real tree.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { suiteFiles, treeFiles } from '../apps/activist-ai/ops/select.mjs'
const R = mkdtempSync(path.join(tmpdir(), 'h2-'))
const w = (f, t) => (mkdirSync(path.dirname(path.join(R, f)), { recursive: true }), writeFileSync(path.join(R, f), t))
w('a/check.mjs', "import { x } from './helper.mjs'\nconst AI = path.join(HERE, '..')\nspawn(node, [path.join(AI, 'b/server.mjs')])\nconst fx = path.join(AI, 'fixtures')\n")
w('a/helper.mjs', "export const x = readFileSync(new URL('./data.json', import.meta.url))\n")
w('a/data.json', '{}')
w('b/server.mjs', "import { shared } from '../lib/shared.mjs'\nimport pkg from 'some-package'\n")
w('b/package-lock.json', '{}')
w('b/package.json', '{}')
w('lib/shared.mjs', "export const shared = 1 // mentions 'web' and 'server.mjs', which are weak signs\n")
w('fixtures/one.csv', 'a')
w('c/other.mjs', 'export {}\n')
w('web/x.mjs', 'export {}\n')
w('d/server.mjs', 'export {}\n')
const files = treeFiles(R)
const c = suiteFiles(R, 'a/check.mjs', files)
for (const f of ['a/check.mjs', 'a/helper.mjs', 'a/data.json', 'b/server.mjs', 'b/package-lock.json', 'lib/shared.mjs', 'fixtures/one.csv']) assert.ok(c.includes(f), `${f} in ${c}`)
assert.ok(!c.includes('c/other.mjs'), 'a file nothing names is not in it')
assert.ok(!c.includes('web/x.mjs'), 'a bare word outside path.join names no folder')
assert.equal(suiteFiles(R, 'a/missing.mjs', files), null)
assert.deepEqual(c, [...c].sort(), 'sorted')
// The real tree: the gateway's check reaches its server; the front desk's check reaches the web's fake model.
const AI = path.join(path.dirname(new URL(import.meta.url).pathname), '../apps/activist-ai')
const all = treeFiles(AI)
assert.ok(suiteFiles(AI, 'gateway/test.mjs', all).includes('gateway/server.mjs'))
assert.ok(suiteFiles(AI, 'frontdesk/check.mjs', all).includes('web/server/fake-model.mjs'))
console.log('ok piece h2')
