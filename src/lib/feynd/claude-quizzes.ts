import fs from 'node:fs/promises'
import path from 'node:path'

// Shared reader for the quiz data produced by scripts/quiz-me/. The
// generator writes public/quiz-data/quizzes.json; the Feynd API routes
// below surface it to the iOS client, auth-gated and filtered to MCQ.

type RawMCQ = {
  type: 'mcq'
  q: string
  options: string[]
  answer_index: number
  explanation?: string
}
type RawShort = {
  type: 'short'
  q: string
  accepted_answer: string
  key_terms: string[]
  explanation?: string
}
export type RawQuestion = RawMCQ | RawShort
export type RawQuiz = {
  id: string
  title: string
  topic?: string
  source_created_at?: string
  summary: string
  questions: RawQuestion[]
}

export async function readAllQuizzes(): Promise<RawQuiz[]> {
  const p = path.join(process.cwd(), 'public', 'quiz-data', 'quizzes.json')
  try {
    const raw = await fs.readFile(p, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RawQuiz[]) : []
  } catch {
    return []
  }
}

export type MCQOut = {
  q: string
  options: string[]
  answer_index: number
  explanation: string | null
}

export function mcqOnly(questions: RawQuestion[]): MCQOut[] {
  return questions
    .filter((x): x is RawMCQ => x.type === 'mcq')
    .map((x) => ({
      q: x.q,
      options: x.options,
      answer_index: x.answer_index,
      explanation: x.explanation ?? null,
    }))
}
