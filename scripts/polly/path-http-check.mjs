// Agentic Learning Mode over HTTP, as the app does it, on a fresh guest:
// guest account → a canned level-check transcript → POST path/placement →
// the Words and Grammar steps through flash/start + flash/submit, the Talk
// step through the voice session's finish call → the server writes lesson 2
// by itself (after()). Deletes the guest at the end.
//   set -a; . .env.local; set +a; node scripts/polly/path-http-check.mjs [base-url]
import { createClient } from '@supabase/supabase-js'
const BASE = process.argv[2] || 'https://hilma-nine.vercel.app'
const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
let failures = 0, cookie = ''
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
const api = async (path, method = 'GET', body) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`)
  return json
}
const T = [['assistant', 'Ciao!'], ['assistant', "Hi! Answer in Italian if you know some, or just say hello in English."],
  ['user', "Hi, I don't know any Italian yet. Just ciao and grazie."], ['assistant', 'Why do you want to learn it?'],
  ['user', "We're going to Rome in spring. I want to order food and chat a little. I love cooking."],
  ['assistant', "I have what I need. I'm building your first lesson now. Ciao!"]].map(([role, text]) => ({ role, text }))

const guest = await api('/api/polly/auth/guest', 'POST', { username: `httpcheck${Date.now() % 100000}`, language: 'it' })
const userId = guest.user?.id ?? guest.id
console.log('guest', userId)
try {
  let path = (await api('/api/polly/path')).path
  check(path && path.lessons.length === 0 && !path.card_dismissed, 'new user: a path with no lessons, card showing')
  path = (await api('/api/polly/path', 'PATCH', { dismissed: true })).path
  check(path.card_dismissed === true, 'card dismissed')
  const { data: vs } = await sb.from('polly_voice_sessions').insert({ user_id: userId, mode: 'placement', transcript: T, ended_at: new Date().toISOString() }).select('id').single()
  let t = Date.now()
  const placed = await api('/api/polly/path/placement', 'POST', { voice_session_id: vs.id })
  console.log(`placement ${((Date.now() - t) / 1000).toFixed(0)}s → ${placed.path.level}: ${placed.path.lessons.map((l) => l.title).join(' | ')}`)
  check(placed.path.level === 'A0' && placed.path.lessons[0].state === 'current', 'a beginner is placed at A0 with lesson 1 current')
  check(placed.path.card_dismissed === false, 'a new path brings the card back')
  const lessonId = placed.lesson_thread_id
  const topics = (await api('/api/polly/topics')).topics
  check(topics.some((x) => x.id === lessonId && x.kind === 'lesson' && x.path_position === 1), 'lesson 1 is in the topics list as kind lesson')

  // The decks are built after the response; wait for them.
  let start
  for (let i = 0; i < 30; i++) {
    try { start = await api('/api/polly/flash/start', 'POST', { mode: 'choice', thread_id: lessonId, lesson_step: 'grammar' }); break }
    catch { await new Promise((r) => setTimeout(r, 4000)) }
  }
  check(!!start && start.questions.length > 0, `grammar set served (${start?.questions.length} questions)`)
  const submit = async (st) => api('/api/polly/flash/submit', 'POST', { mode: 'choice', thread_id: lessonId, answers: st.questions.map((q) => ({ card_id: q.card_id, answer: q.answer })) })
  let res = await submit(start)
  check(res.lesson_step === 'grammar' && res.lesson_finished === false, 'grammar step recorded, lesson still open')
  start = null
  for (let i = 0; i < 30 && !start; i++) {
    try { start = await api('/api/polly/flash/start', 'POST', { mode: 'choice', thread_id: lessonId, lesson_step: 'words' }) }
    catch { await new Promise((r) => setTimeout(r, 4000)) }
  }
  res = await submit(start)
  check(res.lesson_step === 'words' && res.lesson_finished === false, 'words step recorded, lesson still open')

  // Talk: a voice session on the lesson, finished with a real transcript.
  const { data: talk } = await sb.from('polly_voice_sessions').insert({ user_id: userId, thread_id: lessonId, mode: 'topic' }).select('id').single()
  const spoken = [['assistant', 'Buonasera!'], ['user', 'Buonasera.'], ['assistant', 'Cosa prende?'], ['user', 'Vorrei una pasta.'], ['assistant', 'E da bere?'], ['user', 'Acqua, per favore.']].map(([role, text]) => ({ role, text }))
  const fin = await api(`/api/polly/live/session/${talk.id}`, 'PATCH', { transcript: spoken })
  check(fin.lesson_finished === true, 'the talk step finishes the lesson')
  const detail = (await api(`/api/polly/topics/${lessonId}`)).thread
  check(!!detail.lesson_done_at && detail.lesson_steps.talk && detail.lesson_steps.words && detail.lesson_steps.grammar, 'topic detail shows all three steps done')

  t = Date.now()
  let l2
  for (let i = 0; i < 40; i++) {
    path = (await api('/api/polly/path')).path
    l2 = path.lessons[1]
    if (l2.state === 'current') break
    await new Promise((r) => setTimeout(r, 5000))
  }
  console.log(`lesson 2 after ${((Date.now() - t) / 1000).toFixed(0)}s: [${l2.state}] ${l2.title} — ${l2.grammar}`)
  check(path.lessons[0].state === 'done' && l2.state === 'current' && !!l2.thread_id, 'lesson 1 done; the server wrote lesson 2 on its own')
  check(path.lessons[2].state === 'locked', 'lesson 3 still locked')
} finally {
  await sb.from('polly_users').delete().eq('id', userId)
  console.log('cleaned up')
}
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
