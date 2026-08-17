// The daily flash card over iMessage. A cron (api/f2/daily-card) sends one
// scheduler-picked question to every user with a phone number on their
// profile; the reply comes back through the BlueBubbles webhook and is
// graded as a freeform answer — corrections + a little XP.

import { f2Supabase } from './supabase'
import { sendIMessage } from './bluebubbles'
import {
  cardWeight,
  choicesForCard,
  peckExcludedThreadIds,
  getFlashCardsByIds,
  getPeckCredits,
  judgeDailyCard,
  markCardsShown,
  openFormQuestion,
  reviewSingleCard,
  setPeckCredits,
  type FlashCard,
  type PeckCredit,
} from './flash'

/// XP for the daily card: showing up pays, being right pays more. The
/// bonus multiple-choice question pays the same way.
export const DAILY_XP_CORRECT = 15
export const DAILY_XP_ATTEMPT = 5

/// Where the post-bonus reply sends the user to keep playing. Universal
/// link — opens the Peck tab in Dodo, falls back to the web app.
const PECK_URL = 'https://feynd.cc/peck'

/// A pending daily card goes stale after this long — answers after that
/// fall through to normal chat routing. The bonus offer and bonus question
/// expire on the same clock.
const PENDING_MAX_AGE_MS = 36 * 60 * 60 * 1000

/// daily_card is a tiny state machine, one state resident at a time:
///   { card_id, sent_at }                       — daily question out, awaiting the freeform answer
///   { stage: 'bonus_offer', offered_at }       — daily graded, "press 1" open
///   { stage: 'bonus_question', card_id, sent_at, choices } — MC question out
export type PendingDailyCard = {
  card_id: string
  sent_at: string
}

type BonusOffer = {
  stage: 'bonus_offer'
  offered_at: string
}

type BonusQuestion = {
  stage: 'bonus_question'
  card_id: string
  sent_at: string
  /// The shuffled choices exactly as texted, so the reply letter maps back
  /// deterministically.
  choices: string[]
}

type DailyState = PendingDailyCard | BonusOffer | BonusQuestion

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/// Weighted pick of ONE card across the decks the user has active in Peck —
/// same pool and weights as the set scheduler, so opted-out decks stay
/// quiet and due/priority cards surface first.
async function pickDailyCard(
  userId: string,
  excludeIds: string[] = [],
): Promise<FlashCard | null> {
  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .select('*')
    .eq('user_id', userId)
    .or('rating.is.null,rating.eq.priority')
  if (error || !data) return null
  const exclude = new Set(excludeIds)
  const excludedThreads = await peckExcludedThreadIds(userId)
  const cards = (data as FlashCard[]).filter(
    (c) => !exclude.has(c.id) && !excludedThreads.has(c.thread_id),
  )
  if (cards.length === 0) return null
  const now = Date.now()
  const weights = cards.map((c) => cardWeight(c, now))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < cards.length; i++) {
    r -= weights[i]
    if (r <= 0) return cards[i]
  }
  return cards[cards.length - 1]
}

/// Topic label for the card, so the question says which deck it's from.
async function topicLabelFor(card: FlashCard): Promise<string | null> {
  const { data } = await f2Supabase()
    .from('f2_threads')
    .select('topic, url')
    .eq('id', card.thread_id)
    .maybeSingle()
  return (data?.topic as string) ?? (data?.url as string) ?? null
}

/// The iMessage address the daily card goes to: the user's paired handle,
/// preferring a phone-shaped one when several are paired.
function dailyHandle(handles: string[] | null): string | null {
  if (!handles || handles.length === 0) return null
  return handles.find((h) => h.startsWith('+')) ?? handles[0]
}

/// Badge-watch P.S. for the daily card: certified topics whose gold dims
/// within 3 days (or already dimmed). Empty string when nothing is due.
export async function recertPostscript(userId: string): Promise<string> {
  // Refresher toggle off = no badge-watch nudges anywhere, this included.
  const { data: prefs } = await f2Supabase()
    .from('f2_users')
    .select('recert_enabled')
    .eq('id', userId)
    .maybeSingle()
  if (prefs?.recert_enabled === false) return ''
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const { data: due } = await f2Supabase()
    .from('f2_threads')
    .select('topic, url, recert_due_at')
    .eq('user_id', userId)
    .gte('stars', 3)
    .not('recert_due_at', 'is', null)
    .lte('recert_due_at', soon)
    .order('recert_due_at')
    .limit(2)
  if (!due || due.length === 0) return ''
  const lines = due.map((t) => {
    const name = t.topic ?? t.url ?? 'a topic'
    const days = Math.ceil(
      (new Date(t.recert_due_at as string).getTime() - Date.now()) / 86_400_000,
    )
    return days <= 0
      ? `your "${name}" badge has dimmed`
      : `your "${name}" badge dims in ${days} day${days === 1 ? '' : 's'}`
  })
  return `\n\nP.S. ${lines.join(', and ')} — a 5-minute refresher in Dodo keeps it gold.`
}

/// Send the daily card to every user who switched it on (delivery goes to
/// their paired iMessage handle). Returns a per-user summary for the cron
/// log.
export async function sendDailyCards(): Promise<
  { user: string; status: 'sent' | 'no-cards' | 'no-handle' | 'error'; detail?: string }[]
> {
  const { data: users, error } = await f2Supabase()
    .from('f2_users')
    .select('id, username, imessage_handles, daily_chat_guid')
    .eq('daily_card_enabled', true)
  if (error) {
    console.error('[f2/daily-card] user query failed:', error)
    return []
  }

  const out: { user: string; status: 'sent' | 'no-cards' | 'no-handle' | 'error'; detail?: string }[] = []
  for (const u of (users ?? []) as {
    id: string
    username: string
    imessage_handles: string[] | null
    daily_chat_guid: string | null
  }[]) {
    try {
      const handle = dailyHandle(u.imessage_handles)
      if (!u.daily_chat_guid && !handle) {
        out.push({ user: u.username, status: 'no-handle' })
        continue
      }
      const card = await pickDailyCard(u.id)
      if (!card) {
        out.push({ user: u.username, status: 'no-cards' })
        continue
      }
      const label = await topicLabelFor(card)
      const pending: PendingDailyCard = {
        card_id: card.id,
        sent_at: new Date().toISOString(),
      }
      await f2Supabase()
        .from('f2_users')
        .update({ daily_card: pending })
        .eq('id', u.id)

      const recertPs = await recertPostscript(u.id)

      const text = `🃏 Dodo daily card${label ? ` — ${label}` : ''}:

${openFormQuestion(card)}

Reply with your answer (your own words are fine).${recertPs}`
      // daily_chat_guid overrides handle addressing — required when the
      // recipient's handle is an alias of the mini's own Apple ID (a
      // phone-addressed send would make an ungradeable self-chat).
      if (u.daily_chat_guid) {
        await sendIMessage({ chatGuid: u.daily_chat_guid, text })
      } else {
        await sendIMessage({ addresses: [handle!], text })
      }
      await markCardsShown(u.id, [card.id])
      out.push({ user: u.username, status: 'sent' })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.error(`[f2/daily-card] send failed for ${u.username}:`, detail)
      out.push({ user: u.username, status: 'error', detail })
    }
  }
  return out
}

function stale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > PENDING_MAX_AGE_MS
}

async function setDailyState(userId: string, state: DailyState | null): Promise<void> {
  await f2Supabase().from('f2_users').update({ daily_card: state }).eq('id', userId)
}

/// Atomic XP bump; returns the new total when the RPC cooperates.
async function addXp(userId: string, amount: number): Promise<number | null> {
  const { data, error } = await f2Supabase().rpc('f2_add_xp', {
    p_user_id: userId,
    p_amount: amount,
  })
  return !error && typeof data === 'number' ? data : null
}

function xpTail(xp: number, total: number | null): string {
  return `+${xp} XP${total != null ? ` (${total} total)` : ''}.`
}

/// If this user is mid daily-card flow, consume `text` as its next move:
/// grade the freeform answer (SM-2 review + XP + correction + bonus offer),
/// accept "1" as taking the bonus, or grade the bonus letter. Returns the
/// reply, or null when nothing is pending (caller falls through to normal
/// routing).
export async function maybeHandleDailyAnswer(
  userId: string,
  text: string,
): Promise<string | null> {
  const { data: userRow } = await f2Supabase()
    .from('f2_users')
    .select('daily_card')
    .eq('id', userId)
    .maybeSingle()
  const state = userRow?.daily_card as DailyState | null
  if (!state) return null

  if ('stage' in state && state.stage === 'bonus_offer') {
    if (stale(state.offered_at)) {
      await setDailyState(userId, null)
      return null
    }
    // Only a bare "1" (allowing "1." / "1!") takes the offer — anything
    // else is normal chat and leaves the offer standing.
    if (text.replace(/[^0-9a-z]/gi, '') !== '1') return null
    return sendBonusQuestion(userId)
  }

  if ('stage' in state && state.stage === 'bonus_question') {
    if (!state.card_id || stale(state.sent_at)) {
      await setDailyState(userId, null)
      return null
    }
    return gradeBonusAnswer(userId, state, text)
  }

  // Daily question awaiting its freeform answer.
  const pending = state as PendingDailyCard
  if (!pending.card_id || !pending.sent_at) return null
  if (stale(pending.sent_at)) {
    await setDailyState(userId, null)
    return null
  }

  const [card] = await getFlashCardsByIds(userId, [pending.card_id])
  if (!card) {
    await setDailyState(userId, null)
    return null
  }

  const { correct, feedback } = await judgeDailyCard(card, text)
  await reviewSingleCard(userId, card, correct)
  await setDailyState(userId, {
    stage: 'bonus_offer',
    offered_at: new Date().toISOString(),
  })

  // Bank the answer as a Peck step — replaces yesterday's unconsumed
  // credits, so at most one daily (+ one bonus) rides into the next set.
  const credit: PeckCredit = {
    card_id: card.id,
    question: openFormQuestion(card),
    given: text.trim() || null,
    correct,
    mode: 'text',
    source: 'daily',
    date: new Date().toISOString(),
  }
  await setPeckCredits(userId, [credit])

  const xp = correct ? DAILY_XP_CORRECT : DAILY_XP_ATTEMPT
  const total = await addXp(userId, xp)

  const head = correct ? '✅ Right.' : `❌ Not quite — the answer: ${card.answer}.`
  const tail = `${xpTail(xp, total)} Press 1 for today's bonus question.`
  return `${head} ${feedback} ${tail}`.replace(/\s+/g, ' ').trim()
}

/// "1" received while the bonus offer stands: pick a second card and text
/// it as a lettered multiple-choice question.
async function sendBonusQuestion(userId: string): Promise<string | null> {
  const credits = await getPeckCredits(userId)
  const card = await pickDailyCard(userId, credits.map((c) => c.card_id))
  if (!card) {
    await setDailyState(userId, null)
    return `No more cards to quiz today — keep playing in Dodo: ${PECK_URL}`
  }
  const choices = choicesForCard(card).slice(0, LETTERS.length)
  await setDailyState(userId, {
    stage: 'bonus_question',
    card_id: card.id,
    sent_at: new Date().toISOString(),
    choices,
  })
  await markCardsShown(userId, [card.id])
  const listing = choices.map((c, i) => `${LETTERS[i]}. ${c}`).join('\n')
  return `🎁 Bonus question:\n\n${card.question}\n\n${listing}\n\nReply with a letter.`
}

/// Grade the bonus reply: a letter, or the full text of a choice. Anything
/// unrecognizable counts as an attempt (wrong) — the correction still
/// teaches, and the flow always ends here.
async function gradeBonusAnswer(
  userId: string,
  state: BonusQuestion,
  text: string,
): Promise<string | null> {
  const [card] = await getFlashCardsByIds(userId, [state.card_id])
  if (!card) {
    await setDailyState(userId, null)
    return null
  }

  const cleaned = text.trim()

  // A repeat "1" is impatience (the offer said "press 1"), not an answer —
  // re-send the question instead of burning it as a wrong guess.
  if (cleaned.replace(/[^0-9a-z]/gi, '') === '1') {
    const listing = state.choices.map((c, i) => `${LETTERS[i]}. ${c}`).join('\n')
    return `🎁 Bonus question:\n\n${card.question}\n\n${listing}\n\nReply with a letter.`
  }

  const letterIdx = LETTERS.indexOf(cleaned.replace(/[^a-z]/gi, '').toUpperCase())
  let chosen: string | null = null
  if (letterIdx >= 0 && letterIdx < state.choices.length) {
    chosen = state.choices[letterIdx]
  } else {
    chosen =
      state.choices.find((c) => c.trim().toLowerCase() === cleaned.toLowerCase()) ?? null
  }

  const correct = chosen != null && chosen === card.answer
  await reviewSingleCard(userId, card, correct)
  await setDailyState(userId, null)

  // Second Peck step of the day — the one multiple-choice entry in an
  // otherwise text-entry set.
  const credits = (await getPeckCredits(userId)).filter(
    (c) => c.card_id !== card.id && c.source !== 'bonus',
  )
  credits.push({
    card_id: card.id,
    question: card.question,
    given: chosen ?? (cleaned || null),
    correct,
    mode: 'choice',
    source: 'bonus',
    date: new Date().toISOString(),
  })
  await setPeckCredits(userId, credits)

  const xp = correct ? DAILY_XP_CORRECT : DAILY_XP_ATTEMPT
  const total = await addXp(userId, xp)

  const head = correct ? '✅ Right.' : `❌ Not quite — the answer: ${card.answer}.`
  const tail = `${xpTail(xp, total)} Both answers count on your Peck map — keep going in Dodo: ${PECK_URL}`
  return `${head} ${tail}`.replace(/\s+/g, ' ').trim()
}
