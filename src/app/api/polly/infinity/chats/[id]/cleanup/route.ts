import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { cleanUpChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
// The curation is one LLM pass over the transcript; give it room.
export const maxDuration = 120

// POST /api/polly/infinity/chats/[id]/cleanup — curate the ≤5 fixes + vocab +
// grammar (idempotent: returns the existing analysis if already run). Runs at
// the learner's content quality (src/lib/polly/quality.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  const chat = await cleanUpChat(user.id, id)
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ chat })
}
