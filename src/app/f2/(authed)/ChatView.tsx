'use client'

import { useEffect, useRef, useState } from 'react'
import { ActionChip, F2MiniMark, StarRow } from './feynd-chrome'

type Msg = { role: 'user' | 'assistant'; text: string; created_at?: string }

export default function ChatView({
  initialMessages,
  threadId,
  emptyHint,
  topicTitle,
  stars: initialStars,
  sourceUrl,
  initialPendingQuizKind,
}: {
  initialMessages: Msg[]
  threadId?: string
  emptyHint?: string
  /// Topic detail variant only — title shown above the conversation.
  topicTitle?: string
  /// Topic detail variant only — stars row beside the title.
  stars?: number
  /// Topic detail variant only — when present, renders a small external-link
  /// icon at the right end of the chip row.
  sourceUrl?: string | null
  /// Topic detail variant only — server-recorded pending quiz, drives the
  /// Done chip on initial render.
  initialPendingQuizKind?: string | null
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [stars, setStars] = useState<number | undefined>(initialStars)
  const [pendingQuizKind, setPendingQuizKind] = useState<string | null>(
    initialPendingQuizKind ?? null,
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  async function send(textToSend?: string) {
    const payload = (textToSend ?? text).trim()
    if (!payload || busy) return
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: payload, created_at: new Date().toISOString() },
    ])
    if (!textToSend) setText('')

    const res = await fetch('/api/f2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(threadId ? { text: payload, thread_id: threadId } : { text: payload }),
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

  async function quizMe(kind: 'standard' | 'hard' = 'standard') {
    if (!threadId || busy) return
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: kind === 'hard' ? 'Give me the Hard Quiz.' : 'Quiz me on this topic.',
        created_at: new Date().toISOString(),
      },
    ])
    const res = await fetch(`/api/f2/topics/${threadId}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    })
    setBusy(false)
    if (!res.ok) return
    const json = (await res.json()) as { reply: string; pending_quiz_kind?: string }
    if (json.reply) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: json.reply, created_at: new Date().toISOString() },
      ])
    }
    setPendingQuizKind(json.pending_quiz_kind ?? kind)
  }

  /// User signals the quiz is finished. Server awards the star.
  async function completeQuiz() {
    if (!threadId || busy) return
    setBusy(true)
    const res = await fetch(`/api/f2/topics/${threadId}/quiz/complete`, {
      method: 'POST',
    })
    setBusy(false)
    if (!res.ok) return
    const json = (await res.json()) as { stars?: number; pending_quiz_kind: null }
    if (typeof json.stars === 'number') setStars(json.stars)
    setPendingQuizKind(null)
    // Bump the level-watcher's polling — refresh now so the header chip
    // and celebration fire immediately rather than waiting up to 20s.
    window.dispatchEvent(new Event('feynd-progress-refresh'))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {topicTitle ? (
        <div className="px-4 pt-2 pb-3 border-b" style={{ borderColor: 'var(--feynd-border-soft)' }}>
          <div className="max-w-2xl mx-auto">
            <h1
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: 'var(--feynd-text)' }}
            >
              {topicTitle}
            </h1>
            {typeof stars === 'number' ? (
              <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--feynd-text-3)' }}>
                <StarRow value={stars} size={11} />
              </div>
            ) : null}
            {pendingQuizKind ? (
              <div className="mt-1 text-[11px] italic" style={{ color: 'var(--feynd-coral)' }}>
                Quiz in progress — hit Done quiz when you're finished.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {messages.length === 0 && (
            <p
              className="text-sm text-center mt-12"
              style={{ color: 'var(--feynd-text-3)' }}
            >
              {emptyHint ?? 'Send a URL or ask anything to start.'}
            </p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}
          {busy && <TypingDots />}
        </div>
      </div>

      <div
        style={{
          background: 'var(--feynd-bg)',
          borderTop: '1px solid var(--feynd-border-soft)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-3">
          {threadId ? (
            <div className="flex items-center gap-2 mb-2 overflow-x-auto">
              {pendingQuizKind ? (
                <ActionChip
                  label="Done quiz"
                  onClick={completeQuiz}
                  icon={<CheckIcon />}
                />
              ) : (
                <>
                  <ActionChip
                    label="Quiz me"
                    onClick={() => quizMe('standard')}
                    icon={<QuizIcon />}
                  />
                  <ActionChip
                    label="Talk to F2"
                    onClick={() => alert('Voice mode is iPhone-only for now.')}
                    icon={<MicIcon />}
                  />
                </>
              )}
              <div className="flex-1" />
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open source article"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--feynd-surface)',
                    border: '1px solid var(--feynd-border)',
                    color: 'var(--feynd-text-2)',
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M7 17L17 7M9 7h8v8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2 items-end">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Send a URL or ask a question…"
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                borderRadius: 22,
                border: '1px solid var(--feynd-border)',
                background: 'var(--feynd-bg-raised)',
                color: 'var(--feynd-text)',
                padding: '11px 16px',
                fontSize: 16,
                lineHeight: '20px',
                outline: 'none',
                maxHeight: 130,
              }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy || !text.trim()}
              aria-label="Send"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: !busy && text.trim() ? 'var(--feynd-coral)' : 'var(--feynd-surface-2)',
                color: !busy && text.trim() ? '#1A0E08' : 'var(--feynd-text-3)',
                border: 'none',
                cursor: !busy && text.trim() ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 19V5M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="px-3.5 py-2 max-w-[78%] whitespace-pre-wrap text-[16px] leading-snug"
          style={{
            background: 'var(--feynd-blue)',
            color: '#FFFFFF',
            borderRadius: '20px 20px 4px 20px',
          }}
        >
          {text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <F2MiniMark size={26} />
      <div
        className="px-3.5 py-2.5 max-w-[78%] whitespace-pre-wrap text-[16px] leading-snug"
        style={{
          background: 'var(--feynd-surface)',
          color: 'var(--feynd-text)',
          border: '1px solid var(--feynd-border)',
          borderRadius: '20px 20px 20px 4px',
        }}
      >
        {text}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-end gap-2">
      <F2MiniMark size={26} />
      <div
        className="px-3.5 py-2.5"
        style={{
          background: 'var(--feynd-surface)',
          border: '1px solid var(--feynd-border)',
          borderRadius: '20px 20px 20px 4px',
        }}
      >
        <span className="inline-flex gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: 'var(--feynd-text-3)' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.15s]"
            style={{ background: 'var(--feynd-text-3)' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.3s]"
            style={{ background: 'var(--feynd-text-3)' }}
          />
        </span>
      </div>
    </div>
  )
}

function QuizIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9 9.5a3 3 0 1 1 4.4 2.6c-.9.5-1.4 1.1-1.4 2.1v.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.4" r="1.05" fill="currentColor" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 14.59l-4-4 1.41-1.41L11 13.76l5.59-5.59L18 9.59 11 16.59z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
