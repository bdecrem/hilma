// Ola counting its own failures (OLA-235), the part OLA-387 is about: the everyday ways Ola says "I
// cannot" must reach the counter. The five answers below are the ones the November run really said;
// each says in its own words that Ola cannot do the thing, and each came back null, so the turn was
// counted as an ordinary answer and never became a case. The last check says the other half: "here"
// names the place, so "here's a draft" is a plain "I can't", not "I cannot do this here".
// Run: node --test frontdesk/test/faults-refusal.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KINDS, keptKinds, readTurn, refusalOf, typeOf } from '../faults.mjs'

/** A counted refusal is one of the fixed kinds and of the refusal type, whichever bucket it lands in. */
const counted = (answer) => {
  const kind = refusalOf(answer)
  assert.ok(kind, `counted as a refusal, not missed: ${answer}`)
  assert.ok(KINDS[kind], `named by one of the fixed kinds, got ${kind}: ${answer}`)
  assert.equal(typeOf(kind), 'refusal', `a refusal, not a step or a run: ${answer}`)
  return kind
}

test('the ways Ola says it cannot are counted, whichever way it says them', () => {
  for (const answer of [
    "I don't have a way to send text messages.",
    "Sending texts isn't something I can do.",
    'I have no way of making phone calls.',
    "That's outside what I can do from this project.",
    "I can only work with files in this project, so I won't be able to call her.",
  ])
    counted(answer)
})

test('"here\'s" is not "from here": a can\'t with an offer beside it is a plain cannot', () => {
  const answer = "I can't send emails myself, but here's a draft"
  const kind = counted(answer)
  assert.notEqual(kind, 'cannot_here', '"here\'s" is not a place: it did say it cannot send the email')
})

test('an answer that only uses the word "here" the other way stays unlabelled', () => {
  // The two answers faults.test.mjs already expects to be nothing; a wider rule must not eat them.
  for (const answer of ['Done. The page is at https://sites.ola.cx/bart/ and says Bart.', 'I made the chart and saved it as chart.png. You can open it here.'])
    assert.equal(refusalOf(answer), null, answer)
})

test('a turn that says it cannot reaches the counter, in a cloud run and on a Mac', () => {
  const turn = (answer) => [
    { type: 'user', id: 'msg_u1', text: 'send this to Ana as a text message', time: { created: 2 } },
    { type: 'assistant', id: 'a1', model: { id: 'general' }, content: [{ type: 'text', text: answer }], time: { created: 3 } },
    { type: 'idle', id: 'i1', outcome: 'succeeded', time: { created: 4 } },
  ]
  const t = readTurn(turn("I don't have a way to send text messages."))
  assert.equal(t.kinds.length, 1, `the refusal is in the turn's kinds, got ${JSON.stringify(t.kinds)}`)
  assert.equal(typeOf(t.kinds[0]), 'refusal')
  const kept = keptKinds({ answer: 'I have no way of making phone calls.', steps: '[]', status: 'done' })
  assert.equal(kept.length, 1, `the same words on a kept turn from a Mac, got ${JSON.stringify(kept)}`)
  assert.equal(typeOf(kept[0]), 'refusal')
})
