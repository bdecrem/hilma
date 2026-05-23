import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { finishVoiceSession } from '@/lib/f2/realtime'

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
  return NextResponse.json({ ok: true })
}
