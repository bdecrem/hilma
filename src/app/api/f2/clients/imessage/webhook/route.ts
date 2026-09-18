import { NextResponse, after } from 'next/server'
import { authWebhook, isRecentOutbound } from '@/lib/f2/bluebubbles'
import { isRecentOutbound as isRecentPollyOutbound } from '@/lib/polly/bluebubbles'
import { findUserByDailyChatGuid } from '@/lib/f2/imessage'
import { findUserByDailyChatGuid as findPollyUserByDailyChatGuid } from '@/lib/polly/imessage'
import { f2Supabase } from '@/lib/f2/supabase'
import { isOnethingChat } from '@/lib/onething/inbound'
import { dispatchInbound } from '@/lib/imessage/dispatch'

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
  let userLabel = handle
  let owner: { app: 'dodo' | 'polly'; id: string } | null = null
  if (data.isFromMe) {
    if (!text || !chatGuid || !guid) {
      return NextResponse.json({ ok: true, skipped: 'from-me' })
    }
    const dodoOwner = await findUserByDailyChatGuid(chatGuid)
    const pollyOwner = dodoOwner ? null : await findPollyUserByDailyChatGuid(chatGuid)
    owner = dodoOwner ? { app: 'dodo', id: dodoOwner.id } : pollyOwner ? { app: 'polly', id: pollyOwner.id } : null
    // Onething users answer in a chat that can also register as from-me
    // (the mini sends as the user's own Apple ID); let those through too.
    if (!owner && !(await isOnethingChat(chatGuid))) {
      return NextResponse.json({ ok: true, skipped: 'from-me' })
    }
  }

  if (!text || !chatGuid || !guid || (!data.isFromMe && !handle)) {
    console.log(`[f2/imessage] skip ${guid || '?'}: missing fields (text=${!!text} chat=${!!chatGuid} handle=${!!handle} guid=${!!guid})`)
    return NextResponse.json({ ok: true, skipped: 'missing-fields' })
  }

  // Dedup BEFORE the echo check. BlueBubbles can deliver the same message
  // again hours later (2026-09-13: a sign-up note we sent at 06:58Z came back
  // at 12:32Z, after the echo window had lapsed, and was saved as a thought).
  // Claiming the guid first means a second delivery is a duplicate no matter
  // how old the echo ledger entry is.
  const fresh = await claimGuid(guid)
  if (!fresh) {
    console.log(`[f2/imessage] dup ${guid}: already processed`)
    return NextResponse.json({ ok: true, skipped: 'duplicate' })
  }

  if (data.isFromMe) {
    // Either app may have sent it — both ledgers count as an echo.
    if ((await isRecentOutbound(text)) || (await isRecentPollyOutbound(text))) {
      console.log(`[f2/imessage] echo ${guid}: our own send in ${chatGuid}`)
      return NextResponse.json({ ok: true, skipped: 'echo' })
    }
    userLabel = chatGuid
    console.log(`[f2/imessage] self-chat reply ${guid} in ${chatGuid}: ${text.slice(0, 80)}`)
  }

  console.log(`[f2/imessage] accepted ${guid} from ${userLabel}: ${text.slice(0, 80)}`)

  // Onething, Polly or Dodo — the dispatcher decides (src/lib/imessage/
  // dispatch.ts) and runs the app that owns the message.
  after(async () => {
    try {
      await dispatchInbound({ guid, handle, chatGuid, text, fromMeOwner: owner, replyLabel: userLabel })
    } catch (e) {
      console.error(`[f2/imessage] processing failed for ${guid}`, e)
    }
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/clients/imessage/webhook' })
}
