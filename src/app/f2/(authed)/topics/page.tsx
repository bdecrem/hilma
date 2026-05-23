import Link from 'next/link'
import { getSessionUser } from '@/lib/f2/auth'
import { listTopicsForUser, type F2Thread } from '@/lib/f2/threads'

export const dynamic = 'force-dynamic'

function relative(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon}mo ago`
  return `${Math.floor(mon / 12)}y ago`
}

function topicLabel(t: F2Thread): string {
  if (t.topic) return t.topic
  if (t.url) {
    try {
      return new URL(t.url).hostname.replace(/^www\./, '')
    } catch {
      return t.url
    }
  }
  return '(untitled)'
}

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
            <li key={t.id}>
              <Link
                href={`/f2/topics/${t.id}`}
                className="block rounded-xl bg-white border border-neutral-200 px-4 py-3 hover:border-neutral-400 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-[15px] truncate">
                    {topicLabel(t)}
                  </div>
                  <div className="text-xs text-neutral-400 shrink-0">
                    Added {relative(t.created_at)}
                  </div>
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {t.quiz_count > 0
                    ? `Quizzed ${t.quiz_count}× · last ${relative(t.last_quizzed_at)}`
                    : 'No quizzes yet'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
