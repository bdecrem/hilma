'use client'

// The public catalog: every published track, playable by anyone at /t/<slug>.
// Admins (jam_users.is_admin) get the same "…" menu the library has on their
// own tracks — Rename / Delete — on every catalog card.

import { useEffect, useState } from 'react'
import { api, publicTrackUrl, type PublicTrackMeta } from './api'
import LedStrip from './LedStrip'

export function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type Props = {
  title?: string
  emptyText?: string
  /** Signed-in admin: show Rename / Delete on every card. */
  admin?: boolean
}

export default function Catalog({ title = 'Catalog', emptyText = 'Nothing published yet.', admin = false }: Props) {
  const [tracks, setTracks] = useState<PublicTrackMeta[] | null>(null)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  useEffect(() => {
    api.catalog().then((r) => setTracks(r.tracks)).catch((e) => setError((e as Error).message))
  }, [])

  const rename = async (slug: string, raw: string) => {
    setRenaming(null)
    const next = raw.trim().slice(0, 80)
    const current = tracks?.find((t) => t.slug === slug)?.title
    if (!next || next === current) return
    try {
      const { track } = await api.renamePublicTrack(slug, next)
      setTracks((ts) => (ts ? ts.map((t) => (t.slug === slug ? { ...t, title: track.title } : t)) : ts))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (slug: string) => {
    try {
      await api.deletePublicTrack(slug)
      setTracks((ts) => (ts ? ts.filter((t) => t.slug !== slug) : ts))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMenu(null)
    }
  }

  const body = (t: PublicTrackMeta) => (
    <>
      <div className="jb-row">
        {renaming === t.slug ? (
          <input
            autoFocus
            defaultValue={t.title}
            aria-label="New title"
            onBlur={(e) => { void rename(t.slug, e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename(t.slug, (e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setRenaming(null)
            }}
            className="jb-field"
            style={{ padding: '2px 8px', fontFamily: 'var(--font-panel-stack)', textTransform: 'uppercase', fontWeight: 600, fontSize: 18, minWidth: 0 }}
          />
        ) : (
          <span className="jb-track-name">{t.title}</span>
        )}
        <span className="jb-readout shrink-0">{t.username}</span>
      </div>
      <div className="mt-2"><LedStrip strip={t.strip} /></div>
      <div className="jb-readout mt-2">
        <b>{t.bpm}</b> BPM · {t.bars} {t.bars === 1 ? 'bar' : 'bars'}{t.remix ? ' · remix' : ''} · {relTime(t.published_at)}
      </div>
    </>
  )

  return (
    <section className="mt-6">
      <div className="jb-group"><span className="jb-eyebrow">{title}</span></div>
      {error && <p className="jb-note err">{error}</p>}
      {tracks === null && !error && <p className="jb-note">Loading…</p>}
      {tracks && tracks.length === 0 && <p className="jb-body jb-muted">{emptyText}</p>}
      <ul className="flex flex-col gap-2">
        {tracks?.map((t) => (
          <li key={t.slug} className="jb-card jb-track">
            {renaming === t.slug ? (
              <div className="jb-track-main block">{body(t)}</div>
            ) : (
              <a href={publicTrackUrl(t.slug)} className="jb-track-main block">{body(t)}</a>
            )}
            {admin && (menu === t.slug ? (
              <div className="flex flex-col justify-center gap-1 pr-2">
                <button onClick={() => { setMenu(null); setRenaming(t.slug) }} className="jb-key jb-key--panel jb-key--xs">Rename</button>
                <button onClick={() => remove(t.slug)} className="jb-key jb-key--orange jb-key--xs">Delete</button>
                <button onClick={() => setMenu(null)} className="jb-key jb-key--ghost jb-key--xs">Keep</button>
              </div>
            ) : (
              <button onClick={() => setMenu(t.slug)} aria-label="Track options" className="jb-readout px-4 text-lg" style={{ background: 'none', border: 0 }}>
                …
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
