'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { MiniTopicGlyph, StarRow, type TopicKind } from '../feynd-chrome'

export type TopicRowData = {
  id: string
  topic: string | null
  url: string | null
  quiz_count: number
  last_quizzed_at: string | null
  created_at: string
  stars: number
  kind: TopicKind | null
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

export default function TopicRow({
  topic: initial,
  last,
}: {
  topic: TopicRowData
  last: boolean
}) {
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
    setTopic({ ...topic, topic: next })
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
    if (!confirm(`Delete "${defaultLabel(topic)}"? This can't be undone.`)) return
    setBusy(true)
    setDeleted(true)
    const res = await fetch(`/api/f2/topics/${topic.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      setDeleted(false)
      alert('Delete failed.')
    }
  }

  const isNew = topic.stars === 0 && topic.quiz_count === 0

  return (
    <li
      style={{
        borderBottom: last ? 'none' : '1px solid var(--feynd-border-soft)',
        opacity: busy ? 0.6 : 1,
        transition: 'opacity 120ms',
      }}
    >
      <div className="flex items-center gap-3 py-3 px-1">
        <MiniTopicGlyph kind={topic.kind} />

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
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: 16,
                borderRadius: 6,
                border: '1px solid var(--feynd-border)',
                background: 'var(--feynd-bg-raised)',
                color: 'var(--feynd-text)',
                outline: 'none',
              }}
            />
          ) : (
            <Link
              href={`/f2/topics/${topic.id}`}
              style={{
                display: 'block',
                fontSize: 16.5,
                fontWeight: 600,
                letterSpacing: -0.3,
                color: 'var(--feynd-text)',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {defaultLabel(topic)}
            </Link>
          )}
          <div
            className="mt-1 flex items-center gap-2 text-[12.5px]"
            style={{ letterSpacing: -0.1 }}
          >
            {isNew ? (
              <span style={{ color: 'var(--feynd-text-3)' }}>
                {relative(topic.created_at)} · no quizzes yet
              </span>
            ) : (
              <>
                <StarRow value={topic.stars} />
                <span style={{ color: 'var(--feynd-text-3)' }}>·</span>
                <span style={{ color: 'var(--feynd-text-3)' }}>
                  {relative(topic.created_at)}
                </span>
              </>
            )}
          </div>
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Topic options"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: 'var(--feynd-text-3)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 6,
                minWidth: 140,
                background: 'var(--feynd-surface)',
                border: '1px solid var(--feynd-border)',
                borderRadius: 12,
                boxShadow: 'var(--feynd-shadow-soft)',
                overflow: 'hidden',
                zIndex: 20,
              }}
            >
              <button
                type="button"
                onClick={openRename}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  fontSize: 14,
                  color: 'var(--feynd-text)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  fontSize: 14,
                  color: '#D43F2B',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
