import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { applyReview, getCardById } from '@/lib/f3/cards'
import { gradeRecall } from '@/lib/f3/recall-grader'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f3/review/[id]/answer
// Two modes:
//   { answer: "..." }        → typed recall, graded by the model
//   { self_grade: 0|1|2 }    → user revealed the answer and rated themselves
// Either way the scheduler advances and the attempt is logged.
//
// If the LLM grader fails on a typed answer, we return 503 with the canonical
// answer so the client can fall back to self-grading — we never invent a grade.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await ctx.params
  const card = await getCardById(user.id, id)
  if (!card || card.suspended) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let body: { answer?: unknown; self_grade?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  let grade: 0 | 1 | 2
  let feedback: string | null = null
  let gradedBy: 'llm' | 'self'
  let userAnswer = ''

  if (typeof body.self_grade === 'number' && [0, 1, 2].includes(body.self_grade)) {
    grade = body.self_grade as 0 | 1 | 2
    gradedBy = 'self'
  } else if (typeof body.answer === 'string') {
    userAnswer = body.answer.trim()
    gradedBy = 'llm'
    try {
      const result = await gradeRecall({
        prompt: card.prompt,
        canonicalAnswer: card.answer,
        userAnswer,
      })
      grade = result.grade
      feedback = result.feedback
    } catch (e) {
      console.error('[f3] gradeRecall failed:', e)
      return NextResponse.json(
        { error: 'grader unavailable', answer: card.answer },
        { status: 503 },
      )
    }
  } else {
    return NextResponse.json(
      { error: 'expected { answer } or { self_grade }' },
      { status: 400 },
    )
  }

  const outcome = await applyReview({
    userId: user.id,
    card,
    grade,
    userAnswer,
    gradedBy,
    feedback,
  })
  if (!outcome) {
    return NextResponse.json({ error: 'review save failed' }, { status: 500 })
  }

  return NextResponse.json({
    grade,
    feedback,
    answer: card.answer,
    next_due_at: outcome.next_due_at,
    interval_days: outcome.interval_days,
  })
}
