import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getUserProgress } from '@/lib/f2/progress'

export const runtime = 'nodejs'

// GET /api/f2/progress
// Returns the signed-in user's level + star totals across all topics.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const progress = await getUserProgress(user.id)
  return NextResponse.json(progress)
}
