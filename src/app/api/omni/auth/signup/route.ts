import { NextResponse } from 'next/server'
import { createUser, setSessionCookie } from '@/lib/omni/auth'
import { getOrCreateProgress, progressPayload } from '@/lib/omni/progress'
import { isValidLevel } from '@/lib/omni/languages'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { email?: string; password?: string; language?: string; level?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const created = await createUser({
    email: body.email ?? '',
    password: body.password ?? '',
    language: body.language ?? '',
  })
  if ('error' in created) {
    return NextResponse.json({ error: created.error }, { status: created.status })
  }

  const startLevel = isValidLevel(Number(body.level)) ? Number(body.level) : 1
  const progress = await getOrCreateProgress(created.id, created.language, startLevel)

  const res = NextResponse.json({
    user: created,
    progress: progressPayload(progress),
  })
  setSessionCookie(res, created.id)
  return res
}
