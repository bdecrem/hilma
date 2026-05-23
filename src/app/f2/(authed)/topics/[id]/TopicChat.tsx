'use client'

import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; text: string; created_at?: string }

export default function TopicChat({
  threadId,
  initialMessages,
}: {
  threadId: string
  initialMessages: Msg[]
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  async function send() {
    const payload = text.trim()
    if (!payload || busy) return
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: payload, created_at: new Date().toISOString() },
    ])
    setText('')
    const res = await fetch('/api/f2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: payload, thread_id: threadId }),
    })
    setBusy(false)
    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '(error sending message)' },
      ])
      return
    }
    const { reply } = (await res.json()) as { reply: string }
    if (reply) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: reply, created_at: new Date().toISOString() },
      ])
    }
  }

  async function quizMe() {
    if (busy) return
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: 'Quiz me on this topic.',
        created_at: new Date().toISOString(),
      },
    ])
    const res = await fetch(`/api/f2/topics/${threadId}/quiz`, {
      method: 'POST',
    })
    setBusy(false)
    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '(error starting quiz)' },
      ])
      return
    }
    const { reply } = (await res.json()) as { reply: string }
    if (reply) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: reply, created_at: new Date().toISOString() },
      ])
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-neutral-400 text-sm text-center mt-12">
              No messages yet on this topic. Send one, or hit Quiz me.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl whitespace-pre-wrap text-[15px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-white border border-neutral-200 text-neutral-900 rounded-bl-md'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-white border border-neutral-200 rounded-2xl rounded-bl-md px-4 py-3">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="border-t border-neutral-200 bg-white/80 backdrop-blur sticky bottom-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto px-3 py-3 flex gap-2 items-end">
          <button
            onClick={quizMe}
            disabled={busy}
            className="rounded-full bg-white border border-neutral-300 text-neutral-900 px-4 py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-neutral-50"
            title="Quiz me on this topic"
          >
            Quiz me
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Continue this topic…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 outline-none focus:border-neutral-400 max-h-32"
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
