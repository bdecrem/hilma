import { f2Supabase } from './supabase'
import type { F2Client } from './agent'

export type F2ThreadMessage = {
  role: 'user' | 'assistant'
  text: string
  created_at: string
}

/// Extra materials the user has attached to a topic over time. Each entry is
/// a URL + the extracted body (when we could pull one). Stored on the thread
/// row as a jsonb array; concatenated into the LLM context by buildFullContent.
export type F2AdditionalSource = {
  /** The URL the user added. May be cleared (null) via the View Context
   *  modal while the transcript content is kept, e.g. when the user only
   *  cares about the body text. */
  url: string | null
  title: string | null
  content: string | null
  added_at: string
}

export type F2Thread = {
  id: string
  user_id: string
  handle: string
  client: F2Client
  url: string | null
  topic: string | null
  content: string | null
  additional_sources: F2AdditionalSource[]
  messages: F2ThreadMessage[]
  created_at: string
  updated_at: string
  last_quizzed_at: string | null
  quiz_count: number
  stars: number
  hard_quiz_completed_at: string | null
  pending_quiz_kind: QuizKind | null
  kind: TopicKind
}

/// One source-of-truth concatenation of every body the user has attached to a
/// topic — primary content first, then each additional source separated by a
/// labeled header so the model knows where each excerpt comes from. Used by
/// chat, quiz grading, voice, and the reflection quiz.
export function buildFullContent(thread: F2Thread): string {
  const parts: string[] = []
  if (thread.content) {
    parts.push(thread.content)
  }
  for (const src of thread.additional_sources ?? []) {
    if (!src.content) continue
    const label = src.title
      ? `${src.url ?? '(no URL)'} — ${src.title}`
      : (src.url ?? 'pasted material')
    parts.push(`\n\n--- Additional source: ${label} ---\n\n${src.content}`)
  }
  return parts.join('')
}

export type QuizKind = 'standard' | 'hard' | 'reflection'

/// Topic source kind — drives which glyph the Topics list renders.
/// Stored on the thread (computed at creation time, see classifyTopicKind).
export type TopicKind = 'chat' | 'web' | 'audio' | 'video' | 'paste' | 'fallback'

const VIDEO_HOSTS = /^(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|vimeo\.com)$/i
const AUDIO_HOSTS = /^(?:[\w-]+\.)*(?:open\.spotify\.com|anchor\.fm|podcasts\.apple\.com|overcast\.fm)$/i
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac)(?:\?|$)/i
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi)(?:\?|$)/i

/// Pure classification — no LLM call. Order matters: file-extension match
/// beats host match (someone could host audio on YouTube but the file
/// extension is the more reliable signal).
export function classifyTopicKind(input: {
  url: string | null | undefined
  content: string | null | undefined
  topic: string | null | undefined
}): TopicKind {
  const url = input.url?.trim() ?? ''
  if (url) {
    if (AUDIO_EXT.test(url)) return 'audio'
    if (VIDEO_EXT.test(url)) return 'video'
    try {
      const host = new URL(url).hostname.toLowerCase()
      if (VIDEO_HOSTS.test(host)) return 'video'
      if (AUDIO_HOSTS.test(host)) return 'audio'
    } catch {
      // Not a parseable URL — treat as generic web below.
    }
    return 'web'
  }
  if ((input.content ?? '').trim().length > 0) return 'paste'
  if ((input.topic ?? '').trim().length > 0) return 'chat'
  return 'fallback'
}

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
  const kind = classifyTopicKind({
    url: input.url,
    content: input.content,
    topic: input.topic,
  })
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
      kind,
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
//   - 'hard' quiz       → 3
//   - 'reflection' quiz → current + 1 (capped at 3; locks the topic, see completeQuiz).
//     Available as the 1st, 2nd, or 3rd star; each invocation grants one more.
//   - 'standard' quiz   → bumps 0→1, 1→2 (caps at 2; only a hard quiz reaches 3)
export function nextStars(current: number, kind: QuizKind): number {
  if (kind === 'hard') return Math.max(current, 3)
  if (kind === 'reflection') return Math.min(3, current + 1)
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
///
/// All four helpers below add `.eq('user_id', …)` to their WHERE clause as
/// defense-in-depth. Callers should still verify ownership upstream, but the
/// extra filter means a stray call with someone else's thread id is a no-op
/// instead of a cross-user write.
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
    .eq('user_id', thread.user_id)
  if (error) console.error('[f2] recordQuizStarted failed:', error)
  return {
    stars: thread.stars,
    quiz_count: newCount,
    hard_quiz_completed_at: thread.hard_quiz_completed_at,
  }
}

/// Clears a pending quiz without awarding any star. Used when the grader
/// decides the user didn't pass — they can retry without leaving a stale
/// pending row lying around.
export async function abandonPendingQuiz(
  threadId: string,
  userId: string,
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ pending_quiz_kind: null })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) console.error('[f2] abandonPendingQuiz failed:', error)
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
  // `hard_quiz_completed_at` doubles as the "topic is done" sentinel —
  // hard quizzes set it because they're the last star; reflection quizzes
  // set it because they're a single-shot path that locks the topic.
  const newHardAt =
    kind === 'hard' || kind === 'reflection' ? now : thread.hard_quiz_completed_at
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({
      stars: newStars,
      hard_quiz_completed_at: newHardAt,
      pending_quiz_kind: null,
    })
    .eq('id', thread.id)
    .eq('user_id', thread.user_id)
  if (error) console.error('[f2] completeQuiz failed:', error)
  return {
    stars: newStars,
    quiz_count: thread.quiz_count,
    hard_quiz_completed_at: newHardAt,
  }
}

export async function appendMessages(
  threadId: string,
  userId: string,
  existing: F2ThreadMessage[],
  toAdd: F2ThreadMessage[],
): Promise<void> {
  const messages = [...existing, ...toAdd]
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)

  if (error) console.error('[f2] appendMessages failed:', error)
}
