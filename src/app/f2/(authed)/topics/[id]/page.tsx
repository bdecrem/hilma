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
    <TopicChat
      threadId={thread.id}
      initialMessages={thread.messages ?? []}
      topicTitle={topicLabel(thread)}
      stars={thread.stars ?? 0}
      sourceUrl={thread.url ?? null}
    />
  )
}
