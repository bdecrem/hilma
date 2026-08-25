import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { listCommunityTopics } from '@/lib/f2/community'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/f2/community — the community topic directory, newest share
// first. Signed-in users only.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const topics = await listCommunityTopics()
  return NextResponse.json({ topics }, { headers: NO_STORE })
}
