// Replays recorded opencode 2.3.0 events (scripts/record-events.mjs) through the drawer's
// reducer and checks what a person would read. Run: npm test (Node 23.6+ strips the types).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyEvent, emptyConversation, LOST_IN_RESTART, mergeResync, runSummary, startTurn, switchOf, turnsFromMessages } from '../src/lib/conversation.ts'
import { describeCommand, describeTool, ESCALATE, escalation, NUDGE, nudgeOf, precheck, quotaProblem, runProblem, stepProblem, shortPath, STRETCH_CHECKS, STRETCH_WHY, testRan } from '../src/lib/steps.ts'

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

test('a tab that watched the run and one that loaded it later say the same "Worked for" (OLA-87)', () => {
  for (const file of ['fake-ask.jsonl', 'glm-ask.jsonl']) {
    const { state, messages } = replay(file)
    // The page that sent it started its clock earlier than Ola's computer received it.
    const live = state.turns[0]
    const loaded = turnsFromMessages(messages, null)[0]
    assert.equal(live.at, loaded.at, file)
    assert.equal(live.ended, loaded.ended, file)
    assert.equal(runSummary(live), runSummary(loaded), file)
  }
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

test('a question from Ola (opencode raises a form) waits on its step, and the answer lets the run go on', () => {
  const state = emptyConversation()
  state.sessionID = 's'
  startTurn(state, 'Make a page, ask me which one', 1)
  applyEvent(state, { type: 'session.tool.input.started', created: 2, data: { sessionID: 's', id: 'call_q', name: 'question' } })
  applyEvent(state, { type: 'session.tool.called', created: 3, data: { sessionID: 's', id: 'call_q', input: { questions: [{ question: 'Which town?', header: 'Town', options: [{ label: 'A', description: 'a' }] }] } } })
  // The form carries its session inside it, not at the top of the event.
  applyEvent(state, { type: 'form.created', created: 4, data: { form: { id: 'frm_1', sessionID: 's', title: 'Questions', metadata: { kind: 'question', tool: { id: 'call_q' } }, fields: [{ key: 'q0', title: 'Town', description: 'Which town?', type: 'string', options: [{ value: 'A', label: 'A', description: 'a' }], custom: true }] } } })
  assert.equal(state.question?.id, 'frm_1')
  assert.equal(state.question?.fields[0].text, 'Which town?')
  assert.deepEqual(state.question?.fields[0].options.map((o) => o.label), ['A'])
  assert.equal(state.turns[0].steps[0].status, 'waiting')
  assert.equal(`${state.turns[0].steps[0].verb} ${state.turns[0].steps[0].object}`, 'Asked you Which town?')
  // Another session's form is not ours.
  applyEvent(state, { type: 'form.created', created: 5, data: { form: { id: 'frm_2', sessionID: 'other', fields: [{ key: 'q0', type: 'string' }] } } })
  assert.equal(state.question?.id, 'frm_1')
  applyEvent(state, { type: 'form.replied', created: 6, data: { id: 'frm_1', sessionID: 's', answer: { q0: 'A' } } })
  assert.equal(state.question, null)
  assert.equal(state.turns[0].steps[0].status, 'running')
})

test('words for common commands and tools', () => {
  assert.equal(describeCommand('python3 clean.py --in survey.csv').object, 'clean.py')
  assert.equal(describeCommand("python3 -c 'print(1)'").verb, 'Ran a short program')
  assert.equal(describeCommand('wc -l survey.csv').verb, 'Counted the lines in')
  // Ola's own commands are said as what they do, never by name (first-user pass: "Ran ola-page").
  assert.deepEqual(describeCommand('ola-page index.html --width 390 --out shot.png'), { icon: 'check', verb: 'Looked at how the page shows', object: 'index.html' })
  // OLA-474: the agent's own checks of its code.
  assert.deepEqual(describeCommand('ola-test calc.js calc.test.js'), { icon: 'check', verb: 'Tested', object: 'calc.js' })
  assert.equal(describeCommand('/opt/ola/bin/ola-ocr --pages 2 scans/study-3.pdf').object, 'study-3.pdf')
  assert.equal(describeCommand('ola-translate ley.md --to en').verb, 'Translated')
  assert.equal(describeCommand('ola-something-new x').verb, 'Used one of Ola’s tools')
  assert.equal(describeCommand('ola-batch propose spec.json').verb, 'Wrote down a job')
  assert.equal(describeCommand('ola-batch status').verb, 'Checked on the job')
  assert.equal(describeCommand('sleep 20').verb, 'Waited')
  for (const c of ['ola-page a.html --out s.png', 'ola-see chart.png', 'ola-draw "a cat"', 'ola-batch start', 'ola-unzip lib.zip'])
    assert.ok(!/ola-/.test(`${describeCommand(c).verb} ${describeCommand(c).object}`), c)
  assert.equal(describeCommand("awk 'END{print NR}' survey.csv").verb, 'Ran a short program')
  assert.equal(describeCommand('sort -u names.txt').object, 'sort')
  assert.equal(describeTool('grep', { pattern: 'eviction' }, null).object, '“eviction”')
  assert.equal(describeTool('mystery', {}, null).verb, 'Used')
  assert.equal(shortPath('/w/x/notes/a.md', '/w/x'), 'notes/a.md')
  // The allowance used up, in plain words with the day it starts again (OLA-205).
  const quota = runProblem({ status: 429, message: 'insufficient_quota' }).text
  assert.match(quota, /^Your weekly allowance of Ola's model is used up\. It starts again (on|at the start of) [A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}/)
  assert.doesNotMatch(quota, /gateway|setting|raise|Bart|token|share/i)
  const proj = runProblem({ status: 429, message: "This project's weekly allowance of Ola's model is used up. It starts again on Sunday, November 22, at 4 pm Pacific time." }).text
  assert.match(proj, /^This project's weekly allowance/)
  const old = quotaProblem("this week's quota of 100 tokens is used up; it resets at 2026-11-23T00:00:00.000Z")
  const local = new Date('2026-11-23T00:00:00.000Z')
  assert.match(old, /^This project's weekly allowance of Ola's model is used up\. It starts again (on|at the start of) /)
  assert.ok(old.includes(local.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })), old)
  // No instant in the message: the next Monday 00:00 UTC after now.
  assert.ok(quotaProblem('insufficient_quota', Date.parse('2026-11-19T12:00:00Z')).includes(new Date('2026-11-23T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })))
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

test('the simple confidence check: many documents, or design, before a run (OLA-144)', () => {
  const docs = Array.from({ length: 24 }, (_, i) => ({ path: `reports/report-${i + 1}.pdf`, size: 200_000 }))
  assert.equal(precheck('Go through every report and list the landlords named in each', docs), 'many_files')
  assert.equal(precheck('Summarize all the PDFs', docs), 'many_files')
  assert.equal(precheck('Summarize all the PDFs', docs.slice(0, 19)), null, 'nineteen documents are not many')
  assert.equal(precheck('Tell me about the reports from every landlord meeting we held this year, in order, please', docs.slice(0, 5)), null)
  const eight = docs.slice(0, 8).map((f) => f.path.split('/').pop()).join(', ')
  assert.equal(precheck(`Compare ${eight}`, docs.slice(0, 8)), 'many_files', 'eight files named')
  assert.equal(precheck('Compare report-1.pdf and report-2.pdf', docs), null, 'two files named')
  // OLA-168: design goes to the design model, so no card before a design run; the check stays, switched off.
  assert.equal(precheck('Design a landing page for the tenants’ union', []), null)
  assert.equal(precheck('Design a landing page for the tenants’ union', [], { ...STRETCH_CHECKS, designBeforeRun: true }), 'design')
  assert.equal(precheck('Make a poster for the block party on Saturday', []), null)
  assert.equal(precheck('Build me a personal homepage', []), null)
  assert.equal(precheck('What does the design of this survey miss?', []), null, 'asked about, not asked to make')
  assert.equal(precheck('Count the rows in survey.csv', []), null)
  assert.equal(precheck('Make a chart of answers by city', []), null)
  assert.match(STRETCH_WHY.many_files, /many documents/)
  assert.match(STRETCH_WHY.design, /Design/)
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

test('a request the computer lost in a restart stays on the page, said plainly (first-user pass, B12)', () => {
  const s = emptyConversation()
  const t0 = 1_800_000_000_000
  startTurn(s, 'How many households came?', t0)
  // The computer has nothing of it after the reconnect: kept, failed, with the sentence.
  const merged = mergeResync(s.turns, [], t0 + 30_000)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].status, 'failed')
  assert.equal(merged[0].error?.text, LOST_IN_RESTART)
  // Sent a moment ago: kept as it is, not failed yet.
  assert.equal(mergeResync(s.turns, [], t0 + 3000)[0].status, 'sending')
  // The computer has it: its version wins, nothing doubled.
  const server = [{ ...s.turns[0], id: 'msg_1', status: 'working' as const, at: t0 + 400 }]
  const both = mergeResync(s.turns, server, t0 + 30_000)
  assert.equal(both.length, 1)
  assert.equal(both[0].id, 'msg_1')
  // Only requests newer than the last one the computer has are carried over.
  const old = { ...s.turns[0], request: 'Older question', at: t0 - 60_000, status: 'done' as const }
  assert.equal(mergeResync([old], server, t0 + 30_000).length, 1)
})

test('a switch (OLA-157): a fallback right after a cheaper engine had the last turn, with that turn’s message id when the page has one', () => {
  const t = (id: string, engine?: 'claude' | 'hosted') => ({ id, request: 'r', at: 0, status: 'done', steps: [], answer: '', notes: [], error: null, notice: null, ended: 1, ...(engine ? { engine } : {}) }) as any
  assert.equal(switchOf([], 'claude'), null, 'nothing before it')
  assert.deepEqual(switchOf([t('msg_a1')], 'claude'), { switchedFrom: 'ola', fromMessage: 'msg_a1' })
  assert.deepEqual(switchOf([t('msg_a1')], 'hosted'), { switchedFrom: 'ola', fromMessage: 'msg_a1' })
  assert.deepEqual(switchOf([t('msg_a1'), t('local-1763600000', 'hosted')], 'claude'), { switchedFrom: 'hosted' }, 'a turn the page has no id for: no id')
  assert.deepEqual(switchOf([t('local-1763600000')], 'claude'), { switchedFrom: 'ola' })
  assert.equal(switchOf([t('claude-1', 'claude')], 'claude'), null, 'Claude again')
  assert.equal(switchOf([t('claude-1', 'claude')], 'hosted'), null, 'down the ladder')
  assert.equal(switchOf([t('x', 'hosted')], 'hosted'), null, 'the same engine')
})

// OLA-250, Nov 22 (the Mac app, the same fold as here): a question for a step that had already run
// came up as a card, the step was shown as "did not finish", and the card could not be answered.
test('a question for a step that ended is no card, and a card goes when its step or the run ends', () => {
  const live = 'python3 /opt/ola/skills/publish/scripts/publish.py live https://sites.ola.cx/bart/ --expect site 2>&1'
  const s = 's'
  const state = emptyConversation()
  state.sessionID = s
  // Read through a function: assert.equal narrows a property it was given to null for the type checker.
  const card = () => state.approval
  startTurn(state, 'publish it again', 1)
  applyEvent(state, { type: 'session.execution.started', created: 2, data: { sessionID: s } })
  applyEvent(state, { type: 'session.tool.input.started', created: 3, data: { sessionID: s, id: 't1', name: 'shell' } })
  applyEvent(state, { type: 'session.tool.called', created: 3, data: { sessionID: s, id: 't1', input: { command: live } } })
  applyEvent(state, { type: 'session.tool.success', created: 4, data: { sessionID: s, id: 't1', content: [{ type: 'text', text: 'live' }], metadata: { exit: 0 } } })
  // The late copy of its question.
  applyEvent(state, { type: 'permission.asked', created: 5, data: { sessionID: s, id: 'p1', action: 'shell', resources: [live], source: { id: 't1' } } })
  assert.equal(card(), null, 'a card for a step that already ran')
  assert.equal(state.turns[0].steps[0].status, 'done')

  // A card in its time goes when its step ends.
  applyEvent(state, { type: 'session.tool.input.started', created: 6, data: { sessionID: s, id: 't2', name: 'shell' } })
  applyEvent(state, { type: 'session.tool.called', created: 6, data: { sessionID: s, id: 't2', input: { command: 'ls' } } })
  applyEvent(state, { type: 'permission.asked', created: 7, data: { sessionID: s, id: 'p2', action: 'shell', resources: ['ls'], source: { id: 't2' } } })
  assert.equal(card()?.id, 'p2')
  applyEvent(state, { type: 'session.tool.success', created: 8, data: { sessionID: s, id: 't2', content: [], metadata: { exit: 0 } } })
  assert.equal(card(), null, 'the step ran: its card is over')
  // OLA-479 (below): nothing here was cut off at the length limit.
  assert.equal(state.turns[0].cutOff, undefined)

  // One still up when the run ends goes with it.
  applyEvent(state, { type: 'session.tool.input.started', created: 9, data: { sessionID: s, id: 't3', name: 'shell' } })
  applyEvent(state, { type: 'permission.asked', created: 9, data: { sessionID: s, id: 'p3', action: 'shell', resources: ['ls'], source: { id: 't3' } } })
  applyEvent(state, { type: 'session.execution.succeeded', created: 10, data: { sessionID: s } })
  assert.equal(card(), null, 'the run ended with a card still up')
  assert.equal(state.turns[0].status, 'done')
  assert.equal(state.turns[0].steps[0].status, 'done', 'a step that ran is shown as "did not finish"')
})

test('OLA-479: Ola counts failed test rounds, the same step again and replies cut off at the length limit; the model is not asked', () => {
  const sh = (command: string, status = 'done') => ({ tool: 'shell', status, detail: { input: command } })
  const write = (path: string, content: string) => ({ tool: 'write', status: 'done', detail: { input: JSON.stringify({ path, content }) } })
  const turn = (steps: any[], cutOff = 0) => ({ request: 'Build a tiny spreadsheet', steps, cutOff })
  assert.equal(ESCALATE.failedTestRounds, 2)
  assert.equal(ESCALATE.sameSteps, 3)
  assert.equal(ESCALATE.lengthHits, 2)
  assert.equal(escalation(turn([sh('ola-test calc.js calc.test.js', 'failed')])), null, 'one failed round is not two')
  assert.equal(escalation(turn([sh('ola-test calc.js calc.test.js', 'failed'), write('calc.js', 'v2'), sh('ola-test calc.js calc.test.js', 'failed')])), 'tests')
  assert.equal(escalation(turn([sh('ola-test calc.js calc.test.js', 'failed'), sh('ola-test calc.js calc.test.js')])), null, 'a failed round then a passing one')
  assert.equal(escalation(turn([sh('ls'), sh('ls'), sh('ls')])), 'loop', 'the same command three times')
  assert.equal(escalation(turn([write('a.html', 'x'), write('a.html', 'x'), write('a.html', 'x')])), 'loop', 'the same file written again with the same words')
  assert.equal(escalation(turn([sh('cat a.html'), write('a.html', 'v2'), sh('cat a.html'), write('a.html', 'v3'), sh('cat a.html')])), null, 'reading a file again after changing it is not a loop')
  assert.equal(escalation(turn([], 1)), null)
  assert.equal(escalation(turn([], 2)), 'length')
  assert.ok(testRan({ steps: [sh('ola-test calc.js calc.test.js')] }))
  assert.ok(testRan({ steps: [sh('/opt/ola/bin/ola-test index.html t.js')] }))
  assert.ok(!testRan({ steps: [sh('cat calc.test.js'), sh('ola-page index.html --out .shots/a.png')] }), 'reading a test file or looking at a page is not a test')
  // What computes, and what only shows things (that keeps the fast path: no test, no nudge).
  for (const r of ['Build a tiny spreadsheet in one page', 'make a tip calculator', 'a memory game for my class', 'a page that totals our dues']) assert.ok(ESCALATE.computes.test(r), r)
  for (const r of ['Make a good morning page with the weather', 'a page for our block party on Saturday', 'Write a flyer for the garden club']) assert.ok(!ESCALATE.computes.test(r), r)
  for (const r of ['tests', 'loop', 'length', 'untested'] as const) assert.ok(STRETCH_WHY[r].length > 10)
  // The nudge is Ola's, shown as Ola's.
  assert.deepEqual(nudgeOf('make a calculator'), { request: 'make a calculator', nudge: false })
  assert.equal(nudgeOf(NUDGE).nudge, true)
  assert.ok(NUDGE.includes('ola-test'))
})

test('OLA-479: a reply cut off at the length limit is counted, live and in the stored history; the nudge turn is marked', () => {
  const s = 'ses_len'
  const state = emptyConversation()
  state.sessionID = s
  startTurn(state, 'Build a tiny spreadsheet', 1)
  applyEvent(state, { type: 'session.step.ended', created: 2, data: { sessionID: s, finish: 'length' } })
  applyEvent(state, { type: 'session.step.ended', created: 3, data: { sessionID: s, finish: 'tool-calls' } })
  assert.equal(state.turns[0].cutOff, 1)
  startTurn(state, NUDGE, 4)
  assert.equal(state.turns[1].nudge, true)
  assert.ok(!state.turns[1].request.includes('<ola-nudge>'))
  const turns = turnsFromMessages([
    { id: 'u1', type: 'user', text: 'Build a tiny spreadsheet', time: { created: 1 } },
    { id: 'a1', type: 'assistant', finish: 'length', content: [], time: { created: 2 } },
    { id: 'a2', type: 'assistant', finish: 'length', content: [], time: { created: 3 } },
    { id: 'u2', type: 'user', text: NUDGE, time: { created: 4 } },
  ], null)
  assert.equal(turns[0].cutOff, 2)
  assert.equal(escalation(turns[0]), 'length')
  assert.equal(turns[1].nudge, true)
})
