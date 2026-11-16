#!/usr/bin/env node
// The model gateway: the one address a workspace may reach.
//
// A person's workspace (their files, the agent, its shell) has no route to the
// internet. It can talk to this process and nothing else. The gateway holds the
// model server's address and key, so no workspace ever does, and it is where
// "which model, for whom, how much" is decided.
//
//   UPSTREAM_BASE_URL   the model server, OpenAI-compatible (on the Mac Studio:
//                       http://127.0.0.1:<port>/v1; until then Together.ai, made-up data only)
//   UPSTREAM_API_KEY    its key
//   GATEWAY_TOKENS      who may call: "name:token,name:token"
//   GATEWAY_MODELS      what they may ask for: "name=upstream id,name=upstream id"
//   GATEWAY_PORT        default 4180;  GATEWAY_HOST  default 127.0.0.1
//
// It speaks POST /v1/chat/completions (streamed or not) and GET /v1/models.
//
// What it writes down: one line per request with the time, the caller's name,
// the model, token counts, tries and milliseconds. Never a prompt, a file, a
// tool argument or a reply. That is the "no record of what you asked" promise,
// kept in the one place that sees every request.
//
// What it repairs (measured 2026-11-15 with gpt-oss-120b on Together.ai):
//   - a reply that calls tools and ALSO carries text was found to be the model
//     writing invented tool results before it had any. The text is dropped; the
//     calls go through. (TEXT_WITH_CALLS=keep turns this off for a server that
//     does not have the fault.)
//   - an upstream parse error, or a tool call whose arguments are not JSON or
//     whose name is not one of the tools offered, is retried, three tries in all.
// The upstream is always asked for a whole reply, so nothing half-formed reaches
// the agent; a streaming caller gets that reply as a well-formed stream.
import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'

const need = (k) => {
  const v = process.env[k]
  if (!v) {
    console.error(`${k} is not set`)
    process.exit(1)
  }
  return v
}
const UPSTREAM = need('UPSTREAM_BASE_URL').replace(/\/$/, '')
const KEY = need('UPSTREAM_API_KEY')
const TOKENS = new Map(need('GATEWAY_TOKENS').split(',').map((p) => [p.slice(p.indexOf(':') + 1).trim(), p.slice(0, p.indexOf(':')).trim()]))
const MODELS = new Map(need('GATEWAY_MODELS').split(',').map((p) => [p.slice(0, p.indexOf('=')).trim(), p.slice(p.indexOf('=') + 1).trim()]))
const PORT = Number(process.env.GATEWAY_PORT || 4180)
const HOST = process.env.GATEWAY_HOST || '127.0.0.1'
const KEEP_TEXT = process.env.TEXT_WITH_CALLS === 'keep'
const TRIES = 3
const UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000

function caller(req) {
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  for (const [token, name] of TOKENS) {
    const a = Buffer.from(given)
    const b = Buffer.from(token)
    if (a.length === b.length && timingSafeEqual(a, b)) return name
  }
  return null
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
const fail = (res, status, message, type = 'invalid_request_error') => send(res, status, { error: { message, type } })

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 64 * 1024 * 1024) throw new Error('request too large')
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// What is wrong with a reply, or null. Only shape is judged, never content.
function fault(message, offered) {
  for (const call of message.tool_calls || []) {
    const name = call.function?.name
    if (!name || (offered.size && !offered.has(name))) return `a call to a tool that was not offered`
    try {
      const args = JSON.parse(call.function.arguments || '{}')
      if (args === null || typeof args !== 'object') return 'tool arguments that are not an object'
    } catch {
      return 'tool arguments that are not JSON'
    }
  }
  if (!(message.tool_calls || []).length && !(message.content || '').trim()) return 'an empty reply'
  return null
}

async function complete(body, offered) {
  let last = 'no attempt made'
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    let res
    try {
      res = await fetch(`${UPSTREAM}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
    } catch (e) {
      last = `the model server could not be reached (${e.name})`
      continue
    }
    const text = await res.text()
    if (res.status === 429 || res.status >= 500) {
      last = `the model server answered ${res.status}`
      await new Promise((r) => setTimeout(r, 400 * attempt))
      continue
    }
    let json
    try {
      json = JSON.parse(text)
    } catch {
      last = 'the model server sent something that is not JSON'
      continue
    }
    if (!res.ok) {
      const message = json.error?.message || `the model server answered ${res.status}`
      // Together reports the model's own malformed output as a 4xx "Parse error"; that is worth another try.
      if (/parse error|failed to process token/i.test(message)) {
        last = 'the model produced output its server could not parse'
        continue
      }
      // The caller gets the model server's own words about its own request; the log gets only the status.
      return { status: res.status, error: message, logWhy: `the model server answered ${res.status}`, attempts: attempt }
    }
    const message = json.choices?.[0]?.message
    if (!message) {
      last = 'a reply with no message'
      continue
    }
    const wrong = fault(message, offered)
    if (wrong) {
      last = `the model produced ${wrong}`
      continue
    }
    if ((message.tool_calls || []).length && !KEEP_TEXT) message.content = null
    return { status: 200, json, attempts: attempt }
  }
  return { status: 502, error: `${last}, ${TRIES} times`, logWhy: `${last}, ${TRIES} times`, attempts: TRIES }
}

function stream(res, json, wantUsage) {
  const choice = json.choices[0]
  const m = choice.message
  const base = { id: json.id || `chatcmpl-${randomUUID()}`, object: 'chat.completion.chunk', created: json.created || Math.floor(Date.now() / 1000), model: json.model }
  const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
  chunk({ role: 'assistant', content: '' })
  const reasoning = m.reasoning_content ?? m.reasoning
  if (reasoning) chunk({ reasoning_content: reasoning })
  if (m.content) chunk({ content: m.content })
  ;(m.tool_calls || []).forEach((call, index) =>
    chunk({ tool_calls: [{ index, id: call.id || `call_${randomUUID()}`, type: 'function', function: { name: call.function.name, arguments: call.function.arguments || '{}' } }] }),
  )
  chunk({}, choice.finish_reason || ((m.tool_calls || []).length ? 'tool_calls' : 'stop'))
  if (wantUsage && json.usage) res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: json.usage })}\n\n`)
  res.end('data: [DONE]\n\n')
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  const who = caller(req)
  const path = new URL(req.url, 'http://x').pathname
  if (!who) return fail(res, 401, 'unknown caller', 'authentication_error')
  if (req.method === 'GET' && path === '/v1/models') {
    return send(res, 200, { object: 'list', data: [...MODELS.keys()].map((id) => ({ id, object: 'model', owned_by: 'box' })) })
  }
  if (req.method !== 'POST' || path !== '/v1/chat/completions') return fail(res, 404, 'not found')
  let body
  try {
    body = await readJson(req)
  } catch {
    return fail(res, 400, 'the request is not JSON')
  }
  const upstreamModel = MODELS.get(body.model)
  if (!upstreamModel) return fail(res, 404, `no such model: ${String(body.model).slice(0, 80)}`)
  const wantStream = body.stream === true
  const wantUsage = body.stream_options?.include_usage === true
  const offered = new Set((body.tools || []).map((t) => t.function?.name).filter(Boolean))
  const { stream: _s, stream_options: _o, ...rest } = body
  const out = await complete({ ...rest, model: upstreamModel, stream: false }, offered)
  const usage = out.json?.usage
  // The whole record of this request. No content, ever: a failure's reason is one of this
  // file's own fixed descriptions or the upstream status, never the model server's error
  // text, which can quote the request (found in review, 2026-11-15).
  console.log(
    [new Date().toISOString(), who, body.model, `status=${out.status}`, `tries=${out.attempts}`, `in=${usage?.prompt_tokens ?? '-'}`, `out=${usage?.completion_tokens ?? '-'}`, `ms=${Date.now() - started}`, ...(out.status === 200 ? [] : [`why="${out.logWhy}"`])].join(' '),
  )
  if (out.status !== 200) return fail(res, out.status, out.error, 'upstream_error')
  out.json.model = body.model
  if (wantStream) return stream(res, out.json, wantUsage)
  send(res, 200, out.json)
})

server.listen(PORT, HOST, () => console.log(`gateway on http://${HOST}:${PORT} → ${new URL(UPSTREAM).host}, models: ${[...MODELS.keys()].join(', ')}`))
