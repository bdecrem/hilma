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
  pending_quiz_kind: QuizKind | null
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

/// User just *started* a quiz. We track which kind is in flight so that when
/// they hit Done we know which star bump to apply. No star is awarded yet.
export async function recordQuizStarted(
  thread: F2Thread,
  kind: QuizKind = 'standard',
): Promise<RecordedQuiz> {
  const now = new Date().toISOString()
  const newCount = thread.quiz_count + 1
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({
      last_quizzed_at: now,
      quiz_count: newCount,
      pending_quiz_kind: kind,
    })
    .eq('id', thread.id)
  if (error) console.error('[f2] recordQuizStarted failed:', error)
  return {
    stars: thread.stars,
    quiz_count: newCount,
    hard_quiz_completed_at: thread.hard_quiz_completed_at,
  }
}

/// User signaled "Done" on the quiz they had open. Award the star (if any) for
/// whichever kind was pending, then clear the pending state. If nothing was
/// pending this is a no-op so we don't grant stars from a stale Done button.
export async function completeQuiz(thread: F2Thread): Promise<RecordedQuiz> {
  const kind = thread.pending_quiz_kind
  if (!kind) {
    return {
      stars: thread.stars,
      quiz_count: thread.quiz_count,
      hard_quiz_completed_at: thread.hard_quiz_completed_at,
    }
  }
  const now = new Date().toISOString()
  const newStars = nextStars(thread.stars, kind)
  const newHardAt = kind === 'hard' ? now : thread.hard_quiz_completed_at
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({
      stars: newStars,
      hard_quiz_completed_at: newHardAt,
      pending_quiz_kind: null,
    })
    .eq('id', thread.id)
  if (error) console.error('[f2] completeQuiz failed:', error)
  return {
    stars: newStars,
    quiz_count: thread.quiz_count,
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
