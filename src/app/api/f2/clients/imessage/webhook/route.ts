import { NextResponse, after } from 'next/server'
import { authWebhook, sendIMessage } from '@/lib/f2/bluebubbles'
import { processMessage } from '@/lib/f2/agent'
import { getImessageDefaultUserId } from '@/lib/f2/auth'
import { findUserByImessageHandle } from '@/lib/f2/imessage'
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
  if (!data || data.isFromMe) {
    return NextResponse.json({ ok: true, skipped: 'from-me-or-empty' })
  }

  const text = (data.text ?? '').trim()
  const chatGuid = data.chats?.[0]?.guid
  const handle = data.handle?.address ?? ''
  const guid = data.guid ?? ''
  if (!text || !chatGuid || !handle || !guid) {
    console.log(`[f2/imessage] skip ${guid || '?'}: missing fields (text=${!!text} chat=${!!chatGuid} handle=${!!handle} guid=${!!guid})`)
    return NextResponse.json({ ok: true, skipped: 'missing-fields' })
  }

  const fresh = await claimGuid(guid)
  if (!fresh) {
    console.log(`[f2/imessage] dup ${guid}: already processed`)
    return NextResponse.json({ ok: true, skipped: 'duplicate' })
  }

  console.log(`[f2/imessage] accepted ${guid} from ${handle}: ${text.slice(0, 80)}`)

  after(async () => {
    try {
      // Look up the paired user first; fall back to the env default only
      // if no one has claimed this handle yet. Once everyone has paired
      // their own handle, F2_DEFAULT_IMESSAGE_USER_ID can be removed.
      const paired = await findUserByImessageHandle(handle)
      let userId: string
      if (paired) {
        userId = paired.id
      } else {
        try {
          userId = getImessageDefaultUserId()
          console.log(`[f2/imessage] ${guid} unpaired handle, using default user`)
        } catch {
          console.log(`[f2/imessage] ${guid} skipping — unpaired handle, no default user set`)
          return
        }
      }
      const result = await processMessage({ userId, handle, text, client: 'imessage' })
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
