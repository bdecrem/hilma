'use client'

import ChatView from '../../ChatView'

type Msg = { role: 'user' | 'assistant'; text: string; created_at?: string }

/// Thin wrapper around the shared ChatView with topic context.
/// Stars + title render as the topic header inside ChatView.
export default function TopicChat({
  threadId,
  initialMessages,
  topicTitle,
  stars,
}: {
  threadId: string
  initialMessages: Msg[]
  topicTitle: string
  stars: number
}) {
  return (
    <ChatView
      threadId={threadId}
      initialMessages={initialMessages}
      topicTitle={topicTitle}
      stars={stars}
      emptyHint="No messages yet on this topic. Send one, or hit Quiz me."
    />
  )
}
