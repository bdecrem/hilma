// Onething — one sentence a day, over iMessage, with a streak.
//
// Storage is the three onething_* tables in the F2 Supabase project (see
// apps/onething/schema). Outbound iMessage goes through Dodo's sender
// (src/lib/f2/bluebubbles.ts); inbound arrives on Dodo's BlueBubbles
// webhook, which asks `handleInbound` first and only falls through to Dodo
// when Onething does not claim the message.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { isSupportedCountry as isSupportedCountryCore, parsePhoneNumberFromString as parsePhoneCore, type CountryCode, type MetadataJson } from 'libphonenumber-js/core'
import phoneMetadataModule from 'libphonenumber-js/max/metadata'
import { f2Supabase } from '@/lib/f2/supabase'
import { DEMO_PREFIX, isDemoPhone, sendText } from './send'
import { notifySignup, type SignupSource } from './notify'
import { LEVELS, pointsForEntry, type Level } from './levels'
import copy from './copy.json'

export const TZ = 'America/Los_Angeles' // default zone; every user carries their own (User.tz)
export const PROMPT_HOUR = 10 // 10am local: the daily question
export const REMIND_HOUR = 22 // 12h later: the streak reminder
/// No reminder within this long of the question itself. The reminder exists
/// for people who had the whole day and forgot; someone who was asked at 9pm
/// (a late sign-up's welcome text, a manual prompt) has not forgotten anything
/// yet, and a second text an hour later reads as nagging. If four hours pass
/// before midnight the reminder still goes at the next hourly tick.
export const REMIND_MIN_GAP_MS = 4 * 60 * 60 * 1000
export const GRACE_HOUR = 4 // replies before 4am still count for yesterday's prompt
const CODE_TTL_MIN = 10
export const COOKIE = 'onething_session'

export type User = {
  id: string
  phone: string
  created_at: string
  prompt_day: string | null
  reminder_day: string | null
  /// when the day's question last went out (schema 003); null on older rows
  prompted_at: string | null
  /// IANA zone the 10am / 10pm texts follow (schema 002). Browser zone on web
  /// sign-in; a guess from the country code for iMessage joins.
  tz: string
  /// what buddies see instead of the number (schema 004); null until set
  name: string | null
  /// when the name was asked for by text — asked once, never again
  name_asked_at: string | null
}

export type Entry = {
  id: string
  user_id: string
  day: string
  text: string
  streak: number
  points: number
  created_at: string
  updated_at: string
}

export { LEVELS, pointsForEntry, type Level }

// ---------- time ----------

export function localDay(d = new Date(), tz = TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function localHour(d = new Date(), tz = TZ): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d)
  return Number(h) % 24
}

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/// The zone a user's texts follow. Rows from before schema 002 have none.
export function tzFor(user: Pick<User, 'tz'>): string {
  return user.tz && isValidTz(user.tz) ? user.tz : TZ
}

// A first guess from the country code, for numbers that join over iMessage
// (no browser to ask). Countries with several zones get their biggest city's;
// +1 stays Pacific because that is where nearly everyone here is. A web
// sign-in later replaces the guess with the browser's real zone.
const TZ_BY_COUNTRY: Array<[string, string]> = [
  ['+1', 'America/Los_Angeles'],
  ['+31', 'Europe/Amsterdam'], ['+32', 'Europe/Brussels'], ['+33', 'Europe/Paris'],
  ['+34', 'Europe/Madrid'], ['+351', 'Europe/Lisbon'], ['+353', 'Europe/Dublin'],
  ['+358', 'Europe/Helsinki'], ['+39', 'Europe/Rome'], ['+41', 'Europe/Zurich'],
  ['+43', 'Europe/Vienna'], ['+44', 'Europe/London'], ['+45', 'Europe/Copenhagen'],
  ['+46', 'Europe/Stockholm'], ['+47', 'Europe/Oslo'], ['+48', 'Europe/Warsaw'],
  ['+49', 'Europe/Berlin'], ['+52', 'America/Mexico_City'], ['+55', 'America/Sao_Paulo'],
  ['+61', 'Australia/Sydney'], ['+64', 'Pacific/Auckland'], ['+65', 'Asia/Singapore'],
  ['+81', 'Asia/Tokyo'], ['+82', 'Asia/Seoul'], ['+852', 'Asia/Hong_Kong'],
  ['+86', 'Asia/Shanghai'], ['+91', 'Asia/Kolkata'], ['+971', 'Asia/Dubai'],
  ['+972', 'Asia/Jerusalem'],
]

export function tzFromPhone(phone: string): string {
  let best: [string, string] | null = null
  for (const pair of TZ_BY_COUNTRY) {
    if (phone.startsWith(pair[0]) && (!best || pair[0].length > best[0].length)) best = pair
  }
  return best?.[1] ?? TZ
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// ---------- phones ----------

// The library's /max entry breaks under tsx (its metadata arrives wrapped in
// { default }), so the scripts and the routes share this unwrapped copy.
const PHONE_METADATA = ((phoneMetadataModule as unknown as { default?: MetadataJson }).default ?? phoneMetadataModule) as MetadataJson
type ParseOptions = { defaultCallingCode: string } | { defaultCountry: CountryCode }
const parsePhoneNumberFromString = (text: string, opts?: ParseOptions) => parsePhoneCore(text, opts ?? {}, PHONE_METADATA)
const isSupportedCountry = (c: string): c is CountryCode => isSupportedCountryCore(c as CountryCode, PHONE_METADATA)

/// Where a number typed without a country code probably belongs: the browser's
/// zone and language at sign-in, the inviter's own number for a buddy invite.
export type PhoneHint = { tz?: string | null; locale?: string | null; phone?: string | null }

/// Calling codes to try for a national number, best guess first. +1 is never
/// a hint: ten digits already read as a US number further down.
function hintedCountries(hint?: PhoneHint): ParseOptions[] {
  const out: ParseOptions[] = []
  const tz = hint?.tz ?? ''
  const byTz = tz.startsWith('Australia/') ? '+61' : TZ_BY_COUNTRY.find((pair) => pair[1] === tz)?.[0]
  if (byTz && byTz !== '+1') out.push({ defaultCallingCode: byTz.slice(1) })
  try {
    const region = hint?.locale ? new Intl.Locale(hint.locale).region : undefined
    if (region && region !== 'US' && isSupportedCountry(region)) out.push({ defaultCountry: region })
  } catch { /* not a locale; no hint */ }
  const own = hint?.phone ? parsePhoneNumberFromString(hint.phone)?.countryCallingCode : undefined
  if (own && own !== '1') out.push({ defaultCallingCode: own })
  return out
}

/// E.164 from whatever people type: spaces, dashes, dots and brackets are
/// noise; "+44 7911 123456", "44 7911 123456", "0044 …", "011 44 …" and
/// "+44 (0)7911 …" are the same number (the iPhone phone keypad hides "+"
/// behind the +*# key, so it is often missing). A national number
/// ("07911 123456", "0475 12 34 56") is read in the hinted country when it is
/// a valid number there; with no hint that fits, a leading zero is refused and
/// the form asks for the country code. Ten digits stay a US number. Handles
/// that arrive from iMessage carry their plus and pass through as before.
export function normalizePhone(raw: string, hint?: PhoneHint): string | null {
  const t = raw.trim().replace(/\uFF0B/g, '+').replace(/\(\s*0\s*\)/g, '')
  const digits = t.replace(/[^\d]/g, '')
  const intl = (d: string) => (d.length >= 8 && d.length <= 15 && !d.startsWith('0') ? `+${d}` : null)
  const valid = (text: string, opts?: ParseOptions) => {
    const p = parsePhoneNumberFromString(text, opts)
    return p?.isValid() ? p.number : null
  }
  if (t.startsWith('+') && !digits.startsWith('0')) return intl(digits)
  if (digits.startsWith('00')) return intl(digits.slice(2))
  for (const country of hintedCountries(hint)) {
    const n = valid(digits, country)
    if (n) return n
  }
  if (digits.startsWith('011')) return valid(`+${digits.slice(3)}`) // the US exit code
  if (digits.startsWith('0')) return null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return valid(`+${digits}`) // country code typed without the plus
}

export function isEmailHandle(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

/// An iMessage handle: a phone (E.164) or an iCloud email. Either kind lives
/// in the `phone` column; emails are lower-cased so the same person matches.
export function normalizeHandle(raw: string, hint?: PhoneHint): string | null {
  const t = raw.trim()
  if (isEmailHandle(t)) return t.toLowerCase()
  return normalizePhone(t, hint)
}

export function prettyHandle(h: string): string {
  const m = h.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : h
}

/// What other people see: the name if there is one, else the number.
export function displayName(u: Pick<User, 'name' | 'phone'>): string {
  return u.name?.trim() || prettyHandle(u.phone)
}

export async function setUserName(user: User, name: string | null): Promise<User> {
  const { error } = await f2Supabase().from('onething_users').update({ name }).eq('id', user.id)
  if (error) throw new Error(`onething: name update failed: ${error.message}`)
  return { ...user, name }
}

// ---------- scoring ----------

export function levelFor(points: number): { level: Level; next: Level | null; index: number } {
  let i = 0
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].min) i = k
  return { level: LEVELS[i], next: LEVELS[i + 1] ?? null, index: i }
}

// The scoreboard is the latest entry. A streak is alive if the last entry
// was today or yesterday (yesterday = today's prompt is still answerable).
export function scoreboard(entries: Entry[], today: string) {
  const latest = entries[0] ?? null
  const points = latest?.points ?? 0
  const alive = !!latest && (latest.day === today || latest.day === addDays(today, -1))
  const streak = alive ? latest!.streak : 0
  const best = entries.reduce((m, e) => Math.max(m, e.streak), 0)
  return { points, streak, best, ...levelFor(points), doneToday: latest?.day === today }
}

// ---------- users & entries ----------

export async function findUserByPhone(phone: string): Promise<User | null> {
  const { data } = await f2Supabase().from('onething_users').select('*').eq('phone', phone).maybeSingle()
  return (data as User) ?? null
}

export async function findUserById(id: string): Promise<User | null> {
  const { data } = await f2Supabase().from('onething_users').select('*').eq('id', id).maybeSingle()
  return (data as User) ?? null
}

export async function ensureUser(phone: string, source: SignupSource = 'manual', tz?: string): Promise<User> {
  const existing = await findUserByPhone(phone)
  if (existing) return existing
  const zone = tz && isValidTz(tz) ? tz : tzFromPhone(phone)
  const { data, error } = await f2Supabase().from('onething_users').insert({ phone, tz: zone }).select('*').single()
  if (error) {
    // Two joins at once (a web verify and an iMessage "onething" a second apart):
    // the unique phone made the second insert lose; that row is the account.
    if (error.code === '23505') {
      const raced = await findUserByPhone(phone)
      if (raced) return raced
    }
    throw new Error(`onething: create user failed: ${error.message}`)
  }
  const user = data as User
  // The demo number is Bart's own; no sign-up note for it.
  if (!isDemoPhone(user.phone)) await notifySignup(user.phone, source, user.id)
  return user
}

/// A web sign-in knows the browser's zone; keep the account on it.
export async function setUserTz(user: User, tz: string): Promise<User> {
  if (!isValidTz(tz) || tz === user.tz) return user
  const { error } = await f2Supabase().from('onething_users').update({ tz }).eq('id', user.id)
  if (error) throw new Error(`onething: tz update failed: ${error.message}`)
  return { ...user, tz }
}

export async function findEntry(userId: string, day: string): Promise<Entry | null> {
  const { data, error } = await f2Supabase()
    .from('onething_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle()
  if (error) throw new Error(`onething: find entry failed: ${error.message}`)
  return (data as Entry) ?? null
}

export async function listEntries(userId: string, limit = 400): Promise<Entry[]> {
  const { data, error } = await f2Supabase()
    .from('onething_entries')
    .select('*')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`onething: list entries failed: ${error.message}`)
  return (data ?? []) as Entry[]
}

/// A day's row holds every thought for that day, one per line, in order.
/// (The table has one row per user per day; a second "1:" text used to
/// overwrite the first.)
export function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean)
}

export type Recorded = {
  entry: Entry
  edited: boolean
  /// set when this sentence was added to a day that already had one: its number for the day
  added?: number
  streak: number
  points: number
  earned: number
  bonus: number
  level: Level
  /// this sentence crossed a level threshold (Seed → Sprout, …)
  leveledUp: boolean
}

/// Save (or overwrite) the sentence for `day`, computing streak and points
/// from the entry before it. Editing today's sentence keeps its score.
export async function recordEntry(user: User, day: string, text: string): Promise<Recorded> {
  const sb = f2Supabase()
  const same = await findEntry(user.id, day)
  if (same) {
    const all = [...lines(same.text), text]
    const { data, error } = await sb
      .from('onething_entries')
      .update({ text: all.join('\n'), updated_at: new Date().toISOString() })
      .eq('id', same.id)
      .select('*')
      .single()
    if (error) throw new Error(`onething: append failed: ${error.message}`)
    return {
      entry: data as Entry, edited: false, added: all.length, streak: same.streak, points: same.points,
      earned: 0, bonus: 0, level: levelFor(same.points).level, leveledUp: false,
    }
  }
  const prev = (await listEntries(user.id, 1))[0] ?? null
  const streak = prev && prev.day === addDays(day, -1) ? prev.streak + 1 : 1
  const { base, bonus } = pointsForEntry(streak)
  const points = (prev?.points ?? 0) + base + bonus
  const { data, error } = await sb
    .from('onething_entries')
    .insert({ user_id: user.id, day, text, streak, points })
    .select('*')
    .single()
  if (error) throw new Error(`onething: save failed: ${error.message}`)
  const level = levelFor(points)
  const leveledUp = level.index > levelFor(prev?.points ?? 0).index
  return { entry: data as Entry, edited: false, streak, points, earned: base + bonus, bonus, level: level.level, leveledUp }
}

/// Replace one thought on one day (by its position). An empty text removes
/// it, but a day always keeps at least one sentence.
export async function editEntryLine(user: User, day: string, index: number, text: string): Promise<Entry> {
  const sb = f2Supabase()
  const { data: row, error: e1 } = await sb
    .from('onething_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('day', day)
    .maybeSingle()
  if (e1) throw new Error(`onething: load failed: ${e1.message}`)
  if (!row) throw new Error('Nothing kept on that day.')
  const all = lines((row as Entry).text)
  if (index < 0 || index >= all.length) throw new Error('That thought is not there any more.')
  if (text) all[index] = text
  else all.splice(index, 1)
  if (all.length === 0) throw new Error('A day keeps at least one sentence.')
  const { data, error } = await sb
    .from('onething_entries')
    .update({ text: all.join('\n'), updated_at: new Date().toISOString() })
    .eq('id', (row as Entry).id)
    .select('*')
    .single()
  if (error) throw new Error(`onething: edit failed: ${error.message}`)
  return data as Entry
}

// ---------- copy ----------

export const SITE_URL = 'https://onething.ink'

/// The texts live in copy.json (morning question, evening reminder, the line
/// back after an entry lands); each send picks one at random. All but the
/// morning question end with the site URL on its own line.
type BuddyKey = keyof typeof copy.buddy
const COPY: { morning: string[]; reminder: string[]; kept: string[]; retired: string[]; milestone: string; levelUp: string; buddy: Record<BuddyKey, string> } = copy
function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]
}

/// A buddy-streak line from copy.json with its placeholders filled.
export function buddyCopy(key: BuddyKey, vars: Record<string, string | number> = {}): string {
  return COPY.buddy[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/// The morning question; `extra` lines (a buddy-streak reset) go under it.
/// No site link here (2026-09-16): the question is a text to reply to, not a
/// page to open. The link rides on the "kept" reply and the reminder instead.
export function promptText(extra: string[] = []): string {
  return [pick(COPY.morning), ...extra].join('\n')
}

/// The first text a new account gets: what this is, and today's question.
export function welcomeText(): string {
  return `Welcome to Onething. Every day at ten I’ll ask about your day; you answer with one thing that happened, in a sentence.\nHere’s today’s: what’s one thing that happened today? Just reply here.\n${SITE_URL}`
}

/// The evening reminder; when buddies have already written today it says so
/// instead — the same text slot, sharper, never an additional send.
export function reminderText(_streak: number, buddiesIn: string[] = []): string {
  const line = buddiesIn.length === 0
    ? pick(COPY.reminder)
    : buddiesIn.length === 1
      ? buddyCopy('reminderOne', { name: buddiesIn[0] })
      : buddyCopy('reminderMany', { names: joinNames(buddiesIn) })
  return `${line}\n${SITE_URL}`
}

/// "Sam", "Sam and Priya", "Sam, Priya and Lee".
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/// An inbound message that is one of our own texts is an echo (the mini sends
/// as the user's own Apple ID, so our sends come back through the webhook as
/// from-me, sometimes hours later when Messages syncs) — never something a
/// person typed. The random lines are matched exactly against copy.json (with
/// {n} as any number and the trailing site URL stripped); the fixed templates
/// and the wordings from before 2026-09-13, whose echoes still arrive, by
/// prefix. Keep in step with the templates above and with notify.ts.
function templateRe(line: string): RegExp {
  const esc = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc.replace(/\\\{(n|points)\\\}/g, '\\d+').replace(/\\\{(name|names|in|out)\\\}/g, '.+?')}$`, 'i')
}
/// Buddy templates that can OPEN a text. The tails (who is in, a bonus, a
/// reset, the name question) only ever follow a line from the lists above, so
/// they are not echo evidence on their own — "Sam's in too." can be a diary line.
export const BUDDY_FIRST_LINES: BuddyKey[] = ['reminderOne', 'reminderMany', 'invite', 'accepted', 'acceptedInviter', 'nameSet']
const COPY_LINES: RegExp[] = [...COPY.morning, ...COPY.reminder, ...COPY.kept, ...COPY.retired, ...BUDDY_FIRST_LINES.map((k) => COPY.buddy[k])].map(templateRe)
const OWN_TEXT = [
  /^Onething: what is one thing/i,
  /^Welcome to Onething\./i,
  /^Onething: (still time|one sentence before midnight)/i,
  /^(Got it|Kept, thought|Updated)\b.*\b(Day \d+|points)/i,
  /^Your Onething code is \d{6}/i,
  /^New Onething sign-up:/i,
  /^Onething: new sign-up /i, // wording before 2026-09-13; echoes of it still arrive
  /^One sentence, anything at all\. What happened\?$/i,
]

export function looksLikeOurs(text: string): boolean {
  // The demo account's texts land in Bart's own chat, prefixed; the echo is ours too.
  const t = text.trim().startsWith(DEMO_PREFIX.trim()) ? text.trim().slice(DEMO_PREFIX.trim().length).trim() : text.trim()
  if (OWN_TEXT.some((re) => re.test(t))) return true
  const body = t.endsWith(SITE_URL) ? t.slice(0, -SITE_URL.length).trim() : t
  // Every text of ours opens with a line from copy.json; buddy tails, reset
  // notes and the name question follow on their own lines.
  const first = body.split('\n')[0].trim()
  return COPY_LINES.some((re) => re.test(first))
}

/// The line back after a sentence lands; `tail` lines (who else is in, a
/// buddy bonus, the name question) follow it. The site link is sent only on a
/// milestone or level-up day — every day, iMessage's link preview made the
/// reply a card instead of a line.
export function confirmText(r: Recorded, tail: string[] = []): string {
  if (r.edited) return `Updated. Day ${r.streak} stands, ${r.points} points.`
  if (r.added) return `Kept, thought ${r.added} for today. Day ${r.streak} stands, ${r.points} points.`
  const lines = [pick(COPY.kept).replace('{n}', String(r.streak)), ...tail]
  if (r.bonus > 0) lines.push(COPY.milestone.replace('{n}', String(r.streak)).replace('{bonus}', String(r.bonus)))
  if (r.leveledUp) lines.push(COPY.levelUp.replace('{level}', r.level.name))
  if (r.bonus > 0 || r.leveledUp) lines.push(SITE_URL)
  return lines.join('\n')
}

// ---------- sessions (stateless HMAC cookie, same secret family as F2) ----------

function secret(): string {
  const s = process.env.F2_SESSION_SECRET
  if (!s) throw new Error('F2_SESSION_SECRET not set')
  return s
}

export function signSession(userId: string): string {
  const sig = createHmac('sha256', secret()).update(`onething:${userId}`).digest('hex')
  return `${userId}.${sig}`
}

/// The session cookie, one definition for sign-in and for renewal. A year,
/// httpOnly (Safari keeps server-set cookies; script-written ones it purges
/// after a week without a visit), and re-issued on every visit so an active
/// person never reaches the cliff.
export function sessionCookie(userId: string) {
  return {
    name: COOKIE,
    value: signSession(userId),
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null
  const i = token.lastIndexOf('.')
  if (i < 0) return null
  const userId = token.slice(0, i)
  const sig = token.slice(i + 1)
  const expected = createHmac('sha256', secret()).update(`onething:${userId}`).digest('hex')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return userId
}

// ---------- one-time codes ----------

function hashCode(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

export async function startCode(phone: string): Promise<void> {
  const code = (randomBytes(4).readUInt32BE(0) % 1_000_000).toString().padStart(6, '0')
  const expires_at = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  const { error } = await f2Supabase()
    .from('onething_codes')
    .insert({ phone, code_hash: hashCode(phone, code), expires_at })
  if (error) throw new Error(`onething: code insert failed: ${error.message}`)
  await sendText({ addresses: [phone], text: `Your Onething code is ${code}. It expires in ${CODE_TTL_MIN} minutes.` })
}

export async function verifyCode(phone: string, code: string): Promise<boolean> {
  const sb = f2Supabase()
  const { data } = await sb
    .from('onething_codes')
    .select('id')
    .eq('phone', phone)
    .eq('code_hash', hashCode(phone, code.trim()))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
  const row = data?.[0]
  if (!row) return false
  await sb.from('onething_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
  return true
}

// ---------- the hourly tick (Vercel cron) ----------

/// What the hourly tick owes this user right now, on their own clock. Pure, so
/// it can be tested across zones: 'prompt' inside the 10am–10pm window when
/// today's question has not gone out; 'reminder' from 10pm once it has and the
/// reminder has not; otherwise nothing.
export function dueFor(user: Pick<User, 'tz' | 'prompt_day' | 'reminder_day' | 'prompted_at'>, now = new Date()): 'prompt' | 'reminder' | null {
  const tz = tzFor(user)
  const today = localDay(now, tz)
  const hour = localHour(now, tz)
  if (hour >= PROMPT_HOUR && hour < REMIND_HOUR && user.prompt_day !== today) return 'prompt'
  if (hour >= REMIND_HOUR && user.prompt_day === today && user.reminder_day !== today) {
    const askedAt = user.prompted_at ? new Date(user.prompted_at).getTime() : 0
    if (now.getTime() - askedAt < REMIND_MIN_GAP_MS) return null // asked too recently; maybe next hour
    return 'reminder'
  }
  return null
}

// The hourly tick, the welcome, and the inbound webhook handler live in flow.ts.
