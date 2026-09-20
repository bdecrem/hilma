// Headless conversation check for POLLY's ElevenLabs voice engine (Speech
// Engine + Claude) — the counterpart of scripts/test-eleven-dodo.ts, in the
// learner's language.
//
// Signs in (a saved guest cookie, or a fresh guest in --lang), finds the
// learner's Infinity conversation topic, starts a session with
// POST /api/polly/eleven/session, talks to ElevenLabs over its WebSocket
// transport with answers SPOKEN in the target language by a native macOS voice
// (so speech-to-text on learner speech is in the loop), and finishes through
// PATCH /api/polly/live/session/:id.
//
//   npx tsx scripts/polly/test-eleven-polly.ts [--base URL] [--lang it|fr|ko]
//       [--cookie "polly_session=…"] [--answer "text"]... [--text]
//
//   --base    default https://hilma-nine.vercel.app (then ELEVEN engine = "Polly";
//             pass POLLY_ELEVEN_SPEECH_ENGINE_ID=<dev id> for a local backend)
//   --cookie  reuse an account. Without it a guest is created — and EVERY guest
//             sign-up texts Bart, so keep the cookie this prints and pass it back.
//
// Needs ELEVENLABS_API_KEY and POLLY_ELEVEN_SPEECH_ENGINE_ID (the engine whose
// bridge path reaches --base).
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

const SAY_VOICES: Record<string, string> = { it: 'Alice', fr: 'Thomas', ko: 'Yuna' }
const DEFAULT_ANSWERS: Record<string, string[]> = {
  it: ['Ciao! Sto bene, grazie. Oggi sono andato al mercato e ho comprato delle mele.', 'Come si dice cheese in italiano?'],
  fr: ["Bonjour ! Ça va bien, merci. Aujourd'hui je suis allé au marché et j'ai acheté des pommes.", 'Comment dit-on cheese en français ?'],
  ko: ['안녕하세요! 저는 잘 지내요. 오늘 시장에 가서 사과를 샀어요.', 'cheese는 한국어로 뭐예요?'],
}
const RATE = 16000
const FRAME_MS = 100
const FRAME_BYTES = (RATE * 2 * FRAME_MS) / 1000

const args = process.argv.slice(2)
const answers: string[] = []
let base = 'https://hilma-nine.vercel.app'
let lang = 'it'
let cookieArg = ''
const positional: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--answer') answers.push(args[++i])
  else if (args[i] === '--base') base = args[++i]
  else if (args[i] === '--lang') lang = args[++i]
  else if (args[i] === '--cookie') cookieArg = args[++i]
  else if (!args[i].startsWith('--')) positional.push(args[i])
}
const asText = args.includes('--text')
const interrupt = args.includes('--interrupt')
const mode = 'topic'
if (answers.length === 0) answers.push(...DEFAULT_ANSWERS[lang])

/// Spoken PCM16 mono @ 16 kHz from macOS `say`.
function speak(text: string): Buffer {
  const aiff = join(tmpdir(), `eleven-say-${Date.now()}.aiff`)
  const wav = aiff.replace(/\.aiff$/, '.wav')
  execFileSync('say', ['-v', SAY_VOICES[lang] ?? 'Samantha', '-o', aiff, text])
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

  // 1. An account with a course in `lang`, and its Infinity conversation topic.
  let cookie = cookieArg
  if (!cookie) {
    const guest = await fetch(`${base}/api/polly/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `eleven-check-${Date.now() % 100000}`, language: lang }),
    })
    if (!guest.ok) throw new Error(`guest sign-up failed (${guest.status}): ${await guest.text()}`)
    cookie = (guest.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    console.log(at(), 'NEW GUEST — reuse it with: --cookie', JSON.stringify(cookie))
  }
  const topicsRes = await fetch(`${base}/api/polly/topics`, { headers: { cookie } })
  const topicsJson = (await topicsRes.json()) as { topics?: { id: string; kind: string; topic: string | null }[] }
  let infinity = (topicsJson.topics ?? []).find((t) => t.kind === 'infinity')
  if (!infinity) {
    // The app creates the Infinity topic the first time that tab is used.
    const made = await fetch(`${base}/api/polly/topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ topic: 'Infinity', kind: 'infinity' }),
    })
    const madeJson = (await made.json()) as { topic?: { id: string; kind: string; topic: string | null }; id?: string }
    if (!made.ok) throw new Error(`could not create the Infinity topic (${made.status}): ${JSON.stringify(madeJson).slice(0, 300)}`)
    infinity = madeJson.topic ?? { id: madeJson.id!, kind: 'infinity', topic: 'Infinity' }
  }
  const threadId = infinity.id
  console.log(at(), 'infinity topic', threadId)

  const startRes = await fetch(`${base}/api/polly/eleven/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ mode, thread_id: threadId }),
  })
  const start = await startRes.json()
  if (!startRes.ok) throw new Error(`session start failed (${startRes.status}): ${JSON.stringify(start)}`)
  const voiceSessionId: string = start.voice_session.id
  console.log(at(), 'session', voiceSessionId, 'model', start.eleven.model, 'kickoff', start.eleven.kickoff)
  check('token-minted', typeof start.eleven.conversation_token === 'string' && start.eleven.conversation_token.length > 20)

  // 2. Open the conversation (WebSocket transport, same dynamic variable).
  const signed = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.POLLY_ELEVEN_SPEECH_ENGINE_ID}`,
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
        console.log(at(), 'POLLY:', text)
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

  check('polly-spoke', agentReplies > 0, `${agentReplies} replies`)
  check('audio-arrived', audioChunks > 0, `${audioChunks} chunks`)
  check('all-turns-answered', agentReplies >= answers.length, `${agentReplies}/${answers.length + (start.eleven.kickoff ? 1 : 0)}`)
  if (!asText) check('speech-heard', transcript.some((t) => t.role === 'user'))

  // 3. Finish through the same route the phone uses.
  const finish = await fetch(`${base}/api/polly/live/session/${voiceSessionId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ transcript, summary: 'Headless ElevenLabs engine check (Polly).' }),
  })
  check('transcript-uploaded', finish.ok, `${finish.status}, ${transcript.length} turns`)

  console.log('\n' + results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
