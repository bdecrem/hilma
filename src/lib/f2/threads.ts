import { f2Supabase } from './supabase'
import type { F2Client } from './agent'
import type { VideoBand } from './videos'
import type { AudioSummary } from './audio-summary'
import type { BookSummary } from './book-summary'

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
  /** True when the user uploaded this as their own notes (Upload Notes).
   *  Notes always get the point-by-point coverage treatment in audio
   *  summaries, regardless of length. */
  note?: boolean
}

/// A quote the user captured for a topic by typing "quote <text>" in chat.
/// Stored on the thread row as a jsonb array; surfaced in "View context" and
/// folded into the LLM context by buildFullContent.
export type F2Quote = {
  text: string
  /** Optional attribution, e.g. "Amos Tversky". Null when not supplied. */
  author?: string | null
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
  additional_sources: F2AdditionalSource[]
  quotes: F2Quote[]
  messages: F2ThreadMessage[]
  created_at: string
  updated_at: string
  last_quizzed_at: string | null
  quiz_count: number
  stars: number
  hard_quiz_completed_at: string | null
  /** Recertification ladder position: 0 after initial cert, +1 per renewal.
   *  Maps to the 30/60/90-day interval (recertIntervalDays). */
  recert_stage: number
  /** When the gold badge needs its next refresher. Null until certified.
   *  "Lapsed" is derived: now > recert_due_at. */
  recert_due_at: string | null
  pending_quiz_kind: QuizKind | null
  kind: TopicKind
  /** Length band the topic's videos were found in ("new short|medium|long").
   *  Null for non-video topics and legacy "setup:" topics (treated as
   *  'long' when fetching more videos). */
  video_band: VideoBand | null
  /** Narrated recap state (see lib/f2/audio-summary.ts). Null when the user
   *  has never generated one for this topic. */
  audio_summary: AudioSummary | null
  /** Web-researched study-context summary for book topics (see
   *  lib/f2/book-summary.ts). Null when never generated. */
  book_summary: BookSummary | null
  /** When the user pinned this topic. Non-null = pinned; the timestamp also
   *  orders pinned topics (most-recently-pinned first). Null = not pinned. */
  pinned_at: string | null
  /** User instruction scoping what they want to be tested on ("only the
   *  first half — I haven't finished the book"). Honored by flash card
   *  generation, chat quizzes, and the Final Review. Null = no focus. */
  study_focus: string | null
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
  // The generated book summary is study context like any other source.
  if (thread.book_summary?.status === 'ready' && thread.book_summary.markdown) {
    parts.push(
      `\n\n--- Book summary (web-researched study context) ---\n\n${thread.book_summary.markdown}`,
    )
  }
  // Quotes the user captured for this topic. Listed last so the model treats
  // them as the user's own emphasis on top of the source material.
  const quotes = (thread.quotes ?? []).filter((q) => q.text?.trim())
  if (quotes.length > 0) {
    const body = quotes
      .map((q) => (q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`))
      .join('\n\n')
    parts.push(`\n\n--- Quotes the user saved ---\n\n${body}`)
  }
  return parts.join('')
}

/// buildFullContent for callers that must TRUNCATE: the user-curated
/// appendices (book summary, additional sources, quotes) come FIRST, and
/// the primary content fills whatever budget remains. A plain
/// buildFullContent().slice() drops the tail — which is exactly the
/// summary/sources/quotes, the material a study focus most often points
/// at. (A Final Review was graded against a source whose study-focus
/// summary had been sliced off; this exists so that can't recur.)
export function buildBudgetedContent(thread: F2Thread, maxChars: number): string {
  const appendix = buildFullContent({ ...thread, content: null } as F2Thread)
  const primary = thread.content ?? ''
  const room = Math.max(0, maxChars - appendix.length)
  const parts: string[] = []
  if (primary) {
    parts.push(
      primary.length > room ? `${primary.slice(0, room)}\n\n[primary content truncated]` : primary,
    )
  }
  if (appendix) parts.push(appendix)
  return parts.join('').slice(0, maxChars)
}

/// An additional source at or below this size counts as the user's own
/// annotations rather than bulk material, even without the note flag.
export const NOTES_SOURCE_MAX_CHARS = 30_000

/// The user's own notes on a topic: uploaded notes files (note:true, always
/// notes whatever their length) plus captured quotes and short pastes. Shared
/// by audio-summary coverage and flash card generation so both weigh the same
/// material as "what this person personally cared about".
export function gatherUserNotes(thread: F2Thread): string {
  const parts: string[] = []
  for (const q of thread.quotes ?? []) {
    if (q.text?.trim()) parts.push(q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`)
  }
  for (const s of thread.additional_sources ?? []) {
    if (!s.content?.trim()) continue
    const isNotes = s.note === true || s.content.length <= NOTES_SOURCE_MAX_CHARS
    if (!isNotes) continue
    const body = s.note ? s.content.slice(0, NOTES_SOURCE_MAX_CHARS * 2) : s.content
    parts.push(s.title ? `${s.title}:\n${body}` : body)
  }
  return parts.join('\n\n')
}

export type QuizKind = 'standard' | 'hard' | 'reflection'

/// Topic source kind — drives which glyph the Topics list renders.
/// Stored on the thread (computed at creation time, see classifyTopicKind).
/// 'book' | 'mini' | 'general' are user-set types (Rename Topic sheet) that
/// classification never produces — the user picks them to say what a topic
/// IS rather than where it came from.
export type TopicKind =
  | 'chat' | 'web' | 'audio' | 'video' | 'paste' | 'fallback'
  | 'book' | 'mini' | 'general'

export const ALL_TOPIC_KINDS: TopicKind[] = [
  'chat', 'web', 'audio', 'video', 'paste', 'fallback', 'book', 'mini', 'general',
]

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
  videoBand?: VideoBand | null
  /** Explicit topic type — skips classifyTopicKind. Used by the Topics
   *  screen's "+ new topic" flow, where the user picks Book/Mini/General. */
  kind?: TopicKind | null
}

export async function createThread(
  input: CreateThreadInput,
): Promise<F2Thread | null> {
  const kind = input.kind ?? classifyTopicKind({
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
      video_band: input.videoBand ?? null,
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
//
// New ladder (2026-08): chat quizzes of ANY kind award only the FIRST star.
//   ★2 comes from flash sets (>=9/10 twice in a row — src/lib/f2/flash.ts)
//   ★3 comes from an A-grade Final Review voice session.
// 'hard' stays accepted for old clients but no longer reaches 3.
export function nextStars(current: number, _kind: QuizKind): number {
  return Math.max(current, 1)
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
  const newStars = nextStars(thread.stars, kind)
  // `hard_quiz_completed_at` is now the "topic mastered" sentinel and is set
  // ONLY by a passed Final Review (awardFinalReviewStar in flash.ts). Chat
  // quizzes never lock a topic anymore — the ladder continues via flash sets.
  const newHardAt = thread.hard_quiz_completed_at
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

/// Overwrite a thread's additional_sources array. Used by the "setup:" video
/// flow to attach the 2nd/3rd video sources after the thread is created.
export async function setAdditionalSources(
  threadId: string,
  userId: string,
  sources: F2AdditionalSource[],
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ additional_sources: sources, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) console.error('[f2] setAdditionalSources failed:', error)
}

/// Set (or clear, with null) a topic's study focus. Same write the topics
/// PATCH route does; shared here so the chat agent can do it too.
export async function setStudyFocus(
  threadId: string,
  userId: string,
  focus: string | null,
): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ study_focus: focus, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) {
    console.error('[f2] setStudyFocus failed:', error)
    return false
  }
  return true
}

/// Append a captured quote to a topic. Returns the new total, or null on error.
/// Like the quiz helpers, scoped by user_id as defense-in-depth.
export async function appendQuote(
  thread: F2Thread,
  text: string,
  author: string | null = null,
): Promise<number | null> {
  const entry: F2Quote = { text, author: author ?? null, created_at: new Date().toISOString() }
  const next = [...(thread.quotes ?? []), entry]
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ quotes: next, updated_at: new Date().toISOString() })
    .eq('id', thread.id)
    .eq('user_id', thread.user_id)
  if (error) {
    console.error('[f2] appendQuote failed:', error)
    return null
  }
  return next.length
}

/// Remove the quote at `index` from a topic. No-op if the index is out of range.
export async function deleteQuoteAt(
  userId: string,
  thread: F2Thread,
  index: number,
): Promise<boolean> {
  const arr = thread.quotes ?? []
  if (index < 0 || index >= arr.length) return false
  const next = arr.filter((_, i) => i !== index)
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ quotes: next, updated_at: new Date().toISOString() })
    .eq('id', thread.id)
    .eq('user_id', userId)
  if (error) {
    console.error('[f2] deleteQuoteAt failed:', error)
    return false
  }
  return true
}

/// Per-user scratch slot for a quote typed outside any topic. The user's next
/// message names the target topic; we read this, file the quote, then clear it.
export async function getPendingQuote(userId: string): Promise<string | null> {
  const { data, error } = await f2Supabase()
    .from('f2_users')
    .select('pending_quote')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[f2] getPendingQuote failed:', error)
    return null
  }
  return (data?.pending_quote as string | null) ?? null
}

export async function setPendingQuote(
  userId: string,
  text: string | null,
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_users')
    .update({ pending_quote: text })
    .eq('id', userId)
  if (error) console.error('[f2] setPendingQuote failed:', error)
}

/// Resolve a free-text topic name to one of the user's threads. Tries an exact
/// (case-insensitive, trimmed) match on the topic label first, then a unique
/// substring match. Returns null when nothing matches or the substring is
/// ambiguous (more than one hit) — the caller re-prompts in that case.
export async function matchTopicByName(
  userId: string,
  name: string,
): Promise<F2Thread | null> {
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  const topics = await listTopicsForUser(userId)
  const labelOf = (t: F2Thread) => (t.topic ?? t.url ?? '').trim().toLowerCase()

  const exact = topics.filter((t) => labelOf(t) === needle)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return exact[0] // identical labels — pick most-recent (list is desc)

  const partial = topics.filter((t) => labelOf(t).includes(needle))
  return partial.length === 1 ? partial[0] : null
}
