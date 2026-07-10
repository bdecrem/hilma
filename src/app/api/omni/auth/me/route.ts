import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { getOrCreateProgress, progressPayload } from '@/lib/omni/progress'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const progress = await getOrCreateProgress(user.id, user.language)
  return NextResponse.json({ user, progress: progressPayload(progress) })
}
