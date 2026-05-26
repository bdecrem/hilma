import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { listImessageHandles, removeImessageHandle } from '@/lib/f2/imessage'

export const runtime = 'nodejs'

// GET /api/f2/imessage/handles → { handles: string[] }
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const handles = await listImessageHandles(user.id)
  return NextResponse.json({ handles })
}

// DELETE /api/f2/imessage/handles
// Body: { handle }. Removes the handle from the user's imessage_handles.
export async function DELETE(req: Request) {
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
  await removeImessageHandle(user.id, body.handle)
  return NextResponse.json({ ok: true })
}
