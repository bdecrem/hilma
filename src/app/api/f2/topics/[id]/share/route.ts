import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { shareThread, unshareThread } from '@/lib/f2/community'

export const runtime = 'nodejs'

// POST /api/f2/topics/[id]/share — list this topic in the community
// directory. DELETE — remove the listing. Both owner-only; the listing
// points at the live thread (forks copy at fork time).
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const ok = await shareThread(user.id, id)
  if (!ok) {
    return NextResponse.json({ error: 'share failed' }, { status: 500 })
  }
  return NextResponse.json({ shared: true })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params
  const ok = await unshareThread(user.id, id)
  if (!ok) {
    return NextResponse.json({ error: 'unshare failed' }, { status: 500 })
  }
  return NextResponse.json({ shared: false })
}
