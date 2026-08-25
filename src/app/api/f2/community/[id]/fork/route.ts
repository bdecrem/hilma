import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { forkCommunityTopic } from '@/lib/f2/community'

export const runtime = 'nodejs'

// POST /api/f2/community/[id]/fork — copy a community topic into the
// caller's account: sources, uploaded notes, and the flash deck come along
// (fresh scheduling); chat history, stars, and study focus do not.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params
  const threadId = await forkCommunityTopic(user.id, user.username, id)
  if (!threadId) {
    return NextResponse.json({ error: 'fork failed' }, { status: 500 })
  }
  return NextResponse.json({ thread: { id: threadId } })
}
