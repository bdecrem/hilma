import { NextResponse, after } from 'next/server'
import { authWebhook, sendIMessage } from '@/lib/f2/bluebubbles'
import { processMessage } from '@/lib/f2/agent'

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
  const guid = data.guid ?? '?'
  if (!text || !chatGuid || !handle) {
    console.log(`[f2/imessage] skip ${guid}: missing fields (text=${!!text} chat=${!!chatGuid} handle=${!!handle})`)
    return NextResponse.json({ ok: true, skipped: 'missing-fields' })
  }

  console.log(`[f2/imessage] accepted ${guid} from ${handle}: ${text.slice(0, 80)}`)

  after(async () => {
    try {
      const result = await processMessage({ handle, text, client: 'imessage' })
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
