import { getSessionUser } from '@/lib/f2/auth'
import { listTopicsForUser } from '@/lib/f2/threads'
import TopicRow from './TopicRow'

export const dynamic = 'force-dynamic'

export default async function TopicsPage() {
  const user = await getSessionUser()
  const threads = user ? await listTopicsForUser(user.id) : []

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Topics</h1>
        <p className="text-neutral-500 text-sm mb-6">
          Everything you've sent F2 to learn.
        </p>

        {threads.length === 0 && (
          <p className="text-neutral-400 text-sm mt-12 text-center">
            No topics yet. Send F2 a URL or ask a question from the Chat tab to
            get started.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {threads.map((t) => (
            <TopicRow
              key={t.id}
              topic={{
                id: t.id,
                topic: t.topic,
                url: t.url,
                quiz_count: t.quiz_count,
                last_quizzed_at: t.last_quizzed_at,
                created_at: t.created_at,
              }}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
