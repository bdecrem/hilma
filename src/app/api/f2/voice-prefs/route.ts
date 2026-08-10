import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  MAX_VOICE_STYLE_CHARS,
  REALTIME_VOICES,
  getVoicePrefs,
  isKnownVoice,
  realtimeVoice,
  saveVoicePrefs,
} from '@/lib/f2/realtime'

export const runtime = 'nodejs'

// GET /api/f2/voice-prefs — the pickable voice catalog + this user's picks.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const prefs = await getVoicePrefs(user.id)
  return NextResponse.json({
    voices: REALTIME_VOICES,
    default_voice: realtimeVoice(),
    voice: prefs.voice,
    voice_style: prefs.style,
    max_style_chars: MAX_VOICE_STYLE_CHARS,
  })
}

// PUT /api/f2/voice-prefs — save { voice, voice_style }. Empty string or
// null resets a field to the default; an omitted field is left unchanged.
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { voice?: unknown; voice_style?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const current = await getVoicePrefs(user.id)

  let voice = current.voice
  if ('voice' in body) {
    if (body.voice === null || body.voice === '') {
      voice = null
    } else if (typeof body.voice === 'string' && isKnownVoice(body.voice)) {
      voice = body.voice
    } else {
      return NextResponse.json({ error: 'unknown voice' }, { status: 400 })
    }
  }

  let style = current.style
  if ('voice_style' in body) {
    if (body.voice_style === null || body.voice_style === '') {
      style = null
    } else if (typeof body.voice_style === 'string') {
      style = body.voice_style.trim().slice(0, MAX_VOICE_STYLE_CHARS) || null
    } else {
      return NextResponse.json({ error: 'invalid voice_style' }, { status: 400 })
    }
  }

  const ok = await saveVoicePrefs(user.id, { voice, style })
  if (!ok) {
    return NextResponse.json({ error: 'save failed' }, { status: 500 })
  }
  // Same shape as GET so clients can decode one payload for both.
  return NextResponse.json({
    voices: REALTIME_VOICES,
    default_voice: realtimeVoice(),
    voice,
    voice_style: style,
    max_style_chars: MAX_VOICE_STYLE_CHARS,
  })
}
