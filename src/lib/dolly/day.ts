// The day: one row that moves morning → after_talk → after_things → done.
// Every route reads and writes through here, and the state is the server's;
// the app only asks for today and reports what happened. After done: "Talk
// more" (free extra calls) and, with Learning objectives on, the star round
// (a guided call on the level's can-dos → three things → cards), a mini-day
// kept in the day's star_* columns.
import {
  activeThings,
  addDays,
  countDays,
  currentStreak,
  earnCanDo,
  findDay,
  findOpenRefresher,
  listFlashSetsDone,
  hourLabel,
  insertDay,
  insertLevel,
  listDays,
  listEarned,
  listItems,
  listLevels,
  listRefreshers,
  localDay,
  scoreItem,
  starInProgress,
  updateDay,
  updateLevel,
  updateRefresher,
  updateUser,
  upsertItem,
  type Answer,
  type Day,
  type Item,
  type LevelRow,
  type Question,
  type Refresher,
  type Thing,
  type User,
} from './core'
import { canDos, LEVELS, levelInfo, topAuthoredLevel, type CanDo } from './curriculum'
import { answerMatches, LANGUAGES } from './language'
import { annotateStar, buildQuestions, extractThings, pickTopic, seedTopic, type TranscriptRow } from './prompts'
import { award, listXp, MORE_PAID_CALLS_PER_DAY, STREAK_MILESTONES, XP, xpView, type XpView } from './xp'

export type MapState =
  | 'morning'
  | 'after_talk'
  | 'after_things'
  | 'paused'
  | 'done'
  | 'star_after_talk'
  | 'star_after_things'
  | 'star_paused'
  | 'refresh_cards'
  | 'refresh_paused'

/** A completed level, as the map and its sheet show it. */
export type LevelView = {
  level: number
  name: string
  cefr: string
  tagline: string
  completed_day: string
  completed_at: string
  /** Bright until this day; from it on the refresher is due. */
  refresh_due: string
  refreshed_at: string | null
  refresh_count: number
  due: boolean
  can_dos: { id: string; title: string; evidence: string | null; earned_at: string | null }[]
}

/** The refresher under way, or the one done today. */
export type RefreshView = {
  id: string
  level: number
  name: string
  state: 'talk' | 'cards' | 'done'
  targets: { id: string; title: string }[]
  demonstrated: { id: string; title: string }[]
  passed: boolean | null
  /** When it passed: the day the next one is due. */
  next_due: string | null
  /** Its cards: right so far, and how many. */
  right: number
  total: number
}

/** The one banner slot above the day: the most pressing thing, or nothing. */
export type Banner = { kind: 'refresh'; level: number; title: string; text: string }

export type ObjectivesView = {
  on: boolean
  level: number
  name: string
  tagline: string
  cefr: string
  earned: number
  total: number
  /** False when the level has no content yet, nothing is left to earn, or a
   *  completed level's refresher is due (that comes first). */
  star_available: boolean
  /** The completed level whose refresher is due, when one is. */
  refresh_due: { level: number; name: string } | null
  can_dos: { id: string; title: string; evidence: string | null; earned: boolean }[]
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
  trail: { n: number; done: boolean; today: boolean; starred: boolean; level_done: number | null }[]
  coming_back: string[]
  tomorrow: string | null
  extra_calls: number
  extra_minutes: number
  /** Everything the extra calls produced today, and the latest call's own. */
  extra_things: Thing[]
  last_extra_things: Thing[]
  starred: boolean
  star: { state: 'after_talk' | 'after_things' | 'done' | null; targets: { id: string; title: string }[]; earned: { id: string; title: string }[]; level_up: boolean; level_done: number | null } | null
  objectives: ObjectivesView
  /** Every level completed, oldest first, with what earned it. */
  levels: LevelView[]
  refresh: RefreshView | null
  banner: Banner | null
  /** XP and rank (xp.ts): the header, the You sheet, the finish screens' chips. */
  xp: XpView
  /** Flash sets finished today. */
  flash_today: number
}

export function mapState(day: Day, refresher: Refresher | null = null): MapState {
  if (refresher?.state === 'cards') return refresher.answers.length > 0 ? 'refresh_paused' : 'refresh_cards'
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

/** Today back to the morning. Kept words stay kept; the streak and the
 *  objectives earned stay as they are. */
export async function resetToday(day: Day): Promise<Day> {
  return updateDay(day.id, {
    state: 'morning',
    call_session_id: null,
    call_seconds: null,
    things: null,
    things_session_id: null,
    questions: null,
    answers: [],
    done_at: null,
    extra_calls: 0,
    extra_seconds: 0,
    extra_things: [],
    starred_at: null,
    star_state: null,
    star_targets: null,
    star_session_id: null,
    star_seconds: null,
    star_things: null,
    star_things_session_id: null,
    star_questions: null,
    star_answers: [],
    star_earned: null,
    star_level_up: false,
    star_script: null,
  })
}

// ---------- objectives ----------

export async function objectivesView(user: User, now = new Date()): Promise<ObjectivesView> {
  const level = levelInfo(user.rung)
  const list = canDos(user.language, user.rung)
  const earned = new Map((await listEarned(user.id)).map((e) => [e.cando_id, e]))
  const can_dos = list.map((c) => ({ id: c.id, title: c.title, evidence: earned.get(c.id)?.evidence ?? null, earned: earned.has(c.id) }))
  const left = can_dos.filter((c) => !c.earned).length
  const due = (await dueLevels(user, now))[0]
  return {
    on: user.objectives,
    level: user.rung,
    name: level.name,
    tagline: level.tagline,
    cefr: level.cefr,
    earned: can_dos.length - left,
    total: can_dos.length,
    star_available: list.length > 0 && left > 0 && !due,
    refresh_due: due ? { level: due.level, name: levelInfo(due.level).name } : null,
    can_dos,
    ladder: LEVELS.map((l) => ({ n: l.n, name: l.name, tagline: l.tagline, cefr: l.cefr, authored: l.n <= topAuthoredLevel(user.language) })),
  }
}

// ---------- completed levels and refreshers ----------

/** Bright for a week after completion, then two, then a month, two, three. */
export const REFRESH_INTERVALS = [7, 14, 30, 60, 90]

export function refreshInterval(count: number): number {
  return REFRESH_INTERVALS[Math.min(Math.max(count, 0), REFRESH_INTERVALS.length - 1)]
}

/** Completed levels whose refresher is due today or earlier, lowest first. */
export async function dueLevels(user: User, now = new Date()): Promise<LevelRow[]> {
  const today = localDay(now, user.tz)
  return (await listLevels(user.id, user.language)).filter((l) => l.refresh_due <= today)
}

export async function levelsView(user: User, now = new Date()): Promise<LevelView[]> {
  const rows = await listLevels(user.id, user.language)
  if (rows.length === 0) return []
  const today = localDay(now, user.tz)
  const earned = new Map((await listEarned(user.id)).map((e) => [e.cando_id, e]))
  return rows.map((row) => {
    const info = levelInfo(row.level)
    return {
      level: row.level,
      name: info.name,
      cefr: info.cefr,
      tagline: info.tagline,
      completed_day: row.completed_day,
      completed_at: row.completed_at,
      refresh_due: row.refresh_due,
      refreshed_at: row.refreshed_at,
      refresh_count: row.refresh_count,
      due: row.refresh_due <= today,
      can_dos: canDos(user.language, row.level).map((c) => ({ id: c.id, title: c.title, evidence: earned.get(c.id)?.evidence ?? null, earned_at: earned.get(c.id)?.earned_at ?? null })),
    }
  })
}

/** The two can-dos of a completed level most worth refreshing: the ones
 *  whose practice items have been missed most on the cards; ties keep the
 *  curriculum's order. */
export async function refreshTargets(user: User, level: number, count = 2): Promise<CanDo[]> {
  const list = canDos(user.language, level)
  if (list.length === 0) return []
  const items = await listItems(user.id)
  const score = (c: CanDo): number => {
    const own = new Set(c.items.map((i) => i.t.toLowerCase()))
    return items
      .filter((i) => i.source === `From: ${c.title}` || own.has(i.target.toLowerCase()))
      .reduce((sum, i) => sum + (i.misses - i.hits), 0)
  }
  return list
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, count)
    .map((x) => x.c)
}

function refreshView(user: User, r: Refresher | null): RefreshView | null {
  if (!r) return null
  const titles = (ids: string[]) => ids.map((id) => ({ id, title: titleOf(user, id) }))
  return {
    id: r.id,
    level: r.level,
    name: levelInfo(r.level).name,
    state: r.state,
    targets: titles(r.targets),
    demonstrated: titles(r.demonstrated ?? []),
    passed: r.passed,
    next_due: null,
    right: r.answers.filter((a) => a.ok).length,
    total: (r.questions ?? []).length,
  }
}

function bannerFor(levels: LevelView[]): Banner | null {
  const due = levels.find((l) => l.due)
  if (!due) return null
  return {
    kind: 'refresh',
    level: due.level,
    title: `Level ${due.level} refresher is due`,
    text: `Keep it bright: a short call on two things from ${due.name}, then four cards.`,
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
    trail.push({ n, done: d?.state === 'done', today: n === day.n, starred: !!d?.starred_at, level_done: d?.star_level_done ?? null })
  }
  const misses = day.answers.filter((a) => !a.ok).map((a) => day.questions?.[a.q]?.target).filter((t): t is string => !!t)
  const comingBack = day.state === 'done' ? Array.from(new Set([...(day.things ?? []).map((t) => t.target), ...misses])).slice(0, 4) : []
  // The refresher under way, else the latest one finished today.
  const open = user.objectives ? await findOpenRefresher(user.id) : null
  const refresher = open ?? (user.objectives ? ((await listRefreshers(user.id, day.day))[0] ?? null) : null)
  const levels = user.objectives ? await levelsView(user, now) : []
  const refresh = refreshView(user, refresher)
  if (refresh && refresher?.passed) {
    const row = (await listLevels(user.id, user.language)).find((l) => l.level === refresher.level)
    refresh.next_due = row?.refresh_due ?? null
  }
  const live = open?.state === 'cards' ? open : null
  return {
    id: day.id,
    day: day.day,
    n: day.n,
    topic: day.topic,
    state: mapState(day, open),
    streak: currentStreak(user, now),
    best_streak: user.best_streak,
    daily_hour: user.daily_hour,
    daily_label: user.daily_texts ? hourLabel(user.daily_hour) : '',
    things: activeThings(day),
    questions: live ? (live.questions ?? []) : activeQuestionsOf(day),
    answers: live ? live.answers : activeAnswersOf(day),
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
          level_done: day.star_level_done,
        }
      : null,
    objectives: await objectivesView(user, now),
    levels,
    refresh,
    banner: user.objectives ? bannerFor(levels) : null,
    xp: xpView(await listXp(user.id), day.day),
    flash_today: (await listFlashSetsDone(user.id, day.day)).length,
  }
}

function activeQuestionsOf(day: Day): Question[] {
  return (starInProgress(day) ? day.star_questions : day.questions) ?? []
}
function activeAnswersOf(day: Day): Answer[] {
  return starInProgress(day) ? day.star_answers : day.answers
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
  await award(user.id, day.day, 'talk', day.id, XP.talk)
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
  // The first extra calls of the day pay; the rest are for the love of it.
  if (spoken > 0 && day.extra_calls < MORE_PAID_CALLS_PER_DAY) await award(user.id, day.day, 'more', `${day.id}:${day.extra_calls + 1}`, XP.more)
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
    await award(user.id, day.day, 'cando', r.id, XP.cando)
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

/** A refresher's call finished: read it against its two targets, keep what
 *  was demonstrated, and write four cards (the two targets' items first).
 *  A call where the learner said nothing leaves the refresher at 'talk', so
 *  it can be started again (same script). */
export async function finishRefresh(user: User, refresher: Refresher, sessionId: string, transcript: TranscriptRow[], seconds: number | null): Promise<Refresher> {
  if (refresher.state !== 'talk') return refresher
  const spoken = transcript.filter((r) => r.role === 'user' && r.text.trim()).length
  if (spoken === 0) return updateRefresher(refresher.id, { session_id: sessionId, seconds })
  const targets = refresher.targets.map((id) => canDos(user.language).find((c) => c.id === id)).filter((c): c is CanDo => !!c)
  if (targets.length === 0) return refresher
  const results = await annotateStar(user, targets, transcript)
  const demonstrated = results.filter((r) => r.demonstrated).map((r) => r.id)
  const things: Thing[] = []
  for (const r of results) {
    const item = await upsertItem(user.id, r.practice, 0)
    things.push({ ...r.practice, item_id: item.id })
  }
  const pool = await listItems(user.id)
  const questions = buildQuestions(user.language, { id: refresher.id, things }, pool, { things, max: 4 })
  return updateRefresher(refresher.id, { session_id: sessionId, seconds, demonstrated, questions, state: 'cards', answers: [] })
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
  await award(user.id, day.day, 'things', day.id, XP.things)
  return updateDay(day.id, { things_session_id: sessionId, questions, state: 'after_things', answers: [] })
}

// ---------- the cards ----------

export type Graded = { day: Day; ok: boolean; target: string; complete: boolean }

export async function answerCard(user: User, day: Day, q: number, answer: string, now = new Date()): Promise<Graded | { error: string; status: number }> {
  // A refresher's cards come first when one is open: the map shows them.
  const open = user.objectives ? await findOpenRefresher(user.id) : null
  if (open?.state === 'cards') return answerRefreshCard(user, day, open, q, answer, now)
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
  if (ok) await award(user.id, day.day, 'card', `${day.id}:${star ? 'star:' : ''}${q}`, XP.card)
  const complete = next.length >= questions.length
  let updated: Day
  if (star) {
    if (complete) {
      const levelDone = await maybeLevelUp(user, day)
      await award(user.id, day.day, 'star', day.id, XP.star)
      updated = await updateDay(day.id, { star_answers: next, star_state: 'done', starred_at: now.toISOString(), star_level_up: levelDone !== null, star_level_done: levelDone })
    } else {
      updated = await updateDay(day.id, { star_answers: next })
    }
  } else if (complete) {
    updated = await updateDay(day.id, { answers: next, state: 'done', done_at: now.toISOString() })
    const streak = await completeDay(user, updated, now)
    await award(user.id, day.day, 'day', day.id, XP.day)
    if (next.every((a) => a.ok)) await award(user.id, day.day, 'cards_clean', day.id, XP.cards_clean)
    if (STREAK_MILESTONES.includes(streak)) await award(user.id, day.day, 'streak', `${day.id}:${streak}`, XP.streak)
  } else {
    updated = await updateDay(day.id, { answers: next })
  }
  return { day: updated, ok, target: question.target, complete }
}

/** A refresher's card. The fourth one finishes it: passed when both targets
 *  were demonstrated in the call, which keeps the level bright and sets the
 *  next refresher further out; not passed leaves it due (try again). */
async function answerRefreshCard(user: User, day: Day, r: Refresher, q: number, answer: string, now: Date): Promise<Graded | { error: string; status: number }> {
  const questions = r.questions ?? []
  const question = questions[q]
  if (!question) return { error: 'No such card.', status: 400 }
  if (q !== r.answers.length) return { error: `Answer card ${r.answers.length + 1} next.`, status: 409 }
  const ok = question.kind === 'pick' ? answer === question.target : answerMatches(user.language, answer, question)
  const next: Answer[] = [...r.answers, { q, ok, answer: answer.slice(0, 200) }]
  if (question.item_id) await scoreItem(question.item_id, ok, day.day)
  const complete = next.length >= questions.length
  if (!complete) {
    await updateRefresher(r.id, { answers: next })
    return { day, ok, target: question.target, complete }
  }
  const passed = r.targets.every((id) => (r.demonstrated ?? []).includes(id))
  await updateRefresher(r.id, { answers: next, state: 'done', passed, done_at: now.toISOString() })
  if (passed) {
    await award(user.id, day.day, 'refresh', r.id, XP.refresh)
    const row = (await listLevels(user.id, user.language)).find((l) => l.level === r.level)
    if (row) {
      const count = row.refresh_count + 1
      await updateLevel(row.id, { refreshed_at: now.toISOString(), refresh_count: count, refresh_due: addDays(localDay(now, user.tz), refreshInterval(count)) })
    }
  }
  return { day, ok, target: question.target, complete }
}

/** Every can-do of the level earned → the next rung, and the level is
 *  completed: a row with its first refresher due in a week. Returns the
 *  level completed, or null. */
async function maybeLevelUp(user: User, day: Day): Promise<number | null> {
  const list = canDos(user.language, user.rung)
  if (list.length === 0) return null
  const earned = new Set((await listEarned(user.id)).map((e) => e.cando_id))
  if (!list.every((c) => earned.has(c.id))) return null
  const level = user.rung
  await insertLevel({ user_id: user.id, language: user.language, level, completed_day: day.day, refresh_due: addDays(day.day, refreshInterval(0)) })
  await award(user.id, day.day, 'level', `${user.language}:${level}`, XP.level)
  await updateUser(user.id, { rung: level + 1 })
  return level
}

/** The streak ticks and tomorrow's topic is picked. Returns the streak. */
async function completeDay(user: User, day: Day, now: Date): Promise<number> {
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
  return streak
}

export { LANGUAGES, starInProgress, topAuthoredLevel }
