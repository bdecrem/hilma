// The day: one row that moves morning → after_talk → after_things → done.
// Every route reads and writes through here, and the state is the server's;
// the app only asks for today and reports what happened. After done: "Talk
// more" (free extra calls) and, with Learning objectives on, the star round
// (a guided call on the level's can-dos → three things → cards), a mini-day
// kept in the day's star_* columns.
import {
  activeAnswers,
  activeQuestions,
  activeThings,
  addDays,
  countDays,
  currentStreak,
  earnCanDo,
  findDay,
  hourLabel,
  insertDay,
  listDays,
  listEarned,
  listItems,
  localDay,
  scoreItem,
  starInProgress,
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
import { canDos, LEVELS, levelInfo, topAuthoredLevel, type CanDo } from './curriculum'
import { answerMatches, LANGUAGES } from './language'
import { annotateStar, buildQuestions, extractThings, pickTopic, seedTopic, type TranscriptRow } from './prompts'

export type MapState = 'morning' | 'after_talk' | 'after_things' | 'paused' | 'done' | 'star_after_talk' | 'star_after_things' | 'star_paused'

export type ObjectivesView = {
  on: boolean
  level: number
  name: string
  tagline: string
  cefr: string
  earned: number
  total: number
  /** False when the level has no content yet, or nothing is left to earn. */
  star_available: boolean
  can_dos: { id: string; title: string; earned: boolean }[]
  /** The whole ladder, for the room. */
  ladder: { n: number; name: string; tagline: string; cefr: string; authored: boolean }[]
}

/** What the app draws. `things`, `questions` and `answers` are the live
 *  flow's: the star round's while it is under way. */
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
  trail: { n: number; done: boolean; today: boolean; starred: boolean }[]
  coming_back: string[]
  tomorrow: string | null
  extra_calls: number
  extra_minutes: number
  /** Everything the extra calls produced today, and the latest call's own. */
  extra_things: Thing[]
  last_extra_things: Thing[]
  starred: boolean
  star: { state: 'after_talk' | 'after_things' | 'done' | null; targets: { id: string; title: string }[]; earned: { id: string; title: string }[]; level_up: boolean } | null
  objectives: ObjectivesView
}

export function mapState(day: Day): MapState {
  if (day.star_state === 'after_talk') return 'star_after_talk'
  if (day.star_state === 'after_things') return day.star_answers.length > 0 ? 'star_paused' : 'star_after_things'
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

// ---------- objectives ----------

export async function objectivesView(user: User): Promise<ObjectivesView> {
  const level = levelInfo(user.rung)
  const list = canDos(user.language, user.rung)
  const earned = new Set((await listEarned(user.id)).map((e) => e.cando_id))
  const can_dos = list.map((c) => ({ id: c.id, title: c.title, earned: earned.has(c.id) }))
  const left = can_dos.filter((c) => !c.earned).length
  return {
    on: user.objectives,
    level: user.rung,
    name: level.name,
    tagline: level.tagline,
    cefr: level.cefr,
    earned: can_dos.length - left,
    total: can_dos.length,
    star_available: list.length > 0 && left > 0,
    can_dos,
    ladder: LEVELS.map((l) => ({ n: l.n, name: l.name, tagline: l.tagline, cefr: l.cefr, authored: l.n <= topAuthoredLevel(user.language) })),
  }
}

/** The next objectives to practice: the first four not yet earned at the
 *  learner's level, in the curriculum's order. */
export async function starTargets(user: User, count = 4): Promise<CanDo[]> {
  const earned = new Set((await listEarned(user.id)).map((e) => e.cando_id))
  return canDos(user.language, user.rung).filter((c) => !earned.has(c.id)).slice(0, count)
}

const titleOf = (user: User, id: string) => canDos(user.language).find((c) => c.id === id)?.title ?? id

export async function dayView(user: User, day: Day, now = new Date()): Promise<DayView> {
  const recent = await listDays(user.id, 8)
  const byN = new Map(recent.map((d) => [d.n, d]))
  const from = Math.max(1, day.n - 4)
  const trail: DayView['trail'] = []
  for (let n = from; n < from + 8; n++) {
    const d = n === day.n ? day : byN.get(n)
    trail.push({ n, done: d?.state === 'done', today: n === day.n, starred: !!d?.starred_at })
  }
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
    things: activeThings(day),
    questions: activeQuestions(day),
    answers: activeAnswers(day),
    call_seconds: day.call_seconds,
    trail,
    coming_back: comingBack,
    tomorrow: day.state === 'done' ? user.next_topic : null,
    extra_calls: day.extra_calls,
    extra_minutes: Math.round(day.extra_seconds / 60),
    extra_things: (day.extra_things ?? []).flat(),
    last_extra_things: (day.extra_things ?? []).at(-1) ?? [],
    starred: !!day.starred_at,
    star: day.star_state
      ? {
          state: day.star_state,
          targets: (day.star_targets ?? []).map((id) => ({ id, title: titleOf(user, id) })),
          earned: (day.star_earned ?? []).map((id) => ({ id, title: titleOf(user, id) })),
          level_up: day.star_level_up,
        }
      : null,
    objectives: await objectivesView(user),
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

/** An extra call: counted, and its three things kept — shown once, then
 *  into the pool for tomorrow. No say-back round and no cards. */
export async function finishMore(user: User, day: Day, transcript: TranscriptRow[], seconds: number | null): Promise<Day> {
  const spoken = transcript.filter((r) => r.role === 'user' && r.text.trim()).length
  let things: Thing[] = []
  if (spoken > 0) {
    try {
      const raw = await extractThings(user, transcript)
      for (const t of raw) {
        const item = await upsertItem(user.id, t, day.n)
        things.push({ ...t, item_id: item.id })
      }
    } catch (e) {
      console.error('[dolly] extra call: things failed, call kept anyway:', e)
      things = []
    }
  }
  return updateDay(day.id, {
    extra_calls: day.extra_calls + 1,
    extra_seconds: day.extra_seconds + (seconds ?? 0),
    extra_things: [...(day.extra_things ?? []), things],
  })
}

/** The star round's call finished: read it against the targets, earn what
 *  was demonstrated, and set up three things from the targets. A round
 *  where the learner said nothing is dropped, so it can be started again. */
export async function finishStar(user: User, day: Day, sessionId: string, transcript: TranscriptRow[], seconds: number | null): Promise<Day> {
  if (day.star_state) return day
  const spoken = transcript.filter((r) => r.role === 'user' && r.text.trim()).length
  if (spoken === 0) return updateDay(day.id, { star_targets: null, star_session_id: sessionId })
  const targets = (day.star_targets ?? []).map((id) => canDos(user.language).find((c) => c.id === id)).filter((c): c is CanDo => !!c)
  if (targets.length === 0) return day
  const results = await annotateStar(user, targets, transcript)
  const earned: string[] = []
  for (const r of results) {
    if (!r.demonstrated) continue
    await earnCanDo(user.id, r.id, user.rung, r.evidence)
    earned.push(r.id)
  }
  // Three things: the not-yet-demonstrated objectives' items first.
  const ordered = [...results.filter((r) => !r.demonstrated), ...results.filter((r) => r.demonstrated)]
  const things: Thing[] = []
  for (const r of ordered.slice(0, 3)) {
    const item = await upsertItem(user.id, r.practice, day.n)
    things.push({ ...r.practice, item_id: item.id })
  }
  return updateDay(day.id, { star_session_id: sessionId, star_seconds: seconds, star_earned: earned, star_things: things, star_state: 'after_talk', star_answers: [] })
}

/** The three things were said back: the cards are written (the day's, or
 *  the star round's: six cards). */
export async function finishThings(user: User, day: Day, sessionId: string): Promise<Day> {
  const pool = await listItems(user.id)
  if (day.star_state === 'after_talk') {
    const questions = buildQuestions(user.language, day, pool, { things: day.star_things ?? [], max: 6 })
    return updateDay(day.id, { star_things_session_id: sessionId, star_questions: questions, star_state: 'after_things', star_answers: [] })
  }
  if (day.state !== 'after_talk') return day
  const questions = buildQuestions(user.language, day, pool)
  return updateDay(day.id, { things_session_id: sessionId, questions, state: 'after_things', answers: [] })
}

// ---------- the cards ----------

export type Graded = { day: Day; ok: boolean; target: string; complete: boolean }

export async function answerCard(user: User, day: Day, q: number, answer: string, now = new Date()): Promise<Graded | { error: string; status: number }> {
  const star = day.star_state === 'after_things'
  if (!star && day.state !== 'after_things') return { error: 'The cards are not open.', status: 409 }
  const questions = star ? (day.star_questions ?? []) : (day.questions ?? [])
  const answers = star ? day.star_answers : day.answers
  const question = questions[q]
  if (!question) return { error: 'No such card.', status: 400 }
  if (q !== answers.length) return { error: `Answer card ${answers.length + 1} next.`, status: 409 }
  const ok = question.kind === 'pick' ? answer === question.target : answerMatches(user.language, answer, question)
  const next: Answer[] = [...answers, { q, ok, answer: answer.slice(0, 200) }]
  if (question.item_id) await scoreItem(question.item_id, ok, day.day)
  const complete = next.length >= questions.length
  let updated: Day
  if (star) {
    if (complete) {
      const levelUp = await maybeLevelUp(user)
      updated = await updateDay(day.id, { star_answers: next, star_state: 'done', starred_at: now.toISOString(), star_level_up: levelUp })
    } else {
      updated = await updateDay(day.id, { star_answers: next })
    }
  } else if (complete) {
    updated = await updateDay(day.id, { answers: next, state: 'done', done_at: now.toISOString() })
    await completeDay(user, updated, now)
  } else {
    updated = await updateDay(day.id, { answers: next })
  }
  return { day: updated, ok, target: question.target, complete }
}

/** Every can-do of the level earned → the next rung. */
async function maybeLevelUp(user: User): Promise<boolean> {
  const list = canDos(user.language, user.rung)
  if (list.length === 0) return false
  const earned = new Set((await listEarned(user.id)).map((e) => e.cando_id))
  if (!list.every((c) => earned.has(c.id))) return false
  await updateUser(user.id, { rung: user.rung + 1 })
  return true
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

export { LANGUAGES, starInProgress, topAuthoredLevel }
