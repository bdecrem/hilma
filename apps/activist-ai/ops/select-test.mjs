// Which suites an update runs (OLA-283, ops/select.mjs): node --test ops/select-test.mjs. Seconds, no VM.
//
// Against this commit's own tree: a change runs the suites whose files it touches, a change no
// suite is known to use runs everything, and a change in one part that another part's check uses
// (a shared file, a server a check starts, the page a check signs in through) runs that check too.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ALWAYS, PARTS, lanes, plan, suiteFiles, toolFiles, treeFiles } from './select.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SUITES = ['turn', 'gateway', 'workspace', 'web', 'frontdesk', 'backup', 'ci', 'signers', 'tls', 'restart', 'asks', 'select', 'models']
const T = mkdtempSync(path.join(tmpdir(), 'ola-select-test-'))
after(() => rmSync(T, { recursive: true, force: true }))
const README = readFileSync(path.join(AI, 'README.md'), 'utf8')
const ran = (changed, opts = {}) => {
  const p = plan({ root: AI, changed, suites: SUITES, before: (f) => (f === 'README.md' ? README : null), ...opts })
  return { ...p, big: p.run.filter((s) => !ALWAYS.includes(s)).sort() }
}

test('documents, the notes and the asks’ own runner run the seconds-long suites only, and each skipped suite says why', () => {
  for (const c of [['README.md'], ['OVERVIEW.md', 'web/README.md', 'evals/README.md'], ['evals/asks/run.mjs', 'evals/asks/cases.json'], ['ops/watch.mjs'], ['site/build.mjs', 'brand/icon/web-icons.py']]) {
    const p = ran(c)
    assert.equal(p.all, null, `${c}: ${p.all}`)
    assert.deepEqual(p.big, [], `${c} ran ${p.big}`)
    for (const s of ALWAYS) assert.ok(p.run.includes(s), `${s} always runs`)
    for (const s of ['gateway', 'workspace', 'web', 'frontdesk', 'tls']) assert.match(p.skip.find((x) => x.name === s).why, /touches none of its \d+ files/)
  }
})

test('the README’s standing instruction is read by the web and workspace checks: changing it runs them', () => {
  const rule = PARTS['README.md'](README)
  assert.ok(rule && rule.length > 40, 'the README has its standing instruction')
  const changed = README.replace(rule, `${rule} (changed)`)
  const p = ran(['README.md'], { before: () => changed })
  assert.ok(p.big.includes('web') && p.big.includes('workspace'), p.big.join(' '))
  // Without the old text to compare with, it cannot tell, and runs them too.
  assert.ok(ran(['README.md'], { before: () => null }).big.includes('web'))
})

test('the website’s code runs the web suite and the front desk’s (it signs people in through the built page), nothing else', () => {
  assert.deepEqual(ran(['web/src/App.tsx']).big, ['frontdesk', 'web'])
  assert.deepEqual(ran(['web/check.mjs']).big, ['web'], 'the web check’s own code')
  assert.deepEqual(ran(['web/test/blocks.test.ts']).big, ['web'])
})

test('the web server’s code runs its own suite, and the web suite, whose stand-in uses it', () => {
  const p = ran(['frontdesk/server.mjs'])
  assert.ok(p.big.includes('frontdesk') && p.big.includes('web'), p.big.join(' '))
  assert.ok(!p.big.includes('gateway') && !p.big.includes('tls') && !p.big.includes('workspace'), p.big.join(' '))
  assert.deepEqual(ran(['frontdesk/admin.mjs']).big.includes('gateway'), false)
})

test('a change in one part that another part’s check uses runs that check (the cross-part break)', () => {
  // The scripted model the web suite and the front desk's check import from web/server/.
  assert.ok(ran(['web/server/fake-model.mjs']).big.includes('frontdesk'))
  // The pass key code the TLS front imports, and the front desk check starts the TLS front.
  const pass = ran(['ops/pass.mjs']).big
  assert.ok(pass.includes('tls') && pass.includes('frontdesk'), pass.join(' '))
  // The gateway, which every VM suite starts, and the project image's tag.
  const gw = ran(['gateway/server.mjs']).big
  for (const s of ['gateway', 'workspace', 'web', 'frontdesk']) assert.ok(gw.includes(s), `${s} in ${gw}`)
  const ws = ran(['workspace/ws.mjs']).big
  for (const s of ['workspace', 'frontdesk']) assert.ok(ws.includes(s), `${s} in ${ws}`)
  // A skill goes into the image the VM suites run.
  const sk = ran(['skills/sound/SKILL.md']).big
  assert.ok(sk.includes('workspace') && sk.includes('frontdesk'), sk.join(' '))
})

test('when it cannot tell, every suite runs: a file no suite is known to use, the update tool, the top packages, no base', () => {
  for (const c of [['tools/new-thing.mjs'], ['ops/ola.mjs'], ['ops/select.mjs'], ['ops/turn.mjs'], ['package-lock.json'], ['frontdesk/README.md', 'ops/new.mjs']]) {
    const p = ran(c)
    assert.ok(p.all, `${c} should run everything`)
    assert.deepEqual(p.run, SUITES)
  }
  assert.match(ran(null).all, /no passed commit/)
  assert.match(plan({ root: AI, changed: ['README.md'], suites: [...SUITES, 'mystery'] }).all, /does not know suite mystery/)
  assert.ok(toolFiles(AI).includes('ops/clean.mjs') && toolFiles(AI).includes('ops/select.mjs'), toolFiles(AI).join(' '))
})

test('the closure follows imports, spawned scripts, read files and named folders (a made-up tree)', () => {
  const R = path.join(T, 'tree')
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
})

test('lanes: the two VM suites one after the other, everything else beside them', () => {
  const l = lanes(['turn', 'gateway', 'workspace', 'web', 'frontdesk', 'tls', 'select'])
  assert.deepEqual(l[0], ['workspace', 'frontdesk'])
  assert.ok(l.some((x) => x.length === 1 && x[0] === 'web'))
  assert.ok(l.some((x) => x.includes('select')))
  assert.equal(l.flat().length, 7)
})
