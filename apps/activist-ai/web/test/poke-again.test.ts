// OLA-522: after Ola's one fix turn, the page is pressed once more. Still dead: one message (what does
// not work) and one question (the bigger model, outside this machine), offered only when it can be done.
// All fine, or the second pressing failed: neither. Yes: one hand-off turn, never pressed again. No: nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deadAnswer, DEAD_HANDOFF_LINE, deadHandoffRequest, deadOffer, deadQuestion, isPokeFix, pokeable, pokeAgain, pokeAfter, pokePrompt, POKE_LINE, type Poked } from '../src/lib/poke.ts'
import { emptyConversation, startTurn } from '../src/lib/conversation.ts'
import { handoffPrompt } from '../src/lib/steps.ts'
import type { Turn } from '../src/lib/types.ts'

const DEAD = [{ what: 'button', name: 'Done', say: "Pressing 'Done' changed nothing on the page." }]
// The fix turn as the page holds it: Ola's own follow-up (pokePrompt), shown as POKE_LINE.
function fixTurn(over: Partial<Turn> = {}): Turn {
  const st = emptyConversation()
  const t = startTurn(st, pokePrompt('index.html', DEAD), 1_764_270_000_000)
  return Object.assign(t, { id: 'msg_fix', status: 'done', ended: 2 }, over)
}

async function again(t: Turn, poke: (since: number) => Promise<Poked>, last = true) {
  const cards: { page: string; dead: string[] }[] = []
  const asked: number[] = []
  const did = await pokeAgain(t, { poke: async (s) => (asked.push(s), poke(s)), stillDead: (page, dead) => cards.push({ page, dead: dead.map((d) => d.say) }), stillLast: () => last })
  return { did, cards, asked }
}

test('the fix turn is Ola’s own line, and it is pressed again (not as a first pressing)', () => {
  const t = fixTurn()
  assert.equal(t.request, POKE_LINE)
  assert.equal(isPokeFix(t), true)
  assert.equal(pokeable(t), false)
})

test('still dead after the fix: one message and one question, with the bigger model said to run outside this machine', async () => {
  const r = await again(fixTurn(), async () => ({ page: 'index.html', dead: DEAD }))
  assert.deepEqual(r.asked, [1_764_270_000_000])
  assert.equal(r.cards.length, 1)
  const q = deadQuestion(r.cards[0].page, DEAD, { hostedSetUp: true, canSend: true })
  assert.deepEqual(q, { page: 'index.html', dead: ["Pressing 'Done' changed nothing on the page."], offered: true })
  assert.match(deadOffer('Together AI'), /runs outside this machine, at Together AI/)
})

test('all fine after the fix, or nothing changed: neither message nor question', async () => {
  assert.deepEqual((await again(fixTurn(), async () => ({ page: 'index.html', dead: [] }))).cards, [])
  assert.deepEqual((await again(fixTurn(), async () => ({ page: null, dead: [] }))).cards, [])
})

test('the second pressing errors or times out: neither', async () => {
  const r = await again(fixTurn(), async () => {
    throw new Error('502 poke_failed')
  })
  assert.deepEqual([r.did, r.cards], [false, []])
})

test('no hosted model set up (or this person cannot send it): the message without the question', () => {
  assert.equal(deadQuestion('index.html', DEAD, { hostedSetUp: false, canSend: true }).offered, false)
  assert.equal(deadQuestion('index.html', DEAD, { hostedSetUp: true, canSend: false }).offered, false)
  assert.equal(deadQuestion('index.html', DEAD, { hostedSetUp: false, canSend: true }).dead.length, 1)
})

const CARD = { canAct: true, request: 'make a to-do list', page: 'index.html', dead: ["Pressing 'Done' changed nothing on the page."] }

test('yes: one hand-off turn with the page and the list, shown as one plain line, and it is never pressed or asked about again', async () => {
  const a = deadAnswer(CARD, 'once', handoffPrompt)
  assert.equal(a.note, 'yes')
  const prompt = a.handoff!
  assert.equal(prompt, handoffPrompt(DEAD_HANDOFF_LINE, deadHandoffRequest('make a to-do list', 'index.html', CARD.dead)))
  assert.ok(prompt.includes('make a to-do list') && prompt.includes("Pressing 'Done' changed nothing") && prompt.includes('index.html'))
  const st = emptyConversation()
  const t = Object.assign(startTurn(st, prompt, 5), { engine: 'hosted' as const, status: 'done' as const })
  assert.equal(t.request, DEAD_HANDOFF_LINE)
  assert.match(DEAD_HANDOFF_LINE, /bigger model outside this machine/)
  // The hosted model's turn: no first pressing, no second pressing.
  assert.equal(pokeable(t), false)
  assert.equal(isPokeFix(t), false)
  let pressed = 0
  await pokeAfter(t, { poke: async () => (pressed++, { page: 'index.html', dead: DEAD }), send: () => {}, stillLast: () => true })
  await pokeAgain(t, { poke: async () => (pressed++, { page: 'index.html', dead: DEAD }), stillDead: () => {}, stillLast: () => true })
  assert.equal(pressed, 0)
})

test('no: nothing more; OK on a card that offered nothing: nothing, not even a note', () => {
  assert.deepEqual(deadAnswer(CARD, 'not_now', handoffPrompt), { note: 'no', handoff: null })
  assert.deepEqual(deadAnswer({ ...CARD, canAct: false }, 'not_now', handoffPrompt), { note: null, handoff: null })
  assert.deepEqual(deadAnswer({ ...CARD, canAct: false }, 'once', handoffPrompt), { note: null, handoff: null })
})

test('the person typed again while it was pressed: no card', async () => {
  const r = await again(fixTurn(), async () => ({ page: 'index.html', dead: DEAD }), false)
  assert.deepEqual(r.cards, [])
})

test('a second fix is never asked for: a fix turn still dead goes to the card, not to another follow-up', async () => {
  const sent: string[] = []
  await pokeAfter(fixTurn(), { poke: async () => ({ page: 'index.html', dead: DEAD }), send: (x) => sent.push(x), stillLast: () => true })
  assert.deepEqual(sent, [])
})
