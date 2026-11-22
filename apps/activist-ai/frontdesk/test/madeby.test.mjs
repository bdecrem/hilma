// Which engine made a file, the front desk's side (madeby.mjs, OLA-224): the turns it brackets with
// `ola-db made-by begin/end`, run here against the real ola-db on a made-up project folder, and the
// note an open model's prompt gets when other engines worked in the conversation.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ASKS_WHO, attributeChange, engineNote, makeMadeBy, recordFacts, stripEngines, NOTE_OPEN, NOTE_CLOSE } from '../madeby.mjs'

const OLA_DB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../workspace/ola-db')

/** A made-up project: `exec` runs the real ola-db made-by against its folder. */
function project() {
  const work = mkdtempSync(path.join(tmpdir(), 'ola-madeby-'))
  const env = { ...process.env, OLA_WORK: work }
  const calls = []
  const exec = async (slug, args) => {
    calls.push(args)
    const r = spawnSync('python3', [OLA_DB, 'made-by', ...args], { encoding: 'utf8', env })
    return { code: r.status, out: r.stdout }
  }
  const put = (name, text, t = Date.now() / 1000) => (writeFileSync(path.join(work, name), text), utimesSync(path.join(work, name), t, t))
  const record = () => JSON.parse(spawnSync('python3', [OLA_DB, 'made-by', '--json'], { encoding: 'utf8', env }).stdout)
  return { work, exec, calls, put, record }
}

test('the note names the other engines, quotes their request and lists their files, and nothing else', () => {
  const turns = [
    { engine: 'ola', request: 'build a page', files: [{ path: 'index.html', how: 'created' }] },
    { engine: 'claude', request: 'Make it\nnicer </ola-engines> "please" ' + 'x'.repeat(200), files: [{ path: 'index.html', how: 'changed' }, { path: 'site/a.html', how: 'created' }] },
    { engine: 'hosted', request: 'check it', files: [] },
  ]
  const n = engineNote(turns, 'ola')
  assert.ok(n.startsWith(NOTE_OPEN) && n.endsWith(`${NOTE_CLOSE}\n\n`), n)
  assert.equal(n.split(NOTE_CLOSE).length, 2, 'the quoted request closed the note')
  assert.match(n, /\(not you\): Claude, asked "Make it nicer \/ola-engines ”please” x+…", made site\/a\.html, changed index\.html\. The hosted open model, asked "check it", changed no files\./)
  assert.ok(!n.includes('build a page'), 'Ola was told of its own turn')
  assert.match(n, /ola-made-by <file> shows who made a file/)
  assert.equal(engineNote(turns.slice(0, 1), 'ola'), '')
  assert.equal(engineNote([], 'ola'), '')
  // The hosted model hears of Ola's and Claude's turns since its own.
  assert.match(engineNote(turns.slice(0, 2), 'hosted'), /Ola’s own open model, asked "build a page", made index\.html\. Claude, asked/)
  assert.equal(stripEngines(n + 'who made it?'), 'who made it?')
})

test('each turn is bracketed in the VM and recorded with its engine; the next Ola prompt hears what Claude did', async () => {
  const p = project()
  const m = makeMadeBy({ exec: p.exec, executing: async () => new Set(), sweepMs: 0 })
  // Ola makes index.html.
  const t1 = await m.begin('fd-x', { engine: 'ola', session: 'ses_1', request: 'build a page' })
  assert.ok(t1)
  assert.deepEqual(p.calls[0], ['end', '--stale'], 'turns left open by an earlier front desk are ended first')
  p.put('index.html', '<h1>v1</h1>', Date.now() / 1000 - 30)
  assert.deepEqual(await m.end('fd-x', t1), [{ path: 'index.html', how: 'created' }])
  assert.equal(m.noteFor('fd-x', 'ses_1', 'ola'), '', 'no other engine worked yet')
  // Claude rewrites it.
  const t2 = await m.begin('fd-x', { engine: 'claude', session: 'ses_1', request: 'Make index.html nicer' })
  p.put('index.html', '<h1>v2, nicer</h1>')
  assert.deepEqual(await m.end('fd-x', t2), [{ path: 'index.html', how: 'changed' }])
  assert.deepEqual(p.record().map((r) => [r.path, r.engine, r.how]), [['index.html', 'claude', 'changed']])
  // Ola's next prompt in that conversation gets the note; one in another conversation does not.
  assert.match(m.noteFor('fd-x', 'ses_1', 'ola'), /Claude, asked "Make index\.html nicer", changed index\.html\./)
  assert.equal(m.noteFor('fd-x', 'ses_2', 'ola'), '')
  const t3 = await m.begin('fd-x', { engine: 'ola', session: 'ses_1', request: 'who made index.html?' })
  assert.equal(m.noteFor('fd-x', 'ses_1', 'ola'), '', 'the note is said once, at the turn after Claude’s')
  // A turn whose end was never heard is ended at the conversation's next begin.
  const t4 = await m.begin('fd-x', { engine: 'ola', session: 'ses_1', request: 'again' })
  assert.deepEqual(m.openTurns('fd-x').map((t) => t.turn), [t4], `${t3} still open`)
  m.close()
})

test('a run that ends on the session event, a missed event caught by the sweep, and a front desk restart all close their turn', async () => {
  const p = project()
  let running = new Set(['ses_a'])
  const m = makeMadeBy({ exec: p.exec, executing: async () => running, sweepMs: 0, settleMs: 0 })
  const a = await m.begin('fd-y', { engine: 'ola', session: 'ses_a', request: 'one' })
  await m.sweep()
  assert.equal(m.openTurns('fd-y').length, 1, 'ended while it was still executing')
  p.put('a.txt', 'a')
  running = new Set()
  await m.sweep()
  assert.equal(m.openTurns('fd-y').length, 0, `${a} not ended by the sweep`)
  assert.equal(p.record()[0].engine, 'ola')
  // A hosted turn left open by a front desk that went away: the next front desk's first begin ends it.
  const gone = makeMadeBy({ exec: p.exec, executing: async () => new Set(['ses_b']), sweepMs: 0 })
  await gone.begin('fd-y', { engine: 'hosted', session: 'ses_b', request: 'two' })
  p.put('b.txt', 'b')
  const next = makeMadeBy({ exec: p.exec, executing: async () => new Set(), sweepMs: 0 })
  await next.begin('fd-y', { engine: 'ola', session: 'ses_c', request: 'three' })
  const b = p.record().find((r) => r.path === 'b.txt')
  assert.deepEqual([b.engine, b.interrupted], ['hosted', 1])
  // The session's end event does not close a turn that began a moment ago (the event was the last run's).
  next.ended('fd-y', 'ses_c')
  assert.equal(next.openTurns('fd-y').length, 1)
  for (const x of [m, gone, next]) x.close()
})

test('a turn the design model served is recorded with it, per conversation; unsure means no model named (OLA-168)', async () => {
  const p = project()
  const asked = []
  // The gateway's answer per conversation: ses_d had design requests, ses_g only general ones.
  const served = async (slug, session, since) => {
    asked.push({ slug, session, since })
    if (session === 'ses_down') return null
    return { names: session === 'ses_d' ? { general: 1, design: 4 } : { general: 3 }, design_model: 'thinkingmachines/Inkling-2-Small' }
  }
  const m = makeMadeBy({ exec: p.exec, executing: async () => new Set(), served, sweepMs: 0 })
  // Two conversations in one project at the same time: only the design one names the design model.
  const td = await m.begin('fd-y', { engine: 'ola', session: 'ses_d', request: 'make a page for our block party on Saturday' })
  const tg = await m.begin('fd-y', { engine: 'ola', session: 'ses_g', request: 'how many members by city?' })
  p.put('index.html', '<h1>Block party</h1>', Date.now() / 1000 - 20)
  await m.end('fd-y', td)
  p.put('cities.csv', 'city,n\n', Date.now() / 1000 - 10)
  await m.end('fd-y', tg)
  const rec = Object.fromEntries(p.record().map((r) => [r.path, r]))
  assert.equal(rec['index.html'].model, 'design:thinkingmachines/Inkling-2-Small')
  assert.equal(rec['index.html'].engine, 'ola')
  assert.equal(rec['cities.csv'].model, null, 'the other conversation is not the design model’s')
  assert.deepEqual(asked.map((a) => a.session), ['ses_d', 'ses_g'])
  // The gateway could not be asked: no model is named.
  const tx = await m.begin('fd-y', { engine: 'ola', session: 'ses_down', request: 'redo the page' })
  p.put('about.html', '<h1>About</h1>')
  await m.end('fd-y', tx)
  assert.equal(Object.fromEntries(p.record().map((r) => [r.path, r]))['about.html'].model, null)
  // What Ola reads: the design model by name.
  const env = { ...process.env, OLA_WORK: p.work }
  const words = spawnSync('python3', [OLA_DB, 'made-by', 'index.html'], { encoding: 'utf8', env }).stdout
  assert.match(words, /Inkling-2-Small, an outside open model that Ola uses for design work \(not Ola's own model\)/)
  assert.ok(!/Ola's own open model \(model/.test(words), words)
})

// OLA-303: the checker found two design changes to index.html recorded as plain "Ola's own open model"
// (only the creation named the design model), and Ola called Inkling-2-Small "Ola's own open model".
// Each change is now matched to the gateway step that led to it, per conversation.
test('a design creation, a later design change and two conversations at once are each recorded with the model that made them (OLA-303)', async () => {
  const p = project()
  const steps = []
  const step = (session, name, at) => steps.push([at, session, name])
  const served = async (slug, session, since) => ({ names: {}, design_model: 'thinkingmachines/Inkling-2-Small', steps: steps.filter((x) => x[0] >= since) })
  const m = makeMadeBy({ exec: p.exec, executing: async () => new Set(), served, sweepMs: 0 })
  const now = Date.now()
  const rows = () => p.record()
  const words = (...f) => spawnSync('python3', [OLA_DB, 'made-by', ...f], { encoding: 'utf8', env: { ...process.env, OLA_WORK: p.work } }).stdout

  // 1. A design creation: the first step general (it loads the designer skill), then the design model writes the page.
  const t1 = await m.begin('fd-z', { engine: 'ola', session: 'ses_c1', request: 'make a page for our block party' })
  step('ses_c1', 'general', now - 60_000)
  step('ses_c1', 'design', now - 59_000)
  p.put('index.html', '<h1>v1</h1>', (now - 58_500) / 1000)
  step('ses_c1', 'design', now - 58_000)
  await m.end('fd-z', t1)
  assert.equal(rows().find((r) => r.path === 'index.html').model, 'design:thinkingmachines/Inkling-2-Small')

  // 2. A design change in a new conversation, while a general conversation runs at the same time
  // and its turn (begun before the change) ends first: the change is still the design one's.
  const tg = await m.begin('fd-z', { engine: 'ola', session: 'ses_g', request: 'how many members by city?' })
  const t2 = await m.begin('fd-z', { engine: 'ola', session: 'ses_c2', request: 'make the page warmer' })
  step('ses_g', 'general', now - 40_000)
  step('ses_c2', 'general', now - 39_000)
  step('ses_c2', 'design', now - 30_000)
  p.put('index.html', '<h1>v2, warmer</h1>', (now - 29_500) / 1000)
  step('ses_g', 'general', now - 20_000)
  p.put('cities.csv', 'city,n\n', (now - 19_500) / 1000)
  await m.end('fd-z', tg) // the general conversation's turn ends first and sees both changes
  await m.end('fd-z', t2)
  const ix = rows().find((r) => r.path === 'index.html')
  assert.deepEqual([ix.how, ix.model, ix.session], ['changed', 'design:thinkingmachines/Inkling-2-Small', 'ses_c2'], 'the change is the design conversation’s, though another turn recorded it')
  const cs = rows().find((r) => r.path === 'cities.csv')
  assert.deepEqual([cs.model, cs.session], [null, 'ses_g'], 'the general conversation’s file is Ola’s own')

  // 3. A design step and a general step of two conversations, both between the change and the
  // last step before it: not known, and the record says so instead of guessing.
  const t3 = await m.begin('fd-z', { engine: 'ola', session: 'ses_c3', request: 'redo the header' })
  const t4 = await m.begin('fd-z', { engine: 'ola', session: 'ses_g2', request: 'add a members table' })
  step('ses_c3', 'design', now - 10_000)
  step('ses_g2', 'general', now - 9_000)
  p.put('header.html', '<h1>h</h1>', (now - 8_500) / 1000)
  await m.end('fd-z', t3)
  await m.end('fd-z', t4)
  assert.equal(rows().find((r) => r.path === 'header.html').model, 'unknown')
  assert.match(words('header.html'), /which model made this change is not known/)

  // What Ola reads: the outside design model by name, for the creation and the change, never "Ola's own".
  const w = words('index.html')
  assert.equal((w.match(/Inkling-2-Small, an outside open model that Ola uses for design work \(not Ola's own model\)/g) ?? []).length, 2, w)
  assert.ok(!/Ola's own open model/.test(w), w)
  assert.match(words(), /Never call it Ola's own model/)
  // The note another engine reads names it the same way.
  assert.match(m.noteFor('fd-z', 'ses_c2', 'hosted'), /Inkling-2-Small, an outside open model that Ola uses for design work, asked "make the page warmer", changed index\.html/)
  m.close()
})

test('attributeChange: the last step before a change decides; steps too close together agree or the model is unknown (OLA-303)', () => {
  const S = [[1000, 'a', 'general'], [2000, 'a', 'design'], [9000, 'b', 'general'], [11000, 'a', 'design'], [20000, 'b', 'design'], [21000, 'a', 'design']]
  assert.deepEqual(attributeChange(S, 'a', 2500, 'x/D'), { model: 'design:x/D' })
  assert.deepEqual(attributeChange(S, 'a', 1500, 'x/D'), { model: 'design:x/D' }, 'a step up to the clock slack after the file still counts')
  assert.deepEqual(attributeChange(S, 'a', 9500, 'x/D'), { model: null, session: 'b' }, 'the other conversation’s step led to it')
  assert.equal(attributeChange(S, 'b', 11500, 'x/D').model, 'unknown', 'a general and a design step of two conversations within seconds')
  assert.deepEqual(attributeChange(S, 'b', 21500, 'x/D'), { model: 'design:x/D' }, 'both close steps were the design model’s')
  assert.deepEqual(attributeChange([], 'a', 3500, 'x/D'), { model: null }, 'no step: nothing named')
  assert.deepEqual(attributeChange([[1000, 'a', 'design-failed']], 'a', 1500, 'x/D'), { model: null }, 'a failed design step was done by general')
})

// OLA-303, Nov 21: asked "who changed it last?" right after a change, Ola answered from a record read
// before that change's turn was written; asked "who made that page?" it named the design model in 1
// of 3. The answer now comes from the record: the front desk finishes and waits for every turn's
// record, reads it and puts the facts in front of the request.
test('a who-made question: the record is complete before it is read, and its facts go in front of the request (OLA-303)', async () => {
  const p = project()
  const steps = []
  const served = async (slug, session, since) => ({ names: { design: 1 }, design_model: 'thinkingmachines/Inkling-2-Small', steps: steps.filter((x) => x[0] >= since) })
  // The VM is slow to take the corrections (made-by fix), as a busy VM is.
  let slowFix = 0
  const exec = async (slug, args) => {
    if (args[0] === 'fix' && slowFix) await new Promise((r) => setTimeout(r, slowFix))
    return p.exec(slug, args)
  }
  const m = makeMadeBy({ exec, executing: async () => new Set(), served, sweepMs: 0 })
  const now = Date.now()
  // Ola's own model makes the page.
  const t1 = await m.begin('fd-w', { engine: 'ola', session: 'ses_1', request: 'make a page for our block party' })
  steps.push([now - 60_000, 'ses_1', 'general'])
  p.put('index.html', '<h1>v1</h1>', (now - 59_500) / 1000)
  mkdirSync(path.join(p.work, 'fonts'))
  p.put('fonts/a.woff2', 'x', (now - 59_400) / 1000)
  await m.end('fd-w', t1)
  // The design model changes it; the turn's end is still being written when the question comes.
  const t2 = await m.begin('fd-w', { engine: 'ola', session: 'ses_1', request: 'make it warmer and more festive' })
  steps.push([now - 30_000, 'ses_1', 'design'])
  p.put('index.html', '<h1>v2, warm</h1>', (now - 29_500) / 1000)
  slowFix = 400
  const ending = m.end('fd-w', t2)
  const facts = await m.factsFor('fd-w', 'ses_1')
  await ending
  assert.match(facts, /^The record of who made this project’s files, read by Ola’s server/)
  assert.match(facts, /index\.html: made \d{4}-\d\d-\d\d \d\d:\d\d UTC by Ola’s own open model; last changed \d{4}-\d\d-\d\d \d\d:\d\d UTC by Inkling-2-Small, an outside open model that Ola uses for design work \(not Ola’s own model\)\./, facts)
  assert.ok(!facts.includes('woff2'), 'fonts are not what a person means by "that page"')
  // A turn of this conversation that was never heard to end is ended and read too.
  const t3 = await m.begin('fd-w', { engine: 'ola', session: 'ses_1', request: 'add a map page' })
  steps.push([now - 10_000, 'ses_1', 'design'])
  p.put('map.html', '<h1>map</h1>', (now - 9_500) / 1000)
  const f2 = await m.factsFor('fd-w', 'ses_1')
  assert.deepEqual(m.openTurns('fd-w'), [], `${t3} was ended before the record was read`)
  assert.match(f2, /map\.html: made [^;]+ by Inkling-2-Small, an outside open model that Ola uses for design work \(not Ola’s own model\), and not changed since\./, f2)
  // Another conversation still running is said, not hidden.
  const m2 = makeMadeBy({ exec, executing: async () => new Set(['ses_other']), served, sweepMs: 0 })
  await m2.begin('fd-w', { engine: 'ola', session: 'ses_other', request: 'build a members table' })
  assert.match(await m2.factsFor('fd-w', 'ses_1'), /Another conversation in this project is still working, and its changes are not in the record yet\.$/)
  m.close()
  m2.close()
})

test('recordFacts and the who-made question: the words, no record, and which requests ask it (OLA-303)', () => {
  assert.match(recordFacts([], []), /there is no record of any file in this project yet\. Say you do not know who made it; never say you made it\.$/)
  const rows = [{ path: 'a.html', how: 'changed', engine: 'claude', model: 'claude-x', at: '2026-11-21T23:48:00Z' }, { path: 'b.html', how: 'created', engine: 'hosted', model: 'deepseek-v4-pro', at: '2026-11-21T23:40:00Z' }]
  const hist = [rows[0], { path: 'a.html', how: 'created', engine: 'ola', model: 'unknown', at: '2026-11-21T23:30:00Z' }, rows[1]]
  const f = recordFacts(rows, hist)
  assert.match(f, /a\.html: made 2026-11-21 23:30 UTC by Ola, but which model made this change is not known \(two conversations were working at the same time\); last changed 2026-11-21 23:48 UTC by Claude \(model claude-x\)\./)
  assert.match(f, /b\.html: made 2026-11-21 23:40 UTC by DeepSeek V4 Pro, an outside open model \(not Ola’s own model\), and not changed since\./)
  for (const q of ['who made that page?', 'Who changed it last?', 'which model built index.html', 'which agent built index.html: hosted or claude?', 'did you make this page?', 'who designed the flyer', 'who last edited the report?']) assert.ok(ASKS_WHO.test(q), q)
  for (const q of ['make a page for our block party on Saturday', 'who is coming to the party?', 'change the look of the page: make it warmer', 'publish it again']) assert.ok(!ASKS_WHO.test(q), q)
})
