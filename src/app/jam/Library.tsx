'use client'

// The user's tracks. Tap to resume, New to start one, "…" for duplicate/delete.

import { useEffect, useState } from 'react'
import { api, type JamUser, type TrackMeta } from './api'
import Catalog, { relTime } from './Catalog'
import LedStrip from './LedStrip'

type Props = {
  user: JamUser
  onOpen: (id: string) => void
  /** Creates and opens a track; resolves (or rejects) when the attempt is over. */
  onNew: () => void | Promise<void>
  onSignOut: () => void
}

export default function Library({ user, onOpen, onNew, onSignOut }: Props) {
  const [tracks, setTracks] = useState<TrackMeta[] | null>(null)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
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
      setMenu(null)
    }
  }

  const duplicate = async (id: string) => {
    try {
      const { track } = await api.duplicateTrack(id)
      setTracks((t) => (t ? [track, ...t] : [track]))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMenu(null)
    }
  }

  // The key reads "Starting…" only while the create request is in flight.
  // If it fails (the shell shows its banner, or onNew throws) the key comes
  // back so the user can try again without reloading.
  const startNew = async () => {
    if (creating) return
    setCreating(true)
    setError('')
    try {
      await onNew()
    } catch (e) {
      setError((e as Error).message || 'Could not create the track.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="jb-screen jb-screen--fixed">
      <header className="flex items-center justify-between px-4 pb-3 pt-3">
        <div className="flex items-baseline gap-3">
          <h1 className="jb-wordmark jb-wordmark--bar">Jambot<span className="dot" /></h1>
          <span className="jb-readout">{user.username}</span>
        </div>
        <button onClick={onSignOut} className="jb-key jb-key--panel jb-key--xs">Sign out</button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Section row: eyebrow, rule, and the one primary action as a small key — not a banner. */}
        <div className="jb-group" style={{ marginTop: 10 }}>
          <span className="jb-eyebrow">Your tracks</span>
          <button
            onClick={() => { void startNew() }}
            disabled={creating}
            className="jb-key jb-key--orange jb-key--sm"
            style={{ order: 2 }}
          >
            {creating ? 'Starting…' : '+ New track'}
          </button>
        </div>

        {error && <p className="jb-note err mt-4">{error}</p>}
        {tracks === null && !error && <p className="jb-note mt-8 text-center">Loading…</p>}
        {tracks && tracks.length === 0 && (
          <p className="jb-body jb-muted mt-8 text-center">No tracks yet. Start one and tell it what you want to hear.</p>
        )}
        <ul className="flex flex-col gap-2">
          {tracks?.map((t) => (
            <li key={t.id} className="jb-card jb-track">
              <button onClick={() => onOpen(t.id)} className="jb-track-main">
                <div className="jb-row">
                  <span className="jb-track-name">{t.title}</span>
                  <span className="flex shrink-0 gap-1">
                    {t.published_at && <span className="jb-tag jb-tag--green">public</span>}
                    {t.remix_of && <span className="jb-tag jb-tag--outline">remix</span>}
                  </span>
                </div>
                <div className="mt-2"><LedStrip strip={t.strip} /></div>
                <div className="jb-readout mt-2">
                  <b>{t.bpm}</b> BPM · {t.bars} {t.bars === 1 ? 'bar' : 'bars'} · {relTime(t.updated_at)}
                </div>
              </button>
              {menu === t.id ? (
                <div className="flex flex-col justify-center gap-1 pr-2">
                  <button onClick={() => duplicate(t.id)} className="jb-key jb-key--panel jb-key--xs">Duplicate</button>
                  <button onClick={() => remove(t.id)} className="jb-key jb-key--orange jb-key--xs">Delete</button>
                  <button onClick={() => setMenu(null)} className="jb-key jb-key--ghost jb-key--xs">Keep</button>
                </div>
              ) : (
                <button onClick={() => setMenu(t.id)} aria-label="Track options" className="jb-readout px-4 text-lg" style={{ background: 'none', border: 0 }}>
                  …
                </button>
              )}
            </li>
          ))}
        </ul>

        <Catalog title="Catalog · published by everyone" emptyText="Nothing published yet. Open a track and press Publish." />
      </main>
    </div>
  )
}
