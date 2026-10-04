// One iMessage inbox, two apps here (three, counting Polly's own backend).
//
// BlueBubbles on the Mac mini posts every new message to this webhook and,
// since 2026-09-30, to Polly's backend as well (../polly — its own repo,
// Vercel project and database). Each backend keeps what is its own; the mini
// stays a dumb pipe — BlueBubbles in, the send agent out — because the tables
// that say who a handle belongs to live on the servers. Here:
//   1. Onething claims first (its own rules: a user with today's question
//      open, the "onething" join word, an "Onething:" prefix).
//   2. A text starting "polly" is Polly's: dropped here, Polly's webhook
//      answers it. A handle paired to both apps is listed in Polly's
//      POLLY_PREFIX_ONLY_HANDLES, so Polly takes only the prefixed texts from
//      it and Dodo takes the rest; a handle paired to Polly alone is unknown
//      here and dropped as unpaired.
//   3. A handle paired to Dodo (f2_users.imessage_handles or the daily-card
//      chat) → Dodo. Nobody → dropped.
// Polly's own texts echo back as from-me and start with POLLY_MARK; the
// webhook drops those before this module sees them.
//
// Every decision for a paired handle is written to imessage_routes.

import { processMessage as dodoProcess } from '@/lib/f2/agent'
import {
  findUserByDailyChatGuid as dodoDailyChat,
  findUserByImessageHandle as dodoByHandle,
} from '@/lib/f2/imessage'
import { sendIMessage as dodoSend, type BBAttachment } from '@/lib/f2/bluebubbles'
import { handleInbound as onethingInbound } from '@/lib/onething/inbound'
import { rememberRoute as remember, type Route } from './routes'

export type { Route }

/// What every text Polly sends starts with (its bluebubbles.ts).
export const POLLY_MARK = '🦜'
const POLLY_PREFIX = /^polly\b/i

export type Inbound = {
  guid: string
  handle: string
  chatGuid: string
  text: string
  /** Image attachments ride along for Onething (a picture stuck to a day);
   *  Dodo's iMessage side is text-only. */
  attachments?: BBAttachment[]
  /** From-me messages in a daily-card chat: the owner already resolved by
   *  the webhook, so the handle lookup is skipped. */
  fromMeOwner?: { app: 'dodo'; id: string } | null
  /** What the reply is addressed to — the chat guid for from-me chats. */
  replyLabel: string
}

export type Decision = {
  route: Route
  reason: string
  dodoUser: { id: string } | null
}

/// Pure-ish: who this message is for.
export async function decide(
  m: Pick<Inbound, 'handle' | 'chatGuid' | 'text' | 'fromMeOwner'>,
): Promise<Decision> {
  if (POLLY_PREFIX.test(m.text)) {
    return { route: 'drop', reason: 'polly prefix — Polly\'s own webhook answers it', dodoUser: null }
  }
  const dodoUser = m.fromMeOwner
    ? { id: m.fromMeOwner.id }
    : ((await dodoByHandle(m.handle)) ?? (await dodoDailyChat(m.chatGuid)))
  if (!dodoUser) return { route: 'drop', reason: 'unpaired', dodoUser: null }
  return { route: 'dodo', reason: 'paired', dodoUser }
}

/// Route the message and run the app that owns it. Returns the route taken.
export async function dispatchInbound(m: Inbound): Promise<Route> {
  // Onething first — it claims only what is clearly its own.
  if (await onethingInbound({ handle: m.handle, chatGuid: m.chatGuid, text: m.text, attachments: m.attachments })) {
    await remember(m.handle, 'onething', 'claimed')
    console.log(`[imessage] ${m.guid} → onething`)
    return 'onething'
  }

  if (!m.text) {
    console.log(`[imessage] ${m.guid} dropped — a picture with no words, and not Onething's (${m.handle})`)
    return 'drop'
  }
  const d = await decide(m)
  if (d.route === 'drop') {
    console.log(`[imessage] ${m.guid} dropped — ${d.reason} (${m.handle})`)
    return 'drop'
  }
  await remember(m.handle, d.route, d.reason)
  console.log(`[imessage] ${m.guid} → ${d.route} (${d.reason})`)

  const result = await dodoProcess({ userId: d.dodoUser!.id, handle: m.replyLabel, text: m.text, client: 'imessage' })
  if (result.reply) await dodoSend({ chatGuid: m.chatGuid, text: result.reply })
  return d.route
}
