import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { startImessagePairing, sendPairingMessage } from '@/lib/polly/imessage'

export const runtime = 'nodejs'
// Sending via BlueBubbles can take ~15s end-to-end (Tunn3l + AppleScript +
// Messages.app); the send agent is quick. The send is awaited so the app
// learns whether the text went out — hence the generous maxDuration.
export const maxDuration = 60

// POST /api/polly/imessage/start
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

  // Send now and say whether it went. The code is stored either way, so a
  // retry after the mini comes back reuses the same pending row. (Until
  // 2026-09-18 this ran in after(): a dead tunnel to the mini failed silently
  // and the user sat on the code screen waiting for a text that never came.)
  const sent = await sendPairingMessage(result.handle, result.code)
  if (!sent.ok) {
    return NextResponse.json(
      { error: `Couldn't send the code: ${sent.error}. Try again in a minute.`, handle: result.handle },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    handle: result.handle,
    sent_at: new Date().toISOString(),
  })
}
