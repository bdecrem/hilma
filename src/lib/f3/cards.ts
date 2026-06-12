import { f2Supabase } from '@/lib/f2/supabase'
import { schedule, topicStrength, type CardState } from './scheduler'

export type F3Card = {
  id: string
  user_id: string
  thread_id: string
  prompt: string
  answer: string
  state: CardState
  due_at: string
  interval_days: number
  ease: number
  reps: number
  lapses: number
  last_reviewed_at: string | null
  last_grade: number | null
  suspended: boolean
  created_at: string
  updated_at: string
}

// Card + the topic it belongs to, as the review queue needs it.
export type F3QueueCard = F3Card & {
  topic: string | null
  topic_kind: string | null
}

export async function listCardsForThread(
  userId: string,
  threadId: string,
): Promise<F3Card[]> {
  const { data, error } = await f2Supabase()
    .from('f3_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .eq('suspended', false)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[f3] listCardsForThread failed:', error)
    return []
  }
  return (data as F3Card[]) ?? []
}

export async function insertCards(
  userId: string,
  threadId: string,
  cards: { prompt: string; answer: string }[],
): Promise<F3Card[]> {
  if (cards.length === 0) return []
  const rows = cards.map((c) => ({
    user_id: userId,
    thread_id: threadId,
    prompt: c.prompt,
    answer: c.answer,
  }))
  const { data, error } = await f2Supabase()
    .from('f3_cards')
    .insert(rows)
    .select('*')
  if (error) {
    console.error('[f3] insertCards failed:', error)
    return []
  }
  return (data as F3Card[]) ?? []
}

export async function getCardById(
  userId: string,
  cardId: string,
): Promise<F3Card | null> {
  const { data, error } = await f2Supabase()
    .from('f3_cards')
    .select('*')
    .eq('id', cardId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[f3] getCardById failed:', error)
    return null
  }
  return (data as F3Card | null) ?? null
}

export async function suspendCard(
  userId: string,
  cardId: string,
): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f3_cards')
    .update({ suspended: true, updated_at: new Date().toISOString() })
    .eq('id', cardId)
    .eq('user_id', userId)
  if (error) {
    console.error('[f3] suspendCard failed:', error)
    return false
  }
  return true
}

// Everything due now, most overdue first. Topic label joined in so the
// review screen can tag each question without a second fetch.
export async function dueCards(
  userId: string,
  limit = 12,
  now: Date = new Date(),
  threadId?: string,
): Promise<F3QueueCard[]> {
  let query = f2Supabase()
    .from('f3_cards')
    .select('*, f2_threads(topic, kind)')
    .eq('user_id', userId)
    .eq('suspended', false)
    .lte('due_at', now.toISOString())
  if (threadId) query = query.eq('thread_id', threadId)
  const { data, error } = await query
    .order('due_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.error('[f3] dueCards failed:', error)
    return []
  }
  type Row = F3Card & { f2_threads: { topic: string | null; kind: string | null } | null }
  return ((data as Row[]) ?? []).map(({ f2_threads, ...card }) => ({
    ...card,
    topic: f2_threads?.topic ?? null,
    topic_kind: f2_threads?.kind ?? null,
  }))
}

export type ReviewOutcome = {
  card: F3Card
  next_due_at: string
  interval_days: number
}

// Apply a grade to a card: advance the scheduler, persist, log the attempt.
export async function applyReview(input: {
  userId: string
  card: F3Card
  grade: 0 | 1 | 2
  userAnswer: string
  gradedBy: 'llm' | 'self'
  feedback: string | null
  now?: Date
}): Promise<ReviewOutcome | null> {
  const now = input.now ?? new Date()
  const next = schedule(input.card, input.grade, now)

  const { data, error } = await f2Supabase()
    .from('f3_cards')
    .update({ ...next, updated_at: now.toISOString() })
    .eq('id', input.card.id)
    .eq('user_id', input.userId)
    .select('*')
    .single()
  if (error) {
    console.error('[f3] applyReview card update failed:', error)
    return null
  }

  const { error: logError } = await f2Supabase().from('f3_reviews').insert({
    user_id: input.userId,
    card_id: input.card.id,
    thread_id: input.card.thread_id,
    user_answer: input.userAnswer,
    grade: input.grade,
    graded_by: input.gradedBy,
    feedback: input.feedback,
    interval_days: next.interval_days,
    due_at: next.due_at,
  })
  if (logError) console.error('[f3] applyReview log insert failed:', logError)

  await syncTopicStars(input.userId, input.card.thread_id)

  return {
    card: data as F3Card,
    next_due_at: next.due_at,
    interval_days: next.interval_days,
  }
}

// MARK: Stars — reviewing in Loci feeds the same star/level system F2's
// quizzes feed. A topic's stars derive from the spaced-repetition state of
// its cards: 1★ once every idea has been reviewed, 2★ when all hold a 7-day
// interval, 3★ at 21 days (mastered). Stars only ever go UP — a lapsed card
// can pause progress but never takes back a star, and F2 quiz stars are
// preserved (we write max of current and derived).
export async function syncTopicStars(
  userId: string,
  threadId: string,
): Promise<void> {
  const sb = f2Supabase()
  const { data, error } = await sb
    .from('f3_cards')
    .select('last_reviewed_at, interval_days')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .eq('suspended', false)
  if (error) {
    console.error('[f3] syncTopicStars cards fetch failed:', error)
    return
  }
  const cards = (data as Pick<F3Card, 'last_reviewed_at' | 'interval_days'>[]) ?? []
  if (cards.length === 0) return

  let derived = 0
  if (cards.every((c) => c.last_reviewed_at !== null)) {
    derived = 1
    if (cards.every((c) => c.interval_days >= 7)) derived = 2
    if (derived === 2 && cards.every((c) => c.interval_days >= 21)) derived = 3
  }
  if (derived === 0) return

  const { data: thread, error: threadError } = await sb
    .from('f2_threads')
    .select('stars')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle()
  if (threadError || !thread) return
  if ((thread.stars ?? 0) >= derived) return

  const { error: updateError } = await sb
    .from('f2_threads')
    .update({ stars: derived })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (updateError) console.error('[f3] syncTopicStars update failed:', updateError)
}

export type F3TopicSummary = {
  id: string
  topic: string | null
  url: string | null
  kind: string | null
  updated_at: string
  card_count: number
  due_count: number
  strength: number | null // null = no cards yet
}

export type F3Home = {
  due_count: number
  card_count: number
  reviewed_today: number
  streak_days: number
  topics: F3TopicSummary[]
}

// One round trip for the Today screen: every active card + every topic,
// aggregated in JS (per-user cardinality is small — hundreds, not millions).
export async function homeData(
  userId: string,
  timeZone = 'America/Los_Angeles',
  now: Date = new Date(),
): Promise<F3Home> {
  const sb = f2Supabase()
  const [cardsRes, threadsRes, reviewsRes] = await Promise.all([
    sb
      .from('f3_cards')
      .select('thread_id, state, due_at, interval_days, last_reviewed_at')
      .eq('user_id', userId)
      .eq('suspended', false),
    sb
      .from('f2_threads')
      .select('id, topic, url, kind, updated_at')
      .eq('user_id', userId)
      .or('topic.not.is.null,url.not.is.null')
      .order('updated_at', { ascending: false }),
    sb
      .from('f3_reviews')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(now.getTime() - 60 * 86_400_000).toISOString())
      .order('created_at', { ascending: false }),
  ])

  if (cardsRes.error) console.error('[f3] homeData cards failed:', cardsRes.error)
  if (threadsRes.error) console.error('[f3] homeData threads failed:', threadsRes.error)
  if (reviewsRes.error) console.error('[f3] homeData reviews failed:', reviewsRes.error)

  type CardLite = Pick<F3Card, 'thread_id' | 'state' | 'due_at' | 'interval_days' | 'last_reviewed_at'>
  const cards = (cardsRes.data as CardLite[]) ?? []
  const threads = (threadsRes.data as Pick<F3TopicSummary, 'id' | 'topic' | 'url' | 'kind' | 'updated_at'>[]) ?? []
  const reviews = (reviewsRes.data as { created_at: string }[]) ?? []

  const byThread = new Map<string, CardLite[]>()
  for (const c of cards) {
    const arr = byThread.get(c.thread_id) ?? []
    arr.push(c)
    byThread.set(c.thread_id, arr)
  }

  const nowIso = now.toISOString()
  const topics: F3TopicSummary[] = threads.map((t) => {
    const tc = byThread.get(t.id) ?? []
    return {
      ...t,
      card_count: tc.length,
      due_count: tc.filter((c) => c.due_at <= nowIso).length,
      strength: topicStrength(tc, now),
    }
  })

  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(iso))
  const today = dayOf(nowIso)
  const reviewedToday = reviews.filter((r) => dayOf(r.created_at) === today).length

  // Streak: consecutive days (today counts only if it has reviews) walking back.
  const reviewDays = new Set(reviews.map((r) => dayOf(r.created_at)))
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const day = dayOf(new Date(now.getTime() - i * 86_400_000).toISOString())
    if (reviewDays.has(day)) streak++
    else if (i === 0) continue // today without reviews yet doesn't break it
    else break
  }

  return {
    due_count: cards.filter((c) => c.due_at <= nowIso).length,
    card_count: cards.length,
    reviewed_today: reviewedToday,
    streak_days: streak,
    topics,
  }
}
