'use client'

// The public catalog: every published track, playable by anyone at /t/<slug>.

import { useEffect, useState } from 'react'
import { api, publicTrackUrl, type PublicTrackMeta } from './api'

function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ago`
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
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#5ee0ff]">{title}</h2>
      {error && <p className="text-sm text-[#ff5c7a]">{error}</p>}
      {tracks === null && !error && <p className="text-sm text-white/40">Loading…</p>}
      {tracks && tracks.length === 0 && <p className="text-sm text-white/40">{emptyText}</p>}
      <ul className="flex flex-col gap-2">
        {tracks?.map((t) => (
          <li key={t.slug}>
            <a href={publicTrackUrl(t.slug)} className="block rounded-2xl bg-white/5 px-4 py-3 active:bg-white/10">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-semibold">{t.title}</span>
                <span className="shrink-0 text-xs text-white/50">{t.username}</span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-white/45">
                {t.bpm} BPM · {t.bars} {t.bars === 1 ? 'bar' : 'bars'}{t.remix ? ' · remix' : ''} · {relTime(t.published_at)}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
