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
  /** Learning objectives (Settings): the star round and the level ladder. */
  objectives: boolean
  rung: number
  /** A jelly critter kind (avatar.ts), or null: one picked from the id. */
  avatar: string | null
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

/** Where a card's item came from: today's things, a past day, or the level's grammar chunks. */
export type QuestionFrom = 'new' | number | 'grammar'
/** Which way a card asks. `to_target` (the default, every day card): the
 *  English is the prompt and the language is the answer. `to_native` (flash
 *  sets): the language is the prompt (`native` holds it) and the English is
 *  the answer (`target` holds it) — the fields keep their grading roles. */
export type QuestionDir = 'to_target' | 'to_native'
export type Question =
  | { kind: 'pick'; native: string; target: string; pinyin: string | null; options: string[]; from: QuestionFrom; item_id: string | null; dir?: QuestionDir }
  | { kind: 'type'; native: string; target: string; pinyin: string | null; from: QuestionFrom; item_id: string | null; dir?: QuestionDir }

export type Answer = { q: number; ok: boolean; answer: string }

export type DayState = 'morning' | 'after_talk' | 'after_things' | 'done'
export type StarState = 'after_talk' | 'after_things' | 'done'

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
  /** "Talk more": free extra calls after the day is done, and the three
   *  things each one produced (one list per call). */
  extra_calls: number
  extra_seconds: number
  extra_things: Thing[][]
  /** The star round: a guided call on the level's objectives, then three
   *  things from its targets, then cards. Its own mini-day beside the day. */
  starred_at: string | null
  star_state: StarState | null
  star_targets: string[] | null
  star_session_id: string | null
  star_seconds: number | null
  star_things: Thing[] | null
  star_things_session_id: string | null
  star_questions: Question[] | null
  star_answers: Answer[]
  star_earned: string[] | null
  star_level_up: boolean
  /** The round's dialogue: Dolly's lines and suggested replies, in order. */
  star_script: ScriptStep[] | null
  /** The level completed on this day (its star round earned the last can-do): the flag on the trail. */
  star_level_done: number | null
  created_at: string
}

export type ScriptStep = {
  /** Dolly's line in the language, and its English. */
  dolly: string
  dolly_en: string
  /** What the learner could say back: English, and the language (behind a tap). */
  you_en: string
  you: string
  target_id: string
}

/** Is a star round under way (its things or cards still to do)? */
export function starInProgress(day: Day): boolean {
  return day.star_state === 'after_talk' || day.star_state === 'after_things'
}

/** The things / questions / answers of whichever flow is live: the star
 *  round while it is under way, else the day's own. */
export function activeThings(day: Day): Thing[] {
  return (starInProgress(day) ? day.star_things : day.things) ?? []
}
export function activeQuestions(day: Day): Question[] {
  return (starInProgress(day) ? day.star_questions : day.questions) ?? []
}
export function activeAnswers(day: Day): Answer[] {
  return starInProgress(day) ? day.star_answers : day.answers
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

/** talk = the day's call; things = said back (the day's or the star
 *  round's); more = a free extra call; star = the guided round; refresh = a
 *  completed level's refresher (two can-dos, then four cards). */
export type VoiceMode = 'talk' | 'things' | 'more' | 'star' | 'refresh'

/** A completed level: bright until `refresh_due`, due from that day on. */
export type LevelRow = {
  id: string
  user_id: string
  language: LanguageCode
  level: number
  completed_at: string
  completed_day: string
  refresh_due: string
  refreshed_at: string | null
  refresh_count: number
}

export type RefreshState = 'talk' | 'cards' | 'done'

/** One refresher attempt on a completed level. */
export type Refresher = {
  id: string
  user_id: string
  language: LanguageCode
  level: number
  day: string
  state: RefreshState
  targets: string[]
  script: ScriptStep[] | null
  session_id: string | null
  seconds: number | null
  demonstrated: string[] | null
  questions: Question[] | null
  answers: Answer[]
  passed: boolean | null
  created_at: string
  done_at: string | null
}

/** A flash card set: ten cards dealt after the day, open until its last
 *  answer; a new deal drops an open one. */
export type FlashSet = {
  id: string
  user_id: string
  language: LanguageCode
  day: string
  state: 'open' | 'done'
  questions: Question[]
  answers: Answer[]
  xp: number
  created_at: string
  done_at: string | null
}

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
  /** Star round: the script line Dolly last said (the [[step:N]] marker). */
  script_step: number | null
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

// ---------- can-dos earned ----------

export type Earned = { cando_id: string; level: number; evidence: string | null; earned_at: string }

export async function listEarned(userId: string): Promise<Earned[]> {
  const { data, error } = await supabase().from('dolly_cando').select('cando_id, level, evidence, earned_at').eq('user_id', userId)
  if (error) throw new Error(`dolly: list earned failed: ${error.message}`)
  return (data ?? []) as Earned[]
}

/** Once earned, a can-do stays earned; a second demonstration changes nothing. */
export async function earnCanDo(userId: string, candoId: string, level: number, evidence: string | null): Promise<void> {
  const { error } = await supabase()
    .from('dolly_cando')
    .upsert({ user_id: userId, cando_id: candoId, level, evidence }, { onConflict: 'user_id,cando_id', ignoreDuplicates: true })
  if (error) throw new Error(`dolly: earn failed: ${error.message}`)
}

// ---------- levels completed, and their refreshers ----------

export async function listLevels(userId: string, language: LanguageCode): Promise<LevelRow[]> {
  const { data, error } = await supabase().from('dolly_levels').select('*').eq('user_id', userId).eq('language', language).order('level')
  if (error) throw new Error(`dolly: list levels failed: ${error.message}`)
  return (data ?? []) as LevelRow[]
}

export async function insertLevel(input: { user_id: string; language: LanguageCode; level: number; completed_day: string; refresh_due: string }): Promise<LevelRow> {
  const { data, error } = await supabase()
    .from('dolly_levels')
    .upsert(input, { onConflict: 'user_id,language,level', ignoreDuplicates: true })
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`dolly: insert level failed: ${error.message}`)
  if (data) return data as LevelRow
  const { data: existing } = await supabase().from('dolly_levels').select('*').eq('user_id', input.user_id).eq('language', input.language).eq('level', input.level).single()
  return existing as LevelRow
}

export async function updateLevel(id: string, patch: Partial<Omit<LevelRow, 'id' | 'user_id'>>): Promise<LevelRow> {
  const { data, error } = await supabase().from('dolly_levels').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`dolly: update level failed: ${error.message}`)
  return data as LevelRow
}

export async function insertRefresher(input: { user_id: string; language: LanguageCode; level: number; day: string; targets: string[]; script: ScriptStep[] }): Promise<Refresher> {
  const { data, error } = await supabase().from('dolly_refreshers').insert(input).select('*').single()
  if (error) throw new Error(`dolly: insert refresher failed: ${error.message}`)
  return data as Refresher
}

/** The refresher under way (its call or its cards still to do), if any. */
export async function findOpenRefresher(userId: string): Promise<Refresher | null> {
  const { data } = await supabase()
    .from('dolly_refreshers')
    .select('*')
    .eq('user_id', userId)
    .neq('state', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Refresher | null) ?? null
}

export async function findRefresherBySession(userId: string, sessionId: string): Promise<Refresher | null> {
  const { data } = await supabase().from('dolly_refreshers').select('*').eq('user_id', userId).eq('session_id', sessionId).maybeSingle()
  return (data as Refresher | null) ?? null
}

/** The refreshers of a local day, newest first. */
export async function listRefreshers(userId: string, day: string): Promise<Refresher[]> {
  const { data, error } = await supabase().from('dolly_refreshers').select('*').eq('user_id', userId).eq('day', day).order('created_at', { ascending: false })
  if (error) throw new Error(`dolly: list refreshers failed: ${error.message}`)
  return (data ?? []) as Refresher[]
}

export async function updateRefresher(id: string, patch: Partial<Omit<Refresher, 'id' | 'user_id' | 'created_at'>>): Promise<Refresher> {
  const { data, error } = await supabase().from('dolly_refreshers').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`dolly: update refresher failed: ${error.message}`)
  return data as Refresher
}

export async function deleteRefresher(id: string): Promise<void> {
  await supabase().from('dolly_refreshers').delete().eq('id', id)
}

// ---------- flash card sets ----------

export async function insertFlashSet(input: { user_id: string; language: LanguageCode; day: string; questions: Question[] }): Promise<FlashSet> {
  const { data, error } = await supabase().from('dolly_flash_sets').insert(input).select('*').single()
  if (error) throw new Error(`dolly: insert flash set failed: ${error.message}`)
  return data as FlashSet
}

export async function findFlashSet(userId: string, id: string): Promise<FlashSet | null> {
  const { data } = await supabase().from('dolly_flash_sets').select('*').eq('user_id', userId).eq('id', id).maybeSingle()
  return (data as FlashSet | null) ?? null
}

/** The set under way, if any (newest). */
export async function findOpenFlashSet(userId: string): Promise<FlashSet | null> {
  const { data } = await supabase()
    .from('dolly_flash_sets')
    .select('*')
    .eq('user_id', userId)
    .eq('state', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as FlashSet | null) ?? null
}

export async function deleteOpenFlashSets(userId: string): Promise<void> {
  await supabase().from('dolly_flash_sets').delete().eq('user_id', userId).eq('state', 'open')
}

/** Sets finished on a local day, and what they paid. */
export async function listFlashSetsDone(userId: string, day: string): Promise<Pick<FlashSet, 'id' | 'xp' | 'answers' | 'questions'>[]> {
  const { data, error } = await supabase().from('dolly_flash_sets').select('id, xp, answers, questions').eq('user_id', userId).eq('day', day).eq('state', 'done')
  if (error) throw new Error(`dolly: list flash sets failed: ${error.message}`)
  return (data ?? []) as Pick<FlashSet, 'id' | 'xp' | 'answers' | 'questions'>[]
}

export async function updateFlashSet(id: string, patch: Partial<Omit<FlashSet, 'id' | 'user_id' | 'created_at'>>): Promise<FlashSet> {
  const { data, error } = await supabase().from('dolly_flash_sets').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`dolly: update flash set failed: ${error.message}`)
  return data as FlashSet
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
