// Create or update the Speech Engines on ElevenLabs — two for Dodo, two for
// Polly — and point them at this bridge. Idempotent: engines are found by name.
//
//   node engines.mjs <public https origin of the bridge>
//   node engines.mjs https://something.trycloudflare.com
//
//   "Dodo (dev)"   → wss://<host>/ws/dev         (a local dev server)
//   "Dodo"         → wss://<host>/ws/prod        (https://feynd.cc)
//   "Polly (dev)"  → wss://<host>/ws/polly-dev   (a local dev server, Polly's turn route)
//   "Polly"        → wss://<host>/ws/polly-prod  (https://hilma-nine.vercel.app)
//
// Prints the engine ids — ELEVEN_SPEECH_ENGINE_ID / POLLY_ELEVEN_SPEECH_ENGINE_ID
// in .env.local are the dev ones, on Vercel the prod ones. run.sh calls this on every start because a
// Cloudflare quick tunnel gets a new hostname each time.
//
// Env: ELEVENLABS_API_KEY.
const API = 'https://api.elevenlabs.io/v1/speech-engine'
const KEY = (process.env.ELEVENLABS_API_KEY || '').trim()
if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set')
const origin = (process.argv[2] || '').replace(/\/$/, '')
if (!/^https:\/\//.test(origin)) throw new Error('usage: node engines.mjs https://<bridge host>')
const wsBase = origin.replace(/^https:/, 'wss:')

// Polly's voice speaks Italian, French and Korean as well as English: Alice
// is one of the library's multilingual educator voices. DODO_ELEVEN_VOICE_ID /
// POLLY_ELEVEN_VOICE_ID override.
const DODO_VOICE = process.env.DODO_ELEVEN_VOICE_ID || 'cgSgspJ2msm6clMCkdW9' // Jessica — playful, bright, warm
const POLLY_VOICE = process.env.POLLY_ELEVEN_VOICE_ID || 'Xb7hH8MSUJpSbSDYk0k2' // Alice — clear, engaging educator
const ENGINES = [
  { name: 'Dodo (dev)', path: '/ws/dev', voice: DODO_VOICE },
  { name: 'Dodo', path: '/ws/prod', voice: DODO_VOICE },
  { name: 'Polly (dev)', path: '/ws/polly-dev', voice: POLLY_VOICE },
  { name: 'Polly', path: '/ws/polly-prod', voice: POLLY_VOICE },
]

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
    tts: {
      voice_id: engine.voice,
      // The expressive conversational model. 'eleven_flash_v2' is ≈ 0.5 s
      // quicker to first sound and flatter; English engines accept only
      // flash/turbo v2 or this one (v2.5 is refused).
      model_id: process.env.DODO_ELEVEN_TTS_MODEL || 'eleven_v3_conversational',
    },
    turn: {
      // Exams need room to think: no "are you still there?" for half a minute.
      turn_timeout: 30,
      turn_eagerness: 'normal',
    },
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
  console.log(`${found ? 'updated' : 'created'} ${engine.name}: ${result.speech_engine_id} → ${result.speech_engine.ws_url} (${result.tts.voice_id}, ${result.tts.model_id})`)
}
