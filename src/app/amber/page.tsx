'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'

import CREATIONS from './creations.json'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

interface Creation {
  name: string
  url: string
  date: string
  category: string
  description: string
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
  return Math.abs(h)
}

function Card({ c, idx }: { c: Creation; idx: number }) {
  const [loaded, setLoaded] = useState(false)
  const accent = CITRUS[hash(c.name) % CITRUS.length]
  const ogUrl = `${c.url}/opengraph-image.png`

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
          loading="lazy"
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
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
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
