// A project's own requests that ended well as worked examples (OLA-181, frontdesk/examples.mjs) without a
// workspace: which turns count as ended well, what is kept (the request, the files written, the tries after
// the last change, never output), that it is written with `ola-db examples` (the real tool, on a folder that
// stands in for /work), taken out on "This was wrong", a handover or a deleted conversation, and that the
// plugin shows it as "(from this project)". Run: node --test frontdesk/test/examples.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { exampleOfTurn, makeExamples } from '../examples.mjs'
import { FROM_PROJECT, NOTE_END, NOTE_HEAD, onContext, reset } from '../../workspace/plugins/ola-examples/index.js'

const OLA_DB = fileURLToPath(new URL('../../workspace/ola-db', import.meta.url))
const tool = (name, input, status = 'completed', exit = 0) => ({ type: 'tool', id: `t${Math.random()}`, name, state: { status, input, metadata: { exit } } })
const GOOD = [
  tool('shell', { command: 'ls' }),
  tool('write', { filePath: '/work/index.html', content: '<html>secret words of the page</html>' }),
  tool('shell', { command: 'ola-page index.html --out .shots/a.png --text' }),
  tool('edit', { filePath: '/work/index.html', oldString: 'a', newString: 'b' }),
  tool('shell', { command: 'ola-page index.html --out .shots/try.png --do "click + Elm Street" --text' }),
  tool('shell', { command: 'python3 look.py index.html' }),
]
const REQ = 'make a page that counts the bike racks on each street of our block, with a plus button for each street'
// A conversation as opencode lists it (newest last): an earlier turn, then this one.
const turn = ({ request = REQ, tools = GOOD, answer = 'Built it. I clicked + for Elm Street and it showed 1.', outcome = 'succeeded', id = 'msg_u1' } = {}) => [
  { type: 'user', id: 'msg_u0', text: 'hello', time: { created: 0 } },
  { type: 'assistant', id: 'a0', content: [{ type: 'text', text: 'Hi.' }], time: { created: 1 } },
  { type: 'idle', id: 'i0', outcome: 'succeeded', time: { created: 1.5 } },
  { type: 'user', id, text: `<ola-engines>claude: off</ola-engines>\n${request}`, time: { created: 2 } },
  { type: 'assistant', id: 'a1', model: { id: 'general' }, content: [...tools, { type: 'text', text: answer }], time: { created: 3 } },
  { type: 'idle', id: 'i1', outcome, time: { created: 4 } },
]

test('a turn that ended well: its request (without the engines note), the files written, the tries after the last change', () => {
  const ex = exampleOfTurn(turn())
  assert.deepEqual(ex, {
    session: null,
    turn: 'msg_u1',
    request: REQ,
    built: ['Wrote index.html', 'Changed index.html'],
    tried: ['ola-page index.html --out .shots/try.png --do "click + Elm Street" --text', 'python3 look.py index.html'],
    answer: 'Built it. I clicked + for Elm Street and it showed 1.',
  })
  assert.ok(!JSON.stringify(ex).includes('secret words'), 'no file contents')
})

test('turns that did not end well, or are not a request to make something, are not examples', () => {
  assert.ok(exampleOfTurn(turn()))
  assert.equal(exampleOfTurn(turn({ outcome: 'failed' })), null, 'failed')
  assert.equal(exampleOfTurn(turn({ outcome: 'interrupted' })), null, 'stopped by the person')
  assert.equal(exampleOfTurn(turn({ answer: "I can't build pages from here." })), null, 'a refusal')
  assert.equal(exampleOfTurn(turn({ request: 'summarize these meeting minutes' })), null, 'not a request to make something')
  assert.equal(exampleOfTurn(turn({ tools: [GOOD[1]] })), null, 'written, never tried')
  assert.equal(exampleOfTurn(turn({ tools: [GOOD[2], GOOD[1]] })), null, 'tried only before the last change')
  assert.equal(exampleOfTurn(turn({ tools: [GOOD[1], tool('shell', { command: 'ola-page index.html --text' }, 'completed', 1)] })), null, 'the try failed')
  assert.equal(exampleOfTurn(turn({ tools: [tool('write', { filePath: '/work/index.html' }, 'error'), GOOD[2]] })), null, 'the only write failed')
  assert.ok(exampleOfTurn(turn({ tools: [tool('shell', { command: 'nope' }, 'completed', 2), ...GOOD] })), 'a failed step that was got past is allowed')
})

function project() {
  const work = mkdtempSync(path.join(tmpdir(), 'ola-ex-work-'))
  const run = (args, input) => {
    const r = spawnSync('python3', ['-I', OLA_DB, 'examples', ...args], { input, encoding: 'utf8', env: { ...process.env, OLA_WORK: work } })
    return { code: r.status, out: r.stdout }
  }
  return { work, file: path.join(work, '.ola', 'examples.json'), run }
}

test('fromRun writes it into the project with ola-db examples; This was wrong, a handover and a delete take it out', async () => {
  const p = project()
  let list = turn()
  const logs = []
  const ex = makeExamples({
    settleMs: 0,
    log: (m) => logs.push(m),
    workspaces: { oc: async () => ({ json: { data: list } }), examples: async (slug, args, input) => p.run(args, input) },
  })
  assert.equal(await ex.fromRun('p1', 'ses_one', 'failed'), false, 'only a run that succeeded')
  assert.equal(await ex.fromRun('p1', 'ses_one', 'succeeded'), true)
  const kept = JSON.parse(readFileSync(p.file, 'utf8')).examples
  assert.deepEqual(kept.map((e) => [e.source, e.session, e.turn, e.request]), [['project', 'ses_one', 'msg_u1', REQ]])
  assert.ok(logs.every((l) => !l.includes('bike')), 'the log has no words of the request')
  // This was wrong on that turn
  assert.equal(await ex.forget('p1', 'ses_one', 'msg_u1'), 1)
  assert.equal(JSON.parse(p.run(['--json']).out).count, 0)
  // kept again, then the next request in the conversation is handed to Claude: the earlier one goes
  await ex.fromRun('p1', 'ses_one', 'succeeded')
  list = [...turn(), { type: 'user', id: 'msg_u2', text: '/claude make it work properly', time: { created: 5 } }, { type: 'assistant', id: 'a2', content: [{ type: 'text', text: 'Done.' }], time: { created: 6 } }, { type: 'idle', id: 'i2', outcome: 'succeeded', time: { created: 7 } }]
  assert.equal(await ex.fromRun('p1', 'ses_one', 'succeeded'), false)
  assert.equal(JSON.parse(p.run(['--json']).out).count, 0, 'handed over: no example from that conversation')
  // a deleted conversation
  list = turn()
  await ex.fromRun('p1', 'ses_two', 'succeeded')
  assert.equal(await ex.forget('p1', 'ses_two'), 1)
  assert.equal(await ex.forget('p1', 'bad id!'), 0, 'an id that is not one is refused before the VM')
})

test('the plugin in that project shows it as "(from this project)", fenced and capped; another project has no such file', async () => {
  const p = project()
  const ex = makeExamples({ settleMs: 0, workspaces: { oc: async () => ({ json: { data: turn() } }), examples: async (slug, args, input) => p.run(args, input) } })
  await ex.fromRun('p1', 'ses_one', 'succeeded')
  reset()
  const ev = { sessionID: 'ses_new', system: [], messages: [{ role: 'user', content: 'make a page that counts the bike racks on each street, with a plus button' }] }
  onContext(ev, { OLA_EXAMPLES_EXTRA: p.file })
  assert.equal(ev.system.length, 1)
  const note = ev.system[0].text
  assert.ok(note.startsWith(`${NOTE_HEAD} ${FROM_PROJECT}`) && note.endsWith(NOTE_END) && note.length <= 2400, note.slice(0, 80))
  assert.ok(note.includes('click + Elm Street'))
  // another project: its own (empty) file, so only the committed test library can be shown
  reset()
  const other = project()
  const ev2 = { sessionID: 'ses_x', system: [], messages: ev.messages }
  onContext(ev2, { OLA_EXAMPLES_EXTRA: other.file })
  assert.ok(ev2.system.every((s) => !s.text.includes(FROM_PROJECT) && !s.text.includes('bike')))
  reset()
})
