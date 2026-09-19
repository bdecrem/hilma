import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { buildInfinityQuiz } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'no-store' }

// POST /api/polly/infinity/chats/[id]/quiz — this conversation's quiz set, in
// the FlashStart shape the app hands to FlashSetView (mixed choice + fill-in).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  const set = await buildInfinityQuiz(user.id, id)
  if (!set) return NextResponse.json({ error: 'No quiz for this conversation yet.' }, { status: 409 })
  return NextResponse.json(set, { headers: NO_STORE })
}
