#!/usr/bin/env node
// End-to-end harness for an Omniglot talk session — no microphone needed.
//
// Logs in, mints a real talk session from the local backend, connects to
// OpenAI Realtime over WebSocket with the ephemeral secret, and drives the
// conversation with TEXT learner turns (the model answers in audio +
// transcript, exactly like the WebRTC client hears). On finish it PATCHes
// the transcript back, exercising the debrief: summary, corrections, XP,
// and — for freeform — the distilled chapter.
//
// Usage: node scripts/test-omni-talk.mjs [backendBase] [topicId]
//        (default http://localhost:3000 freeform; topicId = chapter mode)

const BASE = process.argv[2] || 'http://localhost:3000'
const TOPIC_ID = process.argv[3] || null
const USER = { email: 'omni-test@example.com', password: 'omni-test-pass1' }

// A Newbie Spanish learner with one planted error ("dos hermano").
const SCRIPT = [
  'Hola. Yo quiero hablar de mi familia. Yo tengo dos hermano.',
  'Mi hermana se llama Ana. Ella tiene veinte años y estudia en la universidad.',
  'Gracias. Adiós.',
]

let cookie = ''
let audioBytes = 0
let transcripts = []
let scriptIndex = 0
let closing = false

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

async function backend(path, body, method = 'POST') {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body ?? {}),
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

const login = await backend('/api/omni/auth/login', USER)
log('logged in as', login.user.email, '| language:', login.user.language)

const session = await backend('/api/omni/talk/session', TOPIC_ID ? { topic_id: TOPIC_ID } : {})
log('session minted:', session.conversation.id, '| mode:', session.conversation.mode)

const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(session.realtime.model)}`
const ws = new WebSocket(url, {
  headers: { Authorization: `Bearer ${session.client_secret.value}` },
})

const send = (obj) => ws.send(JSON.stringify(obj))

function userTurn(text) {
  log('LEARNER >', text)
  transcripts.push({ role: 'user', text })
  send({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  })
  send({ type: 'response.create' })
}

ws.addEventListener('open', () => log('websocket open'))
ws.addEventListener('error', (e) => { console.error('WS error', e.message ?? e); process.exit(1) })
ws.addEventListener('close', (e) => log('websocket closed', e.code))

ws.addEventListener('message', (ev) => {
  let event
  try { event = JSON.parse(ev.data) } catch { return }
  const t = event.type

  if (t === 'session.created') {
    log('session.created — the tutor should speak first')
    send({ type: 'response.create' })
  } else if (t === 'response.output_audio.delta' || t === 'response.audio.delta') {
    audioBytes += (event.delta?.length ?? 0)
  } else if (t === 'response.output_audio_transcript.done' || t === 'response.audio_transcript.done') {
    transcripts.push({ role: 'assistant', text: event.transcript })
    log('TUTOR >', event.transcript)
  } else if (t === 'response.done') {
    if (scriptIndex < SCRIPT.length) {
      const line = SCRIPT[scriptIndex++]
      setTimeout(() => userTurn(line), 400)
    } else if (!closing) {
      closing = true
      setTimeout(() => ws.close(), 800)
    }
  } else if (t === 'error') {
    console.error('REALTIME error:', JSON.stringify(event.error ?? event).slice(0, 300))
  }
})

// Hard stop so a hung session can't wedge the harness.
setTimeout(() => { console.error('TIMEOUT'); process.exit(1) }, 180_000)

await new Promise((resolve) => ws.addEventListener('close', resolve))

log('ending session with', transcripts.length, 'transcript turns')
const end = await backend(`/api/omni/talk/session/${session.conversation.id}`, { transcript: transcripts }, 'PATCH')

log('summary:', end.summary)
log('corrections:', JSON.stringify(end.corrections, null, 1))
log('xp:', JSON.stringify(end.xp))
if (end.new_topic) log('new chapter:', end.new_topic.title, `(${end.new_topic.card_count} cards)`)

const assistantTurns = transcripts.filter((t) => t.role === 'assistant').length
const pass =
  assistantTurns >= 3 &&
  audioBytes > 0 &&
  end.xp.earned > 0 &&
  (TOPIC_ID ? true : Boolean(end.new_topic))
log(`assistant turns: ${assistantTurns} | audio bytes: ${audioBytes}`)
console.log(pass ? 'PASS' : 'FAIL')
process.exit(pass ? 0 : 1)
