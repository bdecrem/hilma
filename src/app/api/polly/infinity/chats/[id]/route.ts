import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getInfinityChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/polly/infinity/chats/[id] — one conversation, with its analysis
// (fixes / vocab / grammar) if clean-up has been run.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  const { id } = await params
  const chat = await getInfinityChat(user.id, id)
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ chat }, { headers: NO_STORE })
}
