// Daily-card streak: consecutive PT days with a graded daily iMessage
// answer. The streak feeds an XP multiplier on the daily card itself and on
// Peck (jumbo) sets — showing up every day makes everything pay more.
//
// State is two columns on f2_users (043): daily_streak + daily_streak_date.
// The date row is the last PT day that counted; a missed day zeroes the
// live value on read without writing anything (the next answer rebuilds
// from 1).

import { f2Supabase } from './supabase'

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

/// Count today's daily answer toward the streak. Idempotent within a day —
/// the bonus question (or a re-grade) doesn't double-count. Returns the
/// streak after the bump.
export async function bumpDailyStreak(userId: string): Promise<number> {
  const sb = f2Supabase()
  const { data } = await sb
    .from('f2_users')
    .select('daily_streak, daily_streak_date')
    .eq('id', userId)
    .maybeSingle()
  const today = ptDay()
  const prev = (data?.daily_streak as number) ?? 0
  const prevDate = (data?.daily_streak_date as string | null) ?? null

  let next: number
  if (prevDate === today) return prev || 1
  else if (prevDate === ptYesterday()) next = prev + 1
  else next = 1

  await sb
    .from('f2_users')
    .update({ daily_streak: next, daily_streak_date: today })
    .eq('id', userId)
  return next
}

/// Set the streak outright — repair after an outage, a reset, or any other
/// user-ordered edit. `days` becomes the live value immediately (dated
/// yesterday, so today's daily answer still bumps it by one); 0 clears.
export async function setDailyStreak(userId: string, days: number): Promise<number> {
  const clamped = Math.max(0, Math.round(days))
  await f2Supabase()
    .from('f2_users')
    .update({
      daily_streak: clamped,
      daily_streak_date: clamped > 0 ? ptDay(new Date(Date.now() - 24 * 60 * 60 * 1000)) : null,
    })
    .eq('id', userId)
  return clamped
}

/// Live streak for display / multipliers. A streak whose last counted day
/// is before yesterday has lapsed and reads as 0 (nothing is written; the
/// next answer starts over at 1).
export async function getDailyStreak(
  userId: string,
): Promise<{ streak: number; multiplier: number }> {
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('daily_streak, daily_streak_date')
    .eq('id', userId)
    .maybeSingle()
  const date = (data?.daily_streak_date as string | null) ?? null
  const raw = (data?.daily_streak as number) ?? 0
  const live = date === ptDay() || date === ptYesterday() ? raw : 0
  return { streak: live, multiplier: streakMultiplier(live) }
}
