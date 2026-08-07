import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'
import {
  SET_SIZE,
  choicesForCard,
  getJumboState,
  jumboLevelMode,
  markCardsShown,
  pickSetCards,
  type FlashSetMode,
} from '@/lib/f2/flash'

export const runtime = 'nodejs'

type StartBody = {
  mode?: FlashSetMode
  thread_id?: string
  jumbo_level?: number
}

/// Same display rule the clients use for deck rows: topic name, else the
/// URL's host, else a placeholder.
function topicLabel(t: { topic: string | null; url: string | null }): string {
  if (t.topic?.trim()) return t.topic
  if (t.url) {
    try {
      return new URL(t.url).hostname.replace(/^www\./, '')
    } catch {
      // fall through
    }
  }
  return '(untitled)'
}

// POST /api/f2/flash/start — pick the questions for a set.
//
// Topic set:  { mode, thread_id }
// Jumbo set:  { jumbo_level } (mode is fixed by the level)
//
// Response questions carry `choices` + `answer` in choice mode so the client
// can give instant right/wrong feedback (it's the user's own deck — the
// server still re-grades on submit). Text/voice questions omit the answer.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: StartBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let mode = body.mode
  let threadId: string | null = null
  let jumboLevel: number | null = null

  if (body.jumbo_level != null) {
    jumboLevel = Math.round(Number(body.jumbo_level))
    if (!Number.isFinite(jumboLevel) || jumboLevel < 1) {
      return NextResponse.json({ error: 'invalid jumbo_level' }, { status: 400 })
    }
    const state = await getJumboState(user.id)
    if (jumboLevel > state.highest_passed + 1) {
      return NextResponse.json({ error: 'level locked' }, { status: 403 })
    }
    if (state.card_count < SET_SIZE) {
      return NextResponse.json(
        { error: `Need at least ${SET_SIZE} flash cards across your topics.` },
        { status: 409 },
      )
    }
    mode = jumboLevelMode(jumboLevel)
  } else {
    if (!body.thread_id) {
      return NextResponse.json({ error: 'thread_id or jumbo_level required' }, { status: 400 })
    }
    if (mode !== 'choice' && mode !== 'text' && mode !== 'voice') {
      return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
    }
    threadId = body.thread_id
  }

  const cards = await pickSetCards(user.id, threadId)
  if (cards.length === 0) {
    return NextResponse.json(
      { error: 'No flash cards yet — generate some first.' },
      { status: 409 },
    )
  }

  // Serving the cards counts as an exposure — this is what makes the
  // scheduler's "when did I last see this" real.
  await markCardsShown(user.id, cards.map((c) => c.id))

  // Topic label per card, so questions like "according to the book…" say
  // WHICH book. One lookup covers both set types (Jumbo mixes topics).
  const threadIds = [...new Set(cards.map((c) => c.thread_id))]
  const { data: threadRows } = await f2Supabase()
    .from('f2_threads')
    .select('id, topic, url')
    .eq('user_id', user.id)
    .in('id', threadIds)
  const topicLabels = new Map(
    (threadRows ?? []).map((t) => [t.id as string, topicLabel(t)]),
  )

  const questions = cards.map((c) => ({
    card_id: c.id,
    question: c.question,
    rating: c.rating,
    topic: topicLabels.get(c.thread_id) ?? null,
    ...(mode === 'choice'
      ? { choices: choicesForCard(c), answer: c.answer }
      : {}),
  }))

  return NextResponse.json({
    mode,
    thread_id: threadId,
    jumbo_level: jumboLevel,
    total: questions.length,
    questions,
  })
}
