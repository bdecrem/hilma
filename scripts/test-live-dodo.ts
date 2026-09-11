// Headless GPT-Live conversation check for Dodo's voice modes.
//
// Builds the SAME session config the /api/f2/live/session route builds (live
// prompt + backend prompt + voice) for the F2 test account, opens it over the
// Live WebSocket (audio as PCM16 @ 24 kHz), lets Dodo open, then answers out
// loud with macOS `say`, and prints both transcripts, every delegation and
// the final usage. Proves the prompts, the Responses delegation and the
// transcript stream end to end without a phone.
//
//   npx tsx scripts/test-live-dodo.ts [mode] [threadId] [--answer "text"]
//
//   mode      global | topic | final_review | second_chance | recert | flash
//             (default final_review; second_chance/recert skip the route's
//             eligibility checks — this drives the builders directly)
//   threadId  default: the test account's "French Revolution" topic (2 stars)
//   --nudge   in global/topic mode, ask Dodo to greet first (the sim drill's
//             path) instead of the user speaking first
//
// Needs OPENAI_API_KEY + SUPABASE_* in .env.local. Test account only.
import { readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const T = '853d0054-7de2-4359-9133-8c14ff3f2653' // newx-test, never Bart's
const DEFAULT_THREAD = 'a2b5d604-eb61-4538-b7fa-0470ea54c2c4' // French Revolution Overview
const RATE = 24000
const FRAME_MS = 100
const FRAME_BYTES = (RATE * 2 * FRAME_MS) / 1000

const args = process.argv.slice(2)
const answerIdx = args.indexOf('--answer')
const customAnswer = answerIdx >= 0 ? args[answerIdx + 1] : null
const nudge = args.includes('--nudge')
const positional = args.filter((a, i) => !a.startsWith('--') && (answerIdx < 0 || i !== answerIdx + 1))
const mode = (positional[0] ?? 'final_review') as
  | 'global' | 'topic' | 'final_review' | 'second_chance' | 'recert' | 'flash'
const threadId = positional[1] ?? DEFAULT_THREAD

/// Spoken PCM16 mono @ 24 kHz from macOS `say`.
function speak(text: string): Buffer {
  const aiff = join(tmpdir(), `live-say-${Date.now()}.aiff`)
  const wav = aiff.replace(/\.aiff$/, '.wav')
  execFileSync('say', ['-v', 'Samantha', '-o', aiff, text])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav])
  const buf = readFileSync(wav)
  rmSync(aiff, { force: true })
  rmSync(wav, { force: true })
  // Walk RIFF chunks to the 'data' chunk (afconvert may emit extra chunks).
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') return buf.subarray(off + 8, off + 8 + size)
    off += 8 + size + (size % 2)
  }
  throw new Error('no data chunk in WAV')
}

async function main() {
  const { getThreadById } = await import('../src/lib/f2/threads')
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const { applyVoiceStyle, getVoicePrefs, realtimeVoice } = await import('../src/lib/f2/realtime')
  const live = await import('../src/lib/f2/live')

  const { data: userRow } = await f2Supabase().from('f2_users').select('username').eq('id', T).single()
  const userName = (userRow?.username as string) ?? 'test'
  const thread = mode === 'global' ? null : await getThreadById(T, threadId)
  if (mode !== 'global' && !thread) throw new Error('thread not found for the test account')

  let instructions: string
  let cards: { question: string; answer: string }[] | undefined
  switch (mode) {
    case 'flash':
      cards = [
        { question: 'In what year did the French Revolution begin?', answer: '1789' },
        { question: 'What prison was stormed on July 14, 1789?', answer: 'The Bastille' },
      ]
      instructions = live.buildLiveFlashInstructions({ userName, topicLabel: thread?.topic ?? null, cards })
      break
    case 'final_review':
      instructions = live.buildLiveFinalReviewInstructions({ userName, thread: thread! })
      break
    case 'second_chance':
      instructions = live.buildLiveSecondChanceInstructions({ userName, thread: thread!, weaknesses: ['The role of the Estates-General'] })
      break
    case 'recert':
      instructions = live.buildLiveRecertInstructions({ userName, thread: thread!, weaknesses: [] })
      break
    default:
      instructions = live.buildLiveTalkInstructions({ mode, userName, thread })
  }
  const prefs = await getVoicePrefs(T)
  instructions = applyVoiceStyle(instructions, prefs.style)
  const session = live.buildLiveSessionConfig({
    instructions,
    backendInstructions: live.buildBackendInstructions({ mode, userName, thread, cards }),
    voice: prefs.voice ?? realtimeVoice(),
    userName,
  })
  const opening = live.liveOpeningInstruction(mode, userName)
  console.log(`mode=${mode} live=${session.model} backend=${session.delegation.responses.model} voice=${session.audio.output.voice}`)
  console.log(`live prompt ${session.instructions.length} chars · backend prompt ${session.delegation.responses.instructions.length} chars · opening=${opening ? 'yes' : 'no'}`)

  const answerText =
    customAnswer ??
    (mode === 'flash'
      ? 'Seventeen eighty nine.'
      : mode === 'global'
        ? 'Can you explain in two sentences why the sky is blue?'
        : mode === 'topic'
          ? 'What does the material say caused the financial crisis before the revolution? Keep it short.'
          : 'My main takeaway is that the French Revolution started in 1789 because the monarchy was bankrupt after the wars and the Estates-General could not agree on how to vote, so the Third Estate formed the National Assembly. And the storming of the Bastille on July 14th showed that Paris itself had turned against the king.')

  const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  } as unknown as string[])
  const send = (o: unknown) => ws.send(JSON.stringify(o))

  let started = false
  let userText = ''
  let dodoText = ''
  let lastDodoAt = 0
  let dodoSpokeAfterAnswer = false
  let answered = false
  let answerQueue: Buffer[] = []
  const delegations: string[] = []
  const nested: string[] = []
  let closed = false
  const t0 = Date.now()
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

  // Continuous input: silence frames, or the queued answer, every 100 ms.
  const silence = Buffer.alloc(FRAME_BYTES)
  const ticker = setInterval(() => {
    if (!started || closed) return
    const frame = answerQueue.length ? answerQueue.shift()! : silence
    send({ type: 'session.input_audio.append', audio: frame.toString('base64') })
  }, FRAME_MS)

  const finish = () => {
    if (closed) return
    closed = true
    clearInterval(ticker)
    log('closing')
    send({ type: 'session.close' })
    setTimeout(() => {
      console.log('FAIL no session.closed within 15s')
      ws.close()
      process.exit(1)
    }, 15000).unref()
  }

  ws.addEventListener('open', () => {
    send({
      type: 'session.start',
      event_id: 'start',
      session: { ...session, audio: { format: { type: 'audio/pcm', rate: RATE }, output: session.audio.output } },
    })
  })
  ws.addEventListener('error', (e) => {
    console.log('WS error', (e as ErrorEvent).message)
    process.exit(1)
  })
  ws.addEventListener('message', (m) => {
    const ev = JSON.parse(String(m.data))
    switch (ev.type) {
      case 'session.started':
        started = true
        log(`session.started ${ev.session?.id}`)
        if (opening) {
          send({ type: 'session.instructions.append', event_id: 'opening', delegation_id: null, content: opening })
        } else if (nudge) {
          send({ type: 'session.instructions.append', event_id: 'nudge', delegation_id: null,
                 content: "Greet the user by name in one short sentence and ask what they'd like to talk about. Speak now, then listen." })
          log('nudged greeting')
        } else {
          // Talk-to-Dodo waits for the user: speak first ourselves.
          answerQueue = chunk(speak(answerText))
          answered = true
          log(`user speaks first (${answerQueue.length * FRAME_MS} ms)`)
        }
        break
      case 'session.instructions.appended':
        log(`instructions appended (${ev.client_event_id})`)
        break
      case 'session.output_transcript.delta':
        dodoText += ev.delta
        lastDodoAt = Date.now()
        if (answered && answerQueue.length === 0) dodoSpokeAfterAnswer = true
        break
      case 'session.input_transcript.delta':
        userText += ev.delta
        break
      case 'session.delegation.created':
        delegations.push(`${ev.delegation?.target} ${ev.delegation?.id}`)
        log(`delegation.created target=${ev.delegation?.target}`)
        break
      case 'response.event':
        nested.push(ev.event?.type)
        if (ev.event?.type === 'response.completed' || ev.event?.type === 'response.output_text.done') {
          log(`backend ${ev.event.type}${ev.event?.text ? `: ${String(ev.event.text).slice(0, 200)}` : ''}`)
        }
        break
      case 'session.usage.updated':
        break
      case 'session.closed':
        clearInterval(ticker)
        log(`session.closed reason=${ev.reason} seconds=${ev.usage?.seconds}`)
        report()
        ws.close()
        process.exit(0)
        break
      case 'error':
        log(`ERROR ${ev.error?.code ?? ''} ${ev.error?.message ?? JSON.stringify(ev)}`)
        break
      default:
        if (!ev.type.endsWith('.delta')) log(ev.type)
    }
  })

  function chunk(pcm: Buffer): Buffer[] {
    const out: Buffer[] = []
    for (let i = 0; i < pcm.length; i += FRAME_BYTES) {
      const b = Buffer.alloc(FRAME_BYTES)
      pcm.copy(b, 0, i, Math.min(i + FRAME_BYTES, pcm.length))
      out.push(b)
    }
    // A second of silence so the turn end is unambiguous.
    for (let i = 0; i < 10; i++) out.push(Buffer.alloc(FRAME_BYTES))
    return out
  }

  // Driver: once Dodo has opened and gone quiet, answer; once it has replied
  // to the answer and gone quiet again, close.
  const driver = setInterval(() => {
    if (!started || closed) return
    const quietMs = lastDodoAt ? Date.now() - lastDodoAt : 0
    if (!answered && dodoText.length > 0 && quietMs > 2500) {
      answerQueue = chunk(speak(answerText))
      answered = true
      log(`user answers (${answerQueue.length * FRAME_MS} ms of audio)`)
    } else if (answered && answerQueue.length === 0 && dodoSpokeAfterAnswer && quietMs > 3500) {
      finish()
    }
  }, 250)
  driver.unref()

  setTimeout(() => {
    log('timeout — closing')
    finish()
  }, 110_000).unref()

  function report() {
    console.log('\n--- transcript ---')
    console.log('USER:', userText.trim() || '(nothing transcribed)')
    console.log('DODO:', dodoText.trim() || '(nothing)')
    console.log('--- delegations:', delegations.length ? delegations.join(', ') : 'none')
    console.log('--- nested backend events:', [...new Set(nested)].join(', ') || 'none')
    const openingOk = dodoText.trim().length > 0
    const heardOk = userText.trim().length > 0
    const repliedOk = dodoSpokeAfterAnswer
    console.log(`${openingOk ? 'PASS' : 'FAIL'} dodo-spoke`)
    console.log(`${heardOk ? 'PASS' : 'FAIL'} user-transcribed`)
    console.log(`${repliedOk ? 'PASS' : 'FAIL'} dodo-replied-to-user`)
    if (!(openingOk && heardOk && repliedOk)) process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
