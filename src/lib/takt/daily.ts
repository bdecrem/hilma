// Takt's daily text (schema apps/takt/schema/002): one iMessage a day at the user's hour, in
// their zone, unless they already practiced today. The pure parts live here (streak, text, due
// check, phone normalization) so scripts/takt/daily-check.ts can test them without a server;
// the DB + send side is src/lib/takt/daily-send.ts. The hour math is Dodo's (f2/daily-time).

import { dueAt, validTimeZone } from '@/lib/f2/daily-time'

export type TaktSnapshot = {
  lessons?: unknown
  skills?: unknown
  days?: string[]
  /// What made each day count (app 0.1 (83)+): a finished lesson or a Stage song.
  practice?: { day: string; kind: 'lesson' | 'stage' | string; id: string }[]
  quiz?: { level?: 'new' | 'ear' | 'theory' | 'both' | string }
}

export type DailyRow = {
  phone_verified_at: string | null
  daily_enabled: boolean
  daily_hour: number
  daily_tz: string
  daily_sent_on: string | null
}

/// "YYYY-MM-DD" at `now` in `tz`.
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/// The calendar day before "YYYY-MM-DD".
export function prevDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/// Consecutive practiced days ending today or yesterday (0 when the last one is older).
export function streak(days: string[] | undefined, today: string): number {
  const set = new Set(days ?? [])
  let d = set.has(today) ? today : prevDate(today)
  let n = 0
  while (set.has(d)) {
    n++
    d = prevDate(d)
  }
  return n
}

export function practicedToday(days: string[] | undefined, today: string): boolean {
  return (days ?? []).includes(today)
}

/// The day's challenge, the same every day since 0.1 (83): only a finished lesson or a Stage
/// song played to the end counts for the streak (the app logs which in `practice`).
export const CHALLENGE = 'finish a lesson or play a song on the Stage'

export function composeText(snapshot: TaktSnapshot | null, now: Date, tz: string): string {
  const n = streak(snapshot?.days, localDate(now, tz))
  return n > 0
    ? `Takt: you're on a ${n}-day streak. Today: ${CHALLENGE}. Open Takt to keep it going.`
    : `Takt: today's challenge: ${CHALLENGE}. One song starts a streak.`
}

/// Whether the tick should text this user at `now` (before the practiced-today check, which
/// needs the snapshot): verified, on, their local hour, not sent yet on their local today.
export function isDue(now: Date, u: DailyRow): boolean {
  if (!u.phone_verified_at || !u.daily_enabled) return false
  const tz = validTimeZone(u.daily_tz) ? u.daily_tz : 'America/Los_Angeles'
  if (!dueAt(now, { hour: u.daily_hour, tz })) return false
  return u.daily_sent_on !== localDate(now, tz)
}

/// E.164, US default: 10 digits → +1…, 11 starting with 1 → +…, "+" and 8–15 digits as given.
/// Null for anything else.
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!/^\+?[\d\s().-]+$/.test(s)) return null
  const digits = s.replace(/\D/g, '')
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? `+${digits}` : null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return null
}

export const CODE_TTL_MS = 10 * 60 * 1000
export const CODE_COOLDOWN_MS = 60 * 1000

/// When the code expiring at `expiresAt` was sent, and whether a new one may go out at `now`.
export function canResend(now: Date, expiresAt: string | null): boolean {
  if (!expiresAt) return true
  const sentAt = Date.parse(expiresAt) - CODE_TTL_MS
  return now.getTime() - sentAt >= CODE_COOLDOWN_MS
}
