import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { omniSupabase } from '@/lib/omni/supabase'
import { awardXp } from '@/lib/omni/progress'
import { conversationXp } from '@/lib/omni/xp'
import {
  chapterFromTranscript,
  debriefConversation,
  type ChapterPackage,
  type TranscriptTurn,
} from '@/lib/omni/generate'
import { insertChapterPackage } from '@/lib/omni/topics'
import { getConversation } from '@/lib/omni/talk'

export const runtime = 'nodejs'
// Debrief + (freeform) chapter distillation run in parallel — one Sonnet
// round-trip each, but budget for the slower of the two.
export const maxDuration = 60

/** A freeform chat needs a bit of substance before it becomes a chapter. */
const MIN_TURNS_FOR_CHAPTER = 3

/** End a talk session: store transcript, debrief, mint XP, distill chapter. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const { id } = await params
  const conversation = await getConversation(user.id, id)
  if (!conversation) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  }

  // Idempotency: a client retry (or double-fire) must not re-run the
  // debrief, re-award XP, or mint a duplicate freeform chapter.
  if (conversation.ended_at) {
    const xp = await awardXp(user.id, conversation.language, 0)
    return NextResponse.json({
      summary: conversation.summary ?? null,
      corrections: conversation.corrections ?? [],
      xp,
      new_topic: null,
    })
  }

  let body: { transcript?: TranscriptTurn[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const transcript = (body.transcript ?? [])
    .filter((t) => typeof t?.role === 'string' && typeof t?.text === 'string')
    .slice(0, 600)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 4000) }))
  const userTurns = transcript.filter(
    (t) => t.role === 'user' && t.text.trim(),
  ).length

  const sb = omniSupabase()
  const finish = (fields: Record<string, unknown>) =>
    sb
      .from('omni_conversations')
      .update({
        transcript,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...fields,
      })
      .eq('id', conversation.id)
      .eq('user_id', user.id)

  // Nothing was said — close the row quietly, no LLM calls, no XP.
  if (userTurns === 0) {
    await finish({})
    const xp = await awardXp(user.id, conversation.language, 0)
    return NextResponse.json({ summary: null, corrections: [], xp, new_topic: null })
  }

  const wantChapter =
    conversation.mode === 'freeform' && userTurns >= MIN_TURNS_FOR_CHAPTER

  let debrief = { summary: '', corrections: [] as { quote: string; corrected: string; note: string }[] }
  let pkg: ChapterPackage | null = null
  try {
    const gen = { language: conversation.language, level: conversation.level, transcript }
    const [d, p] = await Promise.all([
      debriefConversation(gen),
      wantChapter ? chapterFromTranscript(gen) : Promise.resolve(null),
    ])
    debrief = d
    pkg = p
  } catch (err) {
    // The conversation still counts even if the write-up fails.
    console.error('[omni/talk] debrief/distill failed:', err)
  }

  let newTopic: { id: string; title: string; title_target: string | null; emoji: string | null; description: string | null; card_count: number } | null = null
  if (pkg) {
    try {
      const { topic, cards } = await insertChapterPackage({
        pkg,
        language: conversation.language,
        level: conversation.level,
        kind: 'freeform',
        userId: user.id,
      })
      newTopic = {
        id: topic.id,
        title: topic.title,
        title_target: topic.title_target,
        emoji: topic.emoji,
        description: topic.description,
        card_count: cards.length,
      }
    } catch (err) {
      console.error('[omni/talk] freeform chapter insert failed:', err)
    }
  }

  const earned = conversationXp(userTurns)
  const xp = await awardXp(user.id, conversation.language, earned)

  await finish({
    summary: debrief.summary || null,
    corrections: debrief.corrections,
    xp_awarded: earned,
  })

  return NextResponse.json({
    summary: debrief.summary || null,
    corrections: debrief.corrections,
    xp,
    new_topic: newTopic,
  })
}
