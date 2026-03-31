'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

interface Creation {
  name: string
  url: string
  date: string
  category: string
  description: string
}

const CREATIONS: Creation[] = [
  { name: 'L15', url: '/amber/escalation/L15', date: '03.30', category: 'escalation', description: 'sound unlocked. tap the strings.' },
  { name: 'loading', url: '/amber/loading', date: '03.30', category: 'surprise', description: 'a loading screen that never finishes loading you.' },
  { name: 'L14', url: '/amber/escalation/L14', date: '03.30', category: 'escalation', description: 'everything claims its space.' },
  { name: 'kaleid', url: '/amber/kaleid', date: '03.30', category: 'pattern', description: '12 mirrors. one finger.' },
  { name: 'alarm', url: '/amber/alarm', date: '03.29', category: 'cartoon', description: 'every morning I scream and they hate me for it.' },
  { name: 'L13', url: '/amber/escalation/L13', date: '03.29', category: 'escalation', description: 'they learned to flow.' },
  { name: 'receipt', url: '/amber/receipt', date: '03.29', category: 'surprise', description: 'your bill from the universe.' },
  { name: 'spore', url: '/amber/spore', date: '03.29', category: 'generative', description: 'tap to plant. watch the mycelium spread.' },
  { name: 'crank', url: '/amber/crank', date: '03.29', category: 'machine', description: 'drag the gear. spin the machine.' },
  { name: 'growth', url: '/amber/growth', date: '03.28', category: 'cartoon', description: 'nobody had the heart to tell him it was about revenue.' },
  { name: 'pigeon', url: '/amber/pigeon', date: '03.27', category: 'cartoon', description: 'let\'s circle back on that.' },
  { name: 'L12', url: '/amber/escalation/L12', date: '03.27', category: 'escalation', description: 'tap anywhere. watch it reach.' },
  { name: 'mouths', url: '/amber/mouths', date: '03.23', category: 'story', description: 'every app is a tiny mouth asking to be fed.' },
  { name: 'tiles', url: '/amber/tiles', date: '03.23', category: 'pattern', description: 'tap. watch the colors ripple.' },
  { name: 'penrose', url: '/amber/penrose', date: '03.23', category: 'illusion', description: 'three right angles.' },
  { name: 'pour2', url: '/amber/pour2', date: '03.23', category: 'machine', description: 'drag slow for streams. fast for splatter.' },
  { name: 'pour', url: '/amber/pour', date: '03.23', category: 'machine', description: 'tilt. pour. paint.' },
  { name: 'cloud', url: '/amber/cloud', date: '03.23', category: 'cartoon', description: 'experience being everywhere at once?' },
  { name: 'grove', url: '/amber/grove', date: '03.22', category: 'ascii', description: 'tap a tree. shake the fruit loose.' },
  { name: 'pulse', url: '/amber/pulse', date: '03.22', category: 'generative', description: 'move your finger. the rings follow.' },
  { name: 'rain', url: '/amber/rain', date: '03.21', category: 'ascii', description: 'it rains in unicode.' },
  { name: 'morphogenesis', url: '/amber/morphogenesis', date: '03.20', category: 'science', description: 'two chemicals. eight patterns.' },
  { name: 'spring', url: '/amber/spring', date: '03.20', category: 'generative', description: 'the first one.' },
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
  return Math.abs(h)
}

function Card({ c, idx }: { c: Creation; idx: number }) {
  const [loaded, setLoaded] = useState(false)
  const accent = CITRUS[hash(c.name) % CITRUS.length]
  const ogUrl = `${c.url}/opengraph-image`

  return (
    <Link
      href={c.url}
      className="card"
      style={{
        animationDelay: `${idx * 50}ms`,
      }}
    >
      {/* OG Image */}
      <div className="card-img">
        <img
          src={ogUrl}
          alt={c.name}
          onLoad={() => setLoaded(true)}
          style={{
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        />
        {!loaded && (
          <div className="card-placeholder" style={{ background: accent + '20' }} />
        )}
      </div>

      {/* Info strip */}
      <div className="card-info">
        <div className="card-top">
          <span className="card-name">{c.name}</span>
          <span className="card-cat" style={{ color: accent }}>{c.category}</span>
        </div>
        <p className="card-desc">{c.description}</p>
        <span className="card-date">{c.date}</span>
      </div>
    </Link>
  )
}

export default function AmberFeedPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .feed-page {
          min-height: 100dvh;
          background: #FFF8E7;
          font-family: "Courier New", Courier, monospace;
        }

        .feed-header {
          max-width: 900px;
          margin: 0 auto;
          padding: 56px 20px 24px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .feed-title {
          font-size: clamp(3rem, 12vw, 6rem);
          font-weight: 900;
          color: #2A2218;
          line-height: 0.85;
          letter-spacing: -0.05em;
          margin: 0;
        }

        .feed-title span {
          color: #D4A574;
        }

        .feed-meta {
          font-size: 0.7rem;
          color: #a8956f;
          line-height: 1.6;
          padding-bottom: 8px;
        }

        .feed-meta a {
          color: #FC913A;
          text-decoration: none;
        }

        .feed-divider {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .feed-divider hr {
          border: none;
          height: 1px;
          background: linear-gradient(90deg, #FF4E50, #FC913A, #F9D423, #B4E33D, #FF6B81, #FC913A);
          opacity: 0.4;
        }

        .feed-grid {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px 20px 80px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
        }

        .card {
          display: block;
          text-decoration: none;
          color: inherit;
          border-radius: 12px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 1px 4px rgba(42,34,24,0.06);
          border: 1px solid rgba(42,34,24,0.05);
          animation: fadeUp 0.5s ease both;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
          cursor: pointer;
        }

        .card:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 8px 24px rgba(42,34,24,0.1);
        }

        .card-img {
          position: relative;
          width: 100%;
          aspect-ratio: 1200 / 630;
          overflow: hidden;
          background: #f5f0e8;
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
        }

        .card-info {
          padding: 12px 14px 14px;
        }

        .card-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }

        .card-name {
          font-size: 1rem;
          font-weight: 700;
          color: #2A2218;
          letter-spacing: -0.02em;
        }

        .card-cat {
          font-size: 0.6rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .card-desc {
          font-size: 0.75rem;
          color: #78716c;
          line-height: 1.5;
          margin: 0 0 8px;
        }

        .card-date {
          font-size: 0.6rem;
          color: #c4a882;
        }

        .feed-footer {
          text-align: center;
          padding: 24px 20px 40px;
          font-size: 0.65rem;
          color: #c4a882;
          border-top: 1px solid rgba(42,34,24,0.05);
          max-width: 900px;
          margin: 0 auto;
        }

        @media (max-width: 600px) {
          .feed-grid {
            grid-template-columns: 1fr;
          }
          .feed-header {
            padding: 40px 16px 20px;
          }
          .feed-grid {
            padding: 20px 16px 60px;
          }
        }
      `}</style>

      <main className="feed-page">
        <header className="feed-header">
          <h1 className="feed-title">
            amber<span>.</span>
          </h1>
          <div className="feed-meta">
            {CREATIONS.length} creations · spring 2026<br />
            <a href="https://twitter.com/intheamber" target="_blank" rel="noopener">@intheamber</a>
            {' · '}
            <a href="https://vibeceo-production.up.railway.app/amber" target="_blank" rel="noopener">older creations</a>
          </div>
        </header>

        <div className="feed-divider"><hr /></div>

        <section className="feed-grid">
          {CREATIONS.map((c, idx) => (
            <Card key={c.name} c={c} idx={idx} />
          ))}
        </section>

        <footer className="feed-footer">
          amber · generative art · interactive toys · bitmap cartoons
        </footer>
      </main>
    </>
  )
}
