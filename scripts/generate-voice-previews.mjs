#!/usr/bin/env node
// Generate the bundled voice-preview clips for Dodo's voice picker.
//
// For each voice, opens a GPT-Live WebSocket session (the same model the
// app uses, so the preview texture matches real sessions exactly), asks the
// voice to say one fixed line, captures the PCM16 audio until it goes quiet,
// writes a WAV, then afconverts it to .m4a in apps/feynd/Feynd/VoicePreviews/.
//
// Usage: node scripts/generate-voice-previews.mjs [voice ...]
//        (no args = all voices in VOICES below; needs OPENAI_API_KEY in
//        .env.local; macOS only — uses afconvert)

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'apps/feynd/Feynd/VoicePreviews')
const MODEL = 'gpt-live-1'
const SAMPLE_RATE = 24000
const FRAME_MS = 100
const FRAME_BYTES = (SAMPLE_RATE * 2 * FRAME_MS) / 1000

// Keep in sync with REALTIME_VOICES in src/lib/f2/realtime.ts.
const VOICES = ['marin', 'cedar', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer']

const LINE =
  "Hi! I'm one of the voices you can pick for Dodo. We'll talk through your topics, run your flash rounds, and get you through your final reviews."

function apiKey() {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
  const m = env.match(/^OPENAI_API_KEY=(.+)$/m)
  if (!m) throw new Error('OPENAI_API_KEY not found in .env.local')
  return m[1].trim()
}

function wavFromPCM16(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/// Trim leading/trailing digital silence (|sample| < 200) from PCM16.
function trimSilence(pcm) {
  const n = pcm.length / 2
  let start = 0
  let end = n
  while (start < n && Math.abs(pcm.readInt16LE(start * 2)) < 200) start++
  while (end > start && Math.abs(pcm.readInt16LE((end - 1) * 2)) < 200) end--
  const pad = SAMPLE_RATE * 0.15 // 150 ms of room either side
  start = Math.max(0, start - pad)
  end = Math.min(n, end + pad)
  return pcm.subarray(start * 2, end * 2)
}

function generate(voice, key) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let gotAudio = false
    let lastAudioAt = 0
    let started = false
    let closing = false
    const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', {
      headers: { Authorization: `Bearer ${key}` },
    })
    const send = (obj) => ws.send(JSON.stringify(obj))
    const fail = (err) => {
      clearTimeout(timeout)
      clearInterval(ticker)
      ws.close()
      reject(err)
    }
    const timeout = setTimeout(() => fail(new Error(`${voice}: timed out`)), 60_000)

    // The live model needs a running input stream: feed silence.
    const silence = Buffer.alloc(FRAME_BYTES).toString('base64')
    const ticker = setInterval(() => {
      if (!started || closing) return
      send({ type: 'session.input_audio.append', audio: silence })
      // Done once the line has played and the voice has been quiet for 1.5 s.
      if (gotAudio && Date.now() - lastAudioAt > 1500) {
        closing = true
        send({ type: 'session.close' })
      }
    }, FRAME_MS)

    ws.addEventListener('open', () => {
      send({
        type: 'session.start',
        event_id: 'start',
        session: {
          model: MODEL,
          // "You speak first" has to live in the base prompt: an appended
          // instruction alone does not reliably start the model talking.
          instructions:
            `You record short voice samples. You speak first: as soon as the session starts, without waiting for anyone to speak, say exactly this line and nothing else — nothing before, nothing after — then stay silent: "${LINE}"`,
          audio: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, output: { voice } },
        },
      })
    })
    ws.addEventListener('error', (e) => fail(new Error(`${voice}: WS error ${e.message ?? e}`)))
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      switch (msg.type) {
        case 'session.started':
          started = true
          send({
            type: 'session.instructions.append',
            event_id: 'line',
            delegation_id: null,
            content: `Begin now, without waiting for anyone to speak: say the line exactly as given, then stay silent.`,
          })
          break
        case 'session.output_audio.delta': {
          const buf = Buffer.from(msg.delta, 'base64')
          chunks.push(buf)
          // Count only frames with actual signal as "audio".
          let loud = false
          for (let i = 0; i + 1 < buf.length; i += 2) {
            if (Math.abs(buf.readInt16LE(i)) > 200) { loud = true; break }
          }
          if (loud) { gotAudio = true; lastAudioAt = Date.now() }
          break
        }
        case 'session.closed':
          clearTimeout(timeout)
          clearInterval(ticker)
          ws.close()
          resolve(trimSilence(Buffer.concat(chunks)))
          break
        case 'error':
          fail(new Error(`${voice}: ${JSON.stringify(msg.error ?? msg)}`))
          break
        default:
          break
      }
    })
  })
}

const key = apiKey()
mkdirSync(OUT_DIR, { recursive: true })
const targets = process.argv.slice(2).length ? process.argv.slice(2) : VOICES

for (const voice of targets) {
  process.stdout.write(`${voice} ... `)
  let pcm
  try {
    pcm = await generate(voice, key)
  } catch (e) {
    process.stdout.write(`retry (${e.message}) ... `)
    pcm = await generate(voice, key)
  }
  const wavPath = join(OUT_DIR, `voice-${voice}.wav`)
  const m4aPath = join(OUT_DIR, `voice-${voice}.m4a`)
  writeFileSync(wavPath, wavFromPCM16(pcm))
  rmSync(m4aPath, { force: true })
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', wavPath, m4aPath])
  rmSync(wavPath)
  const secs = (pcm.length / 2 / SAMPLE_RATE).toFixed(1)
  console.log(`ok (${secs}s)`)
}
console.log('done →', OUT_DIR)
