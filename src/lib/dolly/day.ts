// The day: one row that moves morning → after_talk → after_things → done.
// Every route reads and writes through here, and the state is the server's;
// the app only asks for today and reports what happened.
import {
  addDays,
  countDays,
  currentStreak,
  findDay,
  hourLabel,
  insertDay,
  listDays,
  listItems,
  localDay,
  scoreItem,
  updateDay,
  updateUser,
  upsertItem,
  type Answer,
  type Day,
  type Item,
  type Question,
  type Thing,
  type User,
} from './core'
import { answerMatches, LANGUAGES } from './language'
import { buildQuestions, extractThings, pickTopic, seedTopic, type TranscriptRow } from './prompts'

export type MapState = 'morning' | 'after_talk' | 'after_things' | 'paused' | 'done'

/** What the app draws. */
export type DayView = {
  id: string
  day: string
  n: number
  topic: string
  state: MapState
  streak: number
  best_streak: number
  daily_hour: number
  daily_label: string
  things: Thing[]
  questions: Question[]
  answers: Answer[]
  call_seconds: number | null
  /** The trail: a few days back and a few ahead, bottom to top. */
  trail: { n: number; done: boolean; today: boolean }[]
  /** Done only: what feeds tomorrow's call. */
  coming_back: string[]
  tomorrow: string | null
}

export function mapState(day: Day): MapState {
  if (day.state === 'after_things' && day.answers.length > 0) return 'paused'
  return day.state
}

/** Today's row, created on first sight (the tick or the app, whichever
 *  comes first). The topic is what the last done picked, else a seed. */
export async function ensureToday(user: User, now = new Date()): Promise<Day> {
  const today = localDay(now, user.tz)
  const existing = await findDay(user.id, today)
  if (existing) return existing
  const n = (await countDays(user.id)) + 1
  const topic = user.next_topic ?? seedTopic(n)
  const day = await insertDay({ user_id: user.id, day: today, n, topic })
  if (user.next_topic) await updateUser(user.id, { next_topic: null })
  return day
}

export async function dayView(user: User, day: Day, now = new Date()): Promise<DayView> {
  const recent = await listDays(user.id, 8)
  const doneN = new Set(recent.filter((d) => d.state === 'done').map((d) => d.n))
  const from = Math.max(1, day.n - 4)
  const trail: DayView['trail'] = []
  for (let n = from; n < from + 8; n++) trail.push({ n, done: n === day.n ? day.state === 'done' : doneN.has(n), today: n === day.n })
  const misses = day.answers.filter((a) => !a.ok).map((a) => day.questions?.[a.q]?.target).filter((t): t is string => !!t)
  const comingBack = day.state === 'done' ? Array.from(new Set([...(day.things ?? []).map((t) => t.target), ...misses])).slice(0, 4) : []
  return {
    id: day.id,
    day: day.day,
    n: day.n,
    topic: day.topic,
    state: mapState(day),
    streak: currentStreak(user, now),
    best_streak: user.best_streak,
    daily_hour: user.daily_hour,
    daily_label: hourLabel(user.daily_hour),
    things: day.things ?? [],
    questions: day.questions ?? [],
    answers: day.answers,
    call_seconds: day.call_seconds,
    trail,
    coming_back: comingBack,
    tomorrow: day.state === 'done' ? user.next_topic : null,
  }
}

/** The items tomorrow's call works back in: recent misses first, then
 *  yesterday's things. */
export async function comingBackItems(user: User, now = new Date()): Promise<Item[]> {
  const items = await listItems(user.id)
  const yesterday = addDays(localDay(now, user.tz), -1)
  const recentDays = await listDays(user.id, 3)
  const yesterdayThings = new Set(recentDays.filter((d) => d.day === yesterday).flatMap((d) => (d.things ?? []).map((t) => t.target)))
  return items
    .filter((i) => i.misses > i.hits || yesterdayThings.has(i.target))
    .sort((a, b) => b.misses - b.hits - (a.misses - a.hits) || (b.last_seen ?? '').localeCompare(a.last_seen ?? ''))
    .slice(0, 6)
}

// ---------- the call ends ----------

/** The talk finished: keep the transcript, pull three things out of it.
 *  A call with nothing said by the learner leaves the day as it was, so
 *  they can call again. */
export async function finishTalk(user: User, day: Day, sessionId: string, transcript: TranscriptRow[], seconds: number | null): Promise<Day> {
  const spoken = transcript.filter((r) => r.role === 'user' && r.text.trim()).length
  if (day.state !== 'morning') return day
  if (spoken === 0) return updateDay(day.id, { call_session_id: sessionId, call_seconds: seconds })
  const raw = await extractThings(user, transcript)
  const things: Thing[] = []
  for (const t of raw) {
    const item = await upsertItem(user.id, t, day.n)
    things.push({ ...t, item_id: item.id })
  }
  return updateDay(day.id, { call_session_id: sessionId, call_seconds: seconds, things, state: 'after_talk' })
}

/** The three things were said back: the cards are written. */
export async function finishThings(user: User, day: Day, sessionId: string): Promise<Day> {
  if (day.state !== 'after_talk') return day
  const pool = await listItems(user.id)
  const questions = buildQuestions(user.language, day, pool)
  return updateDay(day.id, { things_session_id: sessionId, questions, state: 'after_things', answers: [] })
}

// ---------- the cards ----------

export type Graded = { day: Day; ok: boolean; target: string; complete: boolean }

export async function answerCard(user: User, day: Day, q: number, answer: string, now = new Date()): Promise<Graded | { error: string; status: number }> {
  if (day.state !== 'after_things') return { error: 'The cards are not open.', status: 409 }
  const questions = day.questions ?? []
  const question = questions[q]
  if (!question) return { error: 'No such card.', status: 400 }
  if (q !== day.answers.length) return { error: `Answer card ${day.answers.length + 1} next.`, status: 409 }
  const ok = question.kind === 'pick' ? answer === question.target : answerMatches(user.language, answer, question)
  const answers: Answer[] = [...day.answers, { q, ok, answer: answer.slice(0, 200) }]
  if (question.item_id) await scoreItem(question.item_id, ok, day.day)
  const complete = answers.length >= questions.length
  let next: Day
  if (complete) {
    next = await updateDay(day.id, { answers, state: 'done', done_at: now.toISOString() })
    await completeDay(user, next, now)
  } else {
    next = await updateDay(day.id, { answers })
  }
  return { day: next, ok, target: question.target, complete }
}

/** The streak ticks and tomorrow's topic is picked. */
async function completeDay(user: User, day: Day, now: Date): Promise<void> {
  const yesterday = addDays(day.day, -1)
  const streak = user.last_done_day === day.day ? user.streak : user.last_done_day === yesterday ? user.streak + 1 : 1
  const recent = await listDays(user.id, 10)
  const comingBack = await comingBackItems(user, now)
  let nextTopic: string
  try {
    nextTopic = await pickTopic(user, recent.map((d) => d.topic), comingBack)
  } catch (e) {
    console.error('[dolly] topic pick failed, seed instead:', e)
    nextTopic = seedTopic(day.n + 1)
  }
  await updateUser(user.id, {
    streak,
    best_streak: Math.max(user.best_streak, streak),
    last_done_day: day.day,
    next_topic: nextTopic,
  })
}

export { LANGUAGES }
