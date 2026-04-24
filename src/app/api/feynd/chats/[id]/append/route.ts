import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  source: 'text' | 'voice' | 'discord' | 'seed'
  audio_url: string | null
  created_at: string
}

// POST /api/feynd/chats/:id/append
// Body: { role: 'user' | 'assistant', text, source? }
// Appends a single pre-formed message to the chat without calling Opus.
// Used by the iOS voice-mode sheet to land Realtime transcripts
// (input_audio_transcription.completed, response.audio_transcript.done)
// into the same conversation history the text UI reads.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: chatId } = await params

  let body: { role?: string; text?: string; source?: string } = {}
  try { body = await request.json() } catch {}
  const role: 'user' | 'assistant' | null =
    body.role === 'assistant' ? 'assistant'
    : body.role === 'user' ? 'user'
    : null
  if (!role) return NextResponse.json({ error: 'role must be user or assistant' }, { status: 400 })
  const text = (body.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  const source = (body.source === 'text' || body.source === 'discord' || body.source === 'seed')
    ? body.source
    : 'voice'

  const sb = feyndSupabase()

  const { data: chat, error: chatErr } = await sb
    .from('feynd_chats')
    .select('messages')
    .eq('id', chatId)
    .eq('device_id', auth.deviceId)
    .single()
  if (chatErr || !chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  const existing: Msg[] = Array.isArray(chat.messages) ? (chat.messages as Msg[]) : []

  const msg: Msg = {
    id: randomUUID(),
    role,
    text,
    source,
    audio_url: null,
    created_at: new Date().toISOString(),
  }

  const { error: writeErr } = await sb
    .from('feynd_chats')
    .update({ messages: [...existing, msg], updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('device_id', auth.deviceId)
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

  return NextResponse.json({ message: msg })
}
