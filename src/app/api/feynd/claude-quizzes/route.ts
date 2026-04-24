import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth } from '@/lib/feynd/supabase'
import { readAllQuizzes } from '@/lib/feynd/claude-quizzes'

export const runtime = 'nodejs'

// GET /api/feynd/claude-quizzes
// Returns a list of claude-history-derived quizzes that have at least one
// multiple-choice question. The iOS client currently only renders MCQ.
export async function GET(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const all = await readAllQuizzes()
  const quizzes = all
    .map((q) => ({
      id: q.id,
      title: q.title,
      topic: q.topic ?? null,
      source_created_at: q.source_created_at ?? null,
      summary: q.summary,
      question_count: q.questions.filter((x) => x.type === 'mcq').length,
    }))
    .filter((q) => q.question_count > 0)

  return NextResponse.json({ quizzes })
}
