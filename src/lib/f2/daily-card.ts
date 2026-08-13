// The daily flash card over iMessage. A cron (api/f2/daily-card) sends one
// scheduler-picked question to every user with a phone number on their
// profile; the reply comes back through the BlueBubbles webhook and is
// graded as a freeform answer — corrections + a little XP.

import { f2Supabase } from './supabase'
import { sendIMessage } from './bluebubbles'
import {
  cardWeight,
  getFlashCardsByIds,
  judgeDailyCard,
  markCardsShown,
  openFormQuestion,
  reviewSingleCard,
  type FlashCard,
} from './flash'

/// XP for the daily card: showing up pays, being right pays more.
export const DAILY_XP_CORRECT = 15
export const DAILY_XP_ATTEMPT = 5

/// A pending daily card goes stale after this long — answers after that
/// fall through to normal chat routing.
const PENDING_MAX_AGE_MS = 36 * 60 * 60 * 1000

export type PendingDailyCard = {
  card_id: string
  sent_at: string
}

/// Weighted pick of ONE card across every deck the user owns — same
/// weights the set scheduler uses, so due and priority cards surface first.
async function pickDailyCard(userId: string): Promise<FlashCard | null> {
  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .select('*')
    .eq('user_id', userId)
    .or('rating.is.null,rating.eq.priority')
  if (error || !data || data.length === 0) return null
  const cards = data as FlashCard[]
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

/// Send the daily card to every user with a phone on file. Returns a
/// per-user summary for the cron log.
export async function sendDailyCards(): Promise<
  { user: string; status: 'sent' | 'no-cards' | 'error'; detail?: string }[]
> {
  const { data: users, error } = await f2Supabase()
    .from('f2_users')
    .select('id, username, phone')
    .not('phone', 'is', null)
  if (error) {
    console.error('[f2/daily-card] user query failed:', error)
    return []
  }

  const out: { user: string; status: 'sent' | 'no-cards' | 'error'; detail?: string }[] = []
  for (const u of (users ?? []) as { id: string; username: string; phone: string }[]) {
    try {
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

      const text = `🃏 Dodo daily card${label ? ` — ${label}` : ''}:

${openFormQuestion(card)}

Reply with your answer (your own words are fine).`
      await sendIMessage({ addresses: [u.phone], text })
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

/// If this user has a live pending daily card, grade `text` as its answer:
/// SM-2 review + XP + a correction reply. Returns the reply, or null when
/// there's no pending card (caller falls through to normal routing).
export async function maybeHandleDailyAnswer(
  userId: string,
  text: string,
): Promise<string | null> {
  const sb = f2Supabase()
  const { data: userRow } = await sb
    .from('f2_users')
    .select('daily_card')
    .eq('id', userId)
    .maybeSingle()
  const pending = userRow?.daily_card as PendingDailyCard | null
  if (!pending?.card_id || !pending.sent_at) return null
  if (Date.now() - new Date(pending.sent_at).getTime() > PENDING_MAX_AGE_MS) {
    await sb.from('f2_users').update({ daily_card: null }).eq('id', userId)
    return null
  }

  const [card] = await getFlashCardsByIds(userId, [pending.card_id])
  if (!card) {
    await sb.from('f2_users').update({ daily_card: null }).eq('id', userId)
    return null
  }

  const { correct, feedback } = await judgeDailyCard(card, text)
  await reviewSingleCard(userId, card, correct)
  await sb.from('f2_users').update({ daily_card: null }).eq('id', userId)

  const xp = correct ? DAILY_XP_CORRECT : DAILY_XP_ATTEMPT
  let total: number | null = null
  const { data: xpTotal, error: xpErr } = await sb.rpc('f2_add_xp', {
    p_user_id: userId,
    p_amount: xp,
  })
  if (!xpErr && typeof xpTotal === 'number') total = xpTotal

  const head = correct ? '✅ Right.' : `❌ Not quite — the answer: ${card.answer}.`
  const tail = `+${xp} XP${total != null ? ` (${total} total)` : ''}. See you tomorrow!`
  return `${head} ${feedback} ${tail}`.replace(/\s+/g, ' ').trim()
}
