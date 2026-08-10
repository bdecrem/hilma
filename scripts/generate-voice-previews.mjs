#!/usr/bin/env node
// Generate the bundled voice-preview clips for Dodo's voice picker.
//
// For each voice, opens a Realtime WebSocket session (same model the app
// uses, so the preview texture matches real sessions exactly), has the voice
// speak one fixed line, and writes the PCM16 audio to a WAV, then afconvert
// to .m4a in apps/feynd/Feynd/VoicePreviews/.
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
const MODEL = 'gpt-realtime-2.1'
const SAMPLE_RATE = 24000

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

function generate(voice, key) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const send = (obj) => ws.send(JSON.stringify(obj))
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error(`${voice}: timed out`))
    }, 60_000)

    ws.addEventListener('error', (e) => {
      clearTimeout(timeout)
      reject(new Error(`${voice}: WS error ${e.message ?? e}`))
    })

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      const t = msg.type
      if (t === 'session.created') {
        send({
          type: 'session.update',
          session: {
            type: 'realtime',
            model: MODEL,
            output_modalities: ['audio'],
            audio: { output: { voice } },
            instructions:
              'You record short voice samples. Say exactly the line you are given — nothing more, nothing before or after.',
          },
        })
      } else if (t === 'session.updated') {
        send({
          type: 'response.create',
          response: { instructions: `Say exactly: "${LINE}"` },
        })
      } else if (t === 'response.output_audio.delta' || t === 'response.audio.delta') {
        chunks.push(Buffer.from(msg.delta, 'base64'))
      } else if (t === 'response.done') {
        clearTimeout(timeout)
        ws.close()
        resolve(Buffer.concat(chunks))
      } else if (t === 'error') {
        clearTimeout(timeout)
        ws.close()
        reject(new Error(`${voice}: ${JSON.stringify(msg.error ?? msg)}`))
      }
    })
  })
}

const key = apiKey()
mkdirSync(OUT_DIR, { recursive: true })
const targets = process.argv.slice(2).length ? process.argv.slice(2) : VOICES

for (const voice of targets) {
  process.stdout.write(`${voice} ... `)
  const pcm = await generate(voice, key)
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
