'use client'

import { useEffect, useState } from 'react'

const KEY = 'seminar-done-v1'

function readDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

// The number of a step, which is also the box you tick when it is done.
// Ticks are kept in this browser only, so a reader can leave and come back.
export function Tick({ id, n }: { id: string; n: number }) {
  const [done, setDone] = useState(false)
  useEffect(() => setDone(!!readDone()[id]), [id])

  function toggle() {
    const next = !done
    setDone(next)
    try {
      const all = readDone()
      if (next) all[id] = true
      else delete all[id]
      localStorage.setItem(KEY, JSON.stringify(all))
    } catch {
      /* private window: the tick lasts until the page is closed */
    }
  }

  return (
    <button
      type="button"
      className="sem-tick"
      aria-pressed={done}
      aria-label={done ? `Step ${n}, done. Press to undo.` : `Step ${n}. Press when done.`}
      onClick={toggle}
    >
      <span aria-hidden="true">{done ? '✓' : n}</span>
    </button>
  )
}

// A line to say to Claude, with a button that copies it.
export function Say({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* no clipboard access: the text is on the page to select */
    }
  }

  return (
    <div className="sem-say">
      <p className="sem-say-label">Say</p>
      <p className="sem-say-text">{text}</p>
      <button type="button" className="sem-copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
