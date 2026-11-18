// A scripted stand-in for the model server, so the checks can drive opencode, the gateway and
// the page end to end without spending a model call. It speaks just enough of OpenAI's
// /v1/chat/completions (whole replies; the gateway never asks upstream to stream) and plays
// the same short task every time, using opencode's real tools:
//
//   1. list the folder            (glob)
//   2. read survey.csv            (read)
//   3. count its rows with code   (bash)  <- under "Ask me first" this waits for the person
//   4. write rows.md              (write)
//   5. answer in two sentences
//
// Reactions (README): "great job" or "thank you" gets the reaction line alone, "[[ola:react thanks]]";
// "say hi on one line" gets "[[ola:react ok]] Hello!" (a marker on the same line as text, which the
// real model sometimes writes: not a reaction, and the page must not show it).
// A request whose text contains "please fail" gets a 400, so the page's error path can be seen.
// A request whose text contains "slow <steps>x<ms>" (say "slow 5x2000") is a long run instead:
// <steps> folder listings, each reply held <ms> first, then a one-line answer. The front desk's
// checks use it for runs longer than the idle limit, and longer than the run ceiling.
// A request whose text contains "a long answer of <n> KB" gets one plain-text answer that long (the
// front desk's checks use it for a conversation larger than one opencode reply used to be read, OLA-131).
import http from 'node:http'
import { batchAnswer, isBatchRequest, newBatchState } from './fake-batch.mjs'
import { isTwinRequest, twinAnswer } from './fake-twin.mjs'

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) return m.content.map((p) => p.text ?? '').join(' ')
  }
  return ''
}

function pick(tools, ...names) {
  const have = new Set((tools ?? []).map((t) => t.function?.name))
  return names.find((n) => have.has(n)) ?? null
}

// The tool's own name for its file argument (opencode 2.3.0 says `path`; older ones `filePath`).
function pathKey(tools, name) {
  const props = (tools ?? []).find((t) => t.function?.name === name)?.function?.parameters?.properties ?? {}
  return 'path' in props ? 'path' : 'filePath' in props ? 'filePath' : 'path'
}

function plan(tools, count) {
  const steps = []
  const glob = pick(tools, 'glob', 'list', 'ls')
  if (glob) steps.push([glob, glob === 'glob' ? { pattern: '*' } : { path: '.' }])
  const read = pick(tools, 'read')
  if (read) steps.push([read, { [pathKey(tools, read)]: 'survey.csv' }])
  const bash = pick(tools, 'shell', 'bash')
  if (bash) steps.push([bash, { command: "python3 -c \"import csv; print(sum(1 for _ in csv.reader(open('survey.csv'))) - 1)\"", description: 'Count the rows in survey.csv' }])
  const write = pick(tools, 'write')
  if (write) steps.push([write, { [pathKey(tools, write)]: 'rows.md', content: `# Rows in survey.csv\n\nThe export has ${count} data rows, counted by a short program.\n` }])
  return steps
}

// startFakeModel({ hosted: true }) plays the hosted open model instead: the same task, its answers
// say so ("the hosted open model"), and "please fail" does not fail there (a request Ola's own
// model could not do is the one handed to it).
export function startFakeModel({ hosted = false } = {}) {
  let calls = 0
  const batch = newBatchState()
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const send = (status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    if (req.url?.endsWith('/models')) return send(200, { object: 'list', data: [{ id: 'fake', object: 'model' }] })
    if (!req.url?.endsWith('/chat/completions')) return send(404, { error: { message: 'not found' } })
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return send(400, { error: { message: 'bad json' } })
    }
    calls++
    // "Compare with Claude": Ola's own model making a made-up copy of a task (fake-twin.mjs).
    if (isTwinRequest(body)) {
      const a = twinAnswer(body)
      const r = reply({ content: a.content })
      r.usage = { prompt_tokens: a.prompt, completion_tokens: a.completion, total_tokens: a.prompt + a.completion }
      return send(200, r)
    }
    // A batch job's form (workspace/ola-batch): answered from the document, with planted wrong
    // quotes for the checker to catch (fake-batch.mjs).
    if (isBatchRequest(body)) {
      batch.inflight++
      batch.maxInflight = Math.max(batch.maxInflight, batch.inflight)
      try {
        if (batch.delayMs) await new Promise((r) => setTimeout(r, batch.delayMs))
        if (res.destroyed || !res.socket || res.socket.destroyed) return
        const a = batchAnswer(body, batch)
        const r = reply({ content: a.content })
        r.usage = { prompt_tokens: a.prompt, completion_tokens: a.completion, total_tokens: a.prompt + a.completion }
        return send(200, r)
      } finally {
        batch.inflight--
      }
    }
    const messages = body.messages ?? []
    if (!hosted && /please fail/i.test(lastUserText(messages))) return send(400, { error: { message: 'The model refused this request (scripted failure).', type: 'invalid_request_error' } })
    // Titles and other side calls carry no tools: answer them briefly.
    if (!body.tools?.length) return send(200, reply({ content: 'Counting the survey rows' }))
    if (/great job|thank you/i.test(lastUserText(messages))) return send(200, reply({ content: '[[ola:react thanks]]' }))
    if (/say hi on one line/i.test(lastUserText(messages))) return send(200, reply({ content: '[[ola:react ok]] Hello!' }))
    const long = /\ba long answer of (\d{1,4}) KB\b/i.exec(lastUserText(messages))
    if (long) return send(200, reply({ content: 'The made-up survey has thirty rows. '.repeat(Math.ceil((Number(long[1]) * 1024) / 36)) }))
    const slow = /\bslow (\d{1,3})x(\d{1,6})\b/.exec(lastUserText(messages))
    if (slow) {
      let since = -1
      messages.forEach((m, i) => m.role === 'user' && (since = i))
      const done = messages.slice(since + 1).filter((m) => m.role === 'tool').length
      const glob = pick(body.tools, 'glob', 'list', 'ls')
      await new Promise((r) => setTimeout(r, Number(slow[2])))
      if (res.destroyed || !res.socket || res.socket.destroyed) return // the caller went away (an interrupt)
      if (glob && done < Number(slow[1])) return send(200, reply({ tool: { id: `call_${calls}_${done}`, name: glob, args: glob === 'glob' ? { pattern: '*' } : { path: '.' } } }))
      return send(200, reply({ content: `Done after ${done} slow steps.` }))
    }
    // "search the web for <words>": one ola-search (which asks the person first), then an answer.
    const web = /search the web for (.{1,120})$/i.exec(lastUserText(messages).trim())
    if (web) {
      let since = -1
      messages.forEach((m, i) => m.role === 'user' && (since = i))
      const done = messages.slice(since + 1).filter((m) => m.role === 'tool').length
      const bash = pick(body.tools, 'shell', 'bash')
      if (bash && done === 0) return send(200, reply({ tool: { id: `call_${calls}_0`, name: bash, args: { command: `ola-search "${web[1].replace(/["\\$`]/g, '')}"`, description: 'Search the web' } } }))
      return send(200, reply({ content: 'I did not search the web, so I worked from your files only.' }))
    }
    // "ask me which one": opencode's own `question` tool (a question to the person, with choices),
    // then an answer that names what came back. The page must show the question and send the answer.
    if (/ask me which one/i.test(lastUserText(messages))) {
      let since = -1
      messages.forEach((m, i) => m.role === 'user' && (since = i))
      const results = messages.slice(since + 1).filter((m) => m.role === 'tool')
      const q = pick(body.tools, 'question')
      if (q && !results.length)
        return send(200, reply({ tool: { id: `call_${calls}_q`, name: q, args: { questions: [{ question: 'Which made-up town should the page be about?', header: 'Which town', options: [{ label: 'Springfield', description: 'The river town' }, { label: 'Shelbyville', description: 'The one across the river' }] }] } } }))
      const got = results.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''))).join(' ')
      return send(200, reply({ content: q ? `You answered: ${got.replace(/\s+/g, ' ').slice(0, 300)}` : 'I had no way to ask you, so I picked Springfield.' }))
    }
    // "draw the delta": the drawing run (Open for every kind). Writes two SVG drawings (one of them
    // hostile: a script, an onload, an outside picture), a table and a note, then answers with a
    // citation in the agreed form, so the page shows the pictures inline, Open for the rest, and
    // a citation link that opens report.pdf at page 2.
    if (/draw the delta/i.test(lastUserText(messages))) {
      let since = -1
      messages.forEach((m, i) => m.role === 'user' && (since = i))
      const done = messages.slice(since + 1).filter((m) => m.role === 'tool').length
      const write = pick(body.tools, 'write')
      const files = [
        ['delta.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><rect width="400" height="220" fill="#f7f0e3"/><path d="M0 160 C120 120 200 200 400 150 V220 H0 Z" fill="#25407a"/><circle cx="320" cy="60" r="28" fill="#e9a23b"/><text x="24" y="48" font-size="22" font-family="sans-serif" fill="#1d1a16">A made-up delta</text></svg>\n'],
        ['hostile-drawing.svg', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 300 120" onload="fetch(\'http://127.0.0.1:9/svg-onload\')"><script>fetch("http://127.0.0.1:9/svg-script"); new Image().src = "http://127.0.0.1:9/svg-img"</script><image href="http://127.0.0.1:9/svg-image.png" width="10" height="10"/><rect width="300" height="120" fill="#c85a2b"/></svg>\n'],
        ['totals.csv', 'district,households\nNorth,100\nSouth,137\n'],
        ['notes.md', '# Notes\n\nThe drawings are made up.\n'],
      ]
      if (write && done < files.length) return send(200, reply({ tool: { id: `call_${calls}_${done}`, name: write, args: { [pathKey(body.tools, write)]: files[done][0], content: files[done][1] } } }))
      return send(200, reply({ content: 'I drew the delta in delta.svg and a second drawing, and put the numbers in totals.csv. The money for the dikes is on page 2 of the report: [report.pdf, p. 2](doc:report.pdf#page=2).' }))
    }
    // Where are we in the script? Count the tool results since the last user message.
    let lastUser = -1
    messages.forEach((m, i) => m.role === 'user' && (lastUser = i))
    const results = messages.slice(lastUser + 1).filter((m) => m.role === 'tool')
    const done = results.length
    // The count is whatever the program printed (the third tool result), not a scripted number.
    const printed = results.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')))
    const count = /\b(\d+)\b/.exec(printed[2] ?? '')?.[1] ?? 'an unknown number of'
    const steps = plan(body.tools, count)
    if (done < steps.length) {
      const [name, args] = steps[done]
      return send(200, reply({ tool: { id: `call_${calls}_${done}`, name, args } }))
    }
    return send(200, reply({ content: `${hosted ? 'The hosted open model here. ' : ''}I counted the rows in survey.csv with a short program: there are ${count}, not counting the header. I wrote that down in rows.md.` }))
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port, calls: () => calls, batch })))
}

function reply({ content = null, tool = null }) {
  return {
    id: `fake-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'fake',
    choices: [
      {
        index: 0,
        finish_reason: tool ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content,
          ...(tool ? { tool_calls: [{ id: tool.id, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } : {}),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  }
}
