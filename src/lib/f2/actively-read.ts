// Actively Read (2026-10-07). Once a day each user gets one random topic of
// theirs that is not Actively Read yet (stars = 0) and not declined. It is
// offered three ways: an iMessage at noon PT (daily-card users), a push
// (users with a device token), and the top banner in the app. The topic is
// talked through in an 'actively_read' voice session (live.ts); "I'm ready"
// starts a three-question test in the same conversation; the transcript is
// graded afterwards (judgeActivelyRead in flash.ts). B+ or better: the topic
// gets its first star and the next Peck level is cleared — streak credit and
// the level's XP included. "Not interested" (in the conversation, from the
// banner or the push, or "2" over iMessage) takes the topic out of the daily
// picks for good; the topic page can undo it.
//
// State: f2_users.actively_read (today's pick and what happened to it),
// f2_threads.ar_inactive_at / ar_passed_at (schema 055).
import { f2Supabase } from './supabase'
import { getDailyStreak, markPeckWeek, ptDay } from './streak'
import { sendIMessage } from './bluebubbles'
import { rememberRoute } from '@/lib/imessage/routes'
import { dailyHandle } from './daily-card'
import { getJumboState, jumboLevelMode, jumboPassScore, SET_SIZE, xpForSet } from './flash'
import { sendPushToUser, usersWithPush } from './push'

export type ActivelyReadState = {
  day: string // PT date the pick belongs to
  thread_id: string
  picked_at: string
  imessage_sent_at?: string
  push_sent_at?: string
  resolved?: 'passed' | 'declined'
  resolved_at?: string
}

export type ActivelyReadPick = {
  day: string
  thread_id: string
  topic: string
  resolved: 'passed' | 'declined' | null
}

/** Universal link: opens the app straight into the voice session (web falls back to the topic page). */
export const readUrl = (threadId: string) => `https://feynd.cc/read/${threadId}`

/** The noon send: PT, whatever the season (the cron fires at both 19:00 and 20:00 UTC). */
export const NUDGE_HOUR_PT = 12

/** An answer over iMessage counts for this long after the text went out. */
const REPLY_WINDOW_MS = 36 * 60 * 60 * 1000

type Candidate = { id: string; topic: string | null; url: string | null }

const subjectOf = (t: { topic: string | null; url: string | null }) => (t.topic ?? t.url ?? 'a topic').trim()

/** Topics the daily pick may choose: no star yet, not declined, something to talk about. */
async function candidates(userId: string): Promise<Candidate[]> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('id, topic, url')
    .eq('user_id', userId)
    .eq('stars', 0)
    .is('ar_inactive_at', null)
    .or('topic.not.is.null,url.not.is.null')
  if (error) throw new Error(`actively-read candidates failed: ${error.message}`)
  return (data ?? []) as Candidate[]
}

async function readState(userId: string): Promise<ActivelyReadState | null> {
  const { data, error } = await f2Supabase().from('f2_users').select('actively_read').eq('id', userId).maybeSingle()
  if (error) throw new Error(`actively-read state read failed: ${error.message}`)
  return (data?.actively_read as ActivelyReadState | null) ?? null
}

async function writeState(userId: string, state: ActivelyReadState): Promise<void> {
  const { error } = await f2Supabase().from('f2_users').update({ actively_read: state }).eq('id', userId)
  if (error) throw new Error(`actively-read state write failed: ${error.message}`)
}

async function topicOf(userId: string, threadId: string): Promise<{ topic: string | null; url: string | null; stars: number; ar_inactive_at: string | null } | null> {
  const { data } = await f2Supabase()
    .from('f2_threads')
    .select('topic, url, stars, ar_inactive_at')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { topic: string | null; url: string | null; stars: number; ar_inactive_at: string | null } | null) ?? null
}

/**
 * Today's pick for this user, choosing one when today has none. The choice is
 * random among the candidates, avoiding yesterday's when there is another.
 * The write only lands when no pick for today exists yet, so the cron and the
 * app asking at the same moment agree on one topic. Null when the user has no
 * candidate topic.
 */
export async function ensureTodaysPick(userId: string, now: Date = new Date()): Promise<ActivelyReadPick | null> {
  const day = ptDay(now)
  const state = await readState(userId)
  if (state?.day === day) return pickFromState(userId, state)

  const pool = await candidates(userId)
  if (pool.length === 0) return null
  const fresh = pool.filter((c) => c.id !== state?.thread_id)
  const from = fresh.length > 0 ? fresh : pool
  const choice = from[Math.floor(Math.random() * from.length)]
  const next: ActivelyReadState = { day, thread_id: choice.id, picked_at: now.toISOString() }

  // Conditional write: only replace a pick from another day (or none).
  const { data: written, error } = await f2Supabase()
    .from('f2_users')
    .update({ actively_read: next })
    .eq('id', userId)
    .or(`actively_read.is.null,actively_read->>day.neq.${day}`)
    .select('actively_read')
  if (error) throw new Error(`actively-read pick write failed: ${error.message}`)
  if (!written || written.length === 0) {
    // Someone else picked first: use theirs.
    const winner = await readState(userId)
    return winner?.day === day ? pickFromState(userId, winner) : null
  }
  return { day, thread_id: choice.id, topic: subjectOf(choice), resolved: null }
}

async function pickFromState(userId: string, state: ActivelyReadState): Promise<ActivelyReadPick | null> {
  const t = await topicOf(userId, state.thread_id)
  if (!t) return null // topic deleted since
  // Starred some other way (a chat quiz) or declined from the topic page:
  // today's offer is settled.
  const resolved = state.resolved ?? (t.stars >= 1 ? 'passed' : t.ar_inactive_at ? 'declined' : null)
  return { day: state.day, thread_id: state.thread_id, topic: subjectOf(t), resolved }
}

async function resolveToday(userId: string, threadId: string, how: 'passed' | 'declined'): Promise<void> {
  const state = await readState(userId)
  if (!state || state.thread_id !== threadId) return
  // A pass settles the day whatever came before; a decline never overrides a pass.
  if (state.resolved === 'passed' || (state.resolved && how === 'declined')) return
  await writeState(userId, { ...state, resolved: how, resolved_at: new Date().toISOString() })
}

/** "Not interested": out of the daily picks for good (until undone on the topic page). */
export async function declineActivelyRead(userId: string, threadId: string): Promise<boolean> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .update({ ar_inactive_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(`decline failed: ${error.message}`)
  if (!data || data.length === 0) return false
  await resolveToday(userId, threadId, 'declined')
  return true
}

export async function undoDeclineActivelyRead(userId: string, threadId: string): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ ar_inactive_at: null })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) throw new Error(`undo decline failed: ${error.message}`)
  // Today's pick was this topic and was declined: it's open again.
  const state = await readState(userId)
  if (state?.thread_id === threadId && state.resolved === 'declined') {
    const { resolved: _r, resolved_at: _a, ...open } = state
    await writeState(userId, open)
  }
}

export type ActivelyReadReward = {
  stars: number
  /** The Peck level cleared by this pass; null when nothing new was granted. */
  peck_level: number | null
  xp_awarded: number
}

/**
 * A passed test: the topic's first star, and the next Peck level cleared as if
 * it had been played — a passing set row with the level's XP (streak
 * multiplier included), the weekly Peck streak marked, XP credited. Once per
 * topic: a topic that already passed (or already has a star) earns nothing again.
 */
export async function awardActivelyRead(userId: string, threadId: string): Promise<ActivelyReadReward> {
  const sb = f2Supabase()
  const { data: t, error } = await sb
    .from('f2_threads')
    .select('stars, ar_passed_at')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !t) throw new Error(`award: topic not found (${error?.message ?? 'no row'})`)
  if ((t.stars as number) >= 1 || t.ar_passed_at) {
    return { stars: t.stars as number, peck_level: null, xp_awarded: 0 }
  }
  // Claim the award first (conditional on ar_passed_at still null) so a
  // retried grade request cannot grant two levels.
  const { data: claimed, error: claimErr } = await sb
    .from('f2_threads')
    .update({ stars: 1, ar_passed_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
    .is('ar_passed_at', null)
    .select('id')
  if (claimErr) throw new Error(`award claim failed: ${claimErr.message}`)
  if (!claimed || claimed.length === 0) return { stars: 1, peck_level: null, xp_awarded: 0 }

  const jumbo = await getJumboState(userId)
  const level = jumbo.highest_passed + 1
  const mode = jumboLevelMode(level)
  const score = jumboPassScore(mode)
  const xp = xpForSet(score, SET_SIZE) * (await getDailyStreak(userId)).multiplier
  const { error: setErr } = await sb.from('f2_flash_sets').insert({
    user_id: userId,
    thread_id: null,
    jumbo_level: level,
    mode,
    score,
    total: SET_SIZE,
    results: [],
    xp,
  })
  if (setErr) throw new Error(`award: Peck level insert failed: ${setErr.message}`)
  await markPeckWeek(userId)
  const { error: xpErr } = await sb.rpc('f2_add_xp', { p_user_id: userId, p_amount: xp })
  if (xpErr) console.error('[f2/actively-read] f2_add_xp failed:', xpErr)
  await resolveToday(userId, threadId, 'passed')
  return { stars: 1, peck_level: level, xp_awarded: xp }
}

// ---------------------------------------------------------------------------
// The noon send: iMessage + push
// ---------------------------------------------------------------------------

export function activelyReadText(topic: string, threadId: string): string {
  return `📖 Today's read: ${topic}

Talk it through with Dodo, and say "I'm ready" when you want the quick test. Pass it and the topic counts as actively read, plus you move up a Peck level: ${readUrl(threadId)}

Not interested in this one? Reply 2.`
}

export function activelyReadPush(pick: ActivelyReadPick) {
  return {
    title: "Today's read",
    body: `${pick.topic}. Talk it through with Dodo, then take the quick test.`,
    category: 'ACTIVELY_READ',
    // One Dodo push at a time: a newer one replaces this one on the device.
    collapseId: 'dodo-daily',
    threadId: 'dodo',
    data: { kind: 'actively_read', thread_id: pick.thread_id, day: pick.day },
  }
}

type NudgeResult = { user: string; status: 'sent' | 'no-topic' | 'resolved' | 'skipped' | 'error'; imessage?: boolean; push?: number; detail?: string }

/**
 * Send today's pick to everyone who can receive it: an iMessage to daily-card
 * users, a push to users with a device token. Runs at noon PT (the cron fires
 * at 19:00 and 20:00 UTC and this keeps the one that is noon in LA); `force`
 * skips the clock (manual runs). Each channel goes once per day — the state
 * records it — so a rerun only fills in what failed.
 */
export async function sendActivelyReadNudges(opts: { now?: Date; force?: boolean; onlyUserId?: string } = {}): Promise<NudgeResult[]> {
  const now = opts.now ?? new Date()
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(now))
  if (!opts.force && hour !== NUDGE_HOUR_PT) return []

  let q = f2Supabase().from('f2_users').select('id, username, imessage_handles, daily_chat_guid, daily_card_enabled')
  if (opts.onlyUserId) q = q.eq('id', opts.onlyUserId)
  const { data: users, error } = await q
  if (error) throw new Error(`actively-read users query failed: ${error.message}`)
  const pushUsers = await usersWithPush()

  const out: NudgeResult[] = []
  for (const u of (users ?? []) as { id: string; username: string; imessage_handles: string[] | null; daily_chat_guid: string | null; daily_card_enabled: boolean }[]) {
    const handle = dailyHandle(u.imessage_handles)
    const canText = u.daily_card_enabled && (!!u.daily_chat_guid || !!handle)
    const canPush = pushUsers.has(u.id)
    if (!canText && !canPush) { out.push({ user: u.username, status: 'skipped' }); continue }
    try {
      const pick = await ensureTodaysPick(u.id, now)
      if (!pick) { out.push({ user: u.username, status: 'no-topic' }); continue }
      if (pick.resolved) { out.push({ user: u.username, status: 'resolved' }); continue }
      const state = (await readState(u.id))!
      const result: NudgeResult = { user: u.username, status: 'sent' }
      if (canText && !state.imessage_sent_at) {
        const text = activelyReadText(pick.topic, pick.thread_id)
        if (u.daily_chat_guid) await sendIMessage({ chatGuid: u.daily_chat_guid, text })
        else {
          await sendIMessage({ addresses: [handle!], text })
          await rememberRoute(handle!, 'dodo', 'actively read sent')
        }
        state.imessage_sent_at = new Date().toISOString()
        await writeState(u.id, state)
        result.imessage = true
      }
      if (canPush && !state.push_sent_at) {
        const r = await sendPushToUser(u.id, activelyReadPush(pick))
        if (r.sent > 0) {
          state.push_sent_at = new Date().toISOString()
          await writeState(u.id, state)
        }
        result.push = r.sent
        if (r.failed.length) result.detail = r.failed.map((f) => `${f.token}:${f.status}:${f.reason ?? ''}`).join(' ')
      }
      out.push(result)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.error(`[f2/actively-read] nudge failed for ${u.username}:`, detail)
      out.push({ user: u.username, status: 'error', detail })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// iMessage: "2" = not interested
// ---------------------------------------------------------------------------

const DECLINE = /^\s*(2|two|not interested|no thanks|skip( it| this one)?)[\s.!]*$/i

/**
 * If `text` declines today's texted pick, mark it and return the reply; null
 * otherwise. When the daily card is also waiting on a reply, the message that
 * went out LAST owns the reply (a "2" can be a bonus-question answer).
 */
export async function maybeHandleActivelyReadReply(userId: string, text: string): Promise<string | null> {
  if (!DECLINE.test(text)) return null
  const { data } = await f2Supabase().from('f2_users').select('actively_read, daily_card').eq('id', userId).maybeSingle()
  const state = (data?.actively_read as ActivelyReadState | null) ?? null
  if (!state?.imessage_sent_at || state.resolved) return null
  const sentAt = new Date(state.imessage_sent_at).getTime()
  if (Date.now() - sentAt > REPLY_WINDOW_MS) return null
  const daily = data?.daily_card as { sent_at?: string; offered_at?: string } | null
  const dailyAt = daily ? new Date(daily.sent_at ?? daily.offered_at ?? 0).getTime() : 0
  if (dailyAt > sentAt) return null
  const t = await topicOf(userId, state.thread_id)
  if (!t) return null
  await declineActivelyRead(userId, state.thread_id)
  return `Got it, "${subjectOf(t)}" is off your Actively Read list. You can bring it back from the topic page in Dodo.`
}
