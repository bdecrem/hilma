'use client'

import { useEffect, useRef, useState } from 'react'
import { MiniTopicGlyph, StarRow } from '../feynd-chrome'
import TopicRow, { type TopicRowData } from './TopicRow'

type Sort = 'recent' | 'alpha'
const STORAGE_KEY = 'feynd-topics-sort'

export default function TopicsClient({ topics: initial }: { topics: TopicRowData[] }) {
  const [topics] = useState(initial)
  const [sort, setSort] = useState<Sort>('recent')
  const [sortMenu, setSortMenu] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'alpha' || raw === 'recent') setSort(raw)
  }, [])

  useEffect(() => {
    if (!sortMenu) return
    function onClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [sortMenu])

  function pick(next: Sort) {
    setSort(next)
    localStorage.setItem(STORAGE_KEY, next)
    setSortMenu(false)
  }

  const sorted = (() => {
    if (sort === 'recent') return topics
    return [...topics].sort((a, b) =>
      defaultLabel(a).localeCompare(defaultLabel(b), undefined, { sensitivity: 'base' }),
    )
  })()

  return (
    <div style={{ flex: 1 }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-2 pb-12">
        <div className="flex items-end justify-between gap-3 pt-1">
          <h1
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: -0.8,
              lineHeight: 1,
              color: 'var(--feynd-text)',
            }}
          >
            Topics
          </h1>
          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortMenu(v => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px 5px 11px',
                background: 'var(--feynd-surface)',
                border: '1px solid var(--feynd-border)',
                color: 'var(--feynd-text-2)',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              {sort === 'recent' ? 'Recent' : 'A–Z'}
              <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden>
                <path
                  d="M2 4.5l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {sortMenu ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 140,
                  background: 'var(--feynd-surface)',
                  border: '1px solid var(--feynd-border)',
                  borderRadius: 12,
                  boxShadow: 'var(--feynd-shadow-soft)',
                  zIndex: 20,
                  padding: 4,
                }}
              >
                {(['recent', 'alpha'] as Sort[]).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pick(opt)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      fontSize: 14,
                      color: 'var(--feynd-text)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ width: 14, color: 'var(--feynd-coral)' }}>
                      {sort === opt ? '✓' : ''}
                    </span>
                    {opt === 'recent' ? 'Recent' : 'A–Z'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Section meta strip — kept lean per the iOS pass. */}
        <div
          className="mt-3 pb-2 text-[12px] font-semibold uppercase tracking-[0.04em]"
          style={{ color: 'var(--feynd-text-3)' }}
        >
          {topics.length} TOPICS
        </div>

        {topics.length === 0 ? (
          <p className="mt-12 text-center text-sm" style={{ color: 'var(--feynd-text-3)' }}>
            No topics yet. Send F2 a URL or ask a question from Chat to get started.
          </p>
        ) : (
          <ul className="flex flex-col">
            {sorted.map((t, idx) => (
              <TopicRow
                key={t.id}
                topic={t}
                last={idx === sorted.length - 1}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
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

// Re-export the glyph/star helpers so future Topics work can grab them locally.
export { MiniTopicGlyph, StarRow }
