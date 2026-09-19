import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { masterConversation } from '@/lib/polly/infinity'

export const runtime = 'nodejs'

// POST /api/polly/infinity/chats/[id]/master — the learner passed this
// conversation's quiz; mark it mastered.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  const chat = await masterConversation(user.id, id)
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ chat })
}
