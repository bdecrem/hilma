// Slash commands and reactions (README, "Slash commands and reactions (all surfaces)"): the parser
// and the reaction rules, the same cases as apple/OlaKit/Tests/OlaKitTests/CommandsTests.swift and
// more. Run: node --test test/commands.test.ts (web/check.mjs runs it too).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { commandMatches, parseCommand, reactionOnly, REACTION_INSTRUCTION, shown, splitReaction, turnReaction } from '../src/lib/commands.ts'
import { applyClaudeEvent, applyEvent, contextOf, emptyConversation, startClaudeTurn, startTurn } from '../src/lib/conversation.ts'
import type { Turn } from '../src/lib/types.ts'

test('a command only at the very start, as "/" and a word, then a space, a line break or the end', () => {
  assert.deepEqual(parseCommand('/claude build the page'), { kind: 'command', name: 'claude', rest: 'build the page' })
  assert.deepEqual(parseCommand('/Claude\nline two'), { kind: 'command', name: 'claude', rest: 'line two' })
  assert.deepEqual(parseCommand('/claude'), { kind: 'command', name: 'claude', rest: '' })
  assert.deepEqual(parseCommand('/new'), { kind: 'command', name: 'new', rest: '' })
  assert.deepEqual(parseCommand('/hosted   count the rows  '), { kind: 'command', name: 'hosted', rest: 'count the rows' })
  assert.deepEqual(parseCommand('/frobnicate x'), { kind: 'unknown', word: 'frobnicate' })
  assert.deepEqual(parseCommand('/claudex do it'), { kind: 'unknown', word: 'claudex' })
  assert.deepEqual(parseCommand('/'), { kind: 'unknown', word: '' })
  assert.deepEqual(parseCommand('please /claude this'), { kind: 'none' })
  assert.deepEqual(parseCommand('half/claude'), { kind: 'none' })
})

test('the menu shows what matches the word typed so far, and nothing once a space follows', () => {
  assert.deepEqual(commandMatches('/'), ['claude', 'ola', 'hosted', 'new', 'stop', 'files', 'help'])
  assert.deepEqual(commandMatches('/cl'), ['claude'])
  assert.deepEqual(commandMatches('/H'), ['hosted', 'help'])
  assert.deepEqual(commandMatches('/claude x'), [])
  assert.deepEqual(commandMatches('/zz'), [])
  assert.deepEqual(commandMatches('hello'), [])
})

test('a reaction counts only as the whole first line; markers anywhere else are removed', () => {
  assert.deepEqual(splitReaction('[[ola:react done]]\nIt is in your Files as index.html.'), { reaction: 'done', text: 'It is in your Files as index.html.' })
  assert.deepEqual(splitReaction('  [[ola:react  THANKS ]]  '), { reaction: 'thanks', text: '' })
  assert.deepEqual(splitReaction('\n\n[[ola:react think]]\nWhich file do you mean?'), { reaction: 'think', text: 'Which file do you mean?' })
  // Not the first line: no reaction, and the marker is not shown.
  assert.deepEqual(splitReaction('Done.\n[[ola:react done]]'), { reaction: null, text: 'Done.' })
  // An unknown name: no reaction, the line removed.
  assert.deepEqual(splitReaction('[[ola:react wave]]\nHi.'), { reaction: null, text: 'Hi.' })
  // The real model sometimes writes it on the same line as text: not a reaction, the marker removed.
  assert.deepEqual(splitReaction('[[ola:react ok]] Hello!'), { reaction: null, text: 'Hello!' })
  assert.deepEqual(splitReaction('Plain reply.'), { reaction: null, text: 'Plain reply.' })
})

test('while a reply streams in pieces, the raw marker never shows', () => {
  const reply = '[[ola:react party]]\nCongratulations on the vote!'
  for (let i = 1; i <= reply.length; i++) {
    const { text } = splitReaction(reply.slice(0, i), true)
    assert.ok(!text.includes('[') && !text.includes('ola:'), `piece ${i}: "${text}"`)
  }
  assert.equal(splitReaction(reply.slice(0, 25), true).reaction, 'party')
  // A same-line marker arriving in pieces: held back, then removed.
  const same = '[[ola:react ok]] Hello!'
  for (let i = 1; i <= same.length; i++) assert.ok(!shown(same.slice(0, i), true).includes('['), `same-line piece ${i}`)
  // An ordinary reply that starts with a bracket shows once it cannot be a marker.
  assert.equal(shown('[1] the first source', true), '[1] the first source')
})

const turn = (over: Partial<Turn>): Turn => ({ id: 't', request: 'r', at: 0, status: 'working', steps: [], answer: '', notes: [], error: null, notice: null, ended: null, ...over })

test('👀 at once while a run works, replaced by the reply’s own reaction, else ✅ when it ends well, none when it fails or stops', () => {
  assert.equal(turnReaction(turn({ status: 'sending' })), null)
  assert.equal(turnReaction(turn({ status: 'working' })), 'eyes')
  assert.equal(turnReaction(turn({ status: 'working', answer: '[[ola:react thanks]]' })), 'thanks')
  assert.equal(turnReaction(turn({ status: 'working', answer: '[[ola:re' })), 'eyes')
  assert.equal(turnReaction(turn({ status: 'done', answer: 'All done.' })), 'done')
  assert.equal(turnReaction(turn({ status: 'done', answer: '[[ola:react ok]] Hello!' })), 'done')
  assert.equal(turnReaction(turn({ status: 'failed', error: { text: 'x', detail: null } })), null)
  assert.equal(turnReaction(turn({ status: 'stopped' })), null)
  // The reaction is on the turn's first text, even when later texts follow as notes.
  assert.equal(turnReaction(turn({ status: 'done', notes: ['[[ola:react eyes]]\nLet me look.'], answer: 'Here it is.' })), 'eyes')
})

test('a reply that is only the marker shows the reaction and no reply at all', () => {
  assert.equal(reactionOnly(turn({ status: 'done', answer: '[[ola:react thanks]]' })), true)
  assert.equal(reactionOnly(turn({ status: 'done', answer: '[[ola:react thanks]]\n\n' })), true)
  assert.equal(reactionOnly(turn({ status: 'working', answer: '[[ola:react thanks]]' })), false)
  assert.equal(reactionOnly(turn({ status: 'done', answer: '[[ola:react thanks]]\nYou are welcome.' })), false)
  assert.equal(reactionOnly(turn({ status: 'done', answer: '' })), false)
})

test('the same for Ola’s streamed reply and for a Claude turn; Claude’s context never carries a marker', () => {
  const s = emptyConversation()
  s.sessionID = 'ses_1'
  startTurn(s, 'Great job, thank you!', 1)
  applyEvent(s, { type: 'session.execution.started', data: { sessionID: 'ses_1' } })
  assert.equal(turnReaction(s.turns[0]), 'eyes')
  for (const piece of ['[[ola:', 'react tha', 'nks]]']) {
    applyEvent(s, { type: 'session.text.delta', data: { sessionID: 'ses_1', assistantMessageID: 'm1', delta: piece } })
    assert.equal(shown(s.turns[0].answer, true), '')
  }
  applyEvent(s, { type: 'session.execution.succeeded', data: { sessionID: 'ses_1' } })
  assert.equal(turnReaction(s.turns[0]), 'thanks')
  assert.equal(reactionOnly(s.turns[0]), true)
  const c = startClaudeTurn(s, 'thank you', 2)
  applyClaudeEvent(s, c, { ola: 'started', run: 'c1' })
  assert.equal(turnReaction(c), 'eyes')
  applyClaudeEvent(s, c, { type: 'assistant', message: { content: [{ type: 'text', text: '[[ola:react thanks]]' }] } })
  applyClaudeEvent(s, c, { type: 'result', is_error: false, result: '[[ola:react thanks]]' })
  applyClaudeEvent(s, c, { ola: 'ended', reason: 'done' })
  assert.equal(turnReaction(c), 'thanks')
  assert.equal(reactionOnly(c), true)
  assert.ok(!contextOf(s.turns).includes('[[ola:'), contextOf(s.turns))
})

test('the standing instruction is word for word the README’s, in AGENTS.md and in the front desk', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
  const block = /\*\*The standing instruction\*\*[\s\S]*?```text\n([\s\S]*?)\n```/.exec(readme)?.[1]
  assert.equal(block, REACTION_INSTRUCTION)
  assert.ok(readFileSync(new URL('../../workspace/AGENTS.md', import.meta.url), 'utf8').includes(REACTION_INSTRUCTION), 'workspace/AGENTS.md')
  assert.ok(readFileSync(new URL('../../frontdesk/claude.mjs', import.meta.url), 'utf8').includes(REACTION_INSTRUCTION.replaceAll('`', '\\`')), 'frontdesk/claude.mjs')
})
