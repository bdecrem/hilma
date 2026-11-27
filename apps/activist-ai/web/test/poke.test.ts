// OLA-515: after Ola's model hands over a page, Ola presses it (workspace/ola-poke through POST
// /api/poke) and sends one follow-up only for what is dead. A clean page and a pressing that failed send nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POKE_LINE, pokeAfter, pokePrompt, pokeTarget } from '../src/lib/poke.ts'
import { startTurn, emptyConversation } from '../src/lib/conversation.ts'
import type { Turn } from '../src/lib/types.ts'

const turn = (over: Partial<Turn> = {}): Turn => ({
  id: 'msg_1', request: 'make a tip calculator', at: 1, status: 'done', answer: 'Done.', notes: [], error: null, notice: null, ended: 2,
  steps: [
    { id: 's1', tool: 'write', icon: 'write', verb: 'Wrote', object: 'calc.js', result: null, status: 'done', error: null, detail: { input: JSON.stringify({ filePath: '/work/calc.js' }), output: '' }, started: 1, ended: 1 },
    { id: 's2', tool: 'write', icon: 'write', verb: 'Wrote', object: 'index.html', result: null, status: 'done', error: null, detail: { input: JSON.stringify({ filePath: '/work/index.html', content: '<p>' }), output: '' }, started: 1, ended: 1 },
  ],
  ...over,
} as Turn)
const DEAD = [{ what: 'button', name: 'Done', say: "Pressing 'Done' changed nothing on the page." }]

async function run(t: Turn, poke: () => Promise<{ dead: typeof DEAD }>, last = true) {
  const sent: string[] = []
  const asked: string[] = []
  const did = await pokeAfter(t, '/work', { poke: async (p) => (asked.push(p), poke()), send: (x) => sent.push(x), stillLast: () => last })
  return { did, sent, asked }
}

test('a dead button: exactly one follow-up, naming it, shown as one plain line from Ola', async () => {
  const r = await run(turn(), async () => ({ dead: DEAD }))
  assert.deepEqual(r.asked, ['index.html'])
  assert.equal(r.sent.length, 1)
  assert.ok(r.sent[0].includes("Pressing 'Done' changed nothing on the page."))
  assert.ok(r.sent[0].includes('Fix exactly that in index.html'))
  // The page shows it the way it shows Ola's own turns: one line, marked as Ola's, never the prompt.
  const st = emptyConversation()
  startTurn(st, r.sent[0], 5)
  const shown = st.turns[st.turns.length - 1]
  assert.equal(shown.nudge, true)
  assert.equal(shown.request, POKE_LINE)
})

test('a clean page: nothing sent', async () => {
  const r = await run(turn(), async () => ({ dead: [] }))
  assert.equal(r.did, false)
  assert.deepEqual(r.sent, [])
})

test('the pressing failed or timed out: nothing sent', async () => {
  const r = await run(turn(), async () => {
    throw new Error('502 poke_failed')
  })
  assert.equal(r.did, false)
  assert.deepEqual(r.sent, [])
})

test('once per request: Ola’s own follow-up turn is never pressed again, and no page means no pressing', async () => {
  const again = await run(turn({ nudge: true }), async () => ({ dead: DEAD }))
  assert.deepEqual([again.asked, again.sent], [[], []])
  const noPage = await run(turn({ steps: turn().steps.slice(0, 1) }), async () => ({ dead: DEAD }))
  assert.deepEqual([noPage.asked, noPage.sent], [[], []])
  const failed = await run(turn({ status: 'failed' }), async () => ({ dead: DEAD }))
  assert.deepEqual(failed.asked, [])
  const claude = await run(turn({ engine: 'claude' }), async () => ({ dead: DEAD }))
  assert.deepEqual(claude.asked, [])
})

test('the person typed again while it was pressed: nothing sent', async () => {
  const r = await run(turn(), async () => ({ dead: DEAD }), false)
  assert.deepEqual(r.sent, [])
})

test('the page in a folder, and many dead things cut to six lines', () => {
  const t = turn({ steps: [{ ...turn().steps[1], tool: 'edit', detail: { input: JSON.stringify({ filePath: '/work/tips/index.html' }), output: '' } }] })
  assert.equal(pokeTarget(t, '/work'), 'tips/index.html')
  const many = Array.from({ length: 9 }, (_, i) => ({ what: 'button', name: String(i), say: `Pressing '${i}' changed nothing on the page.` }))
  const p = pokePrompt('index.html', many)
  assert.equal((p.match(/^- Pressing/gm) ?? []).length, 6)
  assert.ok(p.includes('and 3 more'))
})
