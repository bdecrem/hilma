// Headless conversation check for Dodo's ElevenLabs voice engine
// (Speech Engine + Claude) — the counterpart of test-live-dodo.ts.
//
// Goes through the real path: signs in as the F2 test account, starts a
// session with POST /api/f2/eleven/session, opens the conversation against
// ElevenLabs (over its WebSocket transport with a signed URL — Node has no
// WebRTC — carrying the same `dodo_voice_session` variable the phone sends),
// sends the kickoff when Dodo speaks first, answers OUT LOUD with macOS `say`
// (PCM16 @ 16 kHz, so ElevenLabs' speech-to-text and turn-taking are in the
// loop), prints both sides with timings, then finishes the session through
// PATCH /api/f2/live/session/:id.
//
//   npx tsx scripts/test-eleven-dodo.ts [mode] [threadId] [--base URL]
//       [--answer "text"]... [--text] [--interrupt]
//
//   mode        global | topic | final_review | recert   (default topic)
//   --base      backend to drive (default http://localhost:3100). The bridge
//               (apps/dodo-voice-bridge) must route this engine to the same
//               backend: the dev engine ↔ localhost, the prod engine ↔ feynd.cc.
//   --answer    what the test user says, one per turn (repeatable)
//   --text      send the answers as text messages instead of speech
//   --interrupt start speaking 1.5 s into Dodo's second reply (barge-in)
//   --guest     sign in as a fresh guest account (use with mode `global`); for
//               production runs: ELEVEN_SPEECH_ENGINE_ID=<prod engine> … --base https://feynd.cc --guest
//
// Needs ELEVENLABS_API_KEY and ELEVEN_SPEECH_ENGINE_ID in .env.local (and
// F2_TEST_PASS to log in rather than self-sign). Test account only.
import { readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  // Values already in the environment win, so a run can name another engine.
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const TEST_USER = 'newx-test@example.com' // never Bart's
const TEST_USER_ID = '853d0054-7de2-4359-9133-8c14ff3f2653'
const DEFAULT_THREAD = 'a2b5d604-eb61-4538-b7fa-0470ea54c2c4' // French Revolution Overview
const RATE = 16000
const FRAME_MS = 100
const FRAME_BYTES = (RATE * 2 * FRAME_MS) / 1000

const args = process.argv.slice(2)
const answers: string[] = []
let base = 'http://localhost:3100'
const positional: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--answer') answers.push(args[++i])
  else if (args[i] === '--base') base = args[++i]
  else if (!args[i].startsWith('--')) positional.push(args[i])
}
const asText = args.includes('--text')
const interrupt = args.includes('--interrupt')
const mode = positional[0] ?? 'topic'
const threadId = positional[1] ?? DEFAULT_THREAD
if (answers.length === 0) {
  answers.push(
    mode === 'global'
      ? 'Hi Dodo. In one or two sentences, why is the sky blue?'
      : 'In one or two sentences, what does my material say caused the financial crisis before the revolution?',
    'Thanks. And who paid most of the taxes back then?',
  )
}

/// Spoken PCM16 mono @ 16 kHz from macOS `say`.
function speak(text: string): Buffer {
  const aiff = join(tmpdir(), `eleven-say-${Date.now()}.aiff`)
  const wav = aiff.replace(/\.aiff$/, '.wav')
  execFileSync('say', ['-v', 'Samantha', '-o', aiff, text])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav])
  const buf = readFileSync(wav)
  rmSync(aiff, { force: true })
  rmSync(wav, { force: true })
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') return buf.subarray(off + 8, off + 8 + size)
    off += 8 + size + (size % 2)
  }
  throw new Error('no data chunk in WAV')
}

const results: string[] = []
function check(name: string, ok: boolean, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const t0 = Date.now()
  const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`

  // 1. Sign in as the test account and start the session through the route.
  //    With F2_TEST_PASS it logs in; without it, it signs the session cookie
  //    itself (works when the backend shares .env.local's session secret).
  //    --guest makes a throwaway guest account instead — the way to drive
  //    production from a machine that has neither (delete the user afterwards).
  let cookie: string
  if (args.includes('--guest')) {
    const guest = await fetch(`${base}/api/f2/auth/guest`, { method: 'POST' })
    if (!guest.ok) throw new Error(`guest sign-up failed (${guest.status})`)
    cookie = (guest.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    console.log(at(), 'guest account', JSON.stringify(await guest.json()).slice(0, 160))
  } else if (process.env.F2_TEST_PASS) {
    const login = await fetch(`${base}/api/f2/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: TEST_USER, password: process.env.F2_TEST_PASS }),
    })
    if (!login.ok) throw new Error(`login failed (${login.status})`)
    cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  } else {
    const { signSession } = await import('../src/lib/f2/auth')
    cookie = `f2_session=${signSession(TEST_USER_ID)}`
  }

  const startRes = await fetch(`${base}/api/f2/eleven/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ mode, thread_id: mode === 'global' ? undefined : threadId }),
  })
  const start = await startRes.json()
  if (!startRes.ok) throw new Error(`session start failed (${startRes.status}): ${JSON.stringify(start)}`)
  const voiceSessionId: string = start.voice_session.id
  console.log(at(), 'session', voiceSessionId, 'model', start.eleven.model, 'kickoff', start.eleven.kickoff)
  check('token-minted', typeof start.eleven.conversation_token === 'string' && start.eleven.conversation_token.length > 20)

  // 2. Open the conversation (WebSocket transport, same dynamic variable).
  const signed = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.ELEVEN_SPEECH_ENGINE_ID}`,
    { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! } },
  ).then((r) => r.json() as Promise<{ signed_url: string }>)
  const ws = new WebSocket(signed.signed_url)

  const transcript: { role: 'user' | 'assistant'; text: string; created_at: string }[] = []
  let agentReplies = 0
  let audioChunks = 0
  let turnSentAt = 0
  let firstAudioLogged = true
  let pendingAnswer = 0
  let interrupted = false
  let done: () => void = () => {}
  const finished = new Promise<void>((resolve) => (done = resolve))

  const sendAnswer = () => {
    const text = answers[pendingAnswer++]
    if (text === undefined) return done()
    console.log(at(), `USER (${asText ? 'text' : 'speech'}):`, text)
    turnSentAt = Date.now()
    firstAudioLogged = false
    if (asText) {
      ws.send(JSON.stringify({ type: 'user_message', text }))
      return
    }
    // Stream the speech in real time, then trailing silence so the turn ends.
    const pcm = Buffer.concat([speak(text), Buffer.alloc(FRAME_BYTES * 25)])
    let off = 0
    const timer = setInterval(() => {
      if (off >= pcm.length || ws.readyState !== ws.OPEN) return clearInterval(timer)
      ws.send(JSON.stringify({ user_audio_chunk: pcm.subarray(off, off + FRAME_BYTES).toString('base64') }))
      off += FRAME_BYTES
      if (off >= pcm.length - FRAME_BYTES * 25 && turnSentAt) turnSentAt = Date.now()
    }, FRAME_MS)
  }

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'conversation_initiation_client_data',
      dynamic_variables: start.eleven.dynamic_variables,
    }))
  })

  ws.on('message', (raw) => {
    const event = JSON.parse(raw.toString())
    switch (event.type) {
      case 'conversation_initiation_metadata':
        console.log(at(), 'connected', event.conversation_initiation_metadata_event.conversation_id)
        if (start.eleven.kickoff) {
          turnSentAt = Date.now()
          firstAudioLogged = false
          ws.send(JSON.stringify({ type: 'user_message', text: start.eleven.kickoff }))
        } else {
          setTimeout(sendAnswer, 500)
        }
        break
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', event_id: event.ping_event.event_id }))
        break
      case 'audio':
        audioChunks++
        if (!firstAudioLogged) {
          firstAudioLogged = true
          console.log(at(), `first audio ${Date.now() - turnSentAt} ms after the user's turn ended`)
          if (interrupt && agentReplies === 1 && !interrupted) {
            interrupted = true
            setTimeout(() => {
              console.log(at(), 'BARGE-IN')
              sendAnswer()
            }, 1500)
          }
        }
        break
      case 'user_transcript': {
        const text = event.user_transcription_event.user_transcript
        console.log(at(), 'HEARD:', text)
        if (text !== start.eleven.kickoff) transcript.push({ role: 'user', text, created_at: new Date().toISOString() })
        break
      }
      case 'agent_response': {
        const text = event.agent_response_event.agent_response
        console.log(at(), 'DODO:', text)
        transcript.push({ role: 'assistant', text, created_at: new Date().toISOString() })
        agentReplies++
        // Let the speech play out (≈ 15 chars/s) before answering — except
        // for the reply being barged into, whose answer is already on its way.
        if (!(interrupted && agentReplies === 2)) {
          setTimeout(sendAnswer, Math.min(20000, (text.length / 15) * 1000) + 800)
        }
        break
      }
      case 'interruption':
        console.log(at(), 'INTERRUPTION event')
        break
      case 'agent_response_correction':
        console.log(at(), 'CORRECTED (spoken part):', event.agent_response_correction_event.corrected_agent_response)
        break
      default:
        console.log(at(), event.type)
    }
  })
  ws.on('close', (code, reason) => {
    console.log(at(), 'ws closed', code, reason.toString())
    done()
  })
  ws.on('error', (err) => console.log('ws error', err.message))

  const timeout = setTimeout(() => {
    console.log('timed out after 150 s')
    done()
  }, 150_000)
  await finished
  clearTimeout(timeout)
  ws.close()

  check('dodo-spoke', agentReplies > 0, `${agentReplies} replies`)
  check('audio-arrived', audioChunks > 0, `${audioChunks} chunks`)
  check('all-turns-answered', agentReplies >= answers.length, `${agentReplies}/${answers.length + (start.eleven.kickoff ? 1 : 0)}`)
  if (!asText) check('speech-heard', transcript.some((t) => t.role === 'user'))

  // 3. Finish through the same route the phone uses.
  const finish = await fetch(`${base}/api/f2/live/session/${voiceSessionId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ transcript, summary: 'Headless ElevenLabs engine check.' }),
  })
  check('transcript-uploaded', finish.ok, `${finish.status}, ${transcript.length} turns`)

  console.log('\n' + results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
