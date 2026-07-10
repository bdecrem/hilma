import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { getOrCreateProgress } from '@/lib/omni/progress'
import { getTopicCards, getTopicForUser } from '@/lib/omni/topics'
import {
  buildChapterTalkInstructions,
  buildFreeformTalkInstructions,
  createConversation,
  mintTalkSecret,
  talkModel,
  talkVoice,
  updateConversationRealtimeId,
} from '@/lib/omni/talk'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Start a live talk session — chapter-scoped ({topic_id}) or freeform. */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { topic_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty body = freeform
  }

  const progress = await getOrCreateProgress(user.id, user.language)
  const name = user.display_name?.trim() || user.email.split('@')[0]

  let instructions: string
  let topicId: string | undefined
  if (body.topic_id) {
    const topic = await getTopicForUser(user.id, body.topic_id)
    if (!topic || topic.status !== 'ready') {
      return NextResponse.json({ error: 'Chapter not found.' }, { status: 404 })
    }
    const cards = await getTopicCards(topic.id)
    topicId = topic.id
    instructions = buildChapterTalkInstructions({
      name,
      language: user.language,
      level: progress.level,
      topicTitle: topic.title,
      topicTitleTarget: topic.title_target,
      dialogue: topic.dialogue,
      grammar: topic.grammar,
      vocab: cards.map((c) => ({ term: c.term, meaning: c.meaning })),
    })
  } else {
    instructions = buildFreeformTalkInstructions({
      name,
      language: user.language,
      level: progress.level,
    })
  }

  try {
    const secret = await mintTalkSecret(instructions)
    const conversation = await createConversation({
      userId: user.id,
      mode: topicId ? 'chapter' : 'freeform',
      language: user.language,
      level: progress.level,
      topicId,
      realtimeSessionId: secret.session?.id,
      model: talkModel(),
      voice: talkVoice(),
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Could not start session.' }, { status: 500 })
    }
    if (secret.session?.id && !conversation.realtime_session_id) {
      await updateConversationRealtimeId({
        userId: user.id,
        conversationId: conversation.id,
        realtimeSessionId: secret.session.id,
      })
    }
    return NextResponse.json({
      client_secret: { value: secret.value, expires_at: secret.expires_at },
      openai_session_id: secret.session?.id ?? null,
      conversation: {
        id: conversation.id,
        mode: conversation.mode,
        topic_id: conversation.topic_id,
      },
      realtime: {
        model: talkModel(),
        voice: talkVoice(),
        calls_url: 'https://api.openai.com/v1/realtime/calls',
        data_channel: 'oai-events',
      },
    })
  } catch (err) {
    console.error('[omni/talk] session start failed:', err)
    return NextResponse.json({ error: 'Could not start session.' }, { status: 500 })
  }
}
