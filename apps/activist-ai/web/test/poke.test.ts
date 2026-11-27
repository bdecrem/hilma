// OLA-515: after every done turn of Ola's own model, Ola asks the front desk to press the page that
// changed since the turn began (workspace/ola-poke through POST /api/poke) and sends one follow-up only
// for what is dead. No page changed, a clean page or a pressing that failed send nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POKE_LINE, pokeAfter, pokePrompt, type Poked } from '../src/lib/poke.ts'
import { startTurn, emptyConversation } from '../src/lib/conversation.ts'
import type { Turn } from '../src/lib/types.ts'

const shell = (id: string, command: string) => ({ id, tool: 'shell', icon: 'run', verb: 'Ran', object: '', result: null, status: 'done', error: null, detail: { input: command, output: 'done' }, started: 1, ended: 1 })
// As in the first live test (Nov 27): only shell steps; the page was written with `cat > index.html`.
const turn = (over: Partial<Turn> = {}): Turn => ({
  id: 'msg_1', request: 'build me a to-do app where each task has a due date', at: 1_764_270_000_000, status: 'done', answer: 'Done.', notes: [], error: null, notice: null, ended: 2,
  steps: [shell('s1', 'ls -la /work'), shell('s2', "cat > /work/index.html <<'EOF'\n<!doctype html>...\nEOF\necho done")],
  ...over,
} as Turn)
const DEAD = [{ what: 'button', name: 'Add task', say: "Pressing 'Add task' changed nothing on the page." }]

async function run(t: Turn, poke: (since: number) => Promise<Poked>, last = true) {
  const sent: string[] = []
  const asked: number[] = []
  const did = await pokeAfter(t, { poke: async (s) => (asked.push(s), poke(s)), send: (x) => sent.push(x), stillLast: () => last })
  return { did, sent, asked }
}

test('a page written by a shell command, with a dead button: asked with the turn’s start, exactly one follow-up naming it, shown as one plain line from Ola', async () => {
  const r = await run(turn(), async () => ({ page: 'index.html', dead: DEAD }))
  assert.deepEqual(r.asked, [1_764_270_000_000])
  assert.equal(r.sent.length, 1)
  assert.ok(r.sent[0].includes("Pressing 'Add task' changed nothing on the page."))
  assert.ok(r.sent[0].includes('Fix exactly that in index.html'))
  const st = emptyConversation()
  startTurn(st, r.sent[0], 5)
  const shown = st.turns[st.turns.length - 1]
  assert.equal(shown.nudge, true)
  assert.equal(shown.request, POKE_LINE)
})

test('a clean page, or no page changed in the turn: nothing sent', async () => {
  assert.deepEqual((await run(turn(), async () => ({ page: 'index.html', dead: [] }))).sent, [])
  assert.deepEqual((await run(turn(), async () => ({ page: null, dead: [] }))).sent, [])
})

test('the pressing failed or timed out: nothing sent', async () => {
  const r = await run(turn(), async () => {
    throw new Error('502 poke_failed')
  })
  assert.equal(r.did, false)
  assert.deepEqual(r.sent, [])
})

test('once per request: Ola’s own follow-up turn is never pressed again; a failed turn or another engine’s is not pressed', async () => {
  for (const over of [{ nudge: true }, { status: 'failed' as const }, { engine: 'claude' as const }, { engine: 'hosted' as const }]) {
    const r = await run(turn(over), async () => ({ page: 'index.html', dead: DEAD }))
    assert.deepEqual([r.asked, r.sent], [[], []], JSON.stringify(over))
  }
})

test('the person typed again while it was pressed: nothing sent', async () => {
  const r = await run(turn(), async () => ({ page: 'index.html', dead: DEAD }), false)
  assert.deepEqual(r.sent, [])
})

test('many dead things are cut to six lines', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ what: 'button', name: String(i), say: `Pressing '${i}' changed nothing on the page.` }))
  const p = pokePrompt('tips/index.html', many)
  assert.equal((p.match(/^- Pressing/gm) ?? []).length, 6)
  assert.ok(p.includes('and 3 more') && p.includes('Fix exactly that in tips/index.html'))
})
