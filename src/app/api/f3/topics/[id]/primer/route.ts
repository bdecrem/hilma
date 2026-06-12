import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { generatePrimer, savePrimer } from '@/lib/f3/primer'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f3/topics/[id]/primer
// Generate (or return the existing) "read for this" questions for a topic.
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

  const existing = (thread as unknown as { primer?: string[] | null }).primer
  if (existing && existing.length > 0) {
    return NextResponse.json({ primer: existing })
  }

  try {
    const questions = await generatePrimer(thread)
    if (questions.length > 0) await savePrimer(user.id, id, questions)
    return NextResponse.json({ primer: questions })
  } catch (e) {
    console.error('[f3] primer failed:', e)
    return NextResponse.json({ error: 'primer generation failed' }, { status: 502 })
  }
}
