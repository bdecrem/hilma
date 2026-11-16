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
// A request whose text contains "please fail" gets a 400, so the page's error path can be seen.
// A request whose text contains "slow <steps>x<ms>" (say "slow 5x2000") is a long run instead:
// <steps> folder listings, each reply held <ms> first, then a one-line answer. The front desk's
// checks use it for runs longer than the idle limit, and longer than the run ceiling.
import http from 'node:http'

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

export function startFakeModel() {
  let calls = 0
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
    const messages = body.messages ?? []
    if (/please fail/i.test(lastUserText(messages))) return send(400, { error: { message: 'The model refused this request (scripted failure).', type: 'invalid_request_error' } })
    // Titles and other side calls carry no tools: answer them briefly.
    if (!body.tools?.length) return send(200, reply({ content: 'Counting the survey rows' }))
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
    return send(200, reply({ content: `I counted the rows in survey.csv with a short program: there are ${count}, not counting the header. I wrote that down in rows.md.` }))
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port, calls: () => calls })))
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
