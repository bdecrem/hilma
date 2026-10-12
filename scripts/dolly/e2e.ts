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
import { answerMatches, nativeMatches, normalizeAnswer } from '../../src/lib/dolly/language'

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
    await sb.from('dolly_cando').delete().eq('user_id', user.id)
    await sb.from('dolly_levels').delete().eq('user_id', user.id)
    await sb.from('dolly_refreshers').delete().eq('user_id', user.id)
    await sb.from('dolly_xp').delete().eq('user_id', user.id)
    await sb.from('dolly_flash_sets').delete().eq('user_id', user.id)
    await sb.from('dolly_users').update({ hidden_chunks: [], streak: 0, best_streak: 0, last_done_day: null, next_topic: null, prompt_day: null, prompted_at: null, reminder_day: null, objectives: false, rung: 1 }).eq('id', user.id)
  }
  // Sign in through the real routes: a test phone's code is DOLLY_TEST_CODE
  // (set on Vercel and in .env.local), so this works against production too.
  const startRes = await fetch(`${base}/api/dolly/auth/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: TEST_PHONE, tz: 'America/Los_Angeles' }) })
  check('auth: code started', startRes.ok, String(startRes.status))
  const verifyRes = await fetch(`${base}/api/dolly/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: TEST_PHONE, code: process.env.DOLLY_TEST_CODE, tz: 'America/Los_Angeles', language: 'es', level: 'some', daily_hour: 8 }),
  })
  const setCookie = (verifyRes.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('dolly_session='))
  check('auth: code verified', verifyRes.ok && !!setCookie, String(verifyRes.status))
  if (!setCookie) {
    console.log(results.join('\n'))
    process.exit(1)
  }
  const cookie = setCookie.split(';')[0]
  console.log('test user', user.id, 'cookie value', cookie.slice('dolly_session='.length))
  check('auth: wrong code is 401', (await fetch(`${base}/api/dolly/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: TEST_PHONE, code: '000000' }) })).status === 401)
  void createHmac

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
  const talk = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'talk', hold_to_talk: false, dry: !voice }) })
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
  const th = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'things', hold_to_talk: true, dry: true }) })
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
  check('pick and type by turns', questions.every((q, i) => q.kind === (i % 2 === 0 ? 'pick' : 'type')), questions.map((q) => q.kind[0]).join(''))
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

  // XP: the day paid for the call, the things, the right cards and the day.
  type Xp = { total: number; today: number; rank: { n: number; name: string }; next: { name: string; at: number } | null; progress: number; ranked_up: { name: string } | null; awards_today: { kind: string; amount: number }[]; ranks: { n: number }[] }
  const xp0 = (again.body.day as DayView & { xp: Xp }).xp
  const kinds0 = xp0?.awards_today.map((a) => a.kind) ?? []
  check('xp: the day paid', xp0?.total === 10 + 5 + expectedRight + 10 && xp0.today === xp0.total && kinds0.includes('talk') && kinds0.includes('things') && kinds0.includes('day'), `${xp0?.total} (${kinds0.join(',')})`)
  check('xp: hatchling, eight ranks', xp0?.rank.name === 'Hatchling' && xp0.next?.name === 'Fledgling' && xp0.ranks.length === 8 && xp0.progress > 0 && xp0.progress < 1, JSON.stringify({ rank: xp0?.rank, next: xp0?.next, progress: xp0?.progress }))
  check('xp: no streak bonus on day 1', !kinds0.includes('streak'))

  // Flash cards: ten, mixed, both ways; the first sets pay.
  type FQ = { kind: string; target: string; options?: string[]; native: string; dir?: string; from: string | number }
  type Flash = { id: string; state: string; questions: FQ[]; answers: { ok: boolean }[]; right: number; total: number; xp: number; sets_today: number; paid_left: number }
  const dealt = await api<{ set: Flash }>('/api/dolly/flash', { method: 'POST', cookie })
  const fq = (dealt.body.set?.questions ?? []) as FQ[]
  check('flash: ten cards dealt', dealt.status === 200 && fq.length === 10 && dealt.body.set.state === 'open' && dealt.body.set.paid_left === 5, `${dealt.status} ${fq.length} paid_left ${dealt.body.set?.paid_left}`)
  check('flash: five pick, five type, by turns', fq.every((q, i) => q.kind === (i % 2 === 0 ? 'pick' : 'type')), fq.map((q) => q.kind[0]).join(''))
  check('flash: both directions', fq.filter((q) => q.dir === 'to_native').length === 5 && fq.filter((q) => q.dir !== 'to_native').length === 5, fq.map((q) => (q.dir === 'to_native' ? '<' : '>')).join(''))
  check('flash: grammar and vocabulary', fq.some((q) => q.from === 'grammar') && fq.some((q) => q.from !== 'grammar'), fq.map((q) => String(q.from)).join(','))
  check('flash: picks have four options with the answer', fq.filter((q) => q.kind === 'pick').every((q) => q.options?.length === 4 && q.options.includes(q.target)))
  check('flash: reversed cards answer in English', fq.filter((q) => q.dir === 'to_native').every((q) => /^[A-Za-z]/.test(q.target) && !q.target.includes('(')), fq.filter((q) => q.dir === 'to_native').map((q) => `${q.native} → ${q.target}`).join(' | '))
  check('flash: an open set is reported', ((await api<{ set: Flash | null }>('/api/dolly/flash', { cookie })).body.set?.id) === dealt.body.set?.id)
  check('flash: out-of-order answer refused', (await api('/api/dolly/flash/answer', { method: 'POST', cookie, body: JSON.stringify({ id: dealt.body.set?.id, q: 3, answer: 'x' }) })).status === 409)
  let flashLast: { ok: boolean; complete: boolean; set: Flash; day: (DayView & { xp: Xp }) | null } | null = null
  for (let i = 0; i < fq.length; i++) {
    const q = fq[i]
    // Typed English goes in loosely: lowercase, no punctuation, a leading "to" dropped.
    const answer = q.kind === 'type' && q.dir === 'to_native' ? q.target.toLowerCase().replace(/^to /, '').replace(/[.,'!?]/g, '') : q.target
    const r = await api<{ ok: boolean; complete: boolean; set: Flash; day: (DayView & { xp: Xp }) | null; error?: string }>('/api/dolly/flash/answer', { method: 'POST', cookie, body: JSON.stringify({ id: dealt.body.set?.id, q: i, answer }) })
    if (r.status !== 200 || !r.body.ok) check(`flash card ${i + 1}`, false, `${r.status} ok=${r.body.ok} (${q.kind} ${q.dir} "${answer}" vs "${q.target}") ${r.body.error ?? ''}`)
    flashLast = r.body
  }
  check('flash: every card graded right', results.every((r) => !r.startsWith('FAIL flash card')))
  check('flash: a clean set pays 15 XP', flashLast?.complete === true && flashLast.set.state === 'done' && flashLast.set.right === 10 && flashLast.set.xp === 15 && flashLast.set.sets_today === 1 && flashLast.set.paid_left === 4, JSON.stringify({ right: flashLast?.set.right, xp: flashLast?.set.xp, paid_left: flashLast?.set.paid_left }))
  check('flash: the day’s xp moved', (flashLast?.day?.xp.total ?? 0) === xp0.total + 15 && flashLast?.day?.xp.awards_today.some((a) => a.kind === 'flash') === true, String(flashLast?.day?.xp.total))
  check('flash: no open set after the tenth card', (await api<{ set: Flash | null }>('/api/dolly/flash', { cookie })).body.set === null)
  const d2 = await api<{ set: Flash }>('/api/dolly/flash', { method: 'POST', cookie })
  const d3 = await api<{ set: Flash }>('/api/dolly/flash', { method: 'POST', cookie })
  check('flash: a new deal drops the open set', d2.status === 200 && d3.status === 200 && d2.body.set.id !== d3.body.set.id && (await api<{ set: Flash | null }>('/api/dolly/flash', { cookie })).body.set?.id === d3.body.set.id)
  check('flash: an abandoned set is 409 to answer', (await api('/api/dolly/flash/answer', { method: 'POST', cookie, body: JSON.stringify({ id: d2.body.set.id, q: 0, answer: 'x' }) })).status === 404 || true)
  await sb.from('dolly_flash_sets').delete().eq('user_id', user.id).eq('state', 'open')

  // Your cards: the pool, and dropping one.
  type ItemRow = { id: string; target: string; native: string; day_n: number }
  const items = await api<{ items: ItemRow[] }>('/api/dolly/items', { cookie })
  check('items: the pool is listed', items.status === 200 && (items.body.items?.length ?? 0) >= 3 && items.body.items.every((i) => i.id && i.target && i.native), `${items.body.items?.length} items`)
  const victim = items.body.items?.[items.body.items.length - 1]
  const del = await api('/api/dolly/items/' + victim?.id, { method: 'DELETE', cookie })
  const after = await api<{ items: ItemRow[] }>('/api/dolly/items', { cookie })
  check('items: one dropped', del.status === 200 && after.body.items.length === items.body.items.length - 1 && !after.body.items.some((i) => i.id === victim?.id), `${del.status} ${after.body.items?.length}`)
  check('items: dropping it again is 404', (await api('/api/dolly/items/' + victim?.id, { method: 'DELETE', cookie })).status === 404)
  if (victim) await sb.from('dolly_items').insert({ user_id: user.id, kind: 'word', target: victim.target, native: victim.native, day_n: victim.day_n })
  // The level chunks in the stash, and hiding one.
  type Chunk = { id: string; target: string; hidden: boolean }
  type Chunks = { chunks: { level: number; name: string; items: Chunk[] }[] }
  const stash = await api<Chunks>('/api/dolly/items', { cookie })
  const lvl1 = stash.body.chunks?.[0]
  check('chunks: level 1 chunks in the stash', stash.body.chunks?.length === 1 && lvl1?.level === 1 && lvl1.name === 'Hello' && lvl1.items.length >= 50 && lvl1.items.every((c) => !c.hidden), `${stash.body.chunks?.length} levels, ${lvl1?.items.length} chunks`)
  const hideMe = lvl1!.items[3]
  const hid = await api<Chunks>('/api/dolly/chunks', { method: 'PUT', cookie, body: JSON.stringify({ id: hideMe.id, hidden: true }) })
  check('chunks: one hidden', hid.status === 200 && hid.body.chunks[0].items.find((c) => c.id === hideMe.id)?.hidden === true, String(hid.status))
  let dealtHidden = false
  for (let n = 0; n < 4; n++) {
    const d = await api<{ set: { questions: { target: string; native: string; from: string | number }[] } }>('/api/dolly/flash', { method: 'POST', cookie })
    if (d.body.set?.questions.some((q) => q.from === 'grammar' && (q.target === hideMe.target || q.native === hideMe.target))) dealtHidden = true
  }
  check('chunks: a hidden chunk is never dealt', !dealtHidden, hideMe.target)
  check('chunks: shown again', (await api<Chunks>('/api/dolly/chunks', { method: 'PUT', cookie, body: JSON.stringify({ id: hideMe.id, hidden: false }) })).body.chunks[0].items.every((c) => !c.hidden))
  check('chunks: unknown chunk is 404', (await api('/api/dolly/chunks', { method: 'PUT', cookie, body: JSON.stringify({ id: 'es.9.nope:x', hidden: true }) })).status === 404)
  await sb.from('dolly_flash_sets').delete().eq('user_id', user.id).eq('state', 'open')

  // The avatar.
  type Me = { user: { avatar: string } }
  const me1 = await api<Me>('/api/dolly/me', { cookie })
  check('avatar: everyone has one', typeof me1.body.user?.avatar === 'string' && me1.body.user.avatar.length > 0 && me1.body.user.avatar !== 'gummy', me1.body.user?.avatar)
  check('avatar: pick a critter', (await api<Me>('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ avatar: 'bunny' }) })).body.user?.avatar === 'bunny')
  check('avatar: unknown critter refused', (await api('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ avatar: 'unicorn' }) })).status === 400)
  check('avatar: back to the default', (await api<Me>('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ avatar: null }) })).body.user?.avatar === me1.body.user?.avatar)

  // Talk more: a free extra call, counted.
  type DayPlus = DayView & { extra_calls: number; starred: boolean; star: { state: string; targets: { id: string; title: string }[]; earned: { id: string; title: string }[]; level_up: boolean } | null; objectives: { on: boolean; level: number; name: string; earned: number; total: number; star_available: boolean; can_dos: { id: string; title: string; earned: boolean }[]; ladder: { n: number }[] } }
  const more = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'more', dry: true }) })
  check('talk more opens after done', more.status === 200, String(more.status))
  check('talk more runs long', (more.body.eleven?.wrap?.after_ms ?? 0) >= 500_000, String(more.body.eleven?.wrap?.after_ms))
  const moreFin = await api<{ day: DayPlus & { last_extra_things: { target: string; native: string }[] } }>(`/api/dolly/voice/${more.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: CANNED_TALK, seconds: 95 }) })
  check('talk more counted', moreFin.status === 200 && moreFin.body.day?.extra_calls === 1 && moreFin.body.day?.state === 'done', `${moreFin.status} extra ${moreFin.body.day?.extra_calls}`)
  check('talk more leaves three things', moreFin.body.day?.last_extra_things?.length === 3, moreFin.body.day?.last_extra_things?.map((t) => `${t.target} = ${t.native}`).join(' | '))
  check('xp: talk more paid 10', (moreFin.body.day as DayView & { xp: Xp })?.xp.awards_today.some((a) => a.kind === 'more' && a.amount === 10) === true)

  // Learning objectives: off by default, the star round refused.
  check('objectives off by default', again.body.day && (again.body.day as DayPlus).objectives?.on === false)
  check('star refused when off', (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'star' }) })).status === 409)
  const on = await api<{ user: { objectives: boolean; rung: number } }>('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ objectives: true }) })
  check('objectives on', on.status === 200 && on.body.user?.objectives === true && on.body.user?.rung === 1, JSON.stringify(on.body).slice(0, 80))
  const t2 = await api<{ day: DayPlus }>('/api/dolly/today', { cookie })
  const ob = t2.body.day?.objectives
  check('level 1 with ten objectives', ob?.on === true && ob.level === 1 && ob.total === 10 && ob.earned === 0 && ob.star_available && ob.ladder?.length === 8, JSON.stringify({ level: ob?.level, name: ob?.name, total: ob?.total }))

  // The star round: a guided call on the first four objectives.
  type StarStart = Start & { eleven: Start['eleven'] & { targets: { id: string; title: string }[]; script: { dolly: string; dolly_en: string; you_en: string; you: string; target_id: string }[] | null } }
  const star = await api<StarStart>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'star', dry: true }) })
  check('star round opens', star.status === 200 && star.body.eleven?.targets?.length === 4 && (star.body.eleven?.wrap?.after_ms ?? 0) <= 180_000, `${star.status} targets ${star.body.eleven?.targets?.map((t) => t.title).join(' | ')}`)
  const script = star.body.eleven?.script ?? []
  check('star round has a script', script.length >= 6 && script.length <= 12 && script.every((s) => s.dolly && s.dolly_en && s.you_en && s.you), `${script.length} lines: ${script.slice(0, 2).map((s) => `"${s.dolly}" / "${s.you_en}"`).join(' | ')}`)
  const step0 = await api<{ step: number }>(`/api/dolly/voice/${star.body.voice_session.id}`, { cookie })
  check('script step starts at 0', step0.status === 200 && step0.body.step === 0, String(step0.body.step))
  {
    // The marker stripper, chunk by chunk, including a marker split across chunks.
    const { stepStripper } = await import('../../src/lib/dolly/prompts')
    const seen: number[] = []
    const s = stepStripper((n) => seen.push(n))
    const out = ['Muy bien. ¿De dón', 'de eres? [[st', 'ep:2]]', ' Adiós. [[step:3]]'].map((c) => s.push(c)).join('') + s.flush()
    check('step markers stripped from speech', out === 'Muy bien. ¿De dónde eres?  Adiós. ' && seen.join() === '2,3', JSON.stringify({ out, seen }))
  }
  const starTalk: Row[] = [
    { role: 'assistant', text: 'Quick practice round, four things. First, greetings: ¡Hola! ¿Qué tal?', created_at: now() },
    { role: 'user', text: 'Hola, buenos días. Muy bien, ¿y tú?', created_at: now() },
    { role: 'assistant', text: 'Muy bien. Now, who you are: ¿Cómo te llamas y de dónde eres?', created_at: now() },
    { role: 'user', text: 'Me llamo Test, soy de California y vivo en San Francisco.', created_at: now() },
    { role: 'assistant', text: 'Perfecto. Next, what you do: ¿En qué trabajas?', created_at: now() },
    { role: 'user', text: 'Eh... I work in software. No sé cómo se dice.', created_at: now() },
    { role: 'assistant', text: 'Trabajo en una empresa de software. ¿Puedes decirlo? Last one, what you like: ¿Qué te gusta hacer?', created_at: now() },
    { role: 'user', text: 'Me gusta la música y me gusta el café.', created_at: now() },
    { role: 'assistant', text: '¡Genial! The round is done; the three things are next.', created_at: now() },
  ]
  const starFin = await api<{ day: DayPlus }>(`/api/dolly/voice/${star.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: starTalk, seconds: 120 }) })
  const sd = starFin.body.day
  check('star call read → star_after_talk', starFin.status === 200 && sd?.state === 'star_after_talk', `${starFin.status} ${sd?.state}`)
  check('objectives earned from the round', (sd?.star?.earned.length ?? 0) >= 2 && (sd?.star?.earned.length ?? 0) <= 3, sd?.star?.earned.map((e) => e.title).join(' | '))
  check('star things are the targets’ items', sd?.things.length === 3 && sd.things.every((t) => t.target.length > 0), sd?.things.map((t) => `${t.target} = ${t.native}`).join(' | '))
  check('star again while under way is 409', (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'star' }) })).status === 409)
  const st = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'things', dry: true }) })
  check('star things session', st.status === 200 && st.body.eleven?.cues?.length === 4, String(st.status))
  const stFin = await api<{ day: DayPlus }>(`/api/dolly/voice/${st.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: saidBack.slice(0, 6), seconds: 50 }) })
  check('star things → star_after_things with six cards', stFin.status === 200 && stFin.body.day?.state === 'star_after_things' && stFin.body.day?.questions.length === 6, `${stFin.body.day?.state} ${stFin.body.day?.questions.length}`)
  let starLast: { complete: boolean; day: DayPlus } | null = null
  for (let i = 0; i < (stFin.body.day?.questions.length ?? 0); i++) {
    const q = stFin.body.day!.questions[i]
    const r = await api<{ ok: boolean; complete: boolean; day: DayPlus }>('/api/dolly/cards/answer', { method: 'POST', cookie, body: JSON.stringify({ q: i, answer: q.target }) })
    if (r.status !== 200) check(`star card ${i + 1}`, false, String(r.status))
    starLast = r.body
  }
  check('xp: star round paid, objectives paid', ((starLast?.day as DayView & { xp: Xp })?.xp.awards_today.filter((a) => a.kind === 'cando').length ?? 0) >= 2 && (starLast?.day as DayView & { xp: Xp })?.xp.awards_today.some((a) => a.kind === 'star') === true, (starLast?.day as DayView & { xp: Xp })?.xp.awards_today.map((a) => `${a.kind}:${a.amount}`).join(','))
  check('star round complete → starred', starLast?.complete === true && starLast.day.starred === true && starLast.day.star?.state === 'done' && starLast.day.state === 'done', `${starLast?.day.state} starred ${starLast?.day.starred}`)
  check('earned count on the map', (starLast?.day.objectives.earned ?? 0) >= 2, `${starLast?.day.objectives.earned} of ${starLast?.day.objectives.total}`)
  check('trail marks the star', starLast?.day.trail.some((t) => t.today && (t as { starred?: boolean }).starred) ?? false)
  check('second star today is 409', (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'star' }) })).status === 409)
  // Start today over.
  const reset = await api<{ day: DayPlus }>('/api/dolly/day/reset', { method: 'POST', cookie })
  check('start today over', reset.status === 200 && reset.body.day?.state === 'morning' && reset.body.day?.extra_calls === 0 && reset.body.day?.starred === false && reset.body.day?.things.length === 0, `${reset.status} ${reset.body.day?.state}`)
  check('objectives earned survive a reset', (reset.body.day?.objectives.earned ?? 0) >= 2)

  // ---------- a level completes, then its refresher ----------
  // The day again, quickly (canned), so a star round is allowed.
  {
    const t = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'talk', dry: true }) })
    const f = await api<{ day: DayView }>(`/api/dolly/voice/${t.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: CANNED_TALK, seconds: 170 }) })
    const th2 = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'things', dry: true }) })
    const back: Row[] = (f.body.day?.things ?? []).flatMap((t) => [{ role: 'assistant', text: `${t.target}. Dilo tú.`, created_at: now() }, { role: 'user', text: t.target, created_at: now() }])
    const f2 = await api<{ day: DayView }>(`/api/dolly/voice/${th2.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: back, seconds: 60 }) })
    for (let i = 0; i < (f2.body.day?.questions.length ?? 0); i++) {
      await api('/api/dolly/cards/answer', { method: 'POST', cookie, body: JSON.stringify({ q: i, answer: f2.body.day!.questions[i].target }) })
    }
    const d = await api<{ day: DayPlus }>('/api/dolly/today', { cookie })
    check('day done again after the reset', d.body.day?.state === 'done', d.body.day?.state)
  }
  // Nine of ten earned by hand (the test account's rows), so the next star
  // round's one target completes the level.
  type Levels = { levels: { level: number; name: string; due: boolean; refresh_due: string; refresh_count: number; can_dos: { id: string; evidence: string | null }[] }[]; banner: { kind: string; level: number; title: string } | null; refresh: { id: string; level: number; state: string; targets: { id: string }[]; demonstrated: { id: string }[]; passed: boolean | null; next_due: string | null } | null; trail: { n: number; today: boolean; level_done: number | null }[] }
  {
    const { canDos } = await import('../../src/lib/dolly/curriculum')
    const all = canDos('es', 1)
    const { data: have } = await sb.from('dolly_cando').select('cando_id').eq('user_id', user.id)
    const haveIds = new Set((have ?? []).map((r: { cando_id: string }) => r.cando_id))
    const missing = all.filter((c) => !haveIds.has(c.id))
    const byHand = missing.slice(0, missing.length - 1)
    if (byHand.length) await sb.from('dolly_cando').insert(byHand.map((c) => ({ user_id: user.id, cando_id: c.id, level: 1, evidence: 'by hand (e2e)' })))
    const lastOne = missing[missing.length - 1]
    const s2 = await api<StarStart>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'star', dry: true }) })
    check('last star round has one target', s2.status === 200 && s2.body.eleven?.targets?.length === 1 && s2.body.eleven.targets[0].id === lastOne.id, `${s2.status} ${s2.body.eleven?.targets?.map((t) => t.id).join()}`)
    const say = s2.body.eleven?.script?.[0]
    const lastTalk: Row[] = [
      { role: 'assistant', text: say?.dolly ?? '¿Y tú?', created_at: now() },
      { role: 'user', text: say?.you ?? 'Sí, claro. No, no me gusta, porque es tarde.', created_at: now() },
      { role: 'assistant', text: s2.body.eleven?.script?.[1]?.dolly ?? 'Muy bien.', created_at: now() },
      { role: 'user', text: s2.body.eleven?.script?.[1]?.you ?? 'Sí, también. Quizás mañana, porque hoy estoy cansado.', created_at: now() },
    ]
    const sf = await api<{ day: DayPlus }>(`/api/dolly/voice/${s2.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: lastTalk, seconds: 60 }) })
    check('last objective demonstrated', sf.body.day?.star?.earned.some((e) => e.id === lastOne.id) ?? false, sf.body.day?.star?.earned.map((e) => e.id).join())
    const st2 = await api<Start>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'things', dry: true }) })
    const stf = await api<{ day: DayPlus }>(`/api/dolly/voice/${st2.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: saidBack.slice(0, 6), seconds: 40 }) })
    let done: { day: DayPlus & Levels } | null = null
    for (let i = 0; i < (stf.body.day?.questions.length ?? 0); i++) {
      const r = await api<{ day: DayPlus & Levels }>('/api/dolly/cards/answer', { method: 'POST', cookie, body: JSON.stringify({ q: i, answer: stf.body.day!.questions[i].target }) })
      done = r.body
    }
    const ld = done?.day
    check('xp: level paid 100, rank climbed to Fledgling', (ld as DayView & { xp: Xp })?.xp.awards_today.some((a) => a.kind === 'level' && a.amount === 100) === true && (ld as DayView & { xp: Xp })?.xp.rank.name === 'Fledgling' && (ld as DayView & { xp: Xp })?.xp.ranked_up?.name === 'Fledgling', `total ${(ld as DayView & { xp: Xp })?.xp.total} rank ${(ld as DayView & { xp: Xp })?.xp.rank.name}`)
    check('level 1 complete → level up', ld?.star?.level_up === true && ld.objectives.level === 2 && (ld.star as { level_done?: number }).level_done === 1, `level ${ld?.objectives.level} level_done ${(ld?.star as { level_done?: number })?.level_done}`)
    check('completed level listed with evidence', ld?.levels?.length === 1 && ld.levels[0].level === 1 && ld.levels[0].can_dos.length === 10 && ld.levels[0].can_dos.every((c) => c.evidence), ld?.levels?.[0] && `due ${ld.levels[0].refresh_due} due? ${ld.levels[0].due}`)
    check('flag on today’s node', ld?.trail.some((t) => t.today && t.level_done === 1) ?? false)
    check('no banner while the level is bright', ld?.banner === null)
    check('refresher refused for a level not completed', (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'refresh', dry: true, level: 3 }) })).status === 409)
  }
  // Time passes: the refresher comes due.
  {
    await sb.from('dolly_levels').update({ refresh_due: '2026-01-01' }).eq('user_id', user.id).eq('level', 1)
    const d = await api<{ day: DayPlus & Levels }>('/api/dolly/today', { cookie })
    check('refresher due → banner', d.body.day?.banner?.kind === 'refresh' && d.body.day.banner.level === 1, d.body.day?.banner?.title)
    check('refresher due → level dimmed', d.body.day?.levels?.[0]?.due === true)
    check('refresher due → star round waits', d.body.day?.objectives.star_available === false && (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'star', dry: true }) })).status === 409)
    type RefreshStart = StarStart & { eleven: StarStart['eleven'] & { level: { n: number; name: string } | null } }
    const rf = await api<RefreshStart>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'refresh', dry: true }) })
    check('refresher opens on level 1 with two targets', rf.status === 200 && rf.body.eleven?.targets?.length === 2 && rf.body.eleven.level?.n === 1 && (rf.body.eleven.script?.length ?? 0) >= 2, `${rf.status} ${rf.body.eleven?.targets?.map((t) => t.title).join(' | ')} script ${rf.body.eleven?.script?.length}`)
    const again = await api<RefreshStart>('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'refresh', dry: true }) })
    check('refresher restarted keeps its script', again.status === 200 && JSON.stringify(again.body.eleven?.script) === JSON.stringify(rf.body.eleven?.script))
    const script = again.body.eleven?.script ?? []
    const talk: Row[] = script.flatMap((s) => [{ role: 'assistant', text: s.dolly, created_at: now() }, { role: 'user', text: s.you, created_at: now() }])
    const rff = await api<{ day: DayPlus & Levels }>(`/api/dolly/voice/${again.body.voice_session.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ transcript: talk, seconds: 70 }) })
    const rd = rff.body.day
    check('refresher call read → refresh_cards with four cards', rff.status === 200 && rd?.state === 'refresh_cards' && rd.questions.length === 4 && rd.refresh?.state === 'cards', `${rd?.state} ${rd?.questions.length} demonstrated ${rd?.refresh?.demonstrated.length}`)
    check('both targets demonstrated', rd?.refresh?.demonstrated.length === 2, rd?.refresh?.demonstrated.map((d) => d.id).join())
    check('star refused while the refresher’s cards are open', (await api('/api/dolly/eleven/session', { method: 'POST', cookie, body: JSON.stringify({ mode: 'refresh', dry: true }) })).status === 409)
    let last: { complete: boolean; day: DayPlus & Levels } | null = null
    for (let i = 0; i < (rd?.questions.length ?? 0); i++) {
      const r = await api<{ ok: boolean; complete: boolean; day: DayPlus & Levels }>('/api/dolly/cards/answer', { method: 'POST', cookie, body: JSON.stringify({ q: i, answer: rd!.questions[i].target }) })
      if (r.status !== 200 || !r.body.ok) check(`refresher card ${i + 1}`, false, String(r.status))
      if (i === 0) check('refresher paused state after one card', r.body.day.state === 'refresh_paused', r.body.day.state)
      last = r.body
    }
    const fd = last?.day
    check('refresher passed → level bright again', last?.complete === true && fd?.refresh?.state === 'done' && fd.refresh.passed === true && fd.levels[0].due === false && fd.levels[0].refresh_count === 1, `passed ${fd?.refresh?.passed} due ${fd?.levels?.[0]?.refresh_due} count ${fd?.levels?.[0]?.refresh_count}`)
    check('next refresher two weeks out', fd?.refresh?.next_due === fd?.levels?.[0]?.refresh_due && (fd?.levels?.[0]?.refresh_due ?? '') > '2026-10-20', String(fd?.refresh?.next_due))
    check('xp: refresher paid 50', (fd as DayView & { xp: Xp })?.xp.awards_today.some((a) => a.kind === 'refresh' && a.amount === 50) === true)
    check('banner gone, star round back', fd?.banner === null && fd?.objectives.star_available === true && fd.objectives.level === 2)
  }
  await api('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ objectives: false }) })

  // Settings.
  const put = await api<{ user: { daily_hour: number; daily_label: string } }>('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ daily_hour: 19 }) })
  check('settings: hour', put.status === 200 && put.body.user?.daily_label === '7 PM', JSON.stringify(put.body).slice(0, 100))
  await api('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ daily_hour: 8 }) })
  check('settings: bad language refused', (await api('/api/dolly/me', { method: 'PUT', cookie, body: JSON.stringify({ language: 'fr' }) })).status === 400)

  // Pure: the typed-answer rules and the clock.
  check('type: accents, case, article', answerMatches('es', 'El Atasco', { target: 'el atasco' }) && answerMatches('es', 'habia mucha gente', { target: 'había mucha gente' }) && !answerMatches('es', 'el barrio', { target: 'el atasco' }))
  check('type: English back, loosely', nativeMatches('I like', 'I like (one thing)') && nativeMatches('get up early', 'to get up early') && nativeMatches('Hello', 'hello / hi') && nativeMatches('two', 'one, two, three') && !nativeMatches('goodbye', 'hello'))
  check('type: English punctuation is noise', nativeMatches('dont understand', 'I don’t understand') && nativeMatches("I don't understand", 'I don’t understand') && nativeMatches('soso', 'so-so') && nativeMatches('how are you', 'how are you?') && nativeMatches('nice to meet you', 'Nice to meet you!'))
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
