// The composer's button, one test per state of the conversation (lib/composer.ts, OLA-311): a
// question Ola waits on can always be answered once there is text, and nothing leaves the button
// inactive except an empty composer, an answer already on its way, or a lost connection for a
// new request (which the banner says, and which comes back by itself).
// Run: node --test test/composer.test.ts (web/check.mjs runs it too).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerFromWords, composerState, type ComposerInput } from '../src/lib/composer.ts'
import type { Question } from '../src/lib/types.ts'

const field = (o: Partial<Question['fields'][number]> = {}): Question['fields'][number] => ({ key: 'q0', title: 'Live data?', text: 'Should I fetch live data?', options: [{ value: 'Yes, fetch live data', label: 'Yes, fetch live data', description: null }], custom: true, multiple: false, ...o })
const card = (fields = [field()]): Question => ({ id: 'frm_1', sessionID: 'ses_1', fields, stepID: 'call_1' })
const base: ComposerInput = { draft: '', working: false, question: null, answering: false, connection: 'open' }
const st = (o: Partial<ComposerInput>) => composerState({ ...base, ...o })

test('his case: a card waits inside a running run, "Yes" typed in the composer: the button sends the answer, not Stop', () => {
  const s = st({ working: true, question: card(), draft: 'Yes' })
  assert.equal(s.button, 'answer')
  assert.equal(s.enabled, true)
  assert.equal(s.submits, true)
  assert.equal(s.placeholder, 'answer')
})

test('a question waiting, nothing typed: the answer button is there and inactive until there is text', () => {
  const s = st({ working: true, question: card(), draft: '   ' })
  assert.deepEqual([s.button, s.enabled, s.submits], ['answer', false, false])
})

test('a question waiting and the event stream lost: the answer still goes (it is its own request)', () => {
  const s = st({ working: true, question: card(), draft: 'Yes', connection: 'lost' })
  assert.deepEqual([s.button, s.enabled], ['answer', true])
})

test('a question waiting while the stream is still connecting (a reload, an update of the server): the answer goes', () => {
  assert.equal(st({ working: true, question: card(), draft: 'Yes', connection: 'connecting' }).enabled, true)
})

test('an answer on its way: inactive, and active again as soon as it is not (whatever the result)', () => {
  assert.equal(st({ working: true, question: card(), draft: 'Yes', answering: true }).enabled, false)
  assert.equal(st({ working: true, question: card(), draft: 'Yes', answering: false }).enabled, true)
})

test('a question whose turn the page thinks has ended (read back after a reconnect): still answered from the composer', () => {
  assert.deepEqual([st({ working: false, question: card(), draft: 'Yes' }).button, st({ working: false, question: card(), draft: 'Yes' }).enabled], ['answer', true])
})

test('a slash command while a question waits is a command (/stop, /help), never sent as the answer', () => {
  const s = st({ working: true, question: card(), draft: '/stop' })
  assert.equal(s.button, 'stop')
  assert.equal(s.submits, true)
})

// The checker's case on c571d55d: a card with TWO questions left the box on Stop with an answer typed.
for (const [shape, q] of [
  ['two questions', card([field({ key: 'a' }), field({ key: 'b' })])],
  ['three questions', card([field({ key: 'a' }), field({ key: 'b' }), field({ key: 'c' })])],
  ['one pick-several question', card([field({ multiple: true })])],
  ['one question with choices only (no own words)', card([field({ custom: false })])],
  ['one question with no choices', card([field({ options: [] })])],
  ['two questions, one of them pick-several and choices only', card([field({ key: 'a' }), field({ key: 'b', multiple: true, custom: false })])],
] as const) {
  test(`a card with ${shape}: words typed in the box go as the answer, never only Stop`, () => {
    const s = st({ working: true, question: q, draft: 'Saturday at noon, in the park' })
    assert.deepEqual([s.button, s.enabled, s.submits, s.placeholder], ['answer', true, true, 'answer'])
    assert.equal(st({ working: true, question: q, draft: '' }).button, 'answer')
  })
}

test('words typed in the box answer every question on the card (a list for a pick-several one)', () => {
  const q = card([field({ key: 'when' }), field({ key: 'what', multiple: true })])
  assert.deepEqual(answerFromWords(q, '  Saturday, games and food  '), { when: 'Saturday, games and food', what: ['Saturday, games and food'] })
})

test('Ola working, no question: Stop, and words typed are kept with a sentence, not dropped', () => {
  const s = st({ working: true, draft: 'next thing' })
  assert.deepEqual([s.button, s.enabled, s.submits, s.placeholder], ['stop', true, false, 'working'])
  assert.match(s.blocked ?? '', /still working/)
})

test('the moment the turn ends, text typed during the run can be sent (a question Ola asked in words)', () => {
  const s = st({ working: false, draft: 'Springfield' })
  assert.deepEqual([s.button, s.enabled, s.submits], ['send', true, true])
})

test('idle and empty: send is inactive', () => {
  assert.deepEqual([st({}).button, st({}).enabled], ['send', false])
})

test('idle while connecting (just reloaded): a request can go', () => {
  assert.equal(st({ draft: 'Make a page', connection: 'connecting' }).enabled, true)
})

test('idle with the connection lost: a new request waits, says why, and is active again once the connection is back', () => {
  const lost = st({ draft: 'Make a page', connection: 'lost' })
  assert.deepEqual([lost.enabled, lost.submits], [false, false])
  assert.match(lost.blocked ?? '', /connection/)
  assert.equal(st({ draft: 'Make a page', connection: 'open' }).enabled, true)
  assert.equal(st({ draft: '/help', connection: 'lost' }).enabled, true)
})
