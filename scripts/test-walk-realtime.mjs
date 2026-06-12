#!/usr/bin/env node
// End-to-end harness for the Peri walk Realtime session — no microphone needed.
//
// Mints a real walk session from the local backend, connects to OpenAI
// Realtime over WebSocket with the ephemeral client secret, and drives the
// conversation with TEXT user turns (the model still answers in audio +
// transcript, and the tool-call loop is identical to the WebRTC client's).
//
// What it proves: session config accepted, model speaks first on
// response.create, get_due_cards → record_review tool round-trips work
// against the authed backend, audio bytes actually stream, transcripts land.
//
// Usage: node scripts/test-walk-realtime.mjs [backendBase] [threadId]
//        (default http://localhost:3000; needs the dev server running)
//        threadId switches to a TOPIC-scoped voice session and, on finish,
//        PATCHes the transcript so the merge-into-chat bridge runs too.

const BASE = process.argv[2] || 'http://localhost:3000'
const THREAD_ID = process.argv[3] || null
const USER = { username: 'f3-test@example.com', password: 'f3-test-pass-1' }

// Scripted user turns: each fires after the assistant finishes a response.
const SCRIPT = [
  "Yes, let's do the review.",
  'I think it means conditions that make learning feel harder, like having to retrieve something with effort, actually build stronger and longer-lasting memories than easy methods like rereading.',
  "Let's stop here, thanks. Bye!",
]

let cookie = ''
let audioBytes = 0
let toolCalls = []
let transcripts = []
let scriptIndex = 0
let done = false

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

async function backend(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body ?? {}),
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

const login = await backend('/api/f2/auth/login', USER)
log('logged in as', login.user.username)

const session = await backend('/api/f4/walk/session', THREAD_ID ? { thread_id: THREAD_ID } : {})
log('session minted:', session.voice_session.id, '| mode:', session.voice_session.mode, '| agenda:', JSON.stringify(session.agenda))

const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(session.realtime.model)}`
const ws = new WebSocket(url, {
  headers: { Authorization: `Bearer ${session.client_secret.value}` },
})

const send = (obj) => ws.send(JSON.stringify(obj))

function userTurn(text) {
  log('USER >', text)
  send({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  })
  send({ type: 'response.create' })
}

async function runTool(callId, name, argsJSON) {
  let args = {}
  try { args = JSON.parse(argsJSON) } catch {}
  log(`TOOL > ${name}(${argsJSON.slice(0, 120)})`)
  let output
  try {
    const res = await fetch(BASE + '/api/f4/walk/tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name, arguments: args }),
    })
    output = await res.text()
    log(`TOOL < ${output.slice(0, 160)}`)
  } catch (e) {
    output = JSON.stringify({ error: String(e) })
  }
  toolCalls.push({ name, args })
  send({
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id: callId, output },
  })
  send({ type: 'response.create' })
}

const handled = new Set()

ws.addEventListener('open', () => log('websocket open'))
ws.addEventListener('error', (e) => { console.error('WS error', e.message ?? e); process.exit(1) })
ws.addEventListener('close', (e) => log('websocket closed', e.code))

ws.addEventListener('message', async (ev) => {
  let event
  try { event = JSON.parse(ev.data) } catch { return }
  const t = event.type

  if (t === 'session.created') {
    log('session.created — asking Peri to open the walk')
    // The WebRTC client does the same thing on data-channel open: the model
    // speaks first, per the instructions' OPEN step.
    send({ type: 'response.create' })
  } else if (t === 'response.output_audio.delta' || t === 'response.audio.delta') {
    audioBytes += (event.delta?.length ?? 0)
  } else if (t === 'response.output_audio_transcript.done' || t === 'response.audio_transcript.done') {
    transcripts.push({ role: 'assistant', text: event.transcript })
    log('PERI >', event.transcript)
  } else if (t === 'response.function_call_arguments.done') {
    if (!handled.has(event.call_id)) {
      handled.add(event.call_id)
      await runTool(event.call_id, event.name, event.arguments)
    }
  } else if (t === 'response.done') {
    // If the response ended with a function call, the tool handler already
    // queued the next response; otherwise it's our turn to speak.
    const hadToolCall = (event.response?.output ?? []).some((o) => o.type === 'function_call')
    if (hadToolCall) return
    if (scriptIndex < SCRIPT.length) {
      const text = SCRIPT[scriptIndex++]
      setTimeout(() => userTurn(text), 400)
    } else if (!done) {
      done = true
      finish()
    }
  } else if (t === 'error') {
    console.error('REALTIME ERROR:', JSON.stringify(event.error ?? event))
  }
})

async function finish() {
  ws.close()
  // Exercise the finish endpoint + merge-into-chat bridge like the app does.
  try {
    const turns = transcripts.map((t) => ({
      role: t.role,
      text: t.text,
      created_at: new Date().toISOString(),
    }))
    const res = await fetch(`${BASE}/api/f4/walk/session/${session.voice_session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ transcript: turns, summary: 'Harness run.' }),
    })
    console.log('finish PATCH:', res.status, await res.text())
  } catch (e) {
    console.error('finish PATCH failed:', e)
  }
  console.log('\n===== RESULTS =====')
  console.log('assistant turns:', transcripts.length)
  console.log('audio bytes (base64) streamed:', audioBytes)
  console.log('tool calls:', toolCalls.map((c) => c.name).join(', ') || '(none)')
  const recorded = toolCalls.filter((c) => c.name === 'record_review')
  console.log('record_review calls:', JSON.stringify(recorded.map((c) => c.args), null, 1))
  const ok = transcripts.length >= 3 && audioBytes > 0 && toolCalls.some((c) => c.name === 'get_due_cards')
  console.log(ok ? 'PASS' : 'FAIL')
  process.exit(ok ? 0 : 1)
}

setTimeout(() => {
  console.error('TIMEOUT — partial results:')
  finish()
}, 180_000)
