// Daily-card streak: consecutive PT days with a graded daily iMessage
// answer. The streak feeds an XP multiplier on the daily card itself and on
// Peck (jumbo) sets — showing up every day makes everything pay more.
//
// State is three columns on f2_users: daily_streak + daily_streak_date
// (043) and peck_week_start (048). The date row is the last PT day that
// counted; a missed day zeroes the live value on read without writing
// anything (the next answer rebuilds from 1).
//
// The weekly Peck rule: a streak also needs one full Peck level every
// 7 days. peck_week_start is the PT day the current clock began — the day
// the streak started, the last day a full Peck set was recorded, or the day
// the agent repaired the streak. The deadline is start + 7, inclusive. A
// read on a later day finds the week missed and zeroes the streak for
// real (written, so a Peck set afterwards can't revive it).

import { f2Supabase } from './supabase'

/// Days in the Peck window. Play a full level on day 0, the next is due by
/// day 7 — "once a week".
export const PECK_WEEK_DAYS = 7

/// XP multiplier ladder. Days 1–3 pay normal; a young streak doubles the
/// take; double digits triple it; two weeks caps it at 4×.
export function streakMultiplier(days: number): number {
  if (days >= 14) return 4
  if (days >= 10) return 3
  if (days >= 4) return 2
  return 1
}

/// Calendar day in Pacific time, YYYY-MM-DD — the daily card runs on PT.
export function ptDay(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

function ptYesterday(): string {
  return ptDay(new Date(Date.now() - 24 * 60 * 60 * 1000))
}

/// YYYY-MM-DD arithmetic (calendar days, no time zone involved).
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/// Whole days from `from` to `to` (negative when `to` is earlier).
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export type StreakState = {
  streak: number
  multiplier: number
  /// Last PT day (inclusive) a full Peck level can be played to keep the
  /// streak. Null when there is no streak to keep.
  peck_due: string | null
  /// Whole days until the deadline: 0 = due today, 1 = tomorrow. Null when
  /// there is no streak.
  peck_days_left: number | null
}

type StreakRow = {
  daily_streak: number | null
  daily_streak_date: string | null
  peck_week_start: string | null
}

async function readRow(userId: string): Promise<StreakRow> {
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('daily_streak, daily_streak_date, peck_week_start')
    .eq('id', userId)
    .maybeSingle()
  return {
    daily_streak: (data?.daily_streak as number) ?? 0,
    daily_streak_date: (data?.daily_streak_date as string | null) ?? null,
    peck_week_start: (data?.peck_week_start as string | null) ?? null,
  }
}

type Resolved = {
  /// Streak as it stands today, both rules applied.
  live: number
  /// The Peck week was missed — the stored streak must be cleared.
  peckLapsed: boolean
  /// Where the Peck clock stands (after any repair). Null without a streak.
  weekStart: string | null
}

/// Apply both lapse rules to a stored row for `today`.
function resolve(row: StreakRow, today: string): Resolved {
  const raw = row.daily_streak ?? 0
  const date = row.daily_streak_date
  const dailyLive = date === today || date === ptYesterday() ? raw : 0
  if (dailyLive <= 0) return { live: 0, peckLapsed: false, weekStart: null }
  // Rows from before 048 that the backfill didn't cover (streak formed
  // between migration and deploy): the clock starts now.
  const weekStart = row.peck_week_start ?? today
  const due = addDays(weekStart, PECK_WEEK_DAYS)
  if (daysBetween(due, today) > 0) return { live: 0, peckLapsed: true, weekStart: null }
  return { live: dailyLive, peckLapsed: false, weekStart }
}

function toState(r: Resolved, today: string): StreakState {
  const due = r.live > 0 && r.weekStart ? addDays(r.weekStart, PECK_WEEK_DAYS) : null
  return {
    streak: r.live,
    multiplier: streakMultiplier(r.live),
    peck_due: due,
    peck_days_left: due ? daysBetween(today, due) : null,
  }
}

/// Persist a missed Peck week: the streak is gone for good, not just
/// hidden. Idempotent.
async function clearLapsed(userId: string): Promise<void> {
  await f2Supabase()
    .from('f2_users')
    .update({ daily_streak: 0, daily_streak_date: null, peck_week_start: null })
    .eq('id', userId)
}

/// Count today's daily answer toward the streak. Idempotent within a day —
/// the bonus question (or a re-grade) doesn't double-count. Returns the
/// streak after the bump.
export async function bumpDailyStreak(userId: string): Promise<number> {
  const sb = f2Supabase()
  const row = await readRow(userId)
  const today = ptDay()
  const r = resolve(row, today)
  const prev = row.daily_streak ?? 0

  let next: number
  let weekStart: string
  if (r.peckLapsed) {
    // The week was missed — today's answer starts over, with a fresh clock.
    next = 1
    weekStart = today
  } else if (row.daily_streak_date === today) {
    return prev || 1
  } else if (row.daily_streak_date === ptYesterday()) {
    next = prev + 1
    weekStart = row.peck_week_start ?? today
  } else {
    next = 1
    weekStart = today
  }

  await sb
    .from('f2_users')
    .update({ daily_streak: next, daily_streak_date: today, peck_week_start: weekStart })
    .eq('id', userId)
  return next
}

/// Set the streak outright — repair after an outage, a reset, or any other
/// user-ordered edit. `days` becomes the live value immediately (dated
/// yesterday, so today's daily answer still bumps it by one) and the Peck
/// week clock restarts today; 0 clears everything.
export async function setDailyStreak(userId: string, days: number): Promise<number> {
  const clamped = Math.max(0, Math.round(days))
  const today = ptDay()
  await f2Supabase()
    .from('f2_users')
    .update({
      daily_streak: clamped,
      daily_streak_date: clamped > 0 ? addDays(today, -1) : null,
      peck_week_start: clamped > 0 ? today : null,
    })
    .eq('id', userId)
  return clamped
}

/// A full Peck level was just played: the weekly clock restarts today.
/// Written unconditionally — a user without a streak yet loses nothing, and
/// the value is overwritten anyway when a streak starts.
export async function markPeckWeek(userId: string): Promise<void> {
  await f2Supabase()
    .from('f2_users')
    .update({ peck_week_start: ptDay() })
    .eq('id', userId)
}

/// Live streak for display / multipliers, with the Peck deadline. A streak
/// whose last counted day is before yesterday has lapsed and reads as 0
/// (nothing written; the next answer starts over at 1). A streak past its
/// Peck deadline is cleared in the database as well.
export async function getDailyStreak(userId: string): Promise<StreakState> {
  const row = await readRow(userId)
  const today = ptDay()
  const r = resolve(row, today)
  if (r.peckLapsed) await clearLapsed(userId)
  return toState(r, today)
}

/// One-line warning for the iMessage grading reply when the Peck deadline
/// is within 48 hours. Empty otherwise.
export function peckNag(state: StreakState): string {
  if (state.streak < 1 || state.peck_days_left == null || state.peck_days_left > 1) return ''
  const when = state.peck_days_left === 0 ? 'today' : 'tomorrow'
  return ` ⚠️ Play one Peck level by ${when} or the streak resets.`
}
