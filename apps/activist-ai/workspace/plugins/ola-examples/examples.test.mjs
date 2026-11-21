// node --test workspace/plugins/ola-examples/examples.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closest, loadLibrary, noteFor, newestRequest, onContext, reset, NOTE_HEAD, MIN_SCORE } from './index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const problems = JSON.parse(readFileSync(path.join(HERE, '../../../evals/apps/problems.json'), 'utf8'))
const seven = (problems.problems ?? problems).map((p) => p.request)
const lib = loadLibrary({})

test('the committed library loads, every example has the parts the note uses, and only test requests', () => {
  assert.ok(lib.length >= 8)
  const ids = new Set()
  for (const ex of lib) {
    assert.equal(ex.source, 'test', ex.id)
    assert.ok(!ids.has(ex.id), `duplicate ${ex.id}`)
    ids.add(ex.id)
    for (const k of ['asked', 'built', 'tried']) assert.ok(Array.isArray(ex[k]) && ex[k].length, `${ex.id} ${k}`)
    assert.ok(ex.answer, ex.id)
  }
})

test('no example is one of the seven measured requests (the measure is not taught to the test)', () => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  for (const ex of lib) for (const r of seven) assert.notEqual(norm(ex.request), norm(r), ex.id)
})

test('each of the seven measured requests finds a neighbor above the threshold', () => {
  for (const r of seven) {
    const hit = closest(r, lib)
    assert.ok(hit, `no example for: ${r}`)
    assert.ok(hit.score >= MIN_SCORE)
  }
})

test('the neighbors are of the same kind', () => {
  const want = {
    'build me a smart app that uses ai to generate a crossword puzzle on demand': 'test-word-game-ai',
    'make me a tip calculator that splits the bill between a group of people': 'test-expense-split',
    'make a simple memory game where you flip tiles to find matching pairs': 'test-tic-tac-toe',
    'make a unit converter for distance, weight and temperature': 'test-recipe-scaler',
    'build me a to-do app where each task has a due date': 'test-reading-list',
  }
  for (const [r, id] of Object.entries(want)) assert.equal(closest(r, lib)?.example.id, id, r)
})

test('requests that are not to make something get no example', () => {
  for (const r of ['summarize these meeting minutes', 'make a chart of the survey answers by city', 'translate this law into English',
    'what does article 14 say about detention', 'write a press release about the rally', 'hello', 'make a word document of the report',
    'build a map of the shelters from this spreadsheet', 'find every mention of funding in the reports', '']) {
    assert.equal(closest(r, lib), null, r)
  }
})

test('a request to make something unlike every example gets none', () => {
  assert.equal(closest('make me a website for our food bank', lib), null)
})

test('the note names itself an example, not the request, and carries the steps', () => {
  const n = noteFor(lib[0])
  assert.ok(n.startsWith(NOTE_HEAD))
  assert.match(n, /not the person's request/)
  assert.match(n, /How each thing was tried before answering:/)
  assert.ok(n.length <= 6000)
})

test('newestRequest takes the newest typed text, not tool results or the note itself', () => {
  const msgs = [
    { role: 'user', content: [{ type: 'text', text: 'make a tic tac toe game' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'tool', content: [{ type: 'tool-result', output: 'x' }] },
    { role: 'user', content: [{ type: 'text', text: 'now make me a stopwatch app' }] },
  ]
  assert.equal(newestRequest(msgs), 'now make me a stopwatch app')
  assert.equal(newestRequest([{ role: 'user', content: 'plain string' }]), 'plain string')
  assert.equal(newestRequest([]), '')
})

test('the hook adds one example to the system prompt, the same one on every step, and a new one for a new request', () => {
  reset()
  const ev = () => ({ sessionID: 's1', system: [{ type: 'text', text: 'base' }], messages: [{ role: 'user', content: [{ type: 'text', text: 'build me a to-do app where each task has a due date' }] }] })
  const a = ev(); onContext(a, {})
  assert.equal(a.system.length, 2)
  assert.match(a.system[1].text, /reading list/)
  const b = ev(); onContext(b, {})
  assert.equal(b.system[1].text, a.system[1].text)
  const c = ev(); c.system.push({ type: 'text', text: a.system[1].text }); onContext(c, {})
  assert.equal(c.system.length, 2, 'never twice')
  const d = ev(); d.messages.push({ role: 'user', content: [{ type: 'text', text: 'make a stopwatch page' }] }); onContext(d, {})
  assert.match(d.system[1].text, /stopwatch page with lap times/)
})

test('OLA_EXAMPLES=off adds nothing; a request with no neighbor adds nothing', () => {
  reset()
  const e1 = { sessionID: 's2', system: [], messages: [{ role: 'user', content: 'make a tic tac toe game' }] }
  onContext(e1, { OLA_EXAMPLES: 'off' })
  assert.equal(e1.system.length, 0)
  const e2 = { sessionID: 's3', system: [], messages: [{ role: 'user', content: 'summarize these minutes' }] }
  onContext(e2, {})
  assert.equal(e2.system.length, 0)
})

test('OLA_EXAMPLES_EXTRA adds kept examples; a broken file is skipped', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'olaex-'))
  const kept = path.join(dir, 'kept.json')
  writeFileSync(kept, JSON.stringify({ examples: [{ id: 'bart-1', source: 'bart', request: 'make a garden watering schedule planner', tried: ['opened it'], asked: ['a planner'] }] }))
  writeFileSync(path.join(dir, 'bad.json'), '{not json')
  const all = loadLibrary({ OLA_EXAMPLES_EXTRA: `${kept}:${path.join(dir, 'bad.json')}:${path.join(dir, 'missing.json')}` })
  assert.equal(all.length, lib.length + 1)
  assert.equal(closest('build a watering schedule planner for my garden', all)?.example.id, 'bart-1')
})
