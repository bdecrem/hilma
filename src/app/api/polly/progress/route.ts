import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getUserProgress } from '@/lib/polly/progress'

export const runtime = 'nodejs'

// GET /api/polly/progress
// Returns the signed-in user's level + star totals across all topics.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const progress = await getUserProgress(user.id)
  return NextResponse.json(progress)
}
