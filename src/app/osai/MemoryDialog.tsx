'use client'

import { useEffect, useState } from 'react'

export default function MemoryDialog({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/osai/memory')
      .then((r) => (r.ok ? r.json() : { notes: '' }))
      .then((j: { notes?: string }) => setNotes(j.notes ?? ''))
      .catch(() => setNotes(''))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function clear() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/osai/memory', { method: 'DELETE' })
      if (res.ok) setNotes('')
    } finally {
      setBusy(false)
    }
  }

  const has = !!notes?.trim()
  return (
    <div className="osai-dialog-backdrop" onClick={onClose} role="presentation">
      <div className="osai-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="osai-mem-title">
        <h2 id="osai-mem-title">Memory</h2>
        <p>What the assistant keeps about you between conversations.</p>
        <div className={`notes${has ? '' : ' empty'}`}>{notes === null ? '…' : has ? notes : 'Nothing yet.'}</div>
        <div className="actions">
          {has ? <button type="button" className="link" onClick={clear} disabled={busy}>Clear</button> : <span />}
          <div><button type="button" className="primary" onClick={onClose}>Done</button></div>
        </div>
      </div>
    </div>
  )
}
