import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { finishVoiceSession } from '@/lib/f2/realtime'
import { f2Supabase } from '@/lib/f2/supabase'
import { mergeVoiceTranscript } from '@/lib/f2/global-chat'

export const runtime = 'nodejs'

type FinishBody = {
  transcript?: unknown
  summary?: string
  usage?: unknown
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: FinishBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id } = await ctx.params
  // Read before finishing: a second PATCH of an ended session must not merge
  // its transcript into the global chat twice.
  const { data: before } = await f2Supabase()
    .from('f2_voice_sessions')
    .select('mode, ended_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const ok = await finishVoiceSession({
    userId: user.id,
    voiceSessionId: id,
    transcript: body.transcript,
    summary: body.summary,
    usage: body.usage,
  })

  if (!ok) {
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  // A GLOBAL voice session is part of the user's global chat: its turns join
  // the same conversation the typed chat shows.
  if (before?.mode === 'global' && !before.ended_at && Array.isArray(body.transcript)) {
    try {
      await mergeVoiceTranscript(user.id, body.transcript as { role?: string; text?: string; created_at?: string }[])
    } catch (err) {
      console.error('[f2/realtime] global transcript merge failed:', id, err)
      return NextResponse.json({ error: 'transcript saved, but it could not join the global chat' }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
