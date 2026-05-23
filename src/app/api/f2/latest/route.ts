import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getLatestThread } from '@/lib/f2/threads'

export const runtime = 'nodejs'

// GET /api/f2/latest — returns the user's most-recently-updated thread (with
// messages) or { thread: null }. Used by clients (iOS) to seed the Chat tab.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const thread = await getLatestThread(user.id)
  return NextResponse.json({ thread })
}
