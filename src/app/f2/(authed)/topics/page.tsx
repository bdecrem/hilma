import { getSessionUser } from '@/lib/f2/auth'
import { listTopicsForUser } from '@/lib/f2/threads'
import TopicsClient from './TopicsClient'

export const dynamic = 'force-dynamic'

export default async function TopicsPage() {
  const user = await getSessionUser()
  const threads = user ? await listTopicsForUser(user.id) : []

  // Strip server-only fields; pass only what the client needs.
  const topics = threads.map(t => ({
    id: t.id,
    topic: t.topic,
    url: t.url,
    quiz_count: t.quiz_count,
    last_quizzed_at: t.last_quizzed_at,
    created_at: typeof t.created_at === 'string' ? t.created_at : String(t.created_at),
    stars: t.stars ?? 0,
    kind: t.kind ?? null,
  }))

  return <TopicsClient topics={topics} />
}
