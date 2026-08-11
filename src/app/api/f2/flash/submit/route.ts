import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'
import {
  getFlashCardsByIds,
  judgeTextAnswers,
  judgeVoiceSet,
  openFormQuestion,
  recordFlashSet,
  type FlashResult,
  type FlashSetMode,
} from '@/lib/f2/flash'

export const runtime = 'nodejs'
// Text/voice judging is one Haiku call.
export const maxDuration = 60

type SubmitBody = {
  mode?: FlashSetMode
  thread_id?: string
  jumbo_level?: number
  // choice/text: the user's answers, in question order.
  answers?: { card_id?: string; answer?: string | null }[]
  // voice: card ids in question order + the finished voice session to grade.
  card_ids?: string[]
  voice_session_id?: string
}

// POST /api/f2/flash/submit — grade a finished set, record it, pay XP,
// and (topic sets) advance the star-2 ladder.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: SubmitBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const mode = body.mode
  if (mode !== 'choice' && mode !== 'text' && mode !== 'voice') {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }
  const threadId = body.thread_id ?? null
  const jumboLevel = body.jumbo_level != null ? Math.round(Number(body.jumbo_level)) : null
  if ((threadId === null) === (jumboLevel === null)) {
    return NextResponse.json(
      { error: 'exactly one of thread_id / jumbo_level required' },
      { status: 400 },
    )
  }

  const orderedIds =
    mode === 'voice'
      ? (body.card_ids ?? [])
      : (body.answers ?? []).map((a) => a.card_id ?? '')
  if (orderedIds.length === 0 || orderedIds.some((id) => !id)) {
    return NextResponse.json({ error: 'card ids required' }, { status: 400 })
  }

  const cards = await getFlashCardsByIds(user.id, orderedIds)
  const byId = new Map(cards.map((c) => [c.id, c]))
  const ordered = orderedIds.map((id) => byId.get(id)).filter((c) => c != null)
  if (ordered.length !== orderedIds.length) {
    return NextResponse.json({ error: 'unknown card in set' }, { status: 400 })
  }

  let given: (string | null)[]
  let correct: boolean[]
  try {
    if (mode === 'voice') {
      if (!body.voice_session_id) {
        return NextResponse.json({ error: 'voice_session_id required' }, { status: 400 })
      }
      const { data: session } = await f2Supabase()
        .from('f2_voice_sessions')
        .select('transcript')
        .eq('id', body.voice_session_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!session) {
        return NextResponse.json({ error: 'voice session not found' }, { status: 404 })
      }
      given = ordered.map(() => null)
      correct = await judgeVoiceSet(
        ordered,
        (session.transcript ?? []) as { role?: string; text?: string }[],
      )
    } else {
      given = (body.answers ?? []).map((a) => a.answer ?? null)
      if (mode === 'choice') {
        correct = ordered.map((c, i) => (given[i] ?? '').trim() === c.answer)
      } else {
        correct = await judgeTextAnswers(ordered, given)
      }
    }
  } catch (e) {
    console.error('[f2/flash] judging failed:', e)
    return NextResponse.json(
      { error: 'Grading failed — please resubmit.' },
      { status: 502 },
    )
  }

  const results: FlashResult[] = ordered.map((c, i) => ({
    card_id: c.id,
    // Echo the question as it was actually asked in this mode.
    question: mode === 'choice' ? c.question : openFormQuestion(c),
    answer: c.answer,
    given: given[i],
    correct: correct[i],
  }))

  try {
    const recorded = await recordFlashSet({
      userId: user.id,
      threadId,
      jumboLevel,
      mode,
      results,
    })
    return NextResponse.json({
      score: recorded.set.score,
      total: recorded.set.total,
      results,
      xp_awarded: recorded.xp_awarded,
      total_xp: recorded.total_xp,
      star2_awarded: recorded.star2_awarded,
      stars: recorded.stars,
      consecutive_high_sets: recorded.consecutive_high_sets,
    })
  } catch (e) {
    console.error('[f2/flash] record failed:', e)
    return NextResponse.json({ error: 'Could not save the set.' }, { status: 500 })
  }
}
