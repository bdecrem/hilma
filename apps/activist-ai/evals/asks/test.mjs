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
import { AI, HERE, PLACES, checkMust, checkNever, commandsNotTheApps, readCases, siteAddresses, siteLinks, turnsOf, verdictOf, ratchet, triesDone, passesNeeded, lostConnection, modelUsedUp, takeRunLock } from './lib.mjs'
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
    assert.ok(c.must.length && c.must.every((m) => m === 'gone' || /^(site|says|opens|file|ran|newfile|nonewfile|served):./.test(m) || /^record:(made|last)$/.test(m)), c.id)
    assert.ok(!c.must.includes('gone') || c.before?.length, `${c.id}: gone needs a page published first (before)`)
    for (const m of c.must.filter((m) => /^(says|opens|nonewfile):/.test(m))) new RegExp(m.slice(m.indexOf(':') + 1), 'i')
    for (const s of c.mustNot ?? []) new RegExp(s, 'i')
    assert.ok(/^\d{4}-\d\d-\d\d$/.test(c.from?.date) && /^OLA-\d+$/.test(c.from?.ticket), `${c.id}: the date and ticket of the failure it came from`)
  }
  assert.ok(cases.some((c) => c.say === 'make a page that says Bart and publish it on ola' && c.places.includes('cloud-web:chat') && c.places.includes('local-mac:chat')))
})

test('OLA-303: who made the design page: the outside design model by name passes, "Ola’s own" beside Inkling fails', () => {
  const cases = readCases()
  for (const id of ['design-who-made-cloud', 'design-change-who-cloud', 'design-who-made-local', 'design-page-cloud']) {
    const c = cases.find((x) => x.id === id)
    assert.ok(c, id)
    const says = c.must.filter((m) => m.startsWith('says:')).map((m) => new RegExp(m.slice(5), 'i'))
    const ok = (t) => says.every((r) => r.test(t)) && !(c.mustNot ?? []).some((s) => new RegExp(s, 'i').test(t))
    // What the checker got, 5 of 5 (OLA-303): fails everywhere.
    assert.ok(!ok('The page was made by Ola’s own open model (Inkling-2-Small), using the designer skill.'), id)
    assert.ok(!ok('Ola’s own model, Inkling-2-Small, built it.'), id)
    assert.ok(!ok('Inkling-2-Small, which is Ola’s own design model, made it.'), id)
    // What the record now says, in Ola's words.
    assert.ok(ok('Inkling-2-Small, an outside open model Ola uses for design work, made index.html on Nov 20 at 4:27 PM.'), id)
    assert.ok(ok('It was made by Inkling-2-Small, an outside open model that Ola uses for design work (not Ola’s own model).'), id)
  }
  const local = cases.find((x) => x.id === 'design-who-made-local')
  assert.deepEqual(local.places, ['local-mac:chat'])
  assert.ok(cases.find((x) => x.id === 'design-change-who-cloud').before.length === 2, 'a creation, then a design change, then the question')
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

test('site: one fresh read is not enough; every reread as a reader must show the words (OLA-302)', async () => {
  const page = (t) => ({ status: 200, text: `<title>${t}</title>` })
  const body = (t) => ({ status: 200, ok: true, body: Buffer.from(`<title>${t}</title>`) })
  const answer = 'Live at https://sites.ola.cx/appdriver/'
  const opts = { rereadMs: 1, fetchFirst: async () => page('Bart was here') }
  // One edge server still answers with the old page on the second reread: not live.
  let n = 0
  const stale = await checkMust('site:Bart was here', {}, answer, { ...opts, reader: async () => (++n === 2 ? body('Bart') : body('Bart was here')) })
  assert.equal(stale.ok, false)
  assert.match(stale.why, /the old page/)
  const good = await checkMust('site:Bart was here', {}, answer, { ...opts, reader: async () => body('Bart was here') })
  assert.equal(good.ok, true, good.why)
  assert.match(good.why, /3 more reads/)
})

// OLA-303, Nov 21: the record said the design model changed the page last, Ola said its own model
// did (and the other way round). record: checks the answer against the project's own record.
test('record: the answer must name whoever the record says made or last changed the newest page (OLA-303)', async () => {
  const rows = [
    { path: 'index.html', how: 'changed', engine: 'ola', model: 'design:thinkingmachines/Inkling-2-Small', at: '2026-11-21T23:48:00Z' },
    { path: 'index.html', how: 'created', engine: 'ola', model: null, at: '2026-11-21T23:45:00Z' },
    { path: 'fonts/a.woff2', how: 'created', engine: 'ola', model: null, at: '2026-11-21T23:49:00Z' },
  ]
  const T = { madeBy: async (rel) => (rel ? rows.filter((r) => r.path === rel) : [rows[0], rows[2]]) }
  const nov21 = 'Ola’s own open model changed it last — at 11:48 PM, just now (the warm palette edit). It was originally created at 11:45 PM, also by Ola’s own open model.'
  const last = await checkMust('record:last', T, nov21)
  assert.equal(last.ok, false, last.why)
  assert.match(last.why, /last changed by Inkling-2-Small \(the design model\)/)
  assert.equal((await checkMust('record:last', T, 'index.html was last changed by Inkling-2-Small, an outside open model that Ola uses for design work (not Ola’s own model).')).ok, true)
  const made = await checkMust('record:made', T, nov21)
  assert.equal(made.ok, true, made.why)
  assert.equal((await checkMust('record:made', T, 'Inkling-2-Small, an outside open model, made it.')).ok, false, 'the record says Ola’s own model made it')
})

// OLA-267, Nov 21: the answer gave "https://sites.ola.cx/chk1121da-test/sites.ola.cx"; the right
// address was its first part, so the check passed. Every sites.ola.cx link must be the published one.
test('site: a link in the answer that is not the published address fails, though the address itself is live (OLA-267)', async () => {
  const pub = 'https://sites.ola.cx/chk1121da-test/'
  const fetchFirst = async (u) => (u === pub ? { status: 200, text: '<h1>Maple</h1>' } : u === `${pub}maple.html` ? { status: 200, text: 'Maple' } : { status: 404, text: '' })
  const opts = { rereadMs: 1, rereads: 1, fetchFirst, reader: async () => ({ status: 200, body: Buffer.from('<h1>Maple</h1>') }) }
  const bad = await checkMust('site:Maple', {}, `Live at: ${pub}sites.ola.cx — the check confirms it.`, opts)
  assert.equal(bad.ok, false, bad.why)
  assert.match(bad.why, /gives https:\/\/sites\.ola\.cx\/chk1121da-test\/sites\.ola\.cx, which answers 404/)
  const other = await checkMust('site:Maple', {}, `Live at ${pub}. Also at https://sites.ola.cx/someone-else/.`, opts)
  assert.match(other.why, /not the published address/)
  for (const fine of [`Live at: [${pub}](${pub}).`, `Live at sites.ola.cx/chk1121da-test/ (on sites.ola.cx): ${pub}`, `Live at ${pub}, the page itself at ${pub}maple.html.`]) {
    const r = await checkMust('site:Maple', {}, fine, opts)
    assert.equal(r.ok, true, `${fine}: ${r.why}`)
  }
  assert.deepEqual(siteLinks(`see ${pub}sites.ola.cx, and [x](${pub}).`), [`${pub}sites.ola.cx`, pub])
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
  assert.equal(c.passes, 5, 'a failure of a person needs five passes (OLA-231)')
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
  // Yesterday, Pacific: the tool reads only the last 2 days and takes a bare "5:47 am" as today's, so
  // fixed dates failed from midnight on (Nov 21, 12:35 am: an update of the test server was refused).
  const yday = new Date(Date.now() - 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const pacific = (hms) => ['-08:00', '-07:00'].map((o) => Date.parse(`${yday}T${hms}${o}`))
    .find((t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit' }).format(t) === hms.slice(0, 5))
  const at1 = pacific('05:47:32')
  const at2 = pacific('08:17:49')
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
  assert.deepEqual([cases()[0].from.words, cases()[0].from.at, cases()[0].from.where, cases()[0].from.handle], ['log', new Date(at2).toISOString(), 'cloud-mac:chat', 'bart'])
  // by time, Pacific
  r = run('--from-log', `${yday} 5:47 am`, '--places', 'local-mac:chat')
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
  // OLA-235: an answer a person marked "This was wrong": the request as the project had it, with the mark's number
  writeFileSync(path.join(dir, 'wrong.json'), JSON.stringify([{ id: 7, at: at2, project: 'hello', handle: 'dana', request: 'send this flyer as a text to my phone', answer: "I don't have a tool for that.", why: 'it should say how', kinds: ['no_tool'] }]))
  const env2 = { ...env, OLA_ASKS_WRONG_JSON: path.join(dir, 'wrong.json') }
  const runW = (...a) => spawnSync(process.execPath, [path.join(dir, 'add-case.mjs'), ...a, '--must', 'says:x', '--ticket', 'OLA-999'], { encoding: 'utf8', env: env2 })
  r = runW('--from-wrong', '7', '--places', 'cloud-web:chat')
  assert.equal(r.status, 0, r.stderr)
  const w = cases().at(-1)
  assert.equal(w.say, 'send this flyer as a text to my phone')
  assert.deepEqual([w.from.words, w.from.mark, w.from.handle, w.from.what], ['log', 7, 'dana', 'marked wrong: it should say how'])
  assert.notEqual(runW('--from-wrong', '8', '--places', 'cloud-web:chat').status, 0, 'no such mark: nothing written')
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

test('OLA-250: the local runtime carries the Mac app\'s commands, never the cloud\'s', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'asks-tools-'))
  copyFileSync(path.join(AI, 'bart/ola-publish'), path.join(dir, 'ola-publish'))
  copyFileSync(path.join(AI, 'workspace/ola-search'), path.join(dir, 'ola-search'))
  copyFileSync(path.join(AI, 'bart/ola-page-mac'), path.join(dir, 'ola-page'))
  copyFileSync(path.join(AI, 'workspace/ola-page'), path.join(dir, 'olapage.py'))
  copyFileSync(path.join(AI, 'workspace/lib/olatext.py'), path.join(dir, 'olatext.py'))
  assert.deepEqual(commandsNotTheApps(dir), [])
  // Nov 20: the cloud's ola-publish in the Mac's runtime
  copyFileSync(path.join(AI, 'workspace/ola-publish'), path.join(dir, 'ola-publish'))
  assert.deepEqual(commandsNotTheApps(dir), ["ola-publish: not the app's (bart/ola-publish)"])
  writeFileSync(path.join(dir, 'ola-extra'), '#!/bin/sh\n')
  assert.ok(commandsNotTheApps(dir).some((l) => l.startsWith('ola-extra: the app carries no such command')))
})

test('OLA-250: gone passes only when every address given is not found', async () => {
  const real = globalThis.fetch
  const up = new Set(['https://sites.ola.cx/bart/'])
  globalThis.fetch = async (u) => ({ status: up.has(String(u)) ? 200 : 404, text: async () => '' })
  try {
    assert.ok(!(await checkMust('gone', {}, 'Taken down.', { earlier: 'Published: https://sites.ola.cx/bart/', wait: 0 })).ok)
    up.clear()
    assert.ok((await checkMust('gone', {}, 'Taken down.', { earlier: 'Published: https://sites.ola.cx/bart/', wait: 0 })).ok)
    assert.ok(!(await checkMust('gone', {}, 'Taken down.', { earlier: 'It is published.', wait: 0 })).ok, 'no address given: nothing seen taken down')
  } finally {
    globalThis.fetch = real
  }
})

void fileURLToPath

test('OLA-251: works is two passes in a row; 2 of 3 is works sometimes; the tries are as before', () => {
  const P = { ok: true }
  const F = { ok: false }
  assert.deepEqual(verdictOf([P, P]), { ok: true, status: 'passing', verdict: 'works (2 of 2)' })
  for (const t of [[P, F, P], [F, P, P]]) assert.deepEqual(verdictOf(t), { ok: true, status: 'works sometimes', verdict: 'works sometimes (2 of 3)' })
  for (const t of [[F, F], [P, F, F], [F, P, F]]) assert.equal(verdictOf(t).ok, false)
  // the runner's loop: it stops at two passes or two fails, so never more than three tries for a case that needs two
  const loop = (seq, need = 2) => {
    const tries = []
    while (!triesDone(tries, need)) tries.push(seq[tries.length])
    return tries
  }
  for (const seq of [[P, P, P], [P, F, P], [F, P, P], [F, F, P], [P, F, F]]) assert.ok(loop(seq).length <= 3)
  assert.equal(loop([P, P, F]).length, 2)
  const src = readFileSync(path.join(HERE, 'run.mjs'), 'utf8')
  assert.ok(src.includes('while (!triesDone(tries, need) && lost.length < LOST_MAX)'), 'the runner uses the same stopping rule')
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
  assert.equal(t.cases['a@cloud-web:chat'].verdict, 'works (2 of 2)')
  assert.equal(t.cases['b@cloud-web:chat'].status, 'works sometimes')
  assert.equal(t.cases['b@cloud-web:chat'].verdict, 'works sometimes (2 of 3)')
  assert.equal(t.summary.passing, 1)
  assert.equal(t.summary.worksSometimes, 1)
})


test('OLA-231 check 6: a request that failed for a person needs five passes, and the result prints the count', () => {
  const P = { ok: true }
  const F = { ok: false }
  const cases = readCases()
  for (const id of ['publish-bart', 'publish-again', 'take-it-down', 'publish-third-page', 'share-link']) assert.equal(passesNeeded(cases.find((c) => c.id === id)), 5, id)
  assert.equal(passesNeeded(cases.find((c) => c.id === 'translate')), 2)
  // two passes are not enough for a case that needs five
  assert.equal(triesDone([P, P], 5), false)
  assert.deepEqual(verdictOf([P, P, P, P, P], 5), { ok: true, status: 'passing', verdict: 'works (5 of 5)' })
  // the one-in-five failure the checker saw is caught: four passes and a fail is never "works"
  assert.notEqual(verdictOf([P, P, F, P, P, P], 5).status, 'passing')
  assert.equal(verdictOf([P, P, F, P, P, P], 5).verdict, 'works sometimes (5 of 6)')
  assert.equal(verdictOf([P, F, P, F], 5).ok, false)
  // at most six tries for five passes (two fails stop it)
  const loop = (seq) => {
    const tries = []
    while (!triesDone(tries, 5)) tries.push(seq[tries.length])
    return tries
  }
  assert.equal(loop([P, P, P, P, P, P]).length, 5)
  assert.equal(loop([P, F, P, P, P, P]).length, 6)
  assert.equal(loop([P, F, P, F, P, P]).length, 4)
})

test('OLA-231 check 7: a try that could not reach Ola did not run; it is never a pass or a fail', () => {
  const e = new TypeError('fetch failed')
  e.cause = { code: 'ECONNRESET', message: 'other side closed' }
  assert.ok(lostConnection(e))
  assert.ok(lostConnection(new Error('fetch failed (ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:4096)')))
  assert.ok(!lostConnection(new Error('the request was not taken: 500 boom')))
  assert.ok(!lostConnection(new Error('emptying the project: no such container')))
  // in the record: what the case had stands, and the did-not-run is written beside it
  const known = new Set(['a@cloud-web:chat'])
  let t = ratchet({ cases: {} }, [{ id: 'a', place: 'cloud-web:chat', say: 'x', ok: false, tries: '0 of 2 passed', verdict: 'fails (0 of 2)', release: 'r1' }], { now: 'n1', release: 'r1', known, lastRun: {} })
  assert.equal(t.cases['a@cloud-web:chat'].status, 'not working yet')
  const lost = { id: 'a', place: 'cloud-web:chat', say: 'x', ok: null, didNotRun: true, release: 'r2', why: 'did not run: the connection to Ola was lost 3 times' }
  t = ratchet(t, [lost], { now: 'n2', release: 'r2', known, lastRun: {} })
  assert.equal(lost.status, 'did not run')
  assert.equal(t.cases['a@cloud-web:chat'].status, 'not working yet', 'unchanged: not counted as a fail or a pass')
  assert.equal(t.cases['a@cloud-web:chat'].release, 'r1')
  assert.equal(t.cases['a@cloud-web:chat'].didNotRun.release, 'r2')
  // the runner treats it so: a lost connection is put apart from the tries
  const src = readFileSync(path.join(HERE, 'run.mjs'), 'utf8')
  assert.ok(src.includes('lostConnection(e) ? { ok: null'), 'a lost connection is ok: null')
  assert.ok(src.includes('lost.push(r)'), 'and kept apart from the tries')
})

test('OLA-231 check 5: the run an update starts waits for a run that is going, then runs', async () => {
  const state = mkdtempSync(path.join(tmpdir(), 'asks-lock-'))
  const said = []
  const log = (s) => said.push(s)
  // a builder's run holds the lock: a child process standing in for it
  const { spawn } = await import('node:child_process')
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
  writeFileSync(path.join(state, 'run.pid'), String(holder.pid))
  // a second builder's run leaves it (as before)
  assert.equal(await takeRunLock({ after: false, state, log }), false)
  // the update's run waits, and runs once the other finishes
  const t0 = Date.now()
  setTimeout(() => holder.kill(), 600)
  const got = await takeRunLock({ after: true, state, pollMs: 100, log })
  assert.equal(got, true)
  assert.ok(Date.now() - t0 >= 500, 'it waited')
  assert.ok(said.some((s) => /waits its turn/.test(s)), said.join(' | '))
  assert.equal(Number(readFileSync(path.join(state, 'run.pid'), 'utf8')), process.pid)
  // while an update's run waits, a builder's run does not go ahead of it
  const state2 = mkdtempSync(path.join(tmpdir(), 'asks-lock-'))
  const waiter = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
  writeFileSync(path.join(state2, 'after-deploy.waiting'), String(waiter.pid))
  assert.equal(await takeRunLock({ after: false, state: state2, log }), false)
  assert.ok(said.at(-1).includes("an update's run is waiting"))
  // a newer update's run replaces a waiting one
  const holder2 = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
  writeFileSync(path.join(state2, 'run.pid'), String(holder2.pid))
  const waiting = takeRunLock({ after: true, state: state2, pollMs: 100, log })
  await new Promise((r) => setTimeout(r, 300))
  writeFileSync(path.join(state2, 'after-deploy.waiting'), String(waiter.pid))
  assert.equal(await waiting, false)
  assert.ok(said.at(-1).includes('newer update'))
  holder2.kill()
  waiter.kill()
  // the runner calls it, and no longer steps aside after an update
  const src = readFileSync(path.join(HERE, 'run.mjs'), 'utf8')
  assert.ok(src.includes("takeRunLock({ after: args.includes('--after-deploy') })"))
})

test('a try refused for the model allowance did not run (Nov 20, 44ec5d68e931: 34 Mac tries counted as fails)', () => {
  const why = 'the turn ended failed ({"type":"provider.quota","message":"Your weekly allowance of Ola\'s model is used up. It starts again on Sunday, November 22, at 4 pm Pacific time.","status":429}); Ola said: (nothing)'
  assert.equal(modelUsedUp({ ok: false, why }), "the made-up account's model allowance is used up (it starts again on Sunday, November 22, at 4 pm Pacific time)")
  assert.equal(modelUsedUp({ ok: false, why: 'site:Bart: https://sites.ola.cx/askcases/ 404' }), null)
  assert.equal(modelUsedUp({ ok: false, why: 'the turn ended failed ({"type":"provider.quota"})' }), "the made-up account's model allowance is used up")
  // the run loop stops the place on it and writes "did not run", never a fail
  const run = readFileSync(path.join(HERE, 'run.mjs'), 'utf8')
  assert.match(run, /r\.ok === false && \(usedUp = modelUsedUp\(r\)\)/)
  assert.match(run, /did not run: \$\{usedUp\}/)
})

test('OLA-232: a stored fail that was only the model refusing is not run, in the record and in the list of abilities', async () => {
  const quota = 'the turn ended failed ({"type":"provider.quota","message":"This project\'s weekly allowance of Ola\'s model is used up. It starts again on Sunday, November 22, at 4 pm Pacific time.","status":429}); Ola said: (nothing)'
  const credits = 'the turn ended failed (402 {"error":{"message":"Credit limit exceeded, please add credits"}})'
  assert.equal(modelUsedUp({ why: credits }), "the model provider's credits had run out")
  const known = new Set(['a@cloud-web:chat', 'b@cloud-web:chat', 'c@cloud-web:chat'])
  const old = { cases: {
    'a@cloud-web:chat': { id: 'a', place: 'cloud-web:chat', status: 'STOPPED WORKING', why: quota, release: 'r0', everPassed: true, lastPassed: { at: 'n0', release: 'rp' } },
    'b@cloud-web:chat': { id: 'b', place: 'cloud-web:chat', status: 'not working yet', why: credits, release: 'r0', everPassed: false },
    'c@cloud-web:chat': { id: 'c', place: 'cloud-web:chat', status: 'not working yet', why: 'site:Bart: 404', release: 'r0', everPassed: false },
  } }
  const t = ratchet(old, [], { now: 'n1', release: 'r1', known, lastRun: {} })
  assert.equal(t.cases['a@cloud-web:chat'].status, 'not run')
  assert.equal(t.cases['a@cloud-web:chat'].everPassed, true, 'what it passed before is kept')
  assert.match(t.cases['a@cloud-web:chat'].why, /^not counted: the made-up account's model allowance is used up/)
  assert.equal(t.cases['b@cloud-web:chat'].status, 'not run')
  assert.equal(t.cases['c@cloud-web:chat'].status, 'not working yet', 'a real fail stands')
  // the list reads an old table the same way, before any new run rewrites it
  const { lines } = await import('./abilities.mjs')
  const abilities = [{ id: 'x', what: 'X', cloud: { tell: 'do x' }, local: { tell: 'do x' } }]
  const mk = (id) => ({ id, ability: 'x', places: ['cloud-web:chat'] })
  for (const [id, want] of [['a', 'not run'], ['b', 'not run'], ['c', 'failing']]) {
    const L = lines({ abilities, cases: [mk(id)], latest: old })
    assert.equal(L.find((l) => l.place === 'cloud-web:chat').status, want, id)
  }
})

test('OLA-232 checker, Nov 21: opens: reads the first 300 characters; nonewfile: fails when Ola made the file itself', async () => {
  const late = 'All checks pass (0 flagged). One honest note on the sounds: the robin tune peaks a bit loud. '.repeat(4) + 'This is a made-up sound, not a recording.'
  const early = "I can't use a recording; this is a sound made in code that comes close to birdsong. The page is in your Files."
  const re = 'opens:(made (it )?in code|not (a )?(real )?recording|can.?t use a recording)'
  assert.equal((await checkMust(re, {}, late)).ok, false)
  assert.equal((await checkMust(re, {}, early)).ok, true)
  const T = { listFiles: async () => ['notes.md', 'hello.txt'] }
  assert.equal((await checkMust('nonewfile:hello\\.txt', T, 'x', { before: ['notes.md'] })).ok, false)
  assert.equal((await checkMust('nonewfile:hello\\.txt', T, 'x', { before: ['notes.md', 'hello.txt'] })).ok, true)
  const c = readCases().find((x) => x.id === 'ask-claude')
  assert.ok(c.must.includes('nonewfile:hello\\.txt'), 'asked for Claude, Ola does not write the file itself')
  assert.ok(readCases().find((x) => x.id === 'birdsong').must.some((m) => m.startsWith('opens:')))
})
