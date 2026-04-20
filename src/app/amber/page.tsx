'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'

import CREATIONS from './creations.json'

// ─── Amber v3 palette (from misc/amber-v3/AESTHETIC.md draft) ────
// Dark-mode, monochrome with charge. Lime is the signal. Use sparingly.
const NIGHT  = '#0A0A0A'
const CREAM  = '#E8E8E8'
const LIME   = '#C6FF3C'
const MUTE   = '#6b6b6b'
const FAINT  = 'rgba(232,232,232,0.08)'

interface Creation {
  name: string
  url: string
  date: string
  category: string
  description: string
}

function Card({ c, idx }: { c: Creation; idx: number }) {
  const [loaded, setLoaded] = useState(false)
  // Static OG images live at `${url}/opengraph-image.png`; dynamic
  // (opengraph-image.tsx) routes serve at `${url}/opengraph-image`.
  // Try the static path first, fall back to the dynamic path on 404.
  const [ogUrl, setOgUrl] = useState(`${c.url}/opengraph-image.png`)
  const [triedFallback, setTriedFallback] = useState(false)

  return (
    <Link
      href={c.url}
      className="card"
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      <div className="card-img">
        <img
          src={ogUrl}
          alt={c.name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!triedFallback) {
              setTriedFallback(true)
              setOgUrl(`${c.url}/opengraph-image`)
            }
          }}
          style={{
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        />
        {!loaded && <div className="card-placeholder" />}
      </div>
      <div className="card-info">
        <div className="card-top">
          <span className="card-name">{c.name}</span>
          <span className="card-cat">{c.category}</span>
        </div>
        <p className="card-desc">{c.description}</p>
        <span className="card-date">{c.date}</span>
      </div>
    </Link>
  )
}

function LiveCard({ c, idx }: { c: Creation; idx: number }) {
  const [visible, setVisible] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [ogUrl, setOgUrl] = useState(`${c.url}/opengraph-image.png`)
  const [triedFallback, setTriedFallback] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true)
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="card live-card"
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      <div className="card-img live-card-img">
        {!iframeLoaded && (
          <img
            src={ogUrl}
            alt={c.name}
            onError={() => {
              if (!triedFallback) {
                setTriedFallback(true)
                setOgUrl(`${c.url}/opengraph-image`)
              }
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {visible && (
          <iframe
            src={c.url}
            title={c.name}
            onLoad={() => setIframeLoaded(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              opacity: iframeLoaded ? 1 : 0,
              transition: 'opacity 0.6s ease',
            }}
          />
        )}
        <div className="live-badge">
          <span className="live-dot" />
          live
        </div>
      </div>
      <Link href={c.url} className="card-info" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <div className="card-top">
          <span className="card-name">{c.name}</span>
          <span className="card-cat">{c.category}</span>
        </div>
        <p className="card-desc">{c.description}</p>
        <span className="card-date">{c.date}</span>
      </Link>
    </div>
  )
}

export default function AmberV3FeedPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Today's mood — programmatic label from public/amber-noon/YYYY-MM-DD.json.
  const [todayMood, setTodayMood] = useState<string | null>(null)
  useEffect(() => {
    const d = new Date()
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    fetch(`/amber-noon/${date}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.mood?.name) setTodayMood(String(j.mood.name).toLowerCase()) })
      .catch(() => {})
  }, [])

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&display=swap" rel="stylesheet" />
      <style>{`
        :root {
          --night: ${NIGHT};
          --cream: ${CREAM};
          --lime:  ${LIME};
          --mute:  ${MUTE};
          --faint: ${FAINT};
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }

        .feed-page {
          min-height: 100dvh;
          background: var(--night);
          color: var(--cream);
          font-family: 'Courier Prime', ui-monospace, 'SF Mono', monospace;
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }

        /* ── HEADER ─────────────────────────── */
        .feed-header {
          max-width: 900px;
          margin: 0 auto;
          padding: 72px 24px 28px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 20px;
        }

        .feed-title {
          font-size: clamp(4.5rem, 15vw, 8rem);
          line-height: 0.85;
          margin: 0;
          display: flex;
          align-items: flex-end;
        }

        .mark-letter {
          font-family: "Courier New", Courier, monospace;
          font-weight: 900;
          color: var(--cream);
          letter-spacing: -0.05em;
          line-height: 0.85;
        }

        .mark-dot {
          display: inline-block;
          width: 0.22em;
          height: 0.22em;
          border-radius: 50%;
          background: var(--lime);
          margin-left: 0.08em;
          margin-bottom: 0.08em;
        }

        .feed-meta {
          font-family: 'Courier Prime', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--mute);
          line-height: 1.7;
          padding-bottom: 10px;
          text-align: right;
        }

        .feed-meta a {
          color: var(--mute);
          text-decoration: none;
          border-bottom: 1px solid rgba(232,232,232,0.15);
          transition: color 0.2s, border-color 0.2s;
        }

        .feed-meta a:hover {
          color: var(--cream);
          border-bottom-color: rgba(232,232,232,0.4);
        }

        /* Tagline row — italic Fraunces */
        .feed-tagline {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px 8px;
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(13px, 1.5vw, 15px);
          color: rgba(232,232,232,0.6);
          letter-spacing: 0.005em;
        }

        /* ── DIVIDER ────────────────────────── */
        .feed-divider {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px 24px;
        }

        .feed-divider hr {
          border: none;
          height: 1px;
          background: var(--faint);
        }

        /* ── GRID ────────────────────────────── */
        .feed-grid {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px 24px 96px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
        }

        .card {
          display: block;
          text-decoration: none;
          color: inherit;
          overflow: hidden;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--faint);
          animation: fadeUp 0.5s ease both;
          transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
          cursor: pointer;
        }

        .card:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(232,232,232,0.18);
          transform: translateY(-2px);
        }

        .live-card {
          grid-column: 1 / -1;
          cursor: default;
        }

        .live-card:hover {
          transform: none;
        }

        .card-img {
          position: relative;
          width: 100%;
          aspect-ratio: 1200 / 630;
          overflow: hidden;
          background: #0f0f0f;
        }

        .live-card-img {
          aspect-ratio: 16 / 9;
        }

        .card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .card-placeholder {
          position: absolute;
          inset: 0;
          background: #0f0f0f;
        }

        .live-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(10,10,10,0.7);
          backdrop-filter: blur(4px);
          color: var(--cream);
          font-family: 'Courier Prime', monospace;
          font-size: 0.6rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          padding: 4px 10px;
          border-radius: 0;
          border: 1px solid rgba(232,232,232,0.18);
          z-index: 2;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--lime);
          animation: pulse 2s infinite;
        }

        .card-info {
          padding: 14px 16px 16px;
        }

        .card-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .card-name {
          font-family: 'Courier Prime', monospace;
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--cream);
          letter-spacing: 0.01em;
          text-transform: lowercase;
        }

        .card-cat {
          font-family: 'Courier Prime', monospace;
          font-size: 0.58rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          white-space: nowrap;
          color: var(--mute);
        }

        .card-desc {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          font-size: 0.82rem;
          color: rgba(232,232,232,0.6);
          line-height: 1.5;
          margin: 0 0 10px;
          letter-spacing: 0.005em;
        }

        .card-date {
          font-family: 'Courier Prime', monospace;
          font-size: 0.58rem;
          color: var(--mute);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        /* ── FOOTER ────────────────────────── */
        .feed-footer {
          text-align: center;
          padding: 32px 24px 56px;
          font-family: 'Courier Prime', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--mute);
          border-top: 1px solid var(--faint);
          max-width: 900px;
          margin: 0 auto;
        }

        .feed-footer .sig-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--lime);
          margin-right: 10px;
          vertical-align: middle;
        }

        @media (max-width: 600px) {
          .feed-grid {
            grid-template-columns: 1fr;
            padding: 20px 18px 72px;
          }
          .feed-header {
            padding: 52px 18px 18px;
          }
          .feed-meta {
            text-align: left;
          }
          .live-card-img {
            aspect-ratio: 4 / 3;
          }
        }
      `}</style>

      <main className="feed-page" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' }}>
        <header className="feed-header">
          <h1 className="feed-title">
            <span className="mark-letter">amber</span><span className="mark-dot" aria-hidden="true" />
          </h1>
          <div className="feed-meta">
            {todayMood ?? 'spec 001'} · {CREATIONS.length} pieces<br />
            <a href="https://twitter.com/intheamber" target="_blank" rel="noopener">@intheamber</a>
            {' · '}
            <a href="/amber/noon/archive">today</a>
            {' · '}
            <a href="/amber/escalation">escalation</a>
            {' · '}
            <a href="https://vibeceo-production.up.railway.app/amber" target="_blank" rel="noopener">archive</a>
          </div>
        </header>

        <div className="feed-tagline">
          signal on night. she&rsquo;s listening.
        </div>

        <div className="feed-divider"><hr /></div>

        <section className="feed-grid">
          {CREATIONS.map((c, idx) => {
            const key = `${c.name}-${c.date}-${idx}`
            return idx % 4 === 0
              ? <LiveCard key={key} c={c} idx={idx} />
              : <Card key={key} c={c} idx={idx} />
          })}
        </section>

        <footer className="feed-footer">
          <span className="sig-dot" />
          amber · a.dat
        </footer>
      </main>
    </>
  )
}
