import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/feynd/messages/:id/tts — generate (and cache) a spoken version
// of an assistant message. Returns { audio_url }. Idempotent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: messageId } = await params
  const sb = feyndSupabase()

  // Fetch message + verify ownership (via chat→device_id join).
  const { data: msg, error: msgErr } = await sb
    .from('feynd_messages')
    .select('id, chat_id, role, text, audio_url, feynd_chats!inner(device_id)')
    .eq('id', messageId)
    .single()
  if (msgErr || !msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  const chat = Array.isArray(msg.feynd_chats) ? msg.feynd_chats[0] : msg.feynd_chats
  if (!chat || chat.device_id !== auth.deviceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (msg.audio_url) {
    return NextResponse.json({ audio_url: msg.audio_url, cached: true })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  // OpenAI TTS — gpt-4o-mini-tts is cheap and good enough for screen-bound
  // reading. Voice matches the Realtime cedar where possible; the TTS
  // endpoint has its own voice catalog (alloy, verse, ballad, coral, sage,
  // ash, nova) — using 'sage' as the warm storyteller closest to cedar.
  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'sage',
      input: msg.text,
      response_format: 'mp3',
    }),
  })
  if (!ttsRes.ok) {
    const body = await ttsRes.text()
    return NextResponse.json({ error: `TTS failed: ${ttsRes.status} ${body}` }, { status: 502 })
  }
  const mp3 = Buffer.from(await ttsRes.arrayBuffer())

  const path = `messages/${msg.id}.mp3`
  const { error: upErr } = await sb.storage
    .from('feynd-audio')
    .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from('feynd-audio').getPublicUrl(path)
  const audioUrl = urlData.publicUrl

  await sb.from('feynd_messages').update({ audio_url: audioUrl }).eq('id', msg.id)

  return NextResponse.json({ audio_url: audioUrl, cached: false })
}
