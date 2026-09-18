import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getLatestThread } from '@/lib/polly/threads'

export const runtime = 'nodejs'

// GET /api/polly/latest — returns the user's most-recently-updated thread (with
// messages) or { thread: null }. Used by clients (iOS) to seed the Chat tab.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const thread = await getLatestThread(user.id)
  return NextResponse.json({ thread })
}
