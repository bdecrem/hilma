import { f2Supabase } from './supabase'
import type { F2Client } from './agent'

export type F2ThreadMessage = {
  role: 'user' | 'assistant'
  text: string
  created_at: string
}

export type F2Thread = {
  id: string
  user_id: string
  handle: string
  client: F2Client
  url: string | null
  topic: string | null
  content: string | null
  messages: F2ThreadMessage[]
  created_at: string
  updated_at: string
  last_quizzed_at: string | null
  quiz_count: number
  stars: number
  hard_quiz_completed_at: string | null
}

export type QuizKind = 'standard' | 'hard'

export type CreateThreadInput = {
  userId: string
  client: F2Client
  handle: string
  url?: string | null
  topic?: string | null
  content?: string | null
}

export async function createThread(
  input: CreateThreadInput,
): Promise<F2Thread | null> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .insert({
      user_id: input.userId,
      client: input.client,
      handle: input.handle,
      url: input.url ?? null,
      topic: input.topic ?? null,
      content: input.content ?? null,
      messages: [],
    })
    .select('*')
    .single()

  if (error) {
    console.error('[f2] createThread failed:', error)
    return null
  }
  return data as F2Thread
}

export async function getLatestThread(
  userId: string,
): Promise<F2Thread | null> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[f2] getLatestThread failed:', error)
    return null
  }
  return (data as F2Thread | null) ?? null
}

export async function getThreadById(
  userId: string,
  threadId: string,
): Promise<F2Thread | null> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[f2] getThreadById failed:', error)
    return null
  }
  return (data as F2Thread | null) ?? null
}

export async function listTopicsForUser(userId: string): Promise<F2Thread[]> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('*')
    .eq('user_id', userId)
    .or('topic.not.is.null,url.not.is.null')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[f2] listTopicsForUser failed:', error)
    return []
  }
  return (data as F2Thread[]) ?? []
}

// Compute the new star value after a quiz. Monotonic — never decreases.
//   - 'hard' quiz → 3
//   - 'standard' quiz → bumps 0→1, 1→2 (caps at 2; only a hard quiz reaches 3)
export function nextStars(current: number, kind: QuizKind): number {
  if (kind === 'hard') return Math.max(current, 3)
  if (current >= 2) return current
  return current + 1
}

export type RecordedQuiz = {
  stars: number
  quiz_count: number
  hard_quiz_completed_at: string | null
}

export async function recordQuiz(
  thread: F2Thread,
  kind: QuizKind = 'standard',
): Promise<RecordedQuiz> {
  const now = new Date().toISOString()
  const newStars = nextStars(thread.stars, kind)
  const newCount = kind === 'standard' ? thread.quiz_count + 1 : thread.quiz_count
  const newHardAt = kind === 'hard' ? now : thread.hard_quiz_completed_at

  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({
      last_quizzed_at: now,
      quiz_count: newCount,
      stars: newStars,
      hard_quiz_completed_at: newHardAt,
    })
    .eq('id', thread.id)
  if (error) console.error('[f2] recordQuiz failed:', error)

  return {
    stars: newStars,
    quiz_count: newCount,
    hard_quiz_completed_at: newHardAt,
  }
}

export async function appendMessages(
  threadId: string,
  existing: F2ThreadMessage[],
  toAdd: F2ThreadMessage[],
): Promise<void> {
  const messages = [...existing, ...toAdd]
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('id', threadId)

  if (error) console.error('[f2] appendMessages failed:', error)
}
