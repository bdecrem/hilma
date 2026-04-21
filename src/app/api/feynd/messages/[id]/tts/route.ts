import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/feynd/messages/:id/tts
// Body: { text: string }
// Generates (and caches) a spoken version of an assistant message. Storage
// is the cache — we use a deterministic path (`messages/<id>.mp3`) and do
// a HEAD check before calling OpenAI. No DB row per message is needed
// since messages live inline in feynd_chats.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: messageId } = await params
  if (!messageId || !/^[A-Za-z0-9_-]+$/.test(messageId)) {
    return NextResponse.json({ error: 'Bad message id' }, { status: 400 })
  }

  let body: { text?: string } = {}
  try { body = await request.json() } catch {}
  const text = (body.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const sb = feyndSupabase()
  const path = `messages/${messageId}.mp3`
  const publicUrl = sb.storage.from('feynd-audio').getPublicUrl(path).data.publicUrl

  // Cache hit? HEAD the public URL — cheap check.
  try {
    const head = await fetch(publicUrl, { method: 'HEAD' })
    if (head.ok) return NextResponse.json({ audio_url: publicUrl, cached: true })
  } catch {
    // ignore — we'll just generate.
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  // Keep this voice in sync with FEYND_VOICE (realtime + tts). `ballad` is
  // a warm masculine storyteller voice that exists in BOTH OpenAI's
  // Realtime voice catalog and the standalone TTS catalog — so the voice
  // chat greeting and the Listen playback sound like the same tutor.
  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'echo',
      input: text,
      response_format: 'mp3',
    }),
  })
  if (!ttsRes.ok) {
    const b = await ttsRes.text()
    return NextResponse.json({ error: `TTS failed: ${ttsRes.status} ${b}` }, { status: 502 })
  }
  const mp3 = Buffer.from(await ttsRes.arrayBuffer())

  const { error: upErr } = await sb.storage
    .from('feynd-audio')
    .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ audio_url: publicUrl, cached: false })
}
