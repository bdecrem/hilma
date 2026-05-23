'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function PasteForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const chars = text.length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setErr(null)
    const res = await fetch('/api/f2/topics/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() || undefined, text }),
    })
    if (!res.ok) {
      setBusy(false)
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Save failed')
      return
    }
    const { thread } = (await res.json()) as { thread: { id: string } }
    router.push(`/f2/topics/${thread.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-600">
          Title <span className="text-neutral-400">(optional)</span>
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Tyler Cowen on AI and economics"
          className="rounded-xl bg-white border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-600">Text</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the transcript, article, or chapter here…"
          rows={20}
          className="resize-y rounded-xl bg-white border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400 font-mono text-[13px] leading-relaxed"
        />
        <span className="text-xs text-neutral-400 self-end">
          {chars.toLocaleString()} characters
        </span>
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full bg-white border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save as topic'}
        </button>
      </div>
    </form>
  )
}
