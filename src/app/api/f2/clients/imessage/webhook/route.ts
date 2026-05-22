import { NextResponse } from 'next/server'
import { authWebhook, sendIMessage } from '@/lib/f2/bluebubbles'
import { processMessage } from '@/lib/f2/agent'

export const runtime = 'nodejs'

// BlueBubbles webhook receiver.
// Configure in BlueBubbles UI → Settings → Webhooks:
//   URL: https://hilma-nine.vercel.app/api/f2/clients/imessage/webhook?secret=<BLUEBUBBLES_WEBHOOK_SECRET>
//   Events: new-message (others currently ignored)
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
  if (!text || !chatGuid || !handle) {
    return NextResponse.json({ ok: true, skipped: 'missing-fields' })
  }

  const result = await processMessage({ handle, text, client: 'imessage' })

  if (result.reply) {
    try {
      await sendIMessage({ chatGuid, text: result.reply })
    } catch (e) {
      console.error('[f2/imessage] send failed', e)
      return NextResponse.json({ ok: false, error: 'send-failed' }, { status: 502 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/clients/imessage/webhook' })
}
