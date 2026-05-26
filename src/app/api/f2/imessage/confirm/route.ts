import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { confirmImessagePairing } from '@/lib/f2/imessage'

export const runtime = 'nodejs'

// POST /api/f2/imessage/confirm
// Body: { handle, code }. Verifies the 6-digit code and, on success, adds
// the handle to the user's imessage_handles.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { handle?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.handle || !body.code) {
    return NextResponse.json({ error: 'handle and code required' }, { status: 400 })
  }

  const result = await confirmImessagePairing(user.id, body.handle, body.code)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, handle: result.handle })
}
