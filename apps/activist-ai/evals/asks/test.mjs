#!/usr/bin/env node
// The asks' own checks, offline (no server, no model): the never list catches the answers people
// were given and passes the ones they wanted, the outcome patterns bite, the conversation is folded
// the way the apps fold it, and add-case writes a case the runner reads.
//   node evals/asks/test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { HERE, PLACES, checkMust, checkNever, readCases, siteAddresses, turnsOf } from './lib.mjs'
import { instructions, lines, problems, readAbilities, summary } from './abilities.mjs'

test('the never list catches the answers that were failures', () => {
  // Nov 20, a cloud project (Bart's screenshot)
  const bad = "This computer is in Ola's cloud runtime with no network, so I can't push it live from here. To publish, press Publish on the page in Made by Ola."
  assert.ok(checkNever({}, bad).includes('says it cannot do it from here'))
  assert.ok(checkNever({}, bad).includes('sends the person to a button or another screen'))
  // Nov 20, his Mac (OLA-223)
  assert.ok(checkNever({}, 'Publishing to sites.ola.cx is not switched on yet on Ola’s server, so nothing was published.').length)
  assert.ok(checkNever({}, 'I’m unable to publish from this runtime.').length)
})

test('the never list passes the answers that were wanted', () => {
  assert.deepEqual(checkNever({}, 'Done. Your page is live at https://sites.ola.cx/askcases/ and says Bart.'), [])
  // a tip after the work is done is fine; the same words when nothing was done are not
  const tip = 'It is live at https://sites.ola.cx/bart/. To change it later, ask me or press Publish again.'
  assert.deepEqual(checkNever({}, tip, { done: true }), [])
  assert.ok(checkNever({}, tip, { done: false }).length)
})

test('every case is well formed, and its patterns compile', () => {
  const cases = readCases()
  assert.ok(cases.length >= 3)
  const ids = new Set()
  for (const c of cases) {
    assert.ok(/^[a-z0-9][a-z0-9-]{0,39}$/.test(c.id) && !ids.has(c.id), c.id)
    ids.add(c.id)
    assert.ok(c.say && c.places.length && c.places.every((p) => PLACES.includes(p)), c.id)
    assert.ok(c.must.length && c.must.every((m) => /^(site|says|file|ran|newfile):./.test(m)), c.id)
    for (const m of c.must.filter((m) => m.startsWith('says:'))) new RegExp(m.slice(5), 'i')
    for (const s of c.mustNot ?? []) new RegExp(s, 'i')
    assert.ok(/^\d{4}-\d\d-\d\d$/.test(c.from?.date) && /^OLA-\d+$/.test(c.from?.ticket), `${c.id}: the date and ticket of the failure it came from`)
  }
  assert.ok(cases.some((c) => c.say === 'make a page that says Bart and publish it on ola' && c.places.includes('cloud-web:chat') && c.places.includes('local-mac:chat')))
})

test('who made it: the right answer passes, the false one fails', () => {
  const c = readCases().find((x) => x.id === 'who-made-index')
  const must = new RegExp(c.must[0].slice(5), 'i')
  const ok = (t) => must.test(t) && !(c.mustNot ?? []).some((s) => new RegExp(s, 'i').test(t))
  assert.ok(ok('index.html was created by Claude (claude-opus-5-5), not by the hosted open model.'))
  assert.ok(ok('Claude Code built it.'))
  assert.ok(!ok('I built it… there was no separate claude agent.'))
  assert.ok(!ok('It was made by Ola’s own model, not by Claude.'))
})

test('site addresses in an answer', () => {
  assert.deepEqual(siteAddresses('see https://sites.ola.cx/askcases and https://sites.ola.cx/bart-page/.'), ['https://sites.ola.cx/askcases/', 'https://sites.ola.cx/bart-page/'])
  assert.deepEqual(siteAddresses('https://example.com/x/'), [])
})

test('a conversation folds into turns as the apps fold it', () => {
  const t = turnsOf([
    { type: 'user', text: 'make a page', time: { created: 1 } },
    { type: 'assistant', time: { created: 2 }, content: [{ type: 'text', text: 'Making it.' }, { type: 'tool', name: 'write', state: { status: 'completed', input: { path: 'index.html' } } }] },
    { type: 'assistant', time: { created: 3 }, content: [{ type: 'text', text: 'Shall I publish it?' }] },
    { type: 'idle', outcome: 'succeeded', time: { created: 4 } },
    { type: 'user', text: 'Yes', time: { created: 5 } },
  ])
  assert.equal(t.length, 2)
  assert.equal(t[0].status, 'done')
  assert.deepEqual(t[0].texts, ['Making it.', 'Shall I publish it?'])
  assert.equal(t[0].tools[0].name, 'write')
  assert.equal(t[1].status, 'working')
})

test('add-case adds a case the runner reads, in one command', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'asks-add-'))
  copyFileSync(path.join(HERE, 'add-case.mjs'), path.join(dir, 'add-case.mjs'))
  copyFileSync(path.join(HERE, 'lib.mjs'), path.join(dir, 'lib.mjs'))
  writeFileSync(path.join(dir, 'cases.json'), JSON.stringify({ cases: [] }))
  const r = spawnSync(process.execPath, [path.join(dir, 'add-case.mjs'), 'make a chart of the survey and publish it', '--runtime', 'cloud,local', '--must', 'site:survey', '--must', 'file:chart.png', '--ticket', 'OLA-999', '--what', 'a made-up failure'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const [c] = JSON.parse(readFileSync(path.join(dir, 'cases.json'), 'utf8')).cases
  assert.equal(c.say, 'make a chart of the survey and publish it')
  assert.deepEqual(c.places, ['cloud-web:chat', 'cloud-mac:chat', 'cloud-phone:chat', 'local-mac:chat', 'local-phone:chat'])
  assert.deepEqual(c.must, ['site:survey', 'file:chart.png'])
  assert.equal(c.from.ticket, 'OLA-999')
  assert.match(c.id, /^make-a-chart-of/)
  const again = spawnSync(process.execPath, [path.join(dir, 'add-case.mjs'), 'make a chart of the survey and publish it', '--runtime', 'cloud', '--must', 'site:survey', '--ticket', 'OLA-999'], { encoding: 'utf8' })
  assert.notEqual(again.status, 0)
  const bad = spawnSync(process.execPath, [path.join(dir, 'add-case.mjs'), 'x y z', '--must', 'live:it', '--ticket', 'OLA-1'], { encoding: 'utf8' })
  assert.notEqual(bad.status, 0)
})

test('OLA-232: the network excuse is a failure for any request; a not-offered case may say it cannot', () => {
  assert.ok(checkNever({}, "I can't download that: this computer is in the cloud runtime with no network.").includes('blames having no network'))
  assert.ok(checkNever({}, 'There is no internet access here, so I cannot search.').includes('blames having no network'))
  assert.deepEqual(checkNever({}, 'This computer has no internet of its own, but I searched through Ola: three headlines below.'), [])
  const send = readCases().find((c) => c.id === 'send-email')
  const said = readAbilities().find((a) => a.id === 'send').cloud.notOffered
  assert.deepEqual(checkNever(send, said), [])
  assert.ok(new RegExp(send.must[0].slice(5), 'i').test(said), 'the case passes the sentence Ola is given')
  assert.ok(checkNever(send, 'I have sent the email to the volunteers.').length)
  assert.ok(checkNever({}, "I can't publish from here.").length, 'an offered case still may not say it cannot')
})

test('OLA-232: ran and newfile outcomes', async () => {
  const T = { listFiles: async () => ['members.csv', 'chart.png', 'flyer.html'], readFile: async (f) => (f === 'flyer.html' ? '<h1>Saturday 10 am</h1>' : null) }
  assert.ok((await checkMust('ran:ola-search', T, '', { steps: ['bash: ola-search "rent control"'] })).ok)
  assert.ok(!(await checkMust('ran:ola-search', T, '', { steps: ['bash: curl x'] })).ok)
  assert.ok((await checkMust('newfile:\\.png$', T, '', { before: ['members.csv'] })).ok)
  assert.ok(!(await checkMust('newfile:\\.png$', T, '', { before: ['chart.png'] })).ok, 'a file that was there before is not new')
  assert.ok((await checkMust('newfile:\\.html$:10', T, '', { before: [] })).ok)
  assert.ok(!(await checkMust('newfile:\\.html$:Sunday', T, '', { before: [] })).ok)
})

test('OLA-232: the list of abilities, the instructions written from it, and its lines', () => {
  assert.deepEqual(problems(), [])
  const A = readAbilities()
  for (const rt of ['cloud', 'local']) {
    const text = instructions(A, rt)
    for (const a of A) assert.ok(text.includes(a.what), `${a.id} is in the ${rt} instructions`)
  }
  // every offered ability that a case covers in a runtime covers both of its reachable places
  const L = lines({ latest: { cases: { 'web-search@cloud-web:chat': { status: 'passing', at: 'x' }, 'send-email@local-mac:chat': { status: 'not working yet', at: 'x' } } } })
  assert.equal(L.find((l) => l.ability === 'web-search' && l.place === 'cloud-web:chat').status, 'passing')
  assert.equal(L.find((l) => l.ability === 'send' && l.place === 'local-mac:chat').status, 'failing')
  assert.equal(L.find((l) => l.ability === 'web-search' && l.place === 'cloud-phone:chat').status, 'not run', 'a place the runner cannot reach is never passed')
  const s = summary({ latest: { cases: {} } })
  assert.equal(s.passing + s.failing + s.notRun, s.lines)
  assert.equal(s.notRun, s.lines)
})

void fileURLToPath
