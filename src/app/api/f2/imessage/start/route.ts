import { NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { startImessagePairing, sendPairingMessage } from '@/lib/f2/imessage'

export const runtime = 'nodejs'
// Sending via BlueBubbles can take ~15s end-to-end (Tunn3l + AppleScript +
// Messages.app). We use after() to keep the user-facing response fast, but
// bump maxDuration so the background send has room to finish.
export const maxDuration = 60

// POST /api/f2/imessage/start
// Body: { handle }. Stores a pending pairing + returns 200 immediately so
// the client UI can advance to the code-entry step. The iMessage with the
// 6-digit code is sent via after() so the slow BlueBubbles AppleScript
// pipeline can't time out the user-facing request.
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

  // Kick off the iMessage send in the background; client doesn't wait.
  after(async () => {
    await sendPairingMessage(result.handle, result.code)
  })

  return NextResponse.json({
    ok: true,
    handle: result.handle,
    sent_at: new Date().toISOString(),
  })
}
