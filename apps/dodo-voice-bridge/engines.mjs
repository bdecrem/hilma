// Create or update the Speech Engines on ElevenLabs — two for Dodo, two for
// Polly — and point them at this bridge. Idempotent: engines are found by name.
//
//   node engines.mjs <public https origin of the bridge> [all|dev|prod] [all|dodo|polly]
//   node engines.mjs https://dodo-voice-bridge-production.up.railway.app   # all four
//   node engines.mjs https://something.trycloudflare.com dev              # the two dev ones
//   node engines.mjs https://dodo-voice-bridge-production.up.railway.app prod dodo   # Dodo's prod engine only
//
//   "Dodo (dev)"   → wss://<host>/ws/dev         (a local dev server)
//   "Dodo"         → wss://<host>/ws/prod        (https://feynd.cc)
//   "Polly (dev)"  → wss://<host>/ws/polly-dev   (a local dev server, Polly's turn route)
//   "Polly"        → wss://<host>/ws/polly-prod  (https://polly-iota.vercel.app)
//   "Dolly (dev)"  → wss://<host>/ws/dolly-dev   (a local dev server on :3260, /api/dolly/eleven/turn)
//   "Dolly"        → wss://<host>/ws/dolly-prod  (https://ola.cx)
//
// Prints the engine ids — ELEVEN_SPEECH_ENGINE_ID / POLLY_ELEVEN_SPEECH_ENGINE_ID
// in .env.local are the dev ones, on Vercel the prod ones. The production
// engines point at the hosted bridge (Railway, a permanent hostname) and are
// only re-pointed by hand. run.sh — a bridge on a dev machine behind a quick
// tunnel with a new hostname each start — passes `dev`, so it re-points only
// the dev engines and never steals the production ones.
//
// Env: ELEVENLABS_API_KEY.
const API = 'https://api.elevenlabs.io/v1/speech-engine'
const KEY = (process.env.ELEVENLABS_API_KEY || '').trim()
if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set')
const origin = (process.argv[2] || '').replace(/\/$/, '')
if (!/^https:\/\//.test(origin)) throw new Error('usage: node engines.mjs https://<bridge host> [all|dev|prod]')
const which = process.argv[3] || 'all'
if (!['all', 'dev', 'prod'].includes(which)) throw new Error('usage: node engines.mjs https://<bridge host> [all|dev|prod] [all|dodo|polly]')
const app = process.argv[4] || 'all'
if (!['all', 'dodo', 'polly', 'dolly'].includes(app)) throw new Error('usage: node engines.mjs https://<bridge host> [all|dev|prod] [all|dodo|polly|dolly]')
const wsBase = origin.replace(/^https:/, 'wss:')

// Polly's voice speaks Italian, French and Korean as well as English: Alice
// is one of the library's multilingual educator voices. DODO_ELEVEN_VOICE_ID /
// POLLY_ELEVEN_VOICE_ID override.
const DODO_VOICE = process.env.DODO_ELEVEN_VOICE_ID || 'cgSgspJ2msm6clMCkdW9' // Jessica — playful, bright, warm
const POLLY_VOICE = process.env.POLLY_ELEVEN_VOICE_ID || 'Xb7hH8MSUJpSbSDYk0k2' // Alice — clear, engaging educator

// How each app's voice is rendered. Everything else in `tts` keeps the API
// defaults (similarity 0.8, pcm_16000, numbers normalised by the LLM).
//
// Dodo (2026-10-09): Eleven v4 Turbo, the agent model since v4 shipped on
// 2026-09-28, with expressive mode OFF. Before this it was
// 'eleven_v3_conversational' with expressive mode on — the API default for
// that model, which this script never set, so production had it — and the
// voice performed every line: drawn-out emphasis, dramatic pauses, a playful
// lilt. Bart stopped enjoying voice mode over it. Whisper found no inserted
// words in the samples (~/Desktop/dodo-voice): it was prosody. v4 turbo reads
// the same paragraph in 24 s where v3 conversational took 27–28 s, with the
// same time to first sound. v4 has no speed or style settings; stability 0.5
// and similarity 0.8 are what the sample Bart chose used. Expressive mode is
// only honoured on v3 models anyway, but stays false so a model change can't
// bring it back. 'eleven_flash_v2' is the flatter, older fallback.
const DODO_TTS = {
  model_id: process.env.DODO_ELEVEN_TTS_MODEL || 'eleven_v4_turbo',
  expressive_mode: false,
  stability: 0.5,
  similarity_boost: 0.8,
}
// Polly: unchanged — the expressive conversational model with its defaults.
const POLLY_TTS = {
  model_id: process.env.POLLY_ELEVEN_TTS_MODEL || 'eleven_v3_conversational',
}
// Dolly (2026-10-10, hilma's apps/dolly — a three-minute call a day in
// Spanish or Mandarin): an American voice (Bart heard Alice's British accent
// on the first build and asked for American English) on Dodo's settings — v4
// turbo, expressive off, so a learner hears the words, not a performance.
// Bella is one of the library's educational voices; the premade American
// alternatives are Sarah, Matilda, Laura and Jessica (Dodo's).
const DOLLY_VOICE = process.env.DOLLY_ELEVEN_VOICE_ID || 'hpp4J3VqNfWAUOO0d1Us' // Bella — professional, bright, warm
const DOLLY_TTS = {
  model_id: process.env.DOLLY_ELEVEN_TTS_MODEL || 'eleven_v4_turbo',
  expressive_mode: false,
  stability: 0.5,
  similarity_boost: 0.8,
}

const ENGINES = [
  { name: 'Dodo (dev)', path: '/ws/dev', voice: DODO_VOICE, tts: DODO_TTS, dev: true, app: 'dodo' },
  { name: 'Dodo', path: '/ws/prod', voice: DODO_VOICE, tts: DODO_TTS, dev: false, app: 'dodo' },
  { name: 'Polly (dev)', path: '/ws/polly-dev', voice: POLLY_VOICE, tts: POLLY_TTS, dev: true, app: 'polly' },
  { name: 'Polly', path: '/ws/polly-prod', voice: POLLY_VOICE, tts: POLLY_TTS, dev: false, app: 'polly' },
  { name: 'Dolly (dev)', path: '/ws/dolly-dev', voice: DOLLY_VOICE, tts: DOLLY_TTS, dev: true, app: 'dolly' },
  { name: 'Dolly', path: '/ws/dolly-prod', voice: DOLLY_VOICE, tts: DOLLY_TTS, dev: false, app: 'dolly' },
]
  .filter((e) => which === 'all' || (which === 'dev') === e.dev)
  .filter((e) => app === 'all' || app === e.app)

/// Everything about how Dodo sounds and takes turns lives here.
function engineBody(engine) {
  return {
    name: engine.name,
    speech_engine: {
      ws_url: `${wsBase}${engine.path}`,
      // The conversation's `dodo_voice_session` variable (the phone sets it
      // from /api/f2/eleven/session) reaches the bridge as this header.
      request_headers: { 'x-dodo-voice-session': { variable_name: 'dodo_voice_session' } },
    },
    tts: { voice_id: engine.voice, ...engine.tts },
    turn: {
      // Exams need room to think: no "are you still there?" for half a minute.
      turn_timeout: 30,
      // 'patient': people studying pause mid-sentence to think (and language
      // learners more so). On 'normal' a comma-length pause ended the turn,
      // Dodo began answering half a question and was cut off by the rest of it.
      turn_eagerness: 'patient',
    },
    // How long ElevenLabs waits for the first words of a reply before it
    // re-sends the turn (three tries, then the conversation fails with "LLM
    // Cascade Error"). The default is 4 s; Claude's first words after a long
    // exam answer take 3.5–4 s plus the hop through Vercel, so long answers
    // died (2026-09-23). 15 is the API's maximum. The bridge keeps a reply in
    // flight across the re-sends, so the whole window is usable.
    cascade_timeout_seconds: 15,
    conversation: {
      // A Final Review can run long; the default cap is ten minutes.
      max_duration_seconds: 3600,
      client_events: [
        'audio', 'interruption', 'agent_response', 'user_transcript',
        'agent_response_correction', 'vad_score',
      ],
    },
  }
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

const listed = await call('GET', `${API}?page_size=100`)
const existing = listed.speech_engines ?? listed.engines ?? listed.items ?? []
for (const engine of ENGINES) {
  const found = existing.find((e) => e.name === engine.name)
  const result = found
    ? await call('PATCH', `${API}/${found.speech_engine_id}`, engineBody(engine))
    : await call('POST', API, engineBody(engine))
  const tts = result.tts
  console.log(`${found ? 'updated' : 'created'} ${engine.name}: ${result.speech_engine_id} → ${result.speech_engine.ws_url} (${tts.voice_id}, ${tts.model_id}, expressive ${tts.expressive_mode}, stability ${tts.stability})`)
}
