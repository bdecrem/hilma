// One iMessage inbox, three apps.
//
// BlueBubbles on the Mac mini posts every new message to ONE webhook (the
// Dodo one; Polly's route is an alias of it). This module decides who the
// message is for and hands it over. The mini stays a dumb pipe — BlueBubbles
// in, the send agent out — because the tables that say who a handle belongs
// to live here, not there.
//
// Order:
//   1. Onething claims first (its own rules: a user with today's question
//      open, the "onething" join word, an "Onething:" prefix).
//   2. Who is this handle paired to? Dodo (f2_users.imessage_handles or the
//      daily-card chat), Polly (same, polly_* tables). Nobody → dropped.
//   3. One app → that app.
//   4. Both → an explicit prefix wins ("polly …" / "dodo …" — the same words
//      that address each app's own agent, so the message still reads right
//      once it lands); else the app that handled this handle's last message
//      within STICKY_MS keeps it; else a one-word Haiku call decides whether
//      the text is about learning a language; else Dodo.
//
// Every decision for a paired handle is written to imessage_routes.

import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from '@/lib/f2/supabase'
import { processMessage as dodoProcess } from '@/lib/f2/agent'
import {
  findUserByDailyChatGuid as dodoDailyChat,
  findUserByImessageHandle as dodoByHandle,
} from '@/lib/f2/imessage'
import { sendIMessage as dodoSend } from '@/lib/f2/bluebubbles'
import { processMessage as pollyProcess } from '@/lib/polly/agent'
import {
  findUserByDailyChatGuid as pollyDailyChat,
  findUserByImessageHandle as pollyByHandle,
} from '@/lib/polly/imessage'
import { sendIMessage as pollySend } from '@/lib/polly/bluebubbles'
import { handleInbound as onethingInbound } from '@/lib/onething/inbound'

export type Route = 'onething' | 'polly' | 'dodo' | 'drop'

/// How long a conversation stays with the app that last handled it.
const STICKY_MS = 6 * 60 * 60 * 1000
const CLASSIFIER_MODEL = process.env.IMESSAGE_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001'

export type Inbound = {
  guid: string
  handle: string
  chatGuid: string
  text: string
  /** From-me messages in a daily-card chat: the owner already resolved by
   *  the webhook (Dodo or Polly), so the handle lookup is skipped. */
  fromMeOwner?: { app: 'dodo' | 'polly'; id: string } | null
  /** What the reply is addressed to — the chat guid for from-me chats. */
  replyLabel: string
}

export type Decision = {
  route: Route
  reason: string
  dodoUser: { id: string } | null
  pollyUser: { id: string } | null
}

/// Pure-ish: who this message is for. Exported for the check script.
export async function decide(
  m: Pick<Inbound, 'handle' | 'chatGuid' | 'text' | 'fromMeOwner'>,
  opts: { classify?: (text: string) => Promise<'polly' | 'dodo'> } = {},
): Promise<Decision> {
  const [dodoUser, pollyUser] = m.fromMeOwner
    ? [
        m.fromMeOwner.app === 'dodo' ? { id: m.fromMeOwner.id } : null,
        m.fromMeOwner.app === 'polly' ? { id: m.fromMeOwner.id } : null,
      ]
    : await Promise.all([
        (async () => (await dodoByHandle(m.handle)) ?? (await dodoDailyChat(m.chatGuid)))(),
        (async () => (await pollyByHandle(m.handle)) ?? (await pollyDailyChat(m.chatGuid)))(),
      ])

  if (!dodoUser && !pollyUser) return { route: 'drop', reason: 'unpaired', dodoUser, pollyUser }
  if (dodoUser && !pollyUser) return { route: 'dodo', reason: 'only dodo', dodoUser, pollyUser }
  if (pollyUser && !dodoUser) return { route: 'polly', reason: 'only polly', dodoUser, pollyUser }

  // Paired to both.
  if (/^polly\b/i.test(m.text)) return { route: 'polly', reason: 'prefix', dodoUser, pollyUser }
  if (/^dodo\b/i.test(m.text)) return { route: 'dodo', reason: 'prefix', dodoUser, pollyUser }

  const last = await lastRoute(m.handle)
  if (last && (last.route === 'polly' || last.route === 'dodo') && Date.now() - last.at < STICKY_MS) {
    return { route: last.route, reason: `sticky (${last.route} ${Math.round((Date.now() - last.at) / 60000)} min ago)`, dodoUser, pollyUser }
  }

  try {
    const pick = await (opts.classify ?? classify)(m.text)
    return { route: pick, reason: 'classifier', dodoUser, pollyUser }
  } catch (e) {
    console.error('[imessage] classifier failed, defaulting to dodo:', e)
    return { route: 'dodo', reason: 'classifier failed', dodoUser, pollyUser }
  }
}

/// Route the message and run the app that owns it. Returns the route taken.
export async function dispatchInbound(m: Inbound): Promise<Route> {
  // Onething first — it claims only what is clearly its own.
  if (await onethingInbound({ handle: m.handle, chatGuid: m.chatGuid, text: m.text })) {
    await remember(m.handle, 'onething', 'claimed')
    console.log(`[imessage] ${m.guid} → onething`)
    return 'onething'
  }

  const d = await decide(m)
  if (d.route === 'drop') {
    console.log(`[imessage] ${m.guid} dropped — unpaired handle ${m.handle}`)
    return 'drop'
  }
  await remember(m.handle, d.route, d.reason)
  console.log(`[imessage] ${m.guid} → ${d.route} (${d.reason})`)

  if (d.route === 'polly') {
    const result = await pollyProcess({ userId: d.pollyUser!.id, handle: m.replyLabel, text: m.text, client: 'imessage' })
    if (result.reply) await pollySend({ chatGuid: m.chatGuid, text: result.reply })
  } else {
    const result = await dodoProcess({ userId: d.dodoUser!.id, handle: m.replyLabel, text: m.text, client: 'imessage' })
    if (result.reply) await dodoSend({ chatGuid: m.chatGuid, text: result.reply })
  }
  return d.route
}

async function lastRoute(handle: string): Promise<{ route: Route; at: number } | null> {
  const { data, error } = await f2Supabase()
    .from('imessage_routes')
    .select('route, routed_at')
    .eq('handle', handle)
    .maybeSingle()
  if (error) {
    console.error('[imessage] route lookup failed:', error)
    return null
  }
  if (!data) return null
  return { route: data.route as Route, at: new Date(data.routed_at as string).getTime() }
}

async function remember(handle: string, route: Route, reason: string): Promise<void> {
  if (route === 'drop' || !handle) return
  const { error } = await f2Supabase()
    .from('imessage_routes')
    .upsert({ handle, route, reason, routed_at: new Date().toISOString() }, { onConflict: 'handle' })
  if (error) console.error('[imessage] route save failed:', error)
}

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
    _anthropic = new Anthropic({ apiKey })
  }
  return _anthropic
}

/// The tie-break for a handle paired to both apps with no recent
/// conversation: is this text about learning a language (Polly) or about
/// anything else someone is studying (Dodo)? One word back.
export async function classify(text: string): Promise<'polly' | 'dodo'> {
  const res = await anthropic().messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 5,
    system: `Two learning apps share one iMessage inbox. POLLY teaches languages (Italian, French, Korean): vocabulary, grammar, translation, "how do you say", practising sentences or the words of a lesson or podcast episode, messages written in one of those languages. DODO is for learning anything else: articles, books, videos, facts, quizzes on a subject. Reply with exactly one word, POLLY or DODO.`,
    messages: [{ role: 'user', content: text.slice(0, 1000) }],
  })
  const out = res.content.find((b) => b.type === 'text')?.text.trim().toUpperCase() ?? ''
  return out.startsWith('POLLY') ? 'polly' : 'dodo'
}
