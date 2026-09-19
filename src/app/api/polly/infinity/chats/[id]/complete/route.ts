import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { completeCleanup, getInfinityChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'

// POST /api/polly/infinity/chats/[id]/complete { cleanup_session_id? } — the
// clean-up walk is finished.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  let body: { cleanup_session_id?: string } = {}
  try { body = await req.json() } catch { /* body optional */ }
  await completeCleanup(user.id, id, body.cleanup_session_id)
  const chat = await getInfinityChat(user.id, id)
  return NextResponse.json({ chat })
}
