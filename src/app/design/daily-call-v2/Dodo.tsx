'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { clipFor, lineRuns, scenes, stillFor } from '@/app/dodo/scenes'

// "Dodo, for reference" on the Polly design package: the team's other app as
// the craft reference. The gallery taps through the real captures the Dodo
// site uses (scripts/dodo-scenes → public/dodo/scenes, the manifest's order
// and one-line captions); the jellies are every avatar a person can be in Dodo — the dodo
// in eight colours and fifteen critters — rendered at 1024 px from the art
// pages in misc/dodo-redesign by scripts/dodo-jelly/web.mjs into
// public/dodo/jelly (a still and a squish frame each). Names and colours
// mirror JellyCritter in apps/feynd/Feynd/JellyAvatar.swift.

/** One phone that taps through every screen, like the hero on dodo.foo. */
export function DodoGallery() {
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(true)
  const [seen, setSeen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const n = scenes.length
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    // advances only while on screen, until someone taps
    if (!auto || !seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setTimeout(() => setI((k) => (k + 1) % n), 3600)
    return () => window.clearTimeout(t)
  }, [i, auto, seen, n])
  const step = (d: number) => {
    setAuto(false)
    setI((k) => (k + d + n) % n)
  }
  const s = scenes[i]
  return (
    <div className="hf-gal" ref={box}>
      <button type="button" className="hf-gal-ph" onClick={() => step(1)} aria-label="Next screen">
        {scenes.map((sc, k) => {
          const clip = clipFor(sc)
          const cls = 'hf-gal-slide' + (k === i ? ' on' : '')
          return clip ? (
            k === i ? <video key={sc.id} className={cls} src={clip} poster={stillFor(sc)} muted loop autoPlay playsInline /> : null
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={sc.id} className={cls} src={stillFor(sc)} alt={k === i ? sc.tour : ''} loading={k < 2 ? 'eager' : 'lazy'} decoding="async" />
          )
        })}
      </button>
      <div className="hf-gal-line">
        {lineRuns(s.line).map((r, k) => (r.em ? <em key={k}>{r.text}</em> : <span key={k}>{r.text}</span>))}
      </div>
      <div className="hf-gal-nav">
        <button type="button" onClick={() => step(-1)} aria-label="Previous screen">←</button>
        <span>
          {i + 1} / {n}
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Next screen">→</button>
      </div>
    </div>
  )
}

type Jelly = { id: string; name: string; tint: string; color: string }

export const JELLIES: Jelly[] = [
  { id: 'dodo', name: 'Sky dodo', tint: '#DCF6FF', color: '#5EC6EC' },
  { id: 'dodo-pink', name: 'Pink dodo', tint: '#FFE0EF', color: '#FF9FC8' },
  { id: 'dodo-peach', name: 'Peach dodo', tint: '#FFE6CF', color: '#FFAA82' },
  { id: 'dodo-mint', name: 'Mint dodo', tint: '#E2FFF4', color: '#91E9CC' },
  { id: 'dodo-lemon', name: 'Lemon dodo', tint: '#FFF8C8', color: '#FFD43A' },
  { id: 'dodo-grape', name: 'Grape dodo', tint: '#EFE2FF', color: '#A77BF2' },
  { id: 'dodo-cherry', name: 'Cherry dodo', tint: '#FFD9D7', color: '#FF6B70' },
  { id: 'dodo-lime', name: 'Lime dodo', tint: '#EFFFD0', color: '#A3E45C' },
  { id: 'bunny', name: 'Bunny', tint: '#FFE0EF', color: '#FF9FC8' },
  { id: 'peach', name: 'Peach', tint: '#FFE6CF', color: '#FFAA82' },
  { id: 'cat', name: 'Cat', tint: '#E2FFF4', color: '#91E9CC' },
  { id: 'dragon', name: 'Dragon', tint: '#C8F7D6', color: '#5FBF86' },
  { id: 'gummy', name: 'Gummy', tint: '#FFD6E6', color: '#FF3C86' },
  { id: 'penguin', name: 'Penguin', tint: '#E4E4EE', color: '#6C6C7C' },
  { id: 'octo', name: 'Octo', tint: '#FFD9D7', color: '#FF6B70' },
  { id: 'panda', name: 'Red panda', tint: '#FFE2CB', color: '#DA642C' },
  { id: 'blob', name: 'Blob', tint: '#FFE7DC', color: '#FFAC8E' },
  { id: 'hamster', name: 'Hamster', tint: '#FFF0D2', color: '#FFBE62' },
  { id: 'bat', name: 'Bat', tint: '#EFE2FF', color: '#A77BF2' },
  { id: 'bee', name: 'Bee', tint: '#FFF8C8', color: '#FFD43A' },
  { id: 'cloud', name: 'Cloud', tint: '#EAF4FF', color: '#A6C8F2' },
  { id: 'mushroom', name: 'Mushroom', tint: '#FFF2E6', color: '#E2B88A' },
  { id: 'sprite', name: 'Sprite', tint: '#E4FFF7', color: '#62CFB5' },
]

const SIZES = '64px'
const src = (id: string, squish = false) => {
  const base = `/dodo/jelly/${id}${squish ? '-squish' : ''}`
  return { src: `${base}.webp`, srcSet: `${base}.webp 512w, ${base}@2x.webp 1024w` }
}

/** The avatar sheet. Tap a jelly and it squishes, like a critter on the Peck map. */
export function Jellies() {
  const [down, setDown] = useState<string | null>(null)
  const timer = useRef(0)
  const squish = (id: string) => {
    setDown(id)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDown(null), 260)
  }
  return (
    <ul className="dj" aria-label="Every avatar in Dodo">
      {JELLIES.map((j) => (
        <li key={j.id}>
          <button
            type="button"
            className={'dj-cell' + (down === j.id ? ' is-squish' : '')}
            style={{ '--t': j.tint, '--c': j.color } as CSSProperties}
            onPointerDown={() => squish(j.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                squish(j.id)
              }
            }}
            aria-label={`${j.name}. Tap to squish.`}
            title={j.name}
          >
            <span className="dj-disc">
              <span className="dj-stack">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="dj-img" {...src(j.id)} sizes={SIZES} alt="" loading="lazy" decoding="async" draggable={false} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="dj-img dj-squish" {...src(j.id, true)} sizes={SIZES} alt="" loading="lazy" decoding="async" draggable={false} aria-hidden />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
