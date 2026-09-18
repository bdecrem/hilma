// Headless check of the level check's opening, over the Live WebSocket:
// Polly says only "Ciao!", the learner stays silent, the client-side nudge
// (the same instruction the app appends after `silence_nudge.after_ms`)
// makes Polly try again in English, the learner answers (macOS `say`),
// Polly carries on. Prints both transcripts and PASS/FAIL lines.
//   npx tsx scripts/polly/test-live-placement.ts [it|fr|ko] [--answer "text"] [--no-silence]
//   --no-silence   answer the greeting straight away in the target language
import { readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const RATE = 24000
const FRAME_MS = 100
const FRAME_BYTES = (RATE * 2 * FRAME_MS) / 1000
const args = process.argv.slice(2)
const answerIdx = args.indexOf('--answer')
const noSilence = args.includes('--no-silence')
const language = (['it', 'fr', 'ko'].includes(args[0]) ? args[0] : 'it') as 'it' | 'fr' | 'ko'
const VOICES = { it: 'Alice', fr: 'Thomas', ko: 'Yuna' }
const answerText = answerIdx >= 0 ? args[answerIdx + 1]
  : noSilence ? { it: 'Ciao! Sto bene, grazie. Mi chiamo Sam.', fr: 'Bonjour ! Ça va bien, merci. Je m’appelle Sam.', ko: '안녕하세요! 저는 샘이에요.' }[language]
  : "Hi! I don't speak any of it yet, I only know a couple of words."

function speak(text: string, voice: string): Buffer {
  const aiff = join(tmpdir(), `live-say-${Date.now()}.aiff`)
  const wav = aiff.replace(/\.aiff$/, '.wav')
  try { execFileSync('say', ['-v', voice, '-o', aiff, text]) } catch { execFileSync('say', ['-o', aiff, text]) }
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav])
  const buf = readFileSync(wav)
  rmSync(aiff, { force: true }); rmSync(wav, { force: true })
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
  const live = await import('../../src/lib/polly/live')
  const { realtimeVoice } = await import('../../src/lib/polly/realtime')
  const userName = 'Sam'
  const session = live.buildLiveSessionConfig({
    instructions: live.buildLivePlacementInstructions({ userName, language }),
    backendInstructions: live.buildBackendInstructions({ mode: 'placement', userName }),
    voice: realtimeVoice(),
    userName,
  })
  const opening = live.liveOpeningInstruction('placement', userName, { language })!
  const nudge = live.livePlacementNudge(userName, language)
  console.log(`language=${language} live prompt ${session.instructions.length} chars · nudge after ${nudge.after_ms} ms`)

  const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  } as unknown as string[])
  const send = (o: unknown) => ws.send(JSON.stringify(o))
  const t0 = Date.now()
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

  let started = false, closed = false
  let pollyText = '', userText = ''
  let greeting = '', nudged = '', reply = ''
  let lastPollyAt = 0
  let stage: 'greeting' | 'nudged' | 'answered' = 'greeting'
  let answerQueue: Buffer[] = []
  const silence = Buffer.alloc(FRAME_BYTES)
  const chunk = (pcm: Buffer) => {
    const out: Buffer[] = []
    for (let i = 0; i < pcm.length; i += FRAME_BYTES) {
      const b = Buffer.alloc(FRAME_BYTES); pcm.copy(b, 0, i, Math.min(i + FRAME_BYTES, pcm.length)); out.push(b)
    }
    for (let i = 0; i < 10; i++) out.push(Buffer.alloc(FRAME_BYTES))
    return out
  }
  const ticker = setInterval(() => {
    if (!started || closed) return
    send({ type: 'session.input_audio.append', audio: (answerQueue.shift() ?? silence).toString('base64') })
  }, FRAME_MS)

  const finish = () => {
    if (closed) return
    closed = true
    clearInterval(ticker)
    send({ type: 'session.close' })
    setTimeout(() => { console.log('FAIL no session.closed within 15s'); process.exit(1) }, 15000).unref()
  }

  ws.addEventListener('open', () => send({
    type: 'session.start', event_id: 'start',
    session: { ...session, audio: { format: { type: 'audio/pcm', rate: RATE }, output: session.audio.output } },
  }))
  ws.addEventListener('error', (e) => { console.log('WS error', (e as ErrorEvent).message); process.exit(1) })
  ws.addEventListener('message', (m) => {
    const ev = JSON.parse(String(m.data))
    switch (ev.type) {
      case 'session.started':
        started = true
        log('session.started')
        send({ type: 'session.instructions.append', event_id: 'opening', delegation_id: null, content: opening })
        break
      case 'session.output_transcript.delta':
        pollyText += ev.delta
        if (stage === 'greeting') greeting += ev.delta
        else if (stage === 'nudged') nudged += ev.delta
        else reply += ev.delta
        lastPollyAt = Date.now()
        break
      case 'session.input_transcript.delta':
        userText += ev.delta
        break
      case 'session.closed':
        log(`session.closed reason=${ev.reason} seconds=${ev.usage?.seconds}`)
        report(); ws.close(); process.exit(process.exitCode ?? 0)
        break
      case 'error':
        log(`ERROR ${ev.error?.code ?? ''} ${ev.error?.message ?? JSON.stringify(ev)}`)
        break
    }
  })

  const driver = setInterval(() => {
    if (!started || closed || !lastPollyAt) return
    // 1.5 s is the app's "Polly went quiet" tail; the nudge timer starts there.
    const quiet = Date.now() - lastPollyAt
    if (stage === 'greeting' && noSilence && quiet > 1500) {
      stage = 'answered'; answerQueue = chunk(speak(answerText, VOICES[language])); log('learner answers the greeting')
    } else if (stage === 'greeting' && quiet > 1500 + nudge.after_ms) {
      stage = 'nudged'
      send({ type: 'session.instructions.append', event_id: 'nudge', delegation_id: null, content: nudge.instruction })
      send({ type: 'session.commentary.append', event_id: 'nudge-say', delegation_id: null, content: nudge.commentary })
      log('silence → nudge appended')
    } else if (stage === 'nudged' && nudged.length > 0 && quiet > 2500) {
      stage = 'answered'; answerQueue = chunk(speak(answerText, 'Samantha')); log('learner answers in English')
    } else if (stage === 'answered' && answerQueue.length === 0 && reply.length > 0 && quiet > 3500) {
      finish()
    }
  }, 250)
  driver.unref()
  setTimeout(() => { log('timeout'); finish() }, 90_000).unref()

  function report() {
    console.log('\nGREETING:', greeting.trim() || '(nothing)')
    if (!noSilence) console.log('NUDGE:   ', nudged.trim() || '(nothing)')
    console.log('LEARNER: ', userText.trim() || '(nothing transcribed)')
    console.log('REPLY:   ', reply.trim() || '(nothing)')
    const words = greeting.trim().split(/\s+/).filter(Boolean).length
    const checks: [boolean, string][] = [
      [words >= 1 && words <= 3, `greeting is just the hello (${words} words)`],
      ...(noSilence ? [] : [[nudged.trim().length > 0 && /\b(you|hello|hi|english)\b/i.test(nudged), 'silence got an English nudge'] as [boolean, string]]),
      [userText.trim().length > 0, 'learner transcribed'],
      [reply.trim().length > 0, 'Polly carried on after the answer'],
    ]
    for (const [ok, label] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) process.exitCode = 1 }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
