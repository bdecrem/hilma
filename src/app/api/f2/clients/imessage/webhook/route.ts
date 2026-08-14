import { NextResponse, after } from 'next/server'
import { authWebhook, isRecentOutbound, sendIMessage } from '@/lib/f2/bluebubbles'
import { processMessage } from '@/lib/f2/agent'
import { findUserByDailyChatGuid, findUserByImessageHandle } from '@/lib/f2/imessage'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'
// BlueBubbles fire-and-forget: if we don't ack fast it drops the message
// (no retries). We return 200 in ~50ms, then process via after().
export const maxDuration = 60

type BBWebhook = {
  type?: string
  data?: {
    guid?: string
    text?: string
    isFromMe?: boolean
    handle?: { address?: string; service?: string } | null
    chats?: Array<{ guid?: string }>
  }
}

// Insert the guid into the dedup table. Returns true if this is the
// first time we've seen it, false if it's a duplicate.
async function claimGuid(guid: string): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_processed_webhooks')
    .insert({ guid, client: 'imessage' })
  if (!error) return true
  if (error.code === '23505') return false
  console.error(`[f2/imessage] dedup insert errored for ${guid}:`, error)
  // Fail open — better to risk a dup than to drop the message.
  return true
}

export async function POST(req: Request) {
  const auth = authWebhook(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let payload: BBWebhook
  try {
    payload = (await req.json()) as BBWebhook
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (payload.type !== 'new-message') {
    return NextResponse.json({ ok: true, skipped: payload.type ?? 'unknown' })
  }
  const data = payload.data
  if (!data) {
    return NextResponse.json({ ok: true, skipped: 'empty' })
  }

  const text = (data.text ?? '').trim()
  const chatGuid = data.chats?.[0]?.guid
  const handle = data.handle?.address ?? ''
  const guid = data.guid ?? ''

  // From-me messages are usually our own sends echoing back (the mini
  // sends as the user's own Apple ID) or the user's unrelated personal
  // texts — both dropped. The exception: in the ONE chat that is a user's
  // daily-card channel, the user's replies ALSO register as from-me, so
  // that chat's from-me messages are accepted unless the text matches
  // something we ourselves sent recently.
  let userId: string | null = null
  let userLabel = handle
  if (data.isFromMe) {
    if (!text || !chatGuid || !guid) {
      return NextResponse.json({ ok: true, skipped: 'from-me' })
    }
    const owner = await findUserByDailyChatGuid(chatGuid)
    if (!owner) {
      return NextResponse.json({ ok: true, skipped: 'from-me' })
    }
    if (await isRecentOutbound(text)) {
      console.log(`[f2/imessage] echo ${guid}: our own send in ${chatGuid}`)
      return NextResponse.json({ ok: true, skipped: 'echo' })
    }
    userId = owner.id
    userLabel = chatGuid
    console.log(`[f2/imessage] self-chat reply ${guid} in ${chatGuid}: ${text.slice(0, 80)}`)
  }

  if (!text || !chatGuid || !guid || (!data.isFromMe && !handle)) {
    console.log(`[f2/imessage] skip ${guid || '?'}: missing fields (text=${!!text} chat=${!!chatGuid} handle=${!!handle} guid=${!!guid})`)
    return NextResponse.json({ ok: true, skipped: 'missing-fields' })
  }

  const fresh = await claimGuid(guid)
  if (!fresh) {
    console.log(`[f2/imessage] dup ${guid}: already processed`)
    return NextResponse.json({ ok: true, skipped: 'duplicate' })
  }

  console.log(`[f2/imessage] accepted ${guid} from ${userLabel}: ${text.slice(0, 80)}`)

  after(async () => {
    try {
      // Strict: the handle must be paired to a real F2 account (or the
      // chat resolved via daily_chat_guid — in the self-chat channel the
      // user's replies can arrive from an account alias, e.g. the me.com
      // address, that was never explicitly paired). No env-var fallback —
      // every account gets its own inbox.
      const paired =
        (userId ? { id: userId } : null) ??
        (await findUserByImessageHandle(handle)) ??
        (await findUserByDailyChatGuid(chatGuid))
      if (!paired) {
        console.log(`[f2/imessage] ${guid} dropped — unpaired handle ${handle}`)
        return
      }
      const result = await processMessage({
        userId: paired.id,
        handle: userLabel,
        text,
        client: 'imessage',
      })
      if (result.reply) {
        await sendIMessage({ chatGuid, text: result.reply })
        console.log(`[f2/imessage] replied ${guid}`)
      }
    } catch (e) {
      console.error(`[f2/imessage] processing failed for ${guid}`, e)
    }
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/clients/imessage/webhook' })
}
