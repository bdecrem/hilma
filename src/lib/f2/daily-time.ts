// One send time for Dodo's daily texts (2026-10-16): the daily card, Today's
// read and the Daily Voice Checkin all go out at the hour the user picked, in
// the user's own zone (f2_users.daily_hour / daily_tz, schema 057). One cron
// fires /api/f2/daily/tick every hour; `dueUsers` says who is due this hour.

import { f2Supabase } from './supabase'

export const DEFAULT_DAILY_HOUR = 9
export const DEFAULT_DAILY_TZ = 'America/Los_Angeles'

export type DailyTime = { hour: number; tz: string }

/// The hour of the day (0–23) at `now` in `tz`.
export function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
}

/// True for an IANA zone Intl knows ("Europe/Brussels"), false for anything else.
export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function validHour(h: unknown): h is number {
  return typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23
}

/// Whether a user whose setting is `t` is due at `now`: the local hour matches.
export function dueAt(now: Date, t: DailyTime): boolean {
  const tz = validTimeZone(t.tz) ? t.tz : DEFAULT_DAILY_TZ
  return localHour(now, tz) === t.hour
}

/// The ids of every user whose chosen hour is now. Each sender filters this
/// list by its own toggle and by whether the user can be reached.
export async function dueUsers(now: Date = new Date(), onlyUserId?: string): Promise<string[]> {
  let q = f2Supabase().from('f2_users').select('id, daily_hour, daily_tz')
  if (onlyUserId) q = q.eq('id', onlyUserId)
  const { data, error } = await q
  if (error) throw new Error(`daily-time users query failed: ${error.message}`)
  return ((data ?? []) as { id: string; daily_hour: number; daily_tz: string }[])
    .filter((u) => dueAt(now, { hour: u.daily_hour, tz: u.daily_tz }))
    .map((u) => u.id)
}

/// "9:00 AM" — for logs and replies.
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`
}
