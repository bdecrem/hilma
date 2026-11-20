// Which engine made a file, as the web app shows it (OLA-224): the front desk's note in front of an
// open model's prompt never reaches the person, and a step another engine took says so.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepVerb, stripEngines, turnsFromMessages } from '../src/lib/conversation.ts'

test('the note the front desk puts in front of a prompt is stripped when the request is shown', () => {
  // As frontdesk/madeby.mjs engineNote writes it (frontdesk/test/madeby.test.mjs checks that side).
  const note = '<ola-engines>Before this request, other engines worked in this conversation (not you): Claude, asked "Make index.html nicer", changed index.html. Never say you did their work; ola-made-by <file> shows who made a file.</ola-engines>\n\n'
  const typed = 'Who made index.html?'
  assert.equal(stripEngines(note + typed), typed)
  assert.equal(stripEngines(typed), typed)
  // Only a note at the very start; text that merely mentions the marks is the person's own.
  assert.equal(stripEngines('say <ola-engines>hi</ola-engines>'), 'say <ola-engines>hi</ola-engines>')
  const turns = turnsFromMessages([{ type: 'user', id: 'msg_1', text: note + typed, time: { created: 1 } }], '/work')
  assert.equal(turns[0].request, typed)
})

test('a step that wrote or changed a file in a Claude or hosted turn names the engine', () => {
  assert.equal(stepVerb({ icon: 'write', verb: 'Wrote' }, 'claude'), 'Claude wrote')
  assert.equal(stepVerb({ icon: 'change', verb: 'Changed' }, 'hosted'), 'The hosted model changed')
  assert.equal(stepVerb({ icon: 'write', verb: 'Wrote' }, 'ola'), 'Wrote')
  assert.equal(stepVerb({ icon: 'write', verb: 'Wrote' }, undefined), 'Wrote')
  assert.equal(stepVerb({ icon: 'read', verb: 'Read' } as any, 'claude'), 'Read')
})
