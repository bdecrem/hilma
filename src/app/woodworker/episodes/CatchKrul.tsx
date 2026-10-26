'use client'
// Catch Krul: the puppy is loose in the park. He pops up behind a hedge for a
// moment; tap him (a boop) and he tires a little. Eight boops and he comes
// home. Ducks pop up too, and booping a duck costs you one.
import { useRef } from 'react'
import { Krul } from '../boards/Cyriel'
import type { Result } from '../lib/episodes'
import { quack, unlock, yip } from '../sfx'
import { Clock, Duck, pos, useLoop } from './loop'

export const BOOPS = 8
export const TIME = 24
const HOLES: [number, number][] = [20, 50, 80].flatMap((y) => [18, 50, 82].map((x) => [x, y + 8] as [number, number]))

interface Pop {
  id: number
  hole: number
  duck: boolean
  t0: number
  life: number
  /** When it was tapped. */
  hit: number | null
}
interface World {
  t: number
  pops: Pop[]
  next: number
  id: number
  boops: number
  oops: number | null
  end: number | null
}

export default function CatchKrul({ onDone }: { onDone(r: Result): void }) {
  const w = useRef<World>({ t: 0, pops: [], next: 1, id: 0, boops: 0, oops: null, end: null }).current

  useLoop((_, t) => {
    w.t = t
    // A pop goes once its time is up, or a moment after it was tapped.
    w.pops = w.pops.filter((p) => (p.hit === null ? t < p.t0 + p.life : t - p.hit < 0.35))
    if (w.end === null && t >= w.next) {
      const k = t / TIME
      const free = HOLES.map((_, i) => i).filter((i) => !w.pops.some((p) => p.hole === i))
      const hole = free[Math.floor(Math.random() * free.length)]
      w.pops.push({ id: w.id++, hole, duck: Math.random() < 0.3, t0: t, life: 1.15 - k * 0.45, hit: null })
      w.next = t + 0.8 - k * 0.35 + Math.random() * 0.2
    }
    if (w.end === null && (w.boops >= BOOPS || t >= TIME)) w.end = t + 0.9
    if (w.end !== null && t >= w.end) {
      onDone({ score: w.boops, max: BOOPS, label: w.boops >= BOOPS ? 'Krul is worn out' : `${w.boops} of ${BOOPS} boops` })
      return true
    }
  })

  const boop = (p: Pop) => {
    unlock()
    if (p.hit !== null || w.end !== null) return
    p.hit = w.t
    if (p.duck) {
      quack()
      w.boops = Math.max(0, w.boops - 1)
      w.oops = w.t
    } else {
      yip()
      w.boops++
    }
  }

  return (
    <div className={`arena park${w.oops !== null && w.t - w.oops < 0.4 ? ' oops' : ''}`} role="application" aria-label="Tap Krul, not the ducks">
      <div className="hud">
        <span>Boops: {w.boops} / {BOOPS}</span>
        <Clock left={TIME - w.t} of={TIME} />
      </div>
      {HOLES.map(([x, y], i) => {
        const p = w.pops.find((q) => q.hole === i)
        // Up over the first fifth of its life, down over the last.
        const age = p ? (w.t - p.t0) / p.life : 0
        const up = p ? (p.hit !== null ? 1 : Math.min(1, age * 5, (1 - age) * 5)) : 0
        return (
          <div key={i} className="hole" style={pos(x, y)}>
            {p && (
              <button
                type="button"
                className={`pop ${p.duck ? 'is-duck' : 'is-krul'}${p.hit !== null ? ' booped' : ''}`}
                style={{ translate: `-50% ${(1 - up) * 70}%` }}
                aria-label={p.duck ? 'A duck' : 'Krul'}
                onPointerDown={(e) => (e.stopPropagation(), boop(p))}
              >
                {p.duck ? (
                  <Duck />
                ) : (
                  <svg viewBox="-24 -26 52 44" aria-hidden>
                    <Krul />
                  </svg>
                )}
              </button>
            )}
            <span className="hedge" />
          </div>
        )
      })}
    </div>
  )
}
