import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { startImessagePairing } from '@/lib/f2/imessage'

export const runtime = 'nodejs'

// POST /api/f2/imessage/start
// Body: { handle }. Begins pairing — generates a 6-digit code, stores it,
// sends an iMessage with the code via BlueBubbles. User then enters the
// code via /imessage/confirm.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { handle?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.handle) {
    return NextResponse.json({ error: 'handle required' }, { status: 400 })
  }

  const result = await startImessagePairing(user.id, body.handle)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, handle: result.handle, sent_at: result.sentAt })
}
