#!/usr/bin/env node
// The phone's local voice (OLA-534), its network half, against the live Studio: OlaKit's
// KitLocalVoice (what the iPhone app's LocalKitTransport posts) plays a recorded question to
// https://kit-voice.tunn3l.sh in 256 ms posts and asks for one sentence back. Passes when the
// question comes back as text and the sentence as audio. Nothing is played aloud, nothing reaches
// ElevenLabs. The voice token comes from the talk session route (as the talk page gets it); that
// session is marked "test". The token is never printed.
//   ( set -a; . ./.env.local; set +a; node scripts/venture/phone-local-voice-check.mjs <audio file> [base] )
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const input = process.argv[2]
const base = process.argv[3] || 'https://ola.cx'
const key = process.env.VENTURE_KEY
if (!input) throw new Error('usage: phone-local-voice-check.mjs <audio file> [base]')
if (!key) throw new Error('VENTURE_KEY is not set')

const dir = mkdtempSync(path.join(os.tmpdir(), 'kit-local-'))
const pcm = path.join(dir, 'question.pcm')
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-ac', '1', '-ar', '16000', '-f', 's16le', pcm])

const res = await fetch(`${base}/api/venture/talk/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, local: true }) })
const s = await res.json()
if (!res.ok || !s.local) throw new Error(`talk session: ${res.status} ${s.error ?? ''}`)
console.log('session', s.session, '(marked test at the end)')

const here = path.dirname(new URL(import.meta.url).pathname)
const kit = path.resolve(here, '../../apps/activist-ai/apple/OlaKit')
const run = spawnSync('swift', ['test', '--filter', 'KitLocalVoiceTests/testLiveStudio'], {
  cwd: kit,
  env: { ...process.env, KIT_VOICE_URL: s.local.url, KIT_VOICE_TOKEN: s.local.token, KIT_VOICE_PCM: pcm },
  encoding: 'utf8',
})
const lines = `${run.stdout}\n${run.stderr}`.split('\n').filter((l) => /KIT_LOCAL|error:|Executed|testLiveStudio\]/.test(l) && !l.includes(s.local.token))
console.log(lines.join('\n'))

const mark = await fetch(`${base}/api/venture/interview/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, session: s.session, role: 'event', text: 'test', call: 'talk' }) })
console.log(mark.ok ? 'session marked test' : `could not mark the session test: ${mark.status}`)
process.exit(run.status === 0 ? 0 : 1)
