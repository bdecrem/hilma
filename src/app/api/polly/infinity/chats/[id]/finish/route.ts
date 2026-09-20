import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { chatForClient, finishChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/polly/infinity/chats/[id]/finish — the text chat's "Finish & clean
// up" (and its ✕): close the open chat and title it. A chat the learner never
// said anything in is dropped: { chat: null }.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  const chat = await finishChat(user.id, id)
  return NextResponse.json({ chat: chat ? chatForClient(chat) : null })
}
