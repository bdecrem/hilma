// OLA-515: every click-through leaves one plain line in the front desk log: who, where, the page (or
// that none changed), how many controls, how long, what was dead, or that it failed or timed out.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pokeLine } from '../poke.mjs'

const at = { handle: 'asks', slug: 'asks-team' }

test('a page pressed with nothing dead', () => {
  assert.equal(pokeLine({ ...at, r: { page: 'index.html', pressed: 7, typed: 2, dead: [] }, ms: 3400 }), 'click-through for asks in asks-team: pressed index.html (7 pressed, 2 typed, 3.4 s): nothing dead')
})

test('a page with dead things: kind and label only, never what the page says', () => {
  const r = { page: 'todo/index.html', pressed: 5, typed: 1, dead: [
    { what: 'button', name: 'Done', say: "Pressing 'Done' changed nothing on the page." },
    { what: 'field', name: 'People', say: "The field 'People' did not take what was typed." },
    { what: 'error', name: '', say: 'Script error when the page opened: ReferenceError: secretThing is not defined' },
  ] }
  const line = pokeLine({ ...at, r, ms: 8000 })
  assert.equal(line, "click-through for asks in asks-team: pressed todo/index.html (5 pressed, 1 typed, 8.0 s): 3 dead: button 'Done', field 'People', script error on load")
  assert.ok(!line.includes('secretThing'))
})

test('no page changed, a failure and a timeout each say so', () => {
  assert.equal(pokeLine({ ...at, r: { page: null, pressed: 0, typed: 0, dead: [] }, ms: 300 }), 'click-through for asks in asks-team: no page changed in the turn; nothing pressed (0.3 s)')
  assert.equal(pokeLine({ ...at, r: { failed: 'failed' }, ms: 1200 }), 'click-through for asks in asks-team: the pressing failed after 1.2 s; nothing sent')
  assert.equal(pokeLine({ ...at, r: { failed: 'timed out' }, ms: 25000 }), 'click-through for asks in asks-team: the pressing timed out after 25.0 s; nothing sent')
})

test('many dead things: four named, the rest counted, and the line fits the log (300)', () => {
  const dead = Array.from({ length: 12 }, (_, i) => ({ what: 'button', name: `A very long button label number ${i}`, say: 'x' }))
  const line = pokeLine({ ...at, r: { page: 'a'.repeat(100) + '.html', pressed: 30, typed: 0, dead }, ms: 16000 })
  assert.ok(line.endsWith(', and 8 more') && line.length <= 300, `${line.length}: ${line}`)
})
