import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById, type F2Thread } from '@/lib/f2/threads'
import TopicChat from './TopicChat'

export const dynamic = 'force-dynamic'

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

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getSessionUser()
  const thread = user ? await getThreadById(user.id, id) : null
  if (!thread) notFound()

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="border-b border-neutral-200 bg-white/80 backdrop-blur px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/f2/topics"
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              ← Topics
            </Link>
            <div className="font-medium truncate">{topicLabel(thread)}</div>
            {thread.url && (
              <a
                href={thread.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-neutral-400 truncate hover:text-neutral-700 underline"
              >
                {thread.url}
              </a>
            )}
          </div>
          <div className="text-right text-xs text-neutral-500 shrink-0">
            {thread.quiz_count > 0 ? `${thread.quiz_count} quizzes` : ''}
          </div>
        </div>
      </div>

      <TopicChat
        threadId={thread.id}
        initialMessages={thread.messages ?? []}
      />
    </div>
  )
}
