// Onething — one sentence a day, over iMessage, with a streak.
//
// Storage is the three onething_* tables in the F2 Supabase project (see
// apps/onething/schema). Outbound iMessage goes through Dodo's sender
// (src/lib/f2/bluebubbles.ts); inbound arrives on Dodo's BlueBubbles
// webhook, which asks `handleInbound` first and only falls through to Dodo
// when Onething does not claim the message.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { f2Supabase } from '@/lib/f2/supabase'
import { sendIMessage } from '@/lib/f2/bluebubbles'
import { notifySignup, type SignupSource } from './notify'
import { LEVELS, type Level } from './levels'
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
const GRACE_HOUR = 4 // replies before 4am still count for yesterday's prompt
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

export { LEVELS, type Level }

const MILESTONES: Record<number, number> = {
  3: 20, 7: 50, 14: 100, 30: 300, 60: 600, 100: 1000, 365: 5000,
}

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

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 8 && digits.length <= 15 && raw.trim().startsWith('+')) return `+${digits}`
  return null
}

// ---------- scoring ----------

export function levelFor(points: number): { level: Level; next: Level | null; index: number } {
  let i = 0
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].min) i = k
  return { level: LEVELS[i], next: LEVELS[i + 1] ?? null, index: i }
}

export function pointsForEntry(streak: number): { base: number; bonus: number } {
  const base = 10 + 2 * Math.min(streak, 25)
  const bonus = MILESTONES[streak] ?? 0
  return { base, bonus }
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
  await notifySignup(user.phone, source, user.id)
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
      earned: 0, bonus: 0, level: levelFor(same.points).level,
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
  return { entry: data as Entry, edited: false, streak, points, earned: base + bonus, bonus, level: levelFor(points).level }
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
/// back after an entry lands); each send picks one at random. Every one of
/// them ends with the site URL on its own line.
const COPY: { morning: string[]; reminder: string[]; kept: string[] } = copy
function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]
}

export function promptText(): string {
  return `${pick(COPY.morning)}\n${SITE_URL}`
}

/// The first text a new account gets: what this is, and today's question.
export function welcomeText(): string {
  return `Welcome to Onething. Every day at ten I’ll text you one question; you answer in one sentence.\nHere’s today’s: what is one thing that happened in the last 24 hours? Just reply here.\n${SITE_URL}`
}

export function reminderText(_streak: number): string {
  return `${pick(COPY.reminder)}\n${SITE_URL}`
}

/// An inbound message that is one of our own texts is an echo (the mini sends
/// as the user's own Apple ID, so our sends come back through the webhook as
/// from-me, sometimes hours later when Messages syncs) — never something a
/// person typed. The random lines are matched exactly against copy.json (with
/// {n} as any number and the trailing site URL stripped); the fixed templates
/// and the wordings from before 2026-09-13, whose echoes still arrive, by
/// prefix. Keep in step with the templates above and with notify.ts.
const COPY_LINES: RegExp[] = [...COPY.morning, ...COPY.reminder, ...COPY.kept].map(
  (line) => new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{n\\\}/g, '\\d+')}$`, 'i'),
)
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
  const t = text.trim()
  if (OWN_TEXT.some((re) => re.test(t))) return true
  const body = t.endsWith(SITE_URL) ? t.slice(0, -SITE_URL.length).trim() : t
  return COPY_LINES.some((re) => re.test(body))
}

export function confirmText(r: Recorded): string {
  if (r.edited) return `Updated. Day ${r.streak} stands, ${r.points} points.\n${SITE_URL}`
  if (r.added) return `Kept, thought ${r.added} for today. Day ${r.streak} stands, ${r.points} points.\n${SITE_URL}`
  return `${pick(COPY.kept).replace('{n}', String(r.streak))}\n${SITE_URL}`
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
  await sendIMessage({ addresses: [phone], text: `Your Onething code is ${code}. It expires in ${CODE_TTL_MIN} minutes.` })
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

export async function tick(now = new Date()): Promise<{ prompted: string[]; reminded: string[]; failed: string[] }> {
  const sb = f2Supabase()
  const prompted: string[] = []
  const reminded: string[] = []
  const { data, error } = await sb.from('onething_users').select('*').order('created_at')
  if (error) throw new Error(`onething: tick load failed: ${error.message}`)
  const failed: string[] = []
  for (const user of (data ?? []) as User[]) {
    // One number that cannot be reached (a test account, a dead line) must not
    // stop the loop: everyone after it still gets their text this hour, and the
    // failed one is retried next hour because its day markers stay unset.
    try {
      const due = dueFor(user, now)
      const today = localDay(now, tzFor(user))
      if (due === 'prompt') {
        await sendIMessage({ addresses: [user.phone], text: promptText() })
        await sb.from('onething_users').update({ prompt_day: today, prompted_at: now.toISOString() }).eq('id', user.id)
        prompted.push(user.phone)
        continue
      }
      if (due === 'reminder') {
        const entries = await listEntries(user.id, 1)
        const board = scoreboard(entries, today)
        if (!board.doneToday) {
          await sendIMessage({ addresses: [user.phone], text: reminderText(board.streak) })
          reminded.push(user.phone)
        }
        await sb.from('onething_users').update({ reminder_day: today }).eq('id', user.id)
      }
    } catch (e) {
      console.error(`[onething] tick failed for ${user.phone}:`, e)
      failed.push(user.phone)
    }
  }
  return { prompted, reminded, failed }
}

/// A brand-new account (web sign-in or the "onething" keyword): say hello and ask
/// today's question right away, so the loop starts now instead of at the next tick.
/// `chatGuid` replies in the thread the person wrote from; otherwise a new chat.
export async function welcomeNewUser(user: User, chatGuid?: string): Promise<void> {
  await sendIMessage(chatGuid ? { chatGuid, text: welcomeText() } : { addresses: [user.phone], text: welcomeText() })
  const now = new Date()
  await f2Supabase().from('onething_users').update({ prompt_day: localDay(now, tzFor(user)), prompted_at: now.toISOString() }).eq('id', user.id)
}

/// Send today's question to one person right now (first-run / manual).
export async function promptNow(phone: string): Promise<User> {
  const user = await ensureUser(phone)
  const now = new Date()
  const today = localDay(now, tzFor(user))
  await sendIMessage({ addresses: [phone], text: promptText() })
  await f2Supabase().from('onething_users').update({ prompt_day: today, prompted_at: now.toISOString() }).eq('id', user.id)
  return { ...user, prompt_day: today, prompted_at: now.toISOString() }
}

// ---------- inbound (called from Dodo's BlueBubbles webhook) ----------

const FORCE_PREFIX = /^(1|one|onething)\s*[:\-]\s*/i
// A number we have never heard from joins by texting "onething" (optionally with a
// first sentence after a colon). Plain "1:" from a stranger is left to Dodo.
const JOIN_PREFIX = /^(onething|one thing)\b\s*[:\-]?\s*/i

function phoneFromChatGuid(chatGuid: string): string | null {
  // "iMessage;-;+16508989508" → "+16508989508"
  const addr = chatGuid.split(';').pop() ?? ''
  return addr.startsWith('+') ? normalizePhone(addr) : null
}

/// Returns true when Onething claimed the message: the sender is an
/// Onething user AND (a prompt is outstanding OR the text starts "1:"),
/// or a new number texting "onething" to join. Otherwise false, and Dodo
/// handles it as before.
export async function handleInbound(args: {
  handle: string
  chatGuid: string
  text: string
}): Promise<boolean> {
  const phone =
    (args.handle.startsWith('+') ? normalizePhone(args.handle) : null) ??
    phoneFromChatGuid(args.chatGuid)
  if (!phone) return false
  // Our own text coming back (see OWN_TEXT). Claim it and do nothing: it must
  // not become a thought — the sign-up note and the daily question both start
  // "Onething:", which is also the force prefix — and it must not fall through
  // to Dodo either, which would grade it as an answer in the same chat.
  if (looksLikeOurs(args.text)) {
    console.log(`[onething] ignoring our own text echoed from ${phone}: ${args.text.slice(0, 60)}`)
    return true
  }
  const user = await findUserByPhone(phone)
  if (!user) {
    if (!JOIN_PREFIX.test(args.text)) return false
    const fresh = await ensureUser(phone, 'imessage')
    const first = args.text.replace(JOIN_PREFIX, '').trim()
    if (first.length < 2) {
      await welcomeNewUser(fresh, args.chatGuid)
      return true
    }
    const day = localDay(new Date(), tzFor(fresh))
    const r = await recordEntry(fresh, day, first)
    await f2Supabase().from('onething_users').update({ prompt_day: day, prompted_at: new Date().toISOString() }).eq('id', fresh.id)
    await sendIMessage({ chatGuid: args.chatGuid, text: `Welcome to Onething. ${confirmText(r)}` })
    return true
  }

  const now = new Date()
  const tz = tzFor(user)
  const today = localDay(now, tz)
  const hour = localHour(now, tz)
  const forced = FORCE_PREFIX.test(args.text)

  // Which day is this sentence for? Today, unless it is the small hours and
  // yesterday's question is still unanswered.
  // (Look the day up directly: the latest row is not necessarily this day's,
  // which once let chat replies pile onto yesterday as extra thoughts.)
  let day = today
  if (hour < GRACE_HOUR && user.prompt_day === addDays(today, -1) && !(await findEntry(user.id, user.prompt_day))) {
    day = user.prompt_day
  }
  const pending = user.prompt_day === day && !(await findEntry(user.id, day))
  if (!pending && !forced) return false

  const text = args.text.replace(FORCE_PREFIX, '').trim()
  if (text.length < 2) {
    await sendIMessage({ chatGuid: args.chatGuid, text: 'One sentence, anything at all. What happened?' })
    return true
  }
  const r = await recordEntry(user, day, text)
  await sendIMessage({ chatGuid: args.chatGuid, text: confirmText(r) })
  return true
}
