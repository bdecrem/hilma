import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'
import { opusAsk } from '@/lib/feynd/opus'
import { getVideo } from '@/lib/feynd/course'

export const runtime = 'nodejs'
export const maxDuration = 60 // Opus round-trip can take ~15-25s on long transcripts

// POST /api/feynd/chats/:id/messages
// Body: { text: string, source?: 'text'|'voice' }
// Appends the user message, calls Opus with full chat history + video
// transcript (if chat is video-scoped), appends the assistant reply, and
// returns both messages. This is the text-chat workhorse.
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

  // Verify chat belongs to this device
  const { data: chat, error: chatErr } = await sb
    .from('feynd_chats')
    .select('*')
    .eq('id', chatId)
    .eq('device_id', auth.deviceId)
    .single()
  if (chatErr || !chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  // Insert the user message first so it's persisted even if Opus fails.
  const { data: userMsg, error: userErr } = await sb
    .from('feynd_messages')
    .insert({ chat_id: chatId, role: 'user', text: userText, source })
    .select()
    .single()
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 })

  // Load full chat history (for Opus context) — include the just-inserted
  // user message.
  const { data: historyRows } = await sb
    .from('feynd_messages')
    .select('role, text')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  const allTurns = (historyRows ?? []) as { role: 'user' | 'assistant'; text: string }[]
  const priorTurns = allTurns.slice(0, -1) // everything before the user msg

  // Build video context if the chat is scoped to a video.
  let videoContext: Parameters<typeof opusAsk>[0]['videoContext'] | undefined
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

  // For text chat, we want readable prose, not "spoken" — override the default
  // system prompt. (When the iOS app renders a message for TTS it'll hit the
  // dedicated /tts route with its own spoken-prose rewrite if needed.)
  const chatSystem = `You are Feynd, a curious and playful tutor who can teach anything. Reply in clean prose that reads well both on screen AND spoken aloud.

Style rules:
- Short paragraphs. Plain language. Vivid examples and analogies.
- Avoid markdown scaffolding (no #, no long bulleted lists, no code fences for prose). One or two inline **bolds** are fine for emphasis.
- If the user is studying a specific video, ground your answer in that video's transcript. If the transcript doesn't cover the question, say so briefly, then answer from general knowledge.
- Don't ask clarifying questions unless the ambiguity is genuinely blocking — the round-trip is expensive.`

  let answer: string
  try {
    answer = await opusAsk({
      question: userText,
      history: priorTurns,
      videoContext,
      system: chatSystem,
      maxTokens: 1200,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Opus failed: ${msg}`, user_message: userMsg }, { status: 502 })
  }

  const { data: assistantMsg, error: asstErr } = await sb
    .from('feynd_messages')
    .insert({ chat_id: chatId, role: 'assistant', text: answer, source: 'text' })
    .select()
    .single()
  if (asstErr) return NextResponse.json({ error: asstErr.message }, { status: 500 })

  return NextResponse.json({ user_message: userMsg, assistant_message: assistantMsg })
}
