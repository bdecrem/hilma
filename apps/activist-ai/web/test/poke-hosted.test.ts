// OLA-542 (from OLA-466, checker Nov 28, chk466j and chk466l): after Yes on the card the bigger model's
// spreadsheet had the row numbers over column A, and Ola never pressed it. Now: the hand-off turn's page is
// pressed once; dead: one fix turn to the bigger model; after that, pressed once more; still dead: the card
// with only OK, titled as after the bigger model's fix. Never a third turn.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEAD_HANDOFF_LINE, deadHandoffRequest, isDeadHandoff, isHostedPokeFix, isPokeFix, pokeable, pokeHosted, pokePrompt, POKE_LINE, POKE_LINE_HOSTED, type Poked } from '../src/lib/poke.ts'
import { emptyConversation, startTurn } from '../src/lib/conversation.ts'
import { handoffPrompt } from '../src/lib/steps.ts'
import type { Turn } from '../src/lib/types.ts'

const DEAD = [{ what: 'grid', name: 'A1', say: 'Tapping a cell of the grid opened no field to type in, so a phone shows no keyboard and nothing can be typed.' }]
const AT = 1_764_300_000_000

function turn(text: string, engine: Turn['engine'], over: Partial<Turn> = {}): Turn {
  const t = startTurn(emptyConversation(), text, AT)
  return Object.assign(t, { id: 'msg_x', status: 'done', ended: 2, engine }, over)
}
const handoff = (over: Partial<Turn> = {}) => turn(handoffPrompt(DEAD_HANDOFF_LINE, deadHandoffRequest('make me a spreadsheet', 'index.html', ['x'])), 'hosted', over)
const hostedFix = (over: Partial<Turn> = {}) => turn(pokePrompt('index.html', DEAD, POKE_LINE_HOSTED), 'hosted', over)

async function run(t: Turn, poke: (since: number) => Promise<Poked>, last = true) {
  const sent: string[] = []
  const cards: string[][] = []
  const asked: number[] = []
  const did = await pokeHosted(t, { poke: async (s) => (asked.push(s), poke(s)), send: (x) => sent.push(x), stillDead: (_p, d) => cards.push(d.map((x) => x.say)), stillLast: () => last })
  return { did, sent, cards, asked }
}

test('the two bigger-model turns are told apart, and neither is pressed as Ola’s own model’s turn', () => {
  const h = handoff()
  const f = hostedFix()
  assert.deepEqual([isDeadHandoff(h), isHostedPokeFix(h)], [true, false])
  assert.deepEqual([isDeadHandoff(f), isHostedPokeFix(f)], [false, true])
  assert.equal(f.request, POKE_LINE_HOSTED)
  for (const t of [h, f]) assert.deepEqual([pokeable(t), isPokeFix(t)], [false, false])
  // Ola's own fix line on a hosted turn, or the hand-off line on Ola's model: neither.
  assert.equal(isHostedPokeFix(turn(pokePrompt('index.html', DEAD), 'hosted')), false)
  assert.equal(isDeadHandoff(handoff({ engine: 'ola' as Turn['engine'] })), false)
})

test('after the hand-off, its page dead: one fix turn to the bigger model saying exactly what, no card', async () => {
  const r = await run(handoff(), async () => ({ page: 'index.html', dead: DEAD }))
  assert.equal(r.did, true)
  assert.deepEqual(r.asked, [AT])
  assert.equal(r.sent.length, 1)
  assert.deepEqual(r.cards, [])
  assert.ok(r.sent[0].includes(POKE_LINE_HOSTED) && r.sent[0].includes(DEAD[0].say) && r.sent[0].includes('index.html'))
  assert.equal(r.sent[0].includes(POKE_LINE), false)
})

test('after the bigger model’s fix, still dead: the card, and never another turn', async () => {
  const r = await run(hostedFix(), async () => ({ page: 'index.html', dead: DEAD }))
  assert.deepEqual([r.did, r.sent, r.cards], [true, [], [[DEAD[0].say]]])
})

test('all fine, no page changed, the pressing fails, or the person typed again: nothing', async () => {
  for (const t of [handoff(), hostedFix()]) {
    assert.equal((await run(t, async () => ({ page: 'index.html', dead: [] }))).did, false)
    assert.equal((await run(t, async () => ({ page: null, dead: DEAD }))).did, false)
    assert.equal((await run(t, async () => Promise.reject(new Error('502')))).did, false)
    const late = await run(t, async () => ({ page: 'index.html', dead: DEAD }), false)
    assert.deepEqual([late.did, late.sent, late.cards], [false, [], []])
  }
})

test('a bigger-model turn that did not end well, or one the person asked for, is not pressed', async () => {
  assert.deepEqual((await run(handoff({ status: 'failed' }), async () => ({ page: 'index.html', dead: DEAD }))).asked, [])
  assert.deepEqual((await run(turn('make me a spreadsheet', 'hosted'), async () => ({ page: 'index.html', dead: DEAD }))).asked, [])
})

// OLA-466, checker Nov 28 (chk466k): the grid use stops at its first failed step, so a later one was hidden.
test('a fix prompt with a grid step names every step Ola takes and the code for each; others do not', () => {
  const p = pokePrompt('index.html', DEAD)
  assert.match(p, /stops at the first step that fails, so make every step work/)
  assert.ok(p.includes('type =A1*2') && p.includes('not 57 or 75') && p.includes('onfocus="this.select()"'))
  assert.match(pokePrompt('index.html', DEAD, POKE_LINE_HOSTED), /make every step work/)
  assert.doesNotMatch(pokePrompt('index.html', [{ what: 'button', name: 'Done', say: "Pressing 'Done' changed nothing on the page." }]), /make every step work/)
})
