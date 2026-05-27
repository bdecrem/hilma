import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  abandonPendingQuiz,
  completeQuiz,
  getThreadById,
} from '@/lib/f2/threads'
import { gradeQuizTwo } from '@/lib/f2/quiz-grader'

export const runtime = 'nodejs'
// The Haiku grading call adds 1–3s on top of the persistence step.
export const maxDuration = 30

// POST /api/f2/topics/[id]/quiz/complete
//
// Per-kind logic:
//   - pending=hard          → award the 3rd star. No grading.
//   - pending=standard, 0★  → Quiz 1: just award. No grading (Quiz 1 is
//                             reflection-heavy and honor system by design).
//   - pending=standard, 1★  → Quiz 2: GRADE first. Only award if the user
//                             answered ≥3 of the 4 substantive questions
//                             acceptably. On failure, clear pending and
//                             return passed: false so the client shows the
//                             score and lets the user retry.
//   - pending=null          → no-op, returns current state.
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

  const completedKind = thread.pending_quiz_kind

  // Quiz 2 is the only path that gates the star on grading. Everything else
  // falls through to the existing award-or-noop completeQuiz() call.
  const isQuizTwo =
    thread.pending_quiz_kind === 'standard' && thread.stars === 1

  if (isQuizTwo) {
    const grade = await gradeQuizTwo(thread)
    if (!grade.passed) {
      await abandonPendingQuiz(thread.id, user.id)
      return NextResponse.json({
        stars: thread.stars,
        quiz_count: thread.quiz_count,
        hard_quiz_completed_at: thread.hard_quiz_completed_at,
        pending_quiz_kind: null,
        completed_kind: completedKind,
        passed: false,
        accepted: grade.accepted,
        total: grade.total,
        notes: grade.notes ?? null,
      })
    }
    // Passed — fall through to the normal award.
    const recorded = await completeQuiz(thread)
    return NextResponse.json({
      stars: recorded.stars,
      quiz_count: recorded.quiz_count,
      hard_quiz_completed_at: recorded.hard_quiz_completed_at,
      pending_quiz_kind: null,
      completed_kind: completedKind,
      passed: true,
      accepted: grade.accepted,
      total: grade.total,
      notes: grade.notes ?? null,
    })
  }

  const recorded = await completeQuiz(thread)
  return NextResponse.json({
    stars: recorded.stars,
    quiz_count: recorded.quiz_count,
    hard_quiz_completed_at: recorded.hard_quiz_completed_at,
    pending_quiz_kind: null,
    completed_kind: completedKind,
    // Quiz 1 and Hard always "pass" — no grading was applied.
    passed: true,
    accepted: null,
    total: null,
    notes: null,
  })
}
