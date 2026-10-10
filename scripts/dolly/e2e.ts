// Dolly, end to end against a backend: the test account's whole day — today
// (created), the call (a canned transcript, or the real ElevenLabs engine
// with --voice: the conversation over its WebSocket transport, answers
// spoken by macOS `say` in Spanish), the three things Claude pulls out, the
// things session, every card, the day complete with a streak and tomorrow's
// topic — then the gates and the tick's pure clock.
//
//   npx tsx scripts/dolly/e2e.ts [--base URL] [--voice] [--keep]
//
//   --base    default http://localhost:3260 (production: https://ola.cx)
//   --voice   talk through ElevenLabs for real; needs ELEVENLABS_API_KEY and
//             DOLLY_ELEVEN_SPEECH_ENGINE_ID (the dev engine locally — the
//             bridge must route it to --base; for production pass the prod
//             engine id in the environment)
//   --keep    leave the test account's day in place (default: wiped first)
//
// Test account only (+1 555 555 0102, created here if missing). Needs
// SUPABASE_URL / SUPABASE_SERVICE_KEY and F2_SESSION_SECRET in .env.local.
import { createHmac } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { dueFor } from '../../src/lib/dolly/tick'
import { answerMatches, normalizeAnswer } from '../../src/lib/dolly/language'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3260'
const voice = args.includes('--voice')
const keep = args.includes('--keep')
/** --until talk|things|cards: stop with the day in that state (for a
 *  simulator drive that opens the app there) and keep it. */
const until = args.includes('--until') ? args[args.indexOf('--until') + 1] : null
const TEST_PHONE = '+15555550102'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })
const results: string[] = []
function check(name: string, ok: boolean, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  console.log(results[results.length - 1])
}
const t0 = Date.now()
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`

async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { cookie: string }): Promise<{ status: number; body: T }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: init.cookie, ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body: T
  try {
    body = JSON.parse(text) as T
  } catch {
    body = { raw: text.slice(0, 200) } as unknown as T
  }
  return { status: res.status, body }
}

/** Spoken PCM16 mono @ 16 kHz from macOS `say`, in Mexican Spanish. */
function speak(text: string): Buffer {
  const aiff = join(tmpdir(), `dolly-say-${Date.now()}.aiff`)
  const wav = aiff.replace(/\.aiff$/, '.wav')
  execFileSync('say', ['-v', 'Eddy (Spanish (Mexico))', '-o', aiff, text])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav])
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

type Row = { role: string; text: string; created_at: string }
const now = () => new Date().toISOString()

const CANNED_TALK: Row[] = [
  { role: 'assistant', text: '¡Hola! ¿Qué tal tu fin de semana?', created_at: now() },
  { role: 'user', text: 'Fue bueno. Fui a la playa con mi hermana.', created_at: now() },
  { role: 'assistant', text: '¡Qué bien! ¿Hacía buen tiempo?', created_at: now() },
  { role: 'user', text: 'Sí, mucho sol. Pero era mucho gente.', created_at: now() },
  { role: 'assistant', text: 'Había mucha gente, claro, un domingo de sol. ¿Y comieron algo rico?', created_at: now() },
  { role: 'user', text: 'Sí, comimos paella en un restaurante pequeño.', created_at: now() },
  { role: 'assistant', text: '¿Madrugaron para ir, o fueron tarde?', created_at: now() },
  { role: 'user', text: '¿Madrugar? No entiendo.', created_at: now() },
  { role: 'assistant', text: 'Madrugar es levantarse muy temprano. ¿Madrugaron?', created_at: now() },
  { role: 'user', text: 'No, no madrugamos. Fuimos a las once.', created_at: now() },
]
const SPOKEN_ANSWERS = [
  'Hola Dolly. Mi fin de semana fue bueno, fui a la playa con mi hermana.',
  'Sí, hacía mucho sol, pero era mucho gente.',
  'Comimos paella en un restaurante pequeño. ¿Qué significa madrugar?',
]

/** The real engine: Dolly speaks first, we answer out loud three times. */
async function talkForReal(start: { eleven: { kickoff: string | null; dynamic_variables: Record<string, string>; wrap: { after_ms: number; cue: string } | null } }): Promise<Row[]> {
  const engine = process.env.DOLLY_ELEVEN_SPEECH_ENGINE_ID
  if (!engine) throw new Error('DOLLY_ELEVEN_SPEECH_ENGINE_ID is not set')
  const signed = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${engine}`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
  }).then((r) => r.json() as Promise<{ signed_url: string }>)
  const ws = new WebSocket(signed.signed_url)
  const rows: Row[] = []
  let replies = 0
  let audio = 0
  let pending = 0
  let wrapped = false
  let done: () => void = () => {}
  const finished = new Promise<void>((resolve) => (done = resolve))
  const FRAME = 3200
  const sendAnswer = () => {
    const text = SPOKEN_ANSWERS[pending++]
    if (text === undefined) {
      if (!wrapped && start.eleven.wrap) {
        wrapped = true
        console.log(at(), 'APP CUE: wrap')
        ws.send(JSON.stringify({ type: 'user_message', text: start.eleven.wrap.cue }))
        return
      }
      return done()
    }
    console.log(at(), 'USER (speech):', text)
    const pcm = Buffer.concat([speak(text), Buffer.alloc(FRAME * 25)])
    let off = 0
    const timer = setInterval(() => {
      if (off >= pcm.length || ws.readyState !== ws.OPEN) return clearInterval(timer)
      ws.send(JSON.stringify({ user_audio_chunk: pcm.subarray(off, off + FRAME).toString('base64') }))
      off += FRAME
    }, 100)
  }
  ws.on('open', () => ws.send(JSON.stringify({ type: 'conversation_initiation_client_data', dynamic_variables: start.eleven.dynamic_variables })))
  ws.on('message', (raw) => {
    const event = JSON.parse(raw.toString())
    switch (event.type) {
      case 'conversation_initiation_metadata':
        console.log(at(), 'connected', event.conversation_initiation_metadata_event.conversation_id)
        if (start.eleven.kickoff) ws.send(JSON.stringify({ type: 'user_message', text: start.eleven.kickoff }))
        else setTimeout(sendAnswer, 500)
        break
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', event_id: event.ping_event.event_id }))
        break
      case 'audio':
        audio++
        break
      case 'user_transcript': {
        const text = event.user_transcription_event.user_transcript
        console.log(at(), 'HEARD:', text)
        if (text !== start.eleven.kickoff && !text.startsWith('[app]')) rows.push({ role: 'user', text, created_at: now() })
        break
      }
      case 'agent_response': {
        const text = event.agent_response_event.agent_response
        console.log(at(), 'DOLLY:', text)
        rows.push({ role: 'assistant', text, created_at: now() })
        replies++
        setTimeout(sendAnswer, Math.min(20000, (text.length / 15) * 1000) + 800)
        break
      }
      default:
        break
    }
  })
  ws.on('close', () => done())
  ws.on('error', (err) => console.log('ws error', err.message))
  const timeout = setTimeout(() => {
    console.log('voice timed out after 150 s')
    done()
  }, 150_000)
  await finished
  clearTimeout(timeout)
  ws.close()
  check('voice: dolly spoke', replies > 0, `${replies} replies`)
  check('voice: audio arrived', audio > 0, `${audio} chunks`)
  check('voice: speech heard', rows.some((r) => r.role === 'user'))
  return rows
}

async function main() {
  // The account, clean.
  let { data: user } = await sb.from('dolly_users').select('*').eq('phone', TEST_PHONE).maybeSingle()
  if (!user) {
    const ins = await sb.from('dolly_users').insert({ phone: TEST_PHONE, language: 'es', level: 'some', daily_hour: 8, tz: 'America/Los_Angeles', name: 'Test' }).select('*').single()
    if (ins.error) throw new Error(ins.error.message)
    user = ins.data
  }
  if (!keep) {
    await sb.from('dolly_voice_sessions').delete().eq('user_id', user.id)
    await sb.from('dolly_days').delete().eq('user_id', user.id)
    await sb.from('dolly_items').delete().eq('user_id', user.id)
    await sb.from('dolly_users').update({ streak: 0, best_streak: 0, last_done_day: null, next_topic: null, prompt_day: null, prompted_at: null, reminder_day: null }).eq('id', user.id)
  }
  const sig = createHmac('sha256', process.env.F2_SESSION_SECRET!).update(`dolly:${user.id}`).digest('hex')
  const cookie = `dolly_session=${user.id}.${sig}`
  console.log('test user', user.id, 'cookie value', `${user.id}.${sig}`)

  // Who am I, and today.
  const me = await api('/api/dolly/me', { cookie })
  check('me', me.status === 200 && (me.body.user as { phone: string })?.phone === TEST_PHONE, String(me.status))
  const bad = await api('/api/dolly/me', { cookie: 'dolly_session=nope.nope' })
  check('me without a session is 401', bad.status === 401)

  type DayView = { id: string; n: number; topic: string; state: string; streak: number; things: { target: string; native: string; kind: string }[]; questions: { kind: string; target: string; options?: string[]; native: string }[]; answers: unknown[]; trail: { n: number; today: boolean; done: boolean }[]; coming_back: string[]; tomorrow: string | null }
  const today = await api<{ day: DayView }>('/api/dolly/today', { cookie })
  check('today created', today.status === 200 && today.body.day?.state === 'morning', `${today.status} day ${today.body.day?.n} "${today.body.day?.topic}"`)
  check('trail has today', today.body.day?.trail?.some((t) => t.today && t.n === today.body.day.n) ?? false)

  // Gates before the talk.
  const early = await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'things' }) })
  check('things before talk is 409', early.status === 409, String(early.status))
  if (until === 'talk') return stopHere('morning')

  // The call.
  type Start = { voice_session: { id: string; mode: string }; eleven: { conversation_token: string; kickoff: string | null; cue_prefix: string; cues: string[]; wrap: { after_ms: number; end_ms: number; cue: string } | null; dynamic_variables: Record<string, string> } }
  const talk = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'talk', hold_to_talk: false }) })
  check('talk session', talk.status === 200 && typeof talk.body.eleven?.conversation_token === 'string', `${talk.status} ${JSON.stringify(talk.body).slice(0, 120)}`)
  check('talk has a wrap cue', (talk.body.eleven?.wrap?.after_ms ?? 0) > 60_000)
  const transcript = voice ? await talkForReal(talk.body) : CANNED_TALK
  console.log(at(), 'finishing the talk', transcript.length, 'rows')
  const fin = await api<{ day: DayView }>(`/api/dolly/voice/${talk.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript, seconds: 178 }) })
  const things = fin.body.day?.things ?? []
  check('talk finished → after_talk', fin.status === 200 && fin.body.day?.state === 'after_talk', `${fin.status} ${fin.body.day?.state}`)
  check('three things', things.length === 3, things.map((t) => `${t.kind}: ${t.target} = ${t.native}`).join(' | '))
  check('talk again is 409', (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'talk' }) })).status === 409)
  if (until === 'things') return stopHere('after_talk')

  // The three things, said back.
  const th = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'things', hold_to_talk: true }) })
  check('things session', th.status === 200 && th.body.eleven?.cues?.length === things.length + 1, `${th.status} cues ${th.body.eleven?.cues?.length}`)
  const saidBack: Row[] = things.flatMap((t) => [
    { role: 'assistant', text: `${t.target}. ${t.native}. Dilo tú.`, created_at: now() },
    { role: 'user', text: t.target, created_at: now() },
    { role: 'assistant', text: '¡Perfecto, lo tienes!', created_at: now() },
  ])
  const fin2 = await api<{ day: DayView }>(`/api/dolly/voice/${th.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: saidBack, seconds: 70 }) })
  const questions = fin2.body.day?.questions ?? []
  check('things finished → after_things', fin2.status === 200 && fin2.body.day?.state === 'after_things', `${fin2.status} ${fin2.body.day?.state}`)
  check('cards written', questions.length >= 6 && questions.length <= 10, `${questions.length}: ${questions.map((q) => q.kind[0]).join('')}`)
  check('picks have four options with the answer', questions.filter((q) => q.kind === 'pick').every((q) => q.options?.length === 4 && q.options.includes(q.target)))
  if (until === 'cards') return stopHere('after_things')

  // The cards, in order, half right.
  let expectedRight = 0
  let last: { ok: boolean; complete: boolean; day: DayView } | null = null
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const right = i % 2 === 0
    let answer: string
    if (q.kind === 'pick') answer = right ? q.target : (q.options!.find((o) => o !== q.target) ?? 'x')
    else answer = right ? q.target.toUpperCase() : 'no sé'
    if (right) expectedRight++
    const r = await api<{ ok: boolean; complete: boolean; day: DayView; error?: string }>('/api/dolly/cards/answer', { method: 'POST', cookie, body: JSON.stringify({ q: i, answer }) })
    if (r.status !== 200 || r.body.ok !== right) check(`card ${i + 1}`, false, `${r.status} ok=${r.body.ok} wanted ${right} (${q.kind} "${answer}" vs "${q.target}") ${r.body.error ?? ''}`)
    last = r.body
  }
  check('every card graded as expected', results.every((r) => !r.startsWith('FAIL card')), `${expectedRight}/${questions.length} right`)
  check('out-of-order answer refused', (await api('/api/dolly/cards/answer', { method: 'POST', cookie, body: JSON.stringify({ q: 0, answer: 'x' }) })).status === 409)
  check('day complete', last?.complete === true && last.day.state === 'done', `${last?.day.state} streak ${last?.day.streak}`)
  check('streak is 1', last?.day.streak === 1)
  check('tomorrow picked', !!last?.day.tomorrow, `"${last?.day.tomorrow}"`)
  check('coming back', (last?.day.coming_back.length ?? 0) > 0, last?.day.coming_back.join(', '))
  const again = await api<{ day: DayView }>('/api/dolly/today', { cookie })
  check('today reads done', again.body.day?.state === 'done')

  // Settings.
  const put = await api<{ user: { daily_hour: number; daily_label: string } }>('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ daily_hour: 19 }) })
  check('settings: hour', put.status === 200 && put.body.user?.daily_label === '7 PM', JSON.stringify(put.body).slice(0, 100))
  await api('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ daily_hour: 8 }) })
  check('settings: bad language refused', (await api('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ language: 'fr' }) })).status === 400)

  // Pure: the typed-answer rules and the clock.
  check('type: accents, case, article', answerMatches('es', 'El Atasco', { target: 'el atasco' }) && answerMatches('es', 'habia mucha gente', { target: 'había mucha gente' }) && !answerMatches('es', 'el barrio', { target: 'el atasco' }))
  check('type: pinyin or characters', answerMatches('zh', 'ni hao', { target: '你好', pinyin: 'nǐ hǎo' }) && answerMatches('zh', '你好', { target: '你好', pinyin: 'nǐ hǎo' }) && normalizeAnswer('zh', 'Nǐ hǎo') === 'nihao')
  const la = { tz: 'America/Los_Angeles', daily_hour: 8, prompt_day: null as string | null, prompted_at: null as string | null, reminder_day: null as string | null }
  const atLA = (h: number) => new Date(Date.UTC(2026, 9, 10, h + 7, 5)) // PDT = UTC-7
  check('tick: before the hour', dueFor(la, atLA(7)) === null)
  check('tick: at the hour', dueFor(la, atLA(8)) === 'prompt')
  check('tick: once a day', dueFor({ ...la, prompt_day: '2026-10-10', prompted_at: atLA(8).toISOString() }, atLA(12)) === null)
  check('tick: reminder at 8 pm', dueFor({ ...la, prompt_day: '2026-10-10', prompted_at: atLA(8).toISOString() }, atLA(20)) === 'reminder')
  check('tick: no reminder within 4 h of the text', dueFor({ ...la, daily_hour: 17, prompt_day: '2026-10-10', prompted_at: atLA(17).toISOString() }, atLA(20)) === null)
  check('tick: reminder once', dueFor({ ...la, prompt_day: '2026-10-10', prompted_at: atLA(8).toISOString(), reminder_day: '2026-10-10' }, atLA(21)) === null)
  check('tick: Tokyo on its own clock', dueFor({ ...la, tz: 'Asia/Tokyo' }, new Date(Date.UTC(2026, 9, 9, 23, 5))) === 'prompt' && dueFor({ ...la, tz: 'Asia/Tokyo' }, new Date(Date.UTC(2026, 9, 9, 22, 5))) === null)

  console.log('\n' + results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

function stopHere(state: string) {
  console.log(`\nstopped with the day at ${state} (--until); the account keeps it`)
  console.log(results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
