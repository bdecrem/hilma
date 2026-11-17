// A scripted stand-in for Anthropic's Messages API, so the checks can drive Claude Code (inside a
// sealed workspace, through the door and the gateway) without spending a real model call. It
// speaks the streamed /v1/messages Claude Code uses and plays one short task, using Claude Code's
// own tools as its request lists them:
//
//   "write <name> saying <word>"   one Write of /work/<name> holding <word>, then a one-line answer
//   "run <command>"                one Bash call, then a one-line answer with what it printed
//   "please fail"                  a 400 the way Anthropic words one (Claude Code gives up)
//   "slow <n>x<ms>"                n Bash calls of `true`, each reply held <ms> first (long runs)
//   "great job" / "thank you"      only the reaction line, "[[ola:react thanks]]" (README, reactions)
//   anything else                  "Hello from the stand-in." and the end of the turn
//
// Claude Code also sends side requests (a title, a summary, count_tokens): each gets a short text.
// Every reply reports usage, so the gateway counts tokens as it does for Anthropic.
import http from 'node:http'
import { claudeTwinStep, isJudgeRequest, judgeAnswer } from './fake-twin.mjs'

const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (p.type === 'text' ? p.text : '')).join(' ') : '')

/** The first user message that is a person's request (not a tool result). */
function requestText(messages) {
  for (const m of messages ?? []) if (m.role === 'user' && textOf(m.content).trim()) return textOf(m.content)
  return ''
}
const toolResults = (messages) => (messages ?? []).flatMap((m) => (m.role === 'user' && Array.isArray(m.content) ? m.content.filter((p) => p.type === 'tool_result') : []))
const has = (tools, name) => (tools ?? []).some((t) => t.name === name)

export function startFakeAnthropic({ port = 0 } = {}) {
  // bodies: every request body as sent (the checks assert that nothing of a project reached Claude)
  const st = { calls: 0, tasks: 0, reactionsRule: 0, judged: 0, bodies: [] }
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    st.calls++
    if (st.bodies.length < 2000) st.bodies.push(raw)
    let body = {}
    try {
      body = JSON.parse(raw || '{}')
    } catch {}
    if (req.url.startsWith('/v1/messages/count_tokens')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":42}')
    if (!req.url.startsWith('/v1/messages')) return res.writeHead(404).end()
    const ask = requestText(body.messages)
    const done = toolResults(body.messages)
    const main = has(body.tools, 'Write') || has(body.tools, 'Bash')
    let reply = { text: 'Hello from the stand-in.' }
    if (/please fail/.test(ask)) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'The stand-in was asked to fail.' } }))
    const w = /write (\S+) saying (\S+)/.exec(ask)
    const r = /run (.+?)(?:\.|$)/m.exec(ask)
    const s = /slow (\d+)x(\d+)/.exec(ask)
    const twin = main && has(body.tools, 'Bash') ? claudeTwinStep(ask, done) : null
    if (isJudgeRequest(body)) {
      st.judged++
      reply = { text: judgeAnswer(body) }
    } else if (twin) reply = twin
    else if (main && w && has(body.tools, 'Write')) {
      if (!done.length) reply = { tool: 'Write', input: { file_path: `/work/${w[1]}`, content: `${w[2]}\n` } }
      else reply = { text: /denied|reject|not allowed|permission/i.test(JSON.stringify(done.at(-1))) ? `I was not allowed to write ${w[1]}.` : `Done. It is in your Files as ${w[1]}.` }
    } else if (main && s && has(body.tools, 'Bash')) {
      await new Promise((ok) => setTimeout(ok, Number(s[2])))
      reply = done.length < Number(s[1]) ? { tool: 'Bash', input: { command: 'true', description: 'Wait a moment' } } : { text: `Finished ${s[1]} steps.` }
    } else if (main && r && has(body.tools, 'Bash')) {
      if (!done.length) reply = { tool: 'Bash', input: { command: r[1], description: 'Run the command' } }
      else reply = { text: `It printed: ${textOf(done.at(-1).content).trim().slice(0, 200)}` }
    }
    if (main && ask.includes('make the very first line of your reply exactly [[ola:react NAME]]')) st.reactionsRule++
    // The person's own words are the last text block of the first user message (the rule and the context come first).
    const own = (() => { const m = (body.messages ?? []).find((x) => x.role === 'user' && textOf(x.content).trim()); return Array.isArray(m?.content) ? (m.content.filter((p) => p.type === 'text').pop()?.text ?? '') : textOf(m?.content) })()
    if (main && !done.length && /great job|thank you/i.test(own)) reply = { text: '[[ola:react thanks]]' }
    if (main) st.tasks++
    const usage = { input_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }
    const id = `msg_${st.calls}`
    if (!body.stream) {
      const content = reply.tool ? [{ type: 'tool_use', id: `toolu_${st.calls}`, name: reply.tool, input: reply.input }] : [{ type: 'text', text: reply.text }]
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id, type: 'message', role: 'assistant', model: body.model, content, stop_reason: reply.tool ? 'tool_use' : 'end_turn', usage: { ...usage, output_tokens: 20 } }))
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': `req_${st.calls}` })
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    ev('message_start', { message: { id, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage } })
    if (reply.tool) {
      ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: `toolu_${st.calls}`, name: reply.tool, input: {} } })
      ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) } })
    } else {
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: reply.text } })
    }
    ev('content_block_stop', { index: 0 })
    ev('message_delta', { delta: { stop_reason: reply.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
    ev('message_stop', {})
    res.end()
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ st, server, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })))
}

if (process.argv[1]?.endsWith('fake-anthropic.mjs')) {
  const f = await startFakeAnthropic({ port: Number(process.argv[2] || 0) })
  console.log(`fake anthropic on ${f.url}`)
}
