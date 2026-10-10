'use client'

import { useRef, useState, type CSSProperties } from 'react'

// The avatar sheet: everyone a person can be in Dodo — the dodo in its eight
// colours and the fifteen critters who live along the Peck trail. The art is
// the drawing code in misc/dodo-redesign (jelly-dodos.html, jelly-critters.html),
// rendered to public/dodo/jelly/ by scripts/dodo-jelly/web.mjs: a still and a
// squish frame each, 512 and 1024 px. Tap one and it squishes, like on the map.
// Names and colours mirror JellyCritter in apps/feynd/Feynd/JellyAvatar.swift.

type Jelly = { id: string; name: string; tint: string; color: string }

const JELLIES: Jelly[] = [
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

const SIZES = '(min-width: 640px) 108px, 22vw'
const src = (id: string, squish = false) => {
  const base = `/dodo/jelly/${id}${squish ? '-squish' : ''}`
  return { src: `${base}.webp`, srcSet: `${base}.webp 512w, ${base}@2x.webp 1024w` }
}

export default function DodoCritters() {
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
          >
            <span className="dj-disc">
              <span className="dj-stack">
                <img className="dj-img" {...src(j.id)} sizes={SIZES} alt="" loading="lazy" decoding="async" draggable={false} />
                <img className="dj-img dj-squish" {...src(j.id, true)} sizes={SIZES} alt="" loading="lazy" decoding="async" draggable={false} aria-hidden />
              </span>
            </span>
            <span className="dj-name">{j.name}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
