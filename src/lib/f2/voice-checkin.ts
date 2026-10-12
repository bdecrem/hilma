// Daily Voice Checkin (2026-10-12). Once a day each user gets ONE high-level
// question about one of their active topics — any kind (a book, a mini
// topic, anything that is not Inactive), starred or not. It goes out as an
// iMessage with a link into a 'voice_checkin' voice session
// (buildLiveVoiceCheckinInstructions in live.ts): Dodo asks that question,
// grades the answer pass/fail out loud, and on a fail explains the idea and
// asks once more — the second chance. After End the transcript is graded
// (judgeVoiceCheckin in flash.ts) and the day is recorded: an attempt counts
// toward the daily streak like a daily-card answer, a pass pays a little
// more XP. "9" over iMessage makes the topic Inactive (kind = 'inactive',
// threads.ts): out of every daily pool, undone from the Rename sheet.
//
// State: f2_users.voice_checkin (today's pick, question and what happened),
// f2_users.voice_checkin_enabled (Settings), schema 056.
import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from './supabase'
import { bumpDailyStreak, getDailyStreak, ptDay } from './streak'
import { sendIMessage } from './bluebubbles'
import { rememberRoute } from '@/lib/imessage/routes'
import { dailyHandle, DAILY_XP_ATTEMPT, DAILY_XP_CORRECT } from './daily-card'
import { buildBudgetedContent, type F2Thread } from './threads'
import { completedText } from '@/lib/anthropic-response'

export type VoiceCheckinState = {
  day: string // PT date the checkin belongs to
  thread_id: string
  question: string
  picked_at: string
  imessage_sent_at?: string
  resolved?: 'passed' | 'failed' | 'inactive'
  resolved_at?: string
  voice_session_id?: string
}

export type VoiceCheckin = {
  day: string
  thread_id: string
  topic: string
  question: string
  resolved: 'passed' | 'failed' | 'inactive' | null
}

/** Universal link: opens the app straight into the checkin (web falls back to the topic page). */
export const checkinUrl = (threadId: string) => `https://feynd.cc/checkin/${threadId}`

/** The send: 5 pm PT, whatever the season (the cron fires at 00:00 and 01:00 UTC). */
export const CHECKIN_HOUR_PT = 17

/** A "9" over iMessage counts for this long after the text went out. */
const REPLY_WINDOW_MS = 36 * 60 * 60 * 1000

/** Writes the question: the newest Sonnet, low effort, one line out. */
const QUESTION_MODEL = process.env.F2_CHECKIN_QUESTION_MODEL ?? 'claude-sonnet-5-5'

type Candidate = { id: string; topic: string | null; url: string | null }

const subjectOf = (t: { topic: string | null; url: string | null }) => (t.topic ?? t.url ?? 'a topic').trim()

/** Topics the daily checkin may choose: every active topic with something to ask about. */
async function candidates(userId: string): Promise<Candidate[]> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('id, topic, url')
    .eq('user_id', userId)
    .neq('kind', 'inactive')
    .or('topic.not.is.null,url.not.is.null')
  if (error) throw new Error(`voice-checkin candidates failed: ${error.message}`)
  return (data ?? []) as Candidate[]
}

async function readState(userId: string): Promise<VoiceCheckinState | null> {
  const { data, error } = await f2Supabase().from('f2_users').select('voice_checkin').eq('id', userId).maybeSingle()
  if (error) throw new Error(`voice-checkin state read failed: ${error.message}`)
  return (data?.voice_checkin as VoiceCheckinState | null) ?? null
}

async function writeState(userId: string, state: VoiceCheckinState): Promise<void> {
  const { error } = await f2Supabase().from('f2_users').update({ voice_checkin: state }).eq('id', userId)
  if (error) throw new Error(`voice-checkin state write failed: ${error.message}`)
}

async function threadRow(userId: string, threadId: string): Promise<F2Thread | null> {
  const { data } = await f2Supabase().from('f2_threads').select('*').eq('id', threadId).eq('user_id', userId).maybeSingle()
  return (data as F2Thread | null) ?? null
}

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

/**
 * One HIGH-LEVEL question about the topic: the main idea, the argument, the
 * why — something a person who understood the topic can answer in a few
 * spoken sentences, never a detail, a date, a name or a number. Avoids the
 * questions asked on earlier days when given.
 */
export async function writeCheckinQuestion(thread: F2Thread, avoid: string[] = []): Promise<string> {
  const subject = subjectOf(thread)
  const source = buildBudgetedContent(thread, 60_000)
  const res = await anthropic().messages.create({
    model: QUESTION_MODEL,
    max_tokens: 2048,
    output_config: { effort: 'low' },
    system: `You write the one question of a daily spoken checkin for a learning app. The learner saved this topic some time ago; the checkin asks whether the big idea stuck.

Write ONE high-level question about the topic:
- about the main idea, the central argument, the mechanism, or why it matters — the kind of thing a person who understood the topic can explain in a few sentences out loud
- general, not specific: never a date, a name, a number, a definition of a term, or a detail from one passage
- answerable without the text in front of them; the answer is an explanation, not a fact
- one sentence, plain words, no preamble, no quotation marks, no "In the book..."
Return only the question.${thread.study_focus ? `\nThe learner's study focus: "${thread.study_focus}" — stay inside it.` : ''}${avoid.length ? `\nDo not reuse or lightly rephrase these earlier questions:\n${avoid.map((q) => `- ${q}`).join('\n')}` : ''}`,
    messages: [{ role: 'user', content: `Topic: ${subject}\n\nMaterial:\n${source || '(no saved material — use general knowledge of the subject)'}` }],
  })
  const q = completedText(res).trim().replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ')
  if (!q || q.length < 12) throw new Error('voice-checkin: no question came back')
  return q.slice(0, 300)
}

/**
 * Today's checkin for this user, choosing one (and writing its question)
 * when today has none. Random among the candidates, avoiding yesterday's
 * topic when there is another. The write only lands when no checkin for
 * today exists yet, so the cron and the app asking at the same moment agree.
 * Null when the user has no active topic.
 */
export async function ensureTodaysCheckin(userId: string, now: Date = new Date()): Promise<VoiceCheckin | null> {
  const day = ptDay(now)
  const state = await readState(userId)
  if (state?.day === day) return checkinFromState(userId, state)

  const pool = await candidates(userId)
  if (pool.length === 0) return null
  const fresh = pool.filter((c) => c.id !== state?.thread_id)
  const from = fresh.length > 0 ? fresh : pool
  const choice = from[Math.floor(Math.random() * from.length)]
  const thread = await threadRow(userId, choice.id)
  if (!thread) return null
  const question = await writeCheckinQuestion(thread, state?.thread_id === choice.id && state.question ? [state.question] : [])
  const next: VoiceCheckinState = { day, thread_id: choice.id, question, picked_at: now.toISOString() }

  const { data: written, error } = await f2Supabase()
    .from('f2_users')
    .update({ voice_checkin: next })
    .eq('id', userId)
    .or(`voice_checkin.is.null,voice_checkin->>day.neq.${day}`)
    .select('voice_checkin')
  if (error) throw new Error(`voice-checkin pick write failed: ${error.message}`)
  if (!written || written.length === 0) {
    const winner = await readState(userId)
    return winner?.day === day ? checkinFromState(userId, winner) : null
  }
  return { day, thread_id: choice.id, topic: subjectOf(choice), question, resolved: null }
}

async function checkinFromState(userId: string, state: VoiceCheckinState): Promise<VoiceCheckin | null> {
  const t = await threadRow(userId, state.thread_id)
  if (!t) return null // topic deleted since
  const resolved = state.resolved ?? (t.kind === 'inactive' ? 'inactive' : null)
  return { day: state.day, thread_id: state.thread_id, topic: subjectOf(t), question: state.question, resolved }
}

/**
 * The question a voice session asks: today's when this is today's topic,
 * otherwise a fresh one (a replay, or the checkin opened from a topic page).
 */
export async function questionForCheckin(userId: string, thread: F2Thread): Promise<string> {
  const state = await readState(userId)
  if (state?.day === ptDay() && state.thread_id === thread.id && state.question) return state.question
  return writeCheckinQuestion(thread, state?.thread_id === thread.id && state.question ? [state.question] : [])
}

/** The topic type Inactive: out of every daily pool. Returns false when the topic isn't the user's. */
export async function markTopicInactive(userId: string, threadId: string): Promise<boolean> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .update({ kind: 'inactive' })
    .eq('id', threadId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(`mark inactive failed: ${error.message}`)
  if (!data || data.length === 0) return false
  const state = await readState(userId)
  if (state && state.thread_id === threadId && !state.resolved) {
    await writeState(userId, { ...state, resolved: 'inactive', resolved_at: new Date().toISOString() })
  }
  return true
}

export type VoiceCheckinReward = {
  /** Whether this session counted for the day (false: the day was already settled). */
  counted: boolean
  streak: number
  xp_awarded: number
}

/**
 * Record a graded checkin: settle today's state, count the attempt toward
 * the daily streak (idempotent within a day) and pay XP — once per day. A
 * later session on the same day (a replay) changes nothing.
 */
export async function recordVoiceCheckin(
  userId: string,
  threadId: string,
  grade: { outcome: 'passed' | 'failed' | 'no_answer' | 'inactive' },
  voiceSessionId: string,
): Promise<VoiceCheckinReward> {
  const state = await readState(userId)
  const today = ptDay()
  if (grade.outcome === 'inactive') {
    await markTopicInactive(userId, threadId)
    return { counted: false, streak: (await getDailyStreak(userId)).streak, xp_awarded: 0 }
  }
  if (grade.outcome === 'no_answer') {
    return { counted: false, streak: (await getDailyStreak(userId)).streak, xp_awarded: 0 }
  }
  const isToday = state?.day === today && state.thread_id === threadId
  if (isToday && state.resolved) {
    return { counted: false, streak: (await getDailyStreak(userId)).streak, xp_awarded: 0 }
  }
  // Claim the day first so a retried grade request pays once: the write is
  // conditional on the state being today's and unresolved.
  if (isToday) {
    const { data: claimed, error } = await f2Supabase()
      .from('f2_users')
      .update({ voice_checkin: { ...state, resolved: grade.outcome, resolved_at: new Date().toISOString(), voice_session_id: voiceSessionId } })
      .eq('id', userId)
      .eq('voice_checkin->>day', today)
      .is('voice_checkin->>resolved', null)
      .select('id')
    if (error) throw new Error(`voice-checkin record failed: ${error.message}`)
    if (!claimed || claimed.length === 0) return { counted: false, streak: (await getDailyStreak(userId)).streak, xp_awarded: 0 }
  } else {
    // Not today's topic: counts for the streak (showing up is showing up) but
    // only when nothing counted today yet — otherwise it's just practice.
    if (state?.day === today && state.resolved && state.resolved !== 'inactive') {
      return { counted: false, streak: (await getDailyStreak(userId)).streak, xp_awarded: 0 }
    }
    await writeState(userId, { day: today, thread_id: threadId, question: '', picked_at: new Date().toISOString(), resolved: grade.outcome, resolved_at: new Date().toISOString(), voice_session_id: voiceSessionId })
  }
  const streak = await bumpDailyStreak(userId)
  const mult = (await getDailyStreak(userId)).multiplier
  const xp = (grade.outcome === 'passed' ? DAILY_XP_CORRECT : DAILY_XP_ATTEMPT) * mult
  const { error: xpErr } = await f2Supabase().rpc('f2_add_xp', { p_user_id: userId, p_amount: xp })
  if (xpErr) console.error('[f2/voice-checkin] f2_add_xp failed:', xpErr)
  return { counted: true, streak, xp_awarded: xp }
}

// ---------------------------------------------------------------------------
// The 5 pm send: iMessage
// ---------------------------------------------------------------------------

export function voiceCheckinText(c: { topic: string; question: string; thread_id: string }): string {
  return `🎙 Daily voice checkin — ${c.topic}

${c.question}

Answer it out loud with Dodo (pass or fail, with a second chance): ${checkinUrl(c.thread_id)}

Done with this topic? Reply 9 and it goes inactive.`
}

type SendResult = { user: string; status: 'sent' | 'no-topic' | 'resolved' | 'skipped' | 'error'; detail?: string }

/**
 * Text today's checkin to everyone with it on and an iMessage handle. Runs
 * at 5 pm PT (the cron fires at 00:00 and 01:00 UTC and this keeps the one
 * that is 17:00 in LA); `force` skips the clock. Once per day per user — the
 * state records the send — so a rerun only fills in what failed.
 */
export async function sendVoiceCheckins(opts: { now?: Date; force?: boolean; onlyUserId?: string } = {}): Promise<SendResult[]> {
  const now = opts.now ?? new Date()
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(now))
  if (!opts.force && hour !== CHECKIN_HOUR_PT) return []

  let q = f2Supabase().from('f2_users').select('id, username, imessage_handles, daily_chat_guid, voice_checkin_enabled').eq('voice_checkin_enabled', true)
  if (opts.onlyUserId) q = q.eq('id', opts.onlyUserId)
  const { data: users, error } = await q
  if (error) throw new Error(`voice-checkin users query failed: ${error.message}`)

  const out: SendResult[] = []
  for (const u of (users ?? []) as { id: string; username: string; imessage_handles: string[] | null; daily_chat_guid: string | null }[]) {
    const handle = dailyHandle(u.imessage_handles)
    if (!u.daily_chat_guid && !handle) { out.push({ user: u.username, status: 'skipped' }); continue }
    try {
      const c = await ensureTodaysCheckin(u.id, now)
      if (!c) { out.push({ user: u.username, status: 'no-topic' }); continue }
      if (c.resolved) { out.push({ user: u.username, status: 'resolved' }); continue }
      const state = (await readState(u.id))!
      if (state.imessage_sent_at) { out.push({ user: u.username, status: 'sent', detail: 'already' }); continue }
      const text = voiceCheckinText(c)
      if (u.daily_chat_guid) await sendIMessage({ chatGuid: u.daily_chat_guid, text })
      else {
        await sendIMessage({ addresses: [handle!], text })
        await rememberRoute(handle!, 'dodo', 'voice checkin sent')
      }
      state.imessage_sent_at = new Date().toISOString()
      await writeState(u.id, state)
      out.push({ user: u.username, status: 'sent' })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.error(`[f2/voice-checkin] send failed for ${u.username}:`, detail)
      out.push({ user: u.username, status: 'error', detail })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// iMessage: "9" = done with this topic
// ---------------------------------------------------------------------------

const INACTIVE = /^\s*(9|nine|inactive|done with (this|it|this one)|retire( it| this)?)[\s.!]*$/i

/**
 * If `text` retires the topic of today's texted checkin, mark it Inactive
 * and return the reply; null otherwise. The message that went out LAST owns
 * the reply (a "9" can be an answer to the daily card or the Actively Read text).
 */
export async function maybeHandleVoiceCheckinReply(userId: string, text: string): Promise<string | null> {
  if (!INACTIVE.test(text)) return null
  const { data } = await f2Supabase().from('f2_users').select('voice_checkin, daily_card, actively_read').eq('id', userId).maybeSingle()
  const state = (data?.voice_checkin as VoiceCheckinState | null) ?? null
  if (!state?.imessage_sent_at || state.resolved) return null
  const sentAt = new Date(state.imessage_sent_at).getTime()
  if (Date.now() - sentAt > REPLY_WINDOW_MS) return null
  const daily = data?.daily_card as { sent_at?: string; offered_at?: string } | null
  const dailyAt = daily ? new Date(daily.sent_at ?? daily.offered_at ?? 0).getTime() : 0
  if (dailyAt > sentAt) return null
  const ar = data?.actively_read as { imessage_sent_at?: string; resolved?: string } | null
  const arAt = ar?.imessage_sent_at && !ar.resolved ? new Date(ar.imessage_sent_at).getTime() : 0
  if (arAt > sentAt) return null
  const t = await threadRow(userId, state.thread_id)
  if (!t) return null
  await markTopicInactive(userId, state.thread_id)
  return `Got it, "${subjectOf(t)}" is inactive now — no more daily questions on it. Its chat and cards stay; the topic's Rename sheet in Dodo brings it back.`
}
