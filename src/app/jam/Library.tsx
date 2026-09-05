'use client'

// The user's tracks. Tap to resume, New to start one, hold "…" to delete.

import { useEffect, useState } from 'react'
import { api, type JamUser, type TrackMeta } from './api'
import Catalog from './Catalog'

type Props = {
  user: JamUser
  onOpen: (id: string) => void
  onNew: () => void
  onSignOut: () => void
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.round(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Library({ user, onOpen, onNew, onSignOut }: Props) {
  const [tracks, setTracks] = useState<TrackMeta[] | null>(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.tracks().then((r) => setTracks(r.tracks)).catch((e) => setError((e as Error).message))
  }, [])

  const remove = async (id: string) => {
    try {
      await api.deleteTrack(id)
      setTracks((t) => (t ? t.filter((x) => x.id !== id) : t))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConfirmDelete(null)
    }
  }

  const duplicate = async (id: string) => {
    try {
      const { track } = await api.duplicateTrack(id)
      setTracks((t) => (t ? [track, ...t] : [track]))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div
      className="flex h-[100dvh] flex-col bg-[#0d0e12] text-[#f2f2f5]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold tracking-[-0.06em]">JAM</h1>
          <span className="text-xs text-white/50">{user.username}</span>
        </div>
        <button onClick={onSignOut} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-6">
        <button
          onClick={() => { if (creating) return; setCreating(true); onNew() }}
          disabled={creating}
          className="mt-2 w-full rounded-2xl bg-[#ffb02e] py-3.5 text-base font-semibold text-black active:scale-[0.99] disabled:opacity-60"
        >
          {creating ? 'Starting…' : '+ New track'}
        </button>

        {error && <p className="mt-4 text-sm text-[#ff5c7a]">{error}</p>}
        {tracks === null && !error && <p className="mt-8 text-center text-sm text-white/40">Loading…</p>}
        {tracks && tracks.length === 0 && (
          <p className="mt-10 text-center text-sm text-white/45">No tracks yet. Start one.</p>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {tracks?.map((t) => (
            <li key={t.id} className="flex items-stretch overflow-hidden rounded-2xl bg-white/5">
              <button onClick={() => onOpen(t.id)} className="min-w-0 flex-1 px-4 py-3 text-left active:bg-white/10">
                <div className="truncate text-[15px] font-semibold">{t.title}</div>
                <div className="mt-0.5 font-mono text-[11px] text-white/45">
                  {t.bpm} BPM · {t.bars} {t.bars === 1 ? 'bar' : 'bars'} · {relTime(t.updated_at)}
                  {t.published_at && <span className="ml-2 rounded-full bg-[#b6ff3d]/15 px-1.5 py-px text-[10px] text-[#b6ff3d]">public</span>}
                  {t.remix_of && <span className="ml-2 text-[10px] text-white/40">remix</span>}
                </div>
              </button>
              {confirmDelete === t.id ? (
                <div className="flex items-center gap-1 pr-2">
                  <button onClick={() => duplicate(t.id)} className="rounded-full bg-[#5ee0ff] px-3 py-1 text-xs font-semibold text-black">Duplicate</button>
                  <button onClick={() => remove(t.id)} className="rounded-full bg-[#ff5c7a] px-3 py-1 text-xs font-semibold text-black">Delete</button>
                  <button onClick={() => setConfirmDelete(null)} className="rounded-full bg-white/10 px-3 py-1 text-xs">Keep</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(t.id)}
                  aria-label="Track options"
                  className="px-4 text-lg text-white/40 active:bg-white/10"
                >
                  …
                </button>
              )}
            </li>
          ))}
        </ul>

        <Catalog title="Catalog — published by everyone" emptyText="Nothing published yet. Open a track and tap Publish." />
      </main>
    </div>
  )
}
