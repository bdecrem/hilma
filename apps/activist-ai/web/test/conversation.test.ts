// Replays recorded opencode 2.3.0 events (scripts/record-events.mjs) through the drawer's
// reducer and checks what a person would read. Run: npm test (Node 23.6+ strips the types).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyEvent, emptyConversation, runSummary, startTurn, turnsFromMessages } from '../src/lib/conversation.ts'
import { describeCommand, describeTool, precheck, runProblem, stepProblem, shortPath, STRETCH_CHECKS } from '../src/lib/steps.ts'

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
  // Ola's own commands are said as what they do, never by name (first-user pass: "Ran ola-page").
  assert.deepEqual(describeCommand('ola-page index.html --width 390 --out shot.png'), { icon: 'check', verb: 'Looked at how the page shows', object: 'index.html' })
  assert.equal(describeCommand('/opt/ola/bin/ola-ocr --pages 2 scans/study-3.pdf').object, 'study-3.pdf')
  assert.equal(describeCommand('ola-translate ley.md --to en').verb, 'Translated')
  assert.equal(describeCommand('ola-something-new x').verb, 'Used one of Ola’s tools')
  for (const c of ['ola-page a.html --out s.png', 'ola-see chart.png', 'ola-draw "a cat"', 'ola-batch start', 'ola-unzip lib.zip'])
    assert.ok(!/ola-/.test(`${describeCommand(c).verb} ${describeCommand(c).object}`), c)
  assert.equal(describeCommand("awk 'END{print NR}' survey.csv").verb, 'Ran a short program')
  assert.equal(describeCommand('sort -u names.txt').object, 'sort')
  assert.equal(describeTool('grep', { pattern: 'eviction' }, null).object, '“eviction”')
  assert.equal(describeTool('mystery', {}, null).verb, 'Used')
  assert.equal(shortPath('/w/x/notes/a.md', '/w/x'), 'notes/a.md')
  assert.match(runProblem({ status: 429, message: 'insufficient_quota' }).text, /share/)
})

test('before a run, the stretch checks fire only on far-too-large named files and long multi-part builds', () => {
  const files = [{ path: 'survey.csv', size: 40_000 }, { path: 'archive/minutes-2019-2026.txt', size: 3 * 1024 * 1024 }, { path: 'scan.pdf', size: 90 * 1024 * 1024 }]
  assert.equal(precheck('How many people answered survey.csv?', files), null)
  assert.equal(precheck('Summarize minutes-2019-2026.txt by year', files), 'big_files', 'a 3 MiB text file is ~6 contexts')
  assert.equal(precheck('What is in scan.pdf?', files), null, 'a PDF’s bytes are not its words')
  assert.equal(precheck('Summarize minutes-2019-2026.txt', [{ path: 'archive/minutes-2019-2026.txt', size: 1024 * 1024 }]), null, 'one MiB is two contexts: not "far larger"')
  const parts = Array.from({ length: 8 }, (_, i) => `${i + 1}. a page about part ${i + 1} of our campaign, with its own photo, sources and a short summary`).join('\n')
  const long = `Build a website for the campaign with:\n${parts}\nMake it readable on a phone, with large type, and write the words in a plain, warm voice for new members.`
  assert.ok(long.length >= STRETCH_CHECKS.buildMinChars)
  assert.equal(precheck(long, []), 'long_build')
  assert.equal(precheck(parts.split('\n').slice(0, 7).join('\n') + '\n' + 'x'.repeat(900) + ' build it', []), null, 'seven parts are not many')
})

test('a step by the hosted open model marks the turn; so does its stored message', () => {
  const state = emptyConversation()
  state.sessionID = 'ses_1'
  const turn = startTurn(state, 'hi', 1)
  applyEvent(state, { type: 'session.step.started', data: { sessionID: 'ses_1', model: { id: 'general', providerID: 'ola' } } })
  assert.equal(turn.engine, undefined)
  applyEvent(state, { type: 'session.step.started', data: { sessionID: 'ses_1', model: { id: 'hosted', providerID: 'ola' } } })
  assert.equal(state.turns[0].engine, 'hosted')
  const turns = turnsFromMessages([{ type: 'user', id: 'u1', text: 'hi', time: { created: 1 } }, { type: 'assistant', model: { id: 'hosted', providerID: 'ola' }, content: [{ type: 'text', text: 'hello' }], time: { created: 2 } }], null)
  assert.equal(turns[0].engine, 'hosted')
})

test('a failed step is said in plain words; the machine’s message stays under Show details', () => {
  const p = stepProblem({ message: 'ripgrep execution failed' })
  assert.equal(p.text, 'This step did not work. Ola can try another way.')
  assert.equal(p.detail, 'ripgrep execution failed')
})
