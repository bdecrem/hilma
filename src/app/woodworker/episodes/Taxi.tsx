'use client'
// Taxi: Cyriel's taxi to the airport loops round the block and won't stop.
// Tap to throw the next thing from the doorstep; it always lands on the chalk
// X, FLIGHT seconds later, so the skill is leading the taxi.
import { useCallback, useEffect, useRef } from 'react'
import type { Result } from '../lib/episodes'
import { knock, thunk, unlock, whoosh } from '../sfx'
import { Thing, pos, useLoop, type ThingKind } from './loop'

export const LAND = 64
export const FLIGHT = 0.8
const FROM: [number, number] = [14, 46]
const ROOF = 68
const ROAD = 89
const KINDS: ThingKind[] = ['passport', 'toothbrush', 'socks', 'chisel', 'umbrella', 'box']

interface World {
  t: number
  taxi: { x: number; v: number; pass: number }
  flying: { k: ThingKind; t0: number } | null
  next: number
  rack: { k: ThingKind; off: number }[]
  road: { k: ThingKind; x: number }[]
  end: number | null
}

export default function Taxi({ onDone }: { onDone(r: Result): void }) {
  const w = useRef<World>({ t: 0, taxi: { x: -20, v: 30, pass: 0 }, flying: null, next: 0, rack: [], road: [], end: null }).current

  useLoop((dt, t) => {
    w.t = t
    const c = w.taxi
    c.x += c.v * dt
    if (c.x > 125) {
      c.pass++
      c.x = -25
      c.v = 26 + Math.random() * 20 + c.pass * 5
    }
    const f = w.flying
    if (f && t - f.t0 >= FLIGHT) {
      w.flying = null
      const off = LAND - c.x
      if (Math.abs(off) < 10) {
        w.rack.push({ k: f.k, off })
        knock(1)
      } else {
        w.road.push({ k: f.k, x: LAND + (Math.random() - 0.5) * 8 })
        thunk()
      }
      if (w.next === KINDS.length) w.end = t + 1.1
    }
    if (w.end !== null && t >= w.end) {
      const n = w.rack.length
      onDone({ score: n, max: KINDS.length, label: `${n} of ${KINDS.length} on the taxi` })
      return true
    }
  })

  const toss = useCallback(() => {
    unlock()
    if (w.flying || w.next >= KINDS.length || w.t < 0.6) return
    w.flying = { k: KINDS[w.next++], t0: w.t }
    whoosh()
  }, [w])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      toss()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [toss])

  const f = w.flying
  const p = f ? Math.min(1, (w.t - f.t0) / FLIGHT) : 0
  const fx = FROM[0] + (LAND - FROM[0]) * p
  const fy = FROM[1] + (ROOF - FROM[1]) * p - 34 * 4 * p * (1 - p)
  return (
    <div className="arena taxi-game" onPointerDown={toss} role="application" aria-label="Tap to throw">
      <div className="hud">
        <span>On the taxi: {w.rack.length}</span>
        <span className="left">
          {KINDS.slice(w.next).map((k) => (
            <Thing key={k} k={k} />
          ))}
        </span>
      </div>
      <div className="house" />
      <div className="kerb" />
      <svg className="aim" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d={`M${FROM[0]} ${FROM[1]} Q${(FROM[0] + LAND) / 2} ${FROM[1] - 60} ${LAND} ${ROOF}`} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="x-mark" style={pos(LAND, ROAD)} />
      <div className="cab" style={pos(w.taxi.x, ROOF - 3)}>
        <svg viewBox="0 0 120 56" aria-hidden>
          <rect x="44" y="0" width="30" height="9" rx="2" fill="#ffd84a" stroke="#2b1a12" strokeWidth="2.5" />
          <path d="M12 26l14-16h56l16 16h12c4 0 6 3 6 6v12H4V32c0-3 3-6 8-6z" fill="#f4ecd4" stroke="#2b1a12" strokeWidth="3" strokeLinejoin="round" />
          <path d="M30 13h22v13H20zM58 13h22l11 13H58z" fill="#3c5a6b" stroke="#2b1a12" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M4 36h112" stroke="#c8323c" strokeWidth="5" />
          <circle cx="28" cy="46" r="8" fill="#2b1a12" />
          <circle cx="92" cy="46" r="8" fill="#2b1a12" />
          <circle cx="28" cy="46" r="3" fill="#9ea2a6" />
          <circle cx="92" cy="46" r="3" fill="#9ea2a6" />
        </svg>
        {w.rack.map((r, i) => (
          <span key={i} className="riding" style={{ left: `calc(50% + ${r.off * 3.3}%)`, bottom: `${78 + (i % 3) * 14}%` }}>
            <Thing k={r.k} />
          </span>
        ))}
      </div>
      {w.road.map((r, i) => (
        <span key={i} className="flung landed" style={pos(r.x, ROAD - 2)}>
          <Thing k={r.k} />
        </span>
      ))}
      {f && (
        <span className="flung" style={{ ...pos(fx, fy), rotate: `${p * 540}deg` }}>
          <Thing k={f.k} />
        </span>
      )}
    </div>
  )
}
