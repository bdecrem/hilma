// Replays recorded opencode 2.3.0 events (scripts/record-events.mjs) through the drawer's
// reducer and checks what a person would read. Run: npm test (Node 23.6+ strips the types).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyEvent, emptyConversation, runSummary, startTurn, turnsFromMessages } from '../src/lib/conversation.ts'
import { describeCommand, describeTool, runProblem, shortPath } from '../src/lib/steps.ts'

function replay(file: string) {
  const lines = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const created = lines.find((e) => e.type === 'session.created')
  const state = emptyConversation()
  state.sessionID = created.data.sessionID
  const request = lines.find((e) => e.type === '(message.list)').data.data.find((m: any) => m.type === 'user').text
  startTurn(state, request, created.created)
  const approvals: string[] = []
  for (const ev of lines) {
    applyEvent(state, ev)
    if (ev.type === 'permission.asked') approvals.push(state.approval!.title)
  }
  return { state, approvals, messages: lines.find((e) => e.type === '(message.list)').data.data }
}

test('a scripted run reads as plain steps, with two approvals and an answer', () => {
  const { state, approvals } = replay('fake-ask.jsonl')
  const turn = state.turns[0]
  assert.equal(turn.status, 'done')
  assert.deepEqual(
    turn.steps.map((s) => `${s.verb}${s.object ? ` ${s.object}` : ''}`),
    ['Looked through the project folder', 'Read survey.csv', 'Ran a short program', 'Wrote rows.md'],
  )
  assert.ok(turn.steps.every((s) => s.status === 'done'))
  assert.equal(turn.steps[2].result, 'printed 56')
  assert.match(turn.steps[2].detail.input, /python3 -c/)
  assert.deepEqual(approvals, ['Ola wants to run code on its computer', 'Ola wants to write a file'])
  assert.equal(state.approval, null)
  assert.match(turn.answer, /there are 56/)
  assert.match(runSummary(turn), /^Worked for \d+ s · 4 steps · changed 1 file$/)
})

test('a real GLM run on Together: absolute paths become file names', () => {
  const { state } = replay('glm-ask.jsonl')
  const turn = state.turns[0]
  assert.equal(turn.status, 'done')
  const said = turn.steps.map((s) => `${s.verb}${s.object ? ` ${s.object}` : ''}`)
  assert.deepEqual(said, ['Looked for survey.csv', 'Ran a short program', 'Wrote rows.md', 'Read survey.csv'])
  assert.ok(!said.join(' ').includes('/var/'), 'no machine paths in the words')
  assert.match(turn.answer, /56/)
})

test('the stored history rebuilds the same turn', () => {
  const { messages } = replay('glm-ask.jsonl')
  const turns = turnsFromMessages(messages, null)
  assert.equal(turns.length, 1)
  assert.equal(turns[0].status, 'done')
  assert.equal(turns[0].steps.length, 4)
  assert.equal(turns[0].steps[1].verb, 'Ran a short program')
  assert.match(turns[0].answer, /56/)
})

test('events for another session change nothing', () => {
  const state = emptyConversation()
  state.sessionID = 'ses_a'
  startTurn(state, 'hello')
  assert.equal(applyEvent(state, { type: 'session.execution.succeeded', data: { sessionID: 'ses_b' } }), false)
  assert.equal(state.turns[0].status, 'sending')
})

test('a failed run and a rejected approval are said out loud', () => {
  const state = emptyConversation()
  state.sessionID = 's'
  startTurn(state, 'x', 0)
  applyEvent(state, { type: 'session.tool.input.started', created: 1, data: { sessionID: 's', id: 't1', name: 'shell' } })
  applyEvent(state, { type: 'session.tool.called', created: 2, data: { sessionID: 's', id: 't1', input: { command: 'rm -rf data' } } })
  applyEvent(state, { type: 'permission.asked', created: 3, data: { sessionID: 's', id: 'p1', action: 'shell', resources: ['rm -rf data'], source: { id: 't1' } } })
  assert.equal(state.turns[0].steps[0].status, 'waiting')
  applyEvent(state, { type: 'permission.replied', created: 4, data: { sessionID: 's', requestID: 'p1', reply: 'reject' } })
  assert.equal(state.turns[0].steps[0].status, 'failed')
  assert.match(state.turns[0].steps[0].error!, /You said no/)
  applyEvent(state, { type: 'session.execution.failed', created: 5, data: { sessionID: 's', error: { type: 'provider', message: 'upstream 400', status: 400 } } })
  assert.equal(state.turns[0].status, 'failed')
  assert.match(state.turns[0].error!.text, /could not take this request/)
})

test('words for common commands and tools', () => {
  assert.equal(describeCommand('python3 clean.py --in survey.csv').object, 'clean.py')
  assert.equal(describeCommand("python3 -c 'print(1)'").verb, 'Ran a short program')
  assert.equal(describeCommand('wc -l survey.csv').verb, 'Counted the lines in')
  assert.equal(describeCommand("awk 'END{print NR}' survey.csv").verb, 'Ran a short program')
  assert.equal(describeCommand('sort -u names.txt').object, 'sort')
  assert.equal(describeTool('grep', { pattern: 'eviction' }, null).object, '“eviction”')
  assert.equal(describeTool('mystery', {}, null).verb, 'Used')
  assert.equal(shortPath('/w/x/notes/a.md', '/w/x'), 'notes/a.md')
  assert.match(runProblem({ status: 429, message: 'insufficient_quota' }).text, /share/)
})
