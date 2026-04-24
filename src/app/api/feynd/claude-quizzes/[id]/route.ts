import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth } from '@/lib/feynd/supabase'
import { readAllQuizzes, mcqOnly } from '@/lib/feynd/claude-quizzes'

export const runtime = 'nodejs'

// GET /api/feynd/claude-quizzes/:id
// Returns a single quiz with only its MCQ questions. 404s if there are no
// MCQ questions (the iOS client has nothing to render otherwise).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const all = await readAllQuizzes()
  const match = all.find((q) => q.id === id)
  if (!match) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  const questions = mcqOnly(match.questions)
  if (questions.length === 0) {
    return NextResponse.json({ error: 'Quiz has no MCQ questions' }, { status: 404 })
  }

  return NextResponse.json({
    quiz: {
      id: match.id,
      title: match.title,
      topic: match.topic ?? null,
      source_created_at: match.source_created_at ?? null,
      summary: match.summary,
      questions,
    },
  })
}
