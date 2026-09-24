//   POST /api/f2/imessage/notify { handle, text }   header x-imsg-secret
//
// A one-line iMessage to a handle, through the normal sender (ledger first,
// so the from-me echo is recognised and never dispatched as that person's
// own message). For hilma's own apps whose code can't import f2 — Token
// Surfers' report notes point SURF_REPORT_TEXT_URL here. Gated by the same
// secret the mini's send agent uses (F2_IMESSAGE_SEND_SECRET).

import { NextRequest, NextResponse } from 'next/server'
import { sendIMessage } from '@/lib/f2/bluebubbles'

export const runtime = 'nodejs'

const err = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const secret = process.env.F2_IMESSAGE_SEND_SECRET
  if (!secret) return err('F2_IMESSAGE_SEND_SECRET is not configured', 500)
  if (req.headers.get('x-imsg-secret') !== secret) return err('forbidden', 403)
  let body: { handle?: unknown; text?: unknown }
  try {
    body = await req.json()
  } catch {
    return err('invalid JSON', 400)
  }
  const handle = typeof body.handle === 'string' ? body.handle.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : ''
  if (!handle || !text) return err('handle and text required', 400)
  try {
    await sendIMessage({ addresses: [handle], text })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[f2/imessage/notify]', (e as Error).message)
    return err('send failed', 502)
  }
}
