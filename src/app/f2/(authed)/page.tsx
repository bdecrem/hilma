import { getSessionUser } from '@/lib/f2/auth'
import { getLatestThread } from '@/lib/f2/threads'
import ChatView from './ChatView'

export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  const user = await getSessionUser()
  // Layout guarantees user exists; assertion-only.
  const thread = user ? await getLatestThread(user.id) : null
  const initial = thread?.messages ?? []

  return (
    <ChatView
      initialMessages={initial}
      emptyHint="Paste a URL to learn from, or ask me anything to begin."
    />
  )
}
