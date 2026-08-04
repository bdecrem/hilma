import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { authorFlashCard } from '@/lib/f2/flash'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/f2/topics/[id]/flash/card — the user drafts a question; the LLM
// polishes it, answers it from the topic material, and writes the wrong
// choices. Returns the finished card.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { question?: string; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }
  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  try {
    const card = await authorFlashCard(thread, question, body.model)
    return NextResponse.json({ card })
  } catch (e) {
    console.error('[f2/flash] author card failed:', e)
    const message = e instanceof Error ? e.message : 'card authoring failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
