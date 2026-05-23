import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { listTopicsForUser } from '@/lib/f2/threads'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const threads = await listTopicsForUser(user.id)
  const topics = threads.map((t) => ({
    id: t.id,
    topic: t.topic,
    url: t.url,
    last_quizzed_at: t.last_quizzed_at,
    quiz_count: t.quiz_count,
    created_at: t.created_at,
    updated_at: t.updated_at,
    client: t.client,
  }))
  return NextResponse.json({ topics })
}
