// Jokers (2026-10-25; "bookmarks" on the page, which is the only place they
// show — no texts mention them). Every tenth day of a streak (10, 20, 30, …) deals one,
// three in hand at most. A joker covers one missed day, for a week after it:
// the streak runs through a covered day without counting it, so 36 days, a
// covered Sunday, and Monday is day 37. Storage (schema 010): the hand is
// onething_users.jokers, a covered day is a row in onething_saves.
//
// Saving is one offer, computed fresh on every visit (`rescueFor`): walking
// back from yesterday, every gap of missed days is covered while it is inside
// the week and the hand can pay for it, so the oldest streak the jokers can
// reach comes back whole. The entries after it are re-chained in the same
// transaction (onething_play_joker); points only ever go up.

import { f2Supabase } from '@/lib/f2/supabase'
import { pointsForEntry } from './levels'
import { addDays, listEntries, type Entry, type User } from './core'

export const JOKER_EVERY = 10
export const JOKER_MAX = 3
/// How many days after a missed day a joker can still cover it.
export const JOKER_REACH = 7

export function dealsJoker(streak: number): boolean {
  return streak > 0 && streak % JOKER_EVERY === 0
}

/// Sentences until the next joker is dealt; null while the hand is full.
export function nextJokerIn(streak: number, held: number): number | null {
  return held >= JOKER_MAX ? null : JOKER_EVERY - (streak % JOKER_EVERY)
}

/// Every day strictly between `from` and `to` is covered, so a streak runs
/// from one to the other (two days in a row trivially do).
export function bridges(from: string, to: string, saves: Set<string>): boolean {
  if (from >= to) return false
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) if (!saves.has(d)) return false
  return true
}

export type Rescue = {
  /// the missed days the jokers would cover, oldest first; one joker each
  days: string[]
  /// the last kept day before them, and the streak that broke there
  from: { day: string; streak: number }
  /// every entry after `from`, oldest first, with its streak before and after the save
  after: Array<{ id: string; day: string; was: number; becomes: number; points: number }>
  cost: number
  /// the streak once saved
  now: number
  /// jokers the re-chained days deal back (a tenth day reached on the way)
  deals: number
  /// the hand before and after
  held: number
  left: number
  /// the offer stands as it is through this day (the oldest covered day + JOKER_REACH)
  until: string
  /// the newest entry the plan saw; the save refuses if a newer one landed
  latest: string
}

/// What the jokers in hand can save right now, or null. `entries` newest
/// first (listEntries), `saves` the days already covered, `today` the
/// person's own day. Pure, so scripts/onething/joker-check.ts can walk it.
export function rescueFor(entries: Entry[], saves: Set<string>, today: string, held: number): Rescue | null {
  if (held <= 0 || entries.length === 0) return null
  const byDay = new Map(entries.map((e) => [e.day, e]))
  const covered = (d: string) => byDay.has(d) || saves.has(d)
  const first = entries[entries.length - 1].day // covered, so every gap below ends by here
  const reach = addDays(today, -JOKER_REACH)
  const days: string[] = []
  let d = addDays(today, -1) // today is never missed: there is still time to write it
  walk: for (;;) {
    while (d >= first && covered(d)) d = addDays(d, -1)
    if (d < first) break // back to the very first day: nothing older to join up with
    const gap: string[] = []
    while (!covered(d)) {
      // a gap is covered whole or not at all
      if (d < reach || days.length + gap.length >= held) break walk
      gap.push(d)
      d = addDays(d, -1)
    }
    days.push(...gap)
  }
  if (days.length === 0) return null
  return rechain(entries, saves, days, held)
}

/// The plan for covering `days` (missed days, any order): the entries after
/// the last kept day before them, re-chained. `gift` covers them without
/// spending the hand (an admin restore, scripts/onething/joker-restore.ts).
export function rechain(entries: Entry[], saves: Set<string>, missed: string[], held: number, gift = false): Rescue {
  const days = [...missed].sort()
  const from = entries.find((e) => e.day < days[0])
  if (!from) throw new JokerError('Nothing kept before those days to join up with.')
  const all = new Set([...saves, ...days])
  const later = entries.filter((e) => e.day > from.day).reverse()
  let prev = from.day
  let streak = from.streak
  let delta = 0
  let deals = 0
  const after = later.map((e) => {
    streak = bridges(prev, e.day, all) ? streak + 1 : 1
    prev = e.day
    const was = pointsForEntry(e.streak)
    const becomes = pointsForEntry(streak)
    delta += becomes.base + becomes.bonus - (was.base + was.bonus)
    if (dealsJoker(streak) && !dealsJoker(e.streak)) deals++
    // each entry keeps whatever else it carried (a buddy bonus) and never loses points
    return { id: e.id, day: e.day, was: e.streak, becomes: streak, points: e.points + Math.max(0, delta) }
  })
  return {
    days,
    from: { day: from.day, streak: from.streak },
    after,
    cost: days.length,
    now: after.length ? after[after.length - 1].becomes : from.streak,
    deals,
    held,
    left: Math.min(JOKER_MAX, held - (gift ? 0 : days.length) + deals),
    until: addDays(days[0], JOKER_REACH),
    latest: entries[0].day,
  }
}

// ---------- storage ----------

export async function listSaves(userId: string): Promise<Set<string>> {
  const { data, error } = await f2Supabase().from('onething_saves').select('day').eq('user_id', userId)
  if (error) throw new Error(`onething: list saves failed: ${error.message}`)
  return new Set((data ?? []).map((r: { day: string }) => r.day))
}

/// The covered days strictly between two days (for recordEntry's streak).
export async function savedBetween(userId: string, from: string, to: string): Promise<Set<string>> {
  const { data, error } = await f2Supabase().from('onething_saves').select('day').eq('user_id', userId).gt('day', from).lt('day', to)
  if (error) throw new Error(`onething: saves lookup failed: ${error.message}`)
  return new Set((data ?? []).map((r: { day: string }) => r.day))
}

/// One more joker in hand. Returns the hand after, or null when it was already full.
export async function dealJoker(userId: string): Promise<number | null> {
  const { data, error } = await f2Supabase().rpc('onething_deal_joker', { p_user: userId, p_cap: JOKER_MAX })
  if (error) throw new Error(`onething: deal joker failed: ${error.message}`)
  return typeof data === 'number' ? data : null
}

export class JokerError extends Error {}

/// Apply a plan in one transaction (onething_play_joker): the hand, the
/// covered days, the re-chained entries; refused if any of them moved.
async function apply(userId: string, r: Rescue): Promise<void> {
  const { error } = await f2Supabase().rpc('onething_play_joker', {
    p_user: userId,
    p_held: r.held,
    p_after: r.left,
    p_days: r.days,
    p_rows: r.after.map((a) => ({ id: a.id, was: a.was, streak: a.becomes, points: a.points })),
    p_latest: r.latest,
  })
  if (error) throw new Error(`onething: play joker failed: ${error.message}`)
}

/// An admin restore: cover these missed days as a gift (the hand is not
/// spent; a tenth day reached on the way still deals). Every day must really
/// be missed, neither written nor already covered. `dryRun` returns the plan only.
export async function restoreStreak(user: User, days: string[], dryRun = true): Promise<Rescue> {
  const [entries, saves] = await Promise.all([listEntries(user.id), listSaves(user.id)])
  const taken = days.filter((d) => saves.has(d) || entries.some((e) => e.day === d))
  if (taken.length) throw new JokerError(`Not missed: ${taken.join(', ')}`)
  const r = rechain(entries, saves, days, user.jokers ?? 0, true)
  if (!dryRun) await apply(user.id, r)
  return r
}

/// Play the jokers on the offer the person saw (`expect`: its days). Refuses
/// when the offer has changed since, so a stale page never spends a joker on
/// something other than what it showed.
export async function playJokers(user: User, today: string, expect: string[]): Promise<Rescue> {
  const [entries, saves] = await Promise.all([listEntries(user.id), listSaves(user.id)])
  const r = rescueFor(entries, saves, today, user.jokers ?? 0)
  if (!r) throw new JokerError('There is nothing for a joker to save right now.')
  if (r.days.join() !== [...expect].sort().join()) throw new JokerError('That changed while you were looking. Here it is again.')
  await apply(user.id, r)
  return r
}
