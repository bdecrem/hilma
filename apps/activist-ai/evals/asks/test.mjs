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
import { HERE, PLACES, checkMust, checkNever, readCases, siteAddresses, turnsOf, verdictOf, ratchet } from './lib.mjs'
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
  writeFileSync(path.join(dir, 'log.json'), JSON.stringify({ rows: [], notes: [] }))
  process.env.OLA_ASKS_LOG_JSON = path.join(dir, 'log.json') // never the real machine from a test
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
  assert.equal(c.from.words, 'description', 'a sentence nobody typed is recorded as a description')
})

test('add-case takes the sentence from the stored conversation, word for word, with its time and place (Bart, Nov 20)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'asks-log-'))
  for (const f of ['add-case.mjs', 'lib.mjs']) copyFileSync(path.join(HERE, f), path.join(dir, f))
  const file = path.join(dir, 'cases.json')
  writeFileSync(file, JSON.stringify({ cases: [] }))
  const at1 = Date.parse('2026-11-20T13:47:32Z') // 5:47 am Pacific
  const at2 = Date.parse('2026-11-20T16:17:49Z') // 8:17 am Pacific
  writeFileSync(path.join(dir, 'log.json'), JSON.stringify({
    rows: [
      { at: at2, request: 'build me a gorgeous simple web page that is a bio of bart decrem - me, i have a wikipedia page, and then publish it on the web', source: 'kept', runtime: 'cloud', place: 'cloud-mac:chat' },
      { at: at1, request: 'Publish this page to sites.ola.cx', source: 'kept', runtime: 'local', place: 'local-mac:chat' },
      { at: at1 - 60_000, request: 'make a page that says Bart and publish it on ola', source: 'project hello', runtime: 'cloud', place: null },
    ],
    notes: [],
  }))
  const env = { ...process.env, OLA_ASKS_LOG_JSON: path.join(dir, 'log.json') }
  const run = (...a) => spawnSync(process.execPath, [path.join(dir, 'add-case.mjs'), ...a, '--must', 'says:x', '--ticket', 'OLA-999'], { encoding: 'utf8', env })
  const cases = () => JSON.parse(readFileSync(file, 'utf8')).cases
  // by words: his exact sentence, not the words searched for
  let r = run('--from-log', 'gorgeous wikipedia', '--places', 'cloud-web:chat')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(cases()[0].say, 'build me a gorgeous simple web page that is a bio of bart decrem - me, i have a wikipedia page, and then publish it on the web')
  assert.deepEqual([cases()[0].from.words, cases()[0].from.at, cases()[0].from.where, cases()[0].from.handle], ['log', '2026-11-20T16:17:49.000Z', 'cloud-mac:chat', 'bart'])
  // by time, Pacific
  r = run('--from-log', '5:47 am', '--places', 'local-mac:chat')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(cases()[1].say, 'Publish this page to sites.ola.cx')
  // several match: it lists them and writes nothing until --pick
  r = run('--from-log', 'publish', '--places', 'local-phone:chat')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /3 requests match/)
  assert.equal(cases().length, 2)
  r = run('--from-log', 'publish', '--pick', '3', '--places', 'local-phone:chat')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(cases()[2].say, 'make a page that says Bart and publish it on ola')
  assert.equal(cases()[2].from.where, 'cloud (project hello)', 'a cloud project does not know the screen; it says so')
  // nothing in the log: it says so and writes nothing
  r = run('--from-log', 'zebra unicorn', '--places', 'local-phone:chat')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /nothing bart typed/)
  // a sentence he did type is found in the log even without --from-log
  r = run('Publish this page to sites.ola.cx', '--places', 'cloud-phone:chat')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(cases()[3].from.words, 'log')
  // the log cannot be read: a sentence is still taken, marked as a description, and it says why
  writeFileSync(path.join(dir, 'log.json'), JSON.stringify({ error: 'ssh: connect timed out' }))
  r = run('make a table of members', '--places', 'cloud-web:chat')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /could not be read/)
  assert.equal(cases()[4].from.words, 'description')
  assert.notEqual(run('--from-log', 'members', '--places', 'cloud-web:chat').status, 0)
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

test('OLA-251: works is two passes in a row; 2 of 3 is works sometimes; the tries are as before', () => {
  const P = { ok: true }
  const F = { ok: false }
  assert.deepEqual(verdictOf([P, P]), { ok: true, status: 'passing', verdict: 'works' })
  for (const t of [[P, F, P], [F, P, P]]) assert.deepEqual(verdictOf(t), { ok: true, status: 'works sometimes', verdict: 'works sometimes (2 of 3)' })
  for (const t of [[F, F], [P, F, F], [F, P, F]]) assert.equal(verdictOf(t).ok, false)
  // the runner's loop is unchanged: it stops at two passes or two fails, so never more than three tries
  const loop = (seq) => {
    const tries = []
    while (tries.filter((t) => t.ok).length < 2 && tries.filter((t) => !t.ok).length < 2) tries.push(seq[tries.length])
    return tries
  }
  for (const seq of [[P, P, P], [P, F, P], [F, P, P], [F, F, P], [P, F, F]]) assert.ok(loop(seq).length <= 3)
  assert.equal(loop([P, P, F]).length, 2)
  const src = readFileSync(path.join(HERE, 'run.mjs'), 'utf8')
  assert.ok(src.includes("while (tries.filter((t) => t.ok).length < 2 && tries.filter((t) => !t.ok).length < 2)"), 'the number of tries is exactly as before')
  // the abilities list counts it apart, never as passing
  const L = lines({ latest: { cases: { 'web-search@cloud-web:chat': { status: 'works sometimes', at: 'x' } } } })
  assert.equal(L.find((l) => l.ability === 'web-search' && l.place === 'cloud-web:chat').status, 'sometimes')
})

test('OLA-251: the result file says works for pass, pass and works sometimes (2 of 3) for the other', () => {
  const res = (id, tries) => {
    const v = verdictOf(tries)
    return { id, place: 'cloud-web:chat', say: 'x', ok: v.ok, sometimes: v.status === 'works sometimes', verdict: v.verdict, tries: `${tries.filter((t) => t.ok).length} of ${tries.length} passed`, release: 'r1' }
  }
  const results = [res('a', [{ ok: true }, { ok: true }]), res('b', [{ ok: true }, { ok: false }, { ok: true }])]
  const t = ratchet({ cases: {} }, results, { now: 'n', release: 'r1', known: new Set(['a@cloud-web:chat', 'b@cloud-web:chat']), lastRun: {} })
  assert.equal(t.cases['a@cloud-web:chat'].status, 'passing')
  assert.equal(t.cases['a@cloud-web:chat'].verdict, 'works')
  assert.equal(t.cases['b@cloud-web:chat'].status, 'works sometimes')
  assert.equal(t.cases['b@cloud-web:chat'].verdict, 'works sometimes (2 of 3)')
  assert.equal(t.summary.passing, 1)
  assert.equal(t.summary.worksSometimes, 1)
})

