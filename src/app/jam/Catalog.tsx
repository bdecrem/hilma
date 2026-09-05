'use client'

// The public catalog: every published track, playable by anyone at /t/<slug>.

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

export default function Catalog({ title = 'Catalog', emptyText = 'Nothing published yet.' }: { title?: string; emptyText?: string }) {
  const [tracks, setTracks] = useState<PublicTrackMeta[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.catalog().then((r) => setTracks(r.tracks)).catch((e) => setError((e as Error).message))
  }, [])
  return (
    <section className="mt-6">
      <div className="jb-group"><span className="jb-eyebrow">{title}</span></div>
      {error && <p className="jb-note err">{error}</p>}
      {tracks === null && !error && <p className="jb-note">Loading…</p>}
      {tracks && tracks.length === 0 && <p className="jb-body jb-muted">{emptyText}</p>}
      <ul className="flex flex-col gap-2">
        {tracks?.map((t) => (
          <li key={t.slug} className="jb-card jb-track">
            <a href={publicTrackUrl(t.slug)} className="jb-track-main block">
              <div className="jb-row">
                <span className="jb-track-name">{t.title}</span>
                <span className="jb-readout shrink-0">{t.username}</span>
              </div>
              <div className="mt-2"><LedStrip strip={t.strip} /></div>
              <div className="jb-readout mt-2">
                <b>{t.bpm}</b> BPM · {t.bars} {t.bars === 1 ? 'bar' : 'bars'}{t.remix ? ' · remix' : ''} · {relTime(t.published_at)}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
