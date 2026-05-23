'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export type TopicRowData = {
  id: string
  topic: string | null
  url: string | null
  quiz_count: number
  last_quizzed_at: string | null
  created_at: string
}

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

function defaultLabel(t: TopicRowData): string {
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

export default function TopicRow({ topic: initial }: { topic: TopicRowData }) {
  const [topic, setTopic] = useState(initial)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [deleted, setDeleted] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  if (deleted) return null

  function openRename() {
    setMenuOpen(false)
    setDraft(topic.topic ?? defaultLabel(topic))
    setRenaming(true)
  }

  async function saveRename() {
    const next = draft.trim()
    if (!next || next === topic.topic) {
      setRenaming(false)
      return
    }
    setBusy(true)
    const prev = topic
    setTopic({ ...topic, topic: next }) // optimistic
    const res = await fetch(`/api/f2/topics/${topic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: next }),
    })
    setBusy(false)
    setRenaming(false)
    if (!res.ok) {
      setTopic(prev)
      alert('Rename failed.')
    }
  }

  async function handleDelete() {
    setMenuOpen(false)
    if (!confirm(`Delete "${defaultLabel(topic)}"? This can't be undone.`))
      return
    setBusy(true)
    setDeleted(true) // optimistic
    const res = await fetch(`/api/f2/topics/${topic.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      setDeleted(false)
      alert('Delete failed.')
    }
  }

  return (
    <li>
      <div
        className={`rounded-xl bg-white border border-neutral-200 px-4 py-3 transition-colors ${
          busy ? 'opacity-60' : 'hover:border-neutral-400'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                onBlur={saveRename}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-[15px] outline-none focus:border-neutral-500"
              />
            ) : (
              <Link
                href={`/f2/topics/${topic.id}`}
                className="block font-medium text-[15px] truncate hover:underline"
              >
                {defaultLabel(topic)}
              </Link>
            )}
            <div className="text-xs text-neutral-500 mt-1">
              <span className="text-neutral-400">
                Added {relative(topic.created_at)}
              </span>
              <span className="mx-1.5 text-neutral-300">·</span>
              {topic.quiz_count > 0
                ? `Quizzed ${topic.quiz_count}× · last ${relative(topic.last_quizzed_at)}`
                : 'No quizzes yet'}
            </div>
          </div>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="Topic options"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
            >
              <span aria-hidden className="text-xl leading-none">⋯</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 min-w-[140px] rounded-lg bg-white border border-neutral-200 shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={openRename}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
