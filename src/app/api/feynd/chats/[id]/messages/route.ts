import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'
import { askWithTopic } from '@/lib/feynd/ask'
import { topicForCourse } from '@/lib/feynd/topics'
import { getVideo } from '@/lib/feynd/course'

export const runtime = 'nodejs'
export const maxDuration = 60

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  source: 'text' | 'voice' | 'discord' | 'seed'
  audio_url?: string | null
  created_at: string
}

// POST /api/feynd/chats/:id/messages
// Body: { text, source? }
// Reads the chat row, appends the user message, calls Opus with full
// history + video transcript (if video-scoped), appends the assistant
// reply, writes the whole messages array back. No separate messages table.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: chatId } = await params

  let body: { text?: string; source?: string } = {}
  try { body = await request.json() } catch {}
  const userText = (body.text ?? '').trim()
  if (!userText) return NextResponse.json({ error: 'text required' }, { status: 400 })
  const source = (body.source === 'voice' ? 'voice' : 'text') as 'voice' | 'text'

  const sb = feyndSupabase()

  // Load chat (verifies ownership + gets current messages).
  const { data: chat, error: chatErr } = await sb
    .from('feynd_chats')
    .select('*')
    .eq('id', chatId)
    .eq('device_id', auth.deviceId)
    .single()
  if (chatErr || !chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  const existing: Msg[] = Array.isArray(chat.messages) ? (chat.messages as Msg[]) : []

  const userMsg: Msg = {
    id: randomUUID(),
    role: 'user',
    text: userText,
    source,
    audio_url: null,
    created_at: new Date().toISOString(),
  }

  // Persist the user message first so it's not lost if Opus fails.
  {
    const { error: e } = await sb
      .from('feynd_chats')
      .update({ messages: [...existing, userMsg], updated_at: new Date().toISOString() })
      .eq('id', chatId)
      .eq('device_id', auth.deviceId)
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  }

  // Build video context (if this chat is scoped to a specific video).
  let videoContext:
    | { title: string; author: string; host: string; publishedOn: string; transcript: string }
    | undefined
  if (chat.video_id) {
    const v = getVideo(chat.course_id, chat.video_id)
    if (v) {
      videoContext = {
        title: v.title,
        author: v.author,
        host: v.host,
        publishedOn: v.publishedOn,
        transcript: v.transcript?.text ?? '',
      }
    }
  }

  const history = existing.map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }))
  const topic = topicForCourse(chat.course_id)

  let answer: string
  try {
    const r = await askWithTopic({
      question: userText,
      topic,
      history,
      videoContext,
      maxTokens: 1200,
    })
    answer = r.answer
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `ask failed: ${msg}`, user_message: userMsg },
      { status: 502 }
    )
  }

  const assistantMsg: Msg = {
    id: randomUUID(),
    role: 'assistant',
    text: answer,
    source: 'text',
    audio_url: null,
    created_at: new Date().toISOString(),
  }

  // Re-read to avoid clobbering a concurrent update. For single-user
  // scale this is overkill but harmless.
  const { data: fresh } = await sb
    .from('feynd_chats')
    .select('messages')
    .eq('id', chatId)
    .eq('device_id', auth.deviceId)
    .single()
  const current: Msg[] = Array.isArray(fresh?.messages) ? (fresh!.messages as Msg[]) : [...existing, userMsg]

  const { error: writeErr } = await sb
    .from('feynd_chats')
    .update({ messages: [...current, assistantMsg], updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('device_id', auth.deviceId)
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

  return NextResponse.json({ user_message: userMsg, assistant_message: assistantMsg })
}
