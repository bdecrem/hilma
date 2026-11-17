#!/usr/bin/env node
// Kit's voice on ElevenLabs: one Speech Engine, named "Kit", for the Ola iPhone app's voice
// meetings (src/lib/venture/phone.ts). It touches this one engine only, found by name; Dodo's,
// Polly's and Dolly's engines (apps/dodo-voice-bridge/engines.mjs) are never read or changed.
//
//   node scripts/venture/kit-engine.mjs          create or update it, print its id
//
// Why no bridge change is needed: the engine points at the bridge's existing /ws/prod path, whose
// backend is this site's /api/f2/eleven/turn. A Kit meeting names itself with a voice-session id
// that starts with "kit-" (Dodo's are database UUIDs), and that route hands those turns to Kit
// before it looks anything up for Dodo. So no Railway variable, no bridge deploy.
//
// It creates no conversation and mints no token: nothing here holds a concurrency slot.
// Env: ELEVENLABS_API_KEY (read from .env.local, never printed).
import { existsSync, readFileSync } from 'node:fs'

const envFile = new URL('../../.env.local', import.meta.url)
const env = Object.fromEntries(
  (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const KEY = (process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || '').trim()
if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set')
const API = 'https://api.elevenlabs.io/v1/speech-engine'
const NAME = 'Kit'
const BRIDGE = 'wss://dodo-voice-bridge-production.up.railway.app/ws/prod'

const body = {
  name: NAME,
  speech_engine: {
    ws_url: BRIDGE,
    // The meeting's `dodo_voice_session` variable ("kit-<session>") reaches the bridge as this header.
    request_headers: { 'x-dodo-voice-session': { variable_name: 'dodo_voice_session' } },
  },
  // Angela, Calm: the voice Bart chose for Dodo (src/lib/f2/CLAUDE.md, the voice picker), the same
  // model and settings as Dodo's "angela · calm" engine.
  tts: { voice_id: 'FUfBrNit0NNZAwb58KWH', model_id: 'eleven_turbo_v2', stability: 0.75, similarity_boost: 0.8 },
  turn: {
    // He thinks out loud; a comma-length pause must not end his turn.
    turn_eagerness: 'patient',
    turn_timeout: 30,
    // Four minutes without a word from him ends the meeting and frees the slot.
    silence_end_call_timeout: 240,
  },
  // See engines.mjs: Claude's first words over a large prompt can take longer than the 4 s default.
  cascade_timeout_seconds: 15,
  conversation: {
    max_duration_seconds: 2400,
    client_events: ['audio', 'interruption', 'agent_response', 'user_transcript', 'agent_response_correction', 'vad_score'],
  },
  // Kit never holds more than one of the workspace's slots, and never bursts.
  call_limits: { agent_concurrency_limit: 1, bursting_enabled: false },
  // A conversation needs a token our server minted, never the bare engine id.
  auth: { enable_auth: true },
  // The words are kept on our side (venture_interview_turns); ElevenLabs keeps no recording.
  privacy: { record_voice: false },
}

async function call(method, url, payload) {
  const res = await fetch(url, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '')} → ${res.status} ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

const listed = await call('GET', `${API}?page_size=100`)
const found = (listed.speech_engines ?? listed.engines ?? listed.items ?? []).filter((e) => e.name === NAME)
if (found.length > 1) throw new Error(`${found.length} engines are named "${NAME}"; delete the extra ones by hand first`)
const result = found.length ? await call('PATCH', `${API}/${found[0].speech_engine_id}`, body) : await call('POST', API, body)
console.log(`${found.length ? 'updated' : 'created'} ${NAME}: ${result.speech_engine_id} → ${result.speech_engine.ws_url} (${result.tts.voice_id}, ${result.tts.model_id})`)
console.log(`limits: ${JSON.stringify(result.call_limits ?? null)}, auth: ${JSON.stringify(result.auth ?? null)}, silence end: ${result.turn?.silence_end_call_timeout}`)
