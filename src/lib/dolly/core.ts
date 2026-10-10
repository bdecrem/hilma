// Dolly's rows and the small pure helpers around them. The day's state
// machine is in day.ts, the prompts in prompts.ts, sign-in in auth.ts.
import { f2Supabase } from '@/lib/f2/supabase'
import { type LanguageCode, type Level } from './language'

export const supabase = f2Supabase

export type User = {
  id: string
  phone: string
  name: string | null
  language: LanguageCode
  level: Level
  daily_hour: number
  tz: string
  streak: number
  best_streak: number
  last_done_day: string | null
  next_topic: string | null
  prompt_day: string | null
  prompted_at: string | null
  reminder_day: string | null
  created_at: string
}

export type ThingKind = 'fix' | 'word' | 'phrase'

export type Thing = {
  kind: ThingKind
  target: string
  native: string
  pinyin: string | null
  source: string
  distractors: string[]
  item_id: string | null
}

export type Question =
  | { kind: 'pick'; native: string; target: string; pinyin: string | null; options: string[]; from: 'new' | number; item_id: string | null }
  | { kind: 'type'; native: string; target: string; pinyin: string | null; from: 'new' | number; item_id: string | null }

export type Answer = { q: number; ok: boolean; answer: string }

export type DayState = 'morning' | 'after_talk' | 'after_things' | 'done'

export type Day = {
  id: string
  user_id: string
  day: string
  n: number
  topic: string
  state: DayState
  call_session_id: string | null
  call_seconds: number | null
  things: Thing[] | null
  things_session_id: string | null
  questions: Question[] | null
  answers: Answer[]
  done_at: string | null
  created_at: string
}

export type Item = {
  id: string
  user_id: string
  kind: ThingKind
  target: string
  native: string
  pinyin: string | null
  source: string | null
  distractors: string[] | null
  day_n: number
  hits: number
  misses: number
  last_seen: string | null
  created_at: string
}

export type VoiceMode = 'talk' | 'things'

export type VoiceSession = {
  id: string
  user_id: string
  day_id: string | null
  mode: VoiceMode
  engine: string
  system_prompt: string | null
  conversation_id: string | null
  transcript: unknown[] | null
  seconds: number | null
  started_at: string
  ended_at: string | null
}

// ---------- clocks ----------

export const DEFAULT_TZ = 'America/Los_Angeles'

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The local calendar day (YYYY-MM-DD) and hour in a zone. */
export function localClock(now: Date, tz: string): { day: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  // en-CA gives 24 for midnight in some engines.
  const hour = Number(get('hour')) % 24
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour, minute: Number(get('minute')) }
}

export function localDay(now: Date, tz: string): string {
  return localClock(now, tz).day
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "8 AM", "12 PM", "7 PM" — how the app and the texts say the daily hour. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${h < 12 ? 'AM' : 'PM'}`
}

// ---------- users ----------

export async function findUserById(id: string): Promise<User | null> {
  const { data } = await supabase().from('dolly_users').select('*').eq('id', id).maybeSingle()
  return (data as User | null) ?? null
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const { data } = await supabase().from('dolly_users').select('*').eq('phone', phone).maybeSingle()
  return (data as User | null) ?? null
}

export async function createUser(input: {
  phone: string
  language: LanguageCode
  level: Level
  daily_hour: number
  tz: string
  name?: string | null
}): Promise<User> {
  const { data, error } = await supabase()
    .from('dolly_users')
    .insert({
      phone: input.phone,
      language: input.language,
      level: input.level,
      daily_hour: input.daily_hour,
      tz: input.tz,
      name: input.name ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`dolly: create user failed: ${error.message}`)
  return data as User
}

export async function updateUser(id: string, patch: Partial<Omit<User, 'id' | 'created_at'>>): Promise<User> {
  const { data, error } = await supabase().from('dolly_users').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`dolly: update user failed: ${error.message}`)
  return data as User
}

export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase().from('dolly_users').select('*').order('created_at')
  if (error) throw new Error(`dolly: list users failed: ${error.message}`)
  return (data ?? []) as User[]
}

/** The streak as it stands right now: alive if the last done day is today
 *  or yesterday, otherwise over. The stored number is only bumped on a done. */
export function currentStreak(user: Pick<User, 'streak' | 'last_done_day' | 'tz'>, now = new Date()): number {
  if (!user.last_done_day) return 0
  const today = localDay(now, user.tz)
  if (user.last_done_day === today || user.last_done_day === addDays(today, -1)) return user.streak
  return 0
}

// ---------- days ----------

export async function findDay(userId: string, day: string): Promise<Day | null> {
  const { data } = await supabase().from('dolly_days').select('*').eq('user_id', userId).eq('day', day).maybeSingle()
  return (data as Day | null) ?? null
}

export async function findDayById(userId: string, id: string): Promise<Day | null> {
  const { data } = await supabase().from('dolly_days').select('*').eq('user_id', userId).eq('id', id).maybeSingle()
  return (data as Day | null) ?? null
}

/** The most recent days, newest first. */
export async function listDays(userId: string, limit = 14): Promise<Day[]> {
  const { data, error } = await supabase()
    .from('dolly_days')
    .select('*')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`dolly: list days failed: ${error.message}`)
  return (data ?? []) as Day[]
}

export async function countDays(userId: string): Promise<number> {
  const { count, error } = await supabase().from('dolly_days').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (error) throw new Error(`dolly: count days failed: ${error.message}`)
  return count ?? 0
}

export async function insertDay(input: { user_id: string; day: string; n: number; topic: string }): Promise<Day> {
  const { data, error } = await supabase().from('dolly_days').insert(input).select('*').single()
  if (error) throw new Error(`dolly: insert day failed: ${error.message}`)
  return data as Day
}

export async function updateDay(id: string, patch: Partial<Omit<Day, 'id' | 'user_id' | 'created_at'>>): Promise<Day> {
  const { data, error } = await supabase().from('dolly_days').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`dolly: update day failed: ${error.message}`)
  return data as Day
}

// ---------- items ----------

export async function listItems(userId: string): Promise<Item[]> {
  const { data, error } = await supabase().from('dolly_items').select('*').eq('user_id', userId).order('created_at')
  if (error) throw new Error(`dolly: list items failed: ${error.message}`)
  return (data ?? []) as Item[]
}

/** Keep a thing: a new row, or the existing row for that target (a fix
 *  that comes up twice stays one item, with its counts). */
export async function upsertItem(userId: string, thing: Omit<Thing, 'item_id'>, dayN: number): Promise<Item> {
  const sb = supabase()
  const { data: existing } = await sb
    .from('dolly_items')
    .select('*')
    .eq('user_id', userId)
    .eq('target', thing.target)
    .maybeSingle()
  if (existing) return existing as Item
  const { data, error } = await sb
    .from('dolly_items')
    .insert({
      user_id: userId,
      kind: thing.kind,
      target: thing.target,
      native: thing.native,
      pinyin: thing.pinyin,
      source: thing.source,
      distractors: thing.distractors,
      day_n: dayN,
    })
    .select('*')
    .single()
  if (error) throw new Error(`dolly: insert item failed: ${error.message}`)
  return data as Item
}

export async function scoreItem(id: string, ok: boolean, day: string): Promise<void> {
  const sb = supabase()
  const { data } = await sb.from('dolly_items').select('hits, misses').eq('id', id).maybeSingle()
  if (!data) return
  const row = data as { hits: number; misses: number }
  await sb
    .from('dolly_items')
    .update({ hits: row.hits + (ok ? 1 : 0), misses: row.misses + (ok ? 0 : 1), last_seen: day })
    .eq('id', id)
}

// ---------- voice sessions ----------

export async function insertVoiceSession(input: {
  user_id: string
  day_id: string
  mode: VoiceMode
  system_prompt: string
}): Promise<VoiceSession> {
  const { data, error } = await supabase().from('dolly_voice_sessions').insert(input).select('*').single()
  if (error) throw new Error(`dolly: insert voice session failed: ${error.message}`)
  return data as VoiceSession
}

export async function findVoiceSession(id: string): Promise<VoiceSession | null> {
  const { data } = await supabase().from('dolly_voice_sessions').select('*').eq('id', id).maybeSingle()
  return (data as VoiceSession | null) ?? null
}

export async function updateVoiceSession(id: string, patch: Partial<Omit<VoiceSession, 'id' | 'user_id'>>): Promise<void> {
  const { error } = await supabase().from('dolly_voice_sessions').update(patch).eq('id', id)
  if (error) throw new Error(`dolly: update voice session failed: ${error.message}`)
}
