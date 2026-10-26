// Takt's daily text (schema apps/takt/schema/002): one iMessage a day at the user's hour, in
// their zone, unless they already practiced today. The pure parts live here (streak, text, due
// check, phone normalization) so scripts/takt/daily-check.ts can test them without a server;
// the DB + send side is src/lib/takt/daily-send.ts. The hour math is Dodo's (f2/daily-time).

import { dueAt, validTimeZone } from '@/lib/f2/daily-time'

export type TaktSnapshot = {
  lessons?: unknown
  skills?: unknown
  days?: string[]
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

export const CHALLENGES = [
  '5 ear questions: major or minor',
  '5 questions on the 12-bar form',
  '5 listening questions: higher or lower',
  'one clean chorus of your blues lesson',
] as const

/// 1 for Jan 1.
export function dayOfYear(ymd: string): number {
  const d = Date.parse(`${ymd}T00:00:00Z`)
  const jan1 = Date.parse(`${ymd.slice(0, 4)}-01-01T00:00:00Z`)
  return Math.round((d - jan1) / 86_400_000) + 1
}

/// The day's rotating challenge, shared with the app: index (dayOfYear - 1) % 4, dayOfYear of
/// `date` in `tz` (Jan 1 = 1). 2026-10-25 is day 298 → index 1 → the 12-bar form.
export function challengeFor(date: Date, tz: string): string {
  return CHALLENGES[(dayOfYear(localDate(date, tz)) - 1) % CHALLENGES.length]
}

/// What the text asks for: the ear check until the placement quiz has a level, then the rotation.
export function todaysChallenge(snapshot: TaktSnapshot | null, now: Date, tz: string): string {
  if (!snapshot?.quiz?.level) return 'the 5-question ear check'
  return challengeFor(now, tz)
}

export function composeText(snapshot: TaktSnapshot | null, now: Date, tz: string): string {
  const n = streak(snapshot?.days, localDate(now, tz))
  const challenge = todaysChallenge(snapshot, now, tz)
  return n > 0
    ? `Takt: you're on a ${n}-day streak. Today's challenge: ${challenge}. Open Takt to keep it going.`
    : `Takt: today's challenge is ${challenge}. Two minutes starts a streak.`
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
