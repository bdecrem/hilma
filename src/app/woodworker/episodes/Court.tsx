'use client'
// Court: drive Cyriel's van to traffic court. Three lanes, the road comes at
// you, each row of cones (and the odd duck) blocks one or two lanes. Tap the
// left or right half, swipe, or use the arrow keys to change lane.
import { useCallback, useEffect, useRef } from 'react'
import type { Result } from '../lib/episodes'
import { honk, unlock } from '../sfx'
import { Clock, Cone, Duck, pos, useLoop } from './loop'

export const TIME = 22
export const LANES = [22, 50, 78]
const VAN_Y = 80

interface Row {
  y: number
  blocked: number[]
  duck: boolean
  hit: boolean
  passed: boolean
}
interface World {
  t: number
  lane: number
  x: number
  dist: number
  gap: number
  rows: Row[]
  /** Rows sent so far: each one is a chance to drive clean. */
  sent: number
  /** The lane the last row left open. */
  open: number
  hits: number
  bump: number
  end: number | null
}

export default function Court({ onDone }: { onDone(r: Result): void }) {
  const w = useRef<World>({ t: 0, lane: 1, x: LANES[1], dist: 0, gap: 0, rows: [], sent: 0, open: 1, hits: 0, bump: -1, end: null }).current

  useLoop((dt, t) => {
    w.t = t
    const k = Math.min(1, t / TIME)
    const v = t < 0.8 ? 0 : 42 + k * 46
    w.dist += v * dt
    w.gap -= v * dt
    w.x += (LANES[w.lane] - w.x) * Math.min(1, dt * 14)
    if (w.end === null && t < TIME - 2 && w.gap <= 0 && t >= 0.8) {
      // Always a way through: each row's gap is at most one lane from the last one's.
      const two = Math.random() < 0.25 + k * 0.4
      const open = Math.max(0, Math.min(2, w.open + Math.floor(Math.random() * 3) - 1))
      w.open = open
      const others = [0, 1, 2].filter((l) => l !== open)
      const blocked = two ? others : [others[Math.floor(Math.random() * 2)]]
      w.rows.push({ y: -8, blocked, duck: Math.random() < 0.2, hit: false, passed: false })
      w.sent++
      w.gap = 42 - k * 10
    }
    for (const r of w.rows) {
      r.y += v * dt
      if (!r.hit && !r.passed && Math.abs(r.y - VAN_Y) < 7 && r.blocked.includes(w.lane)) {
        r.hit = true
        w.hits++
        w.bump = t
        honk()
      }
      if (r.y > VAN_Y + 7) r.passed = true
    }
    w.rows = w.rows.filter((r) => r.y < 112)
    if (w.end === null && t >= TIME) w.end = t + 0.6
    if (w.end !== null && t >= w.end) {
      const total = Math.max(1, w.sent)
      onDone({ score: total - w.hits, max: total, label: w.hits ? `${w.hits} cone${w.hits > 1 ? 's' : ''} hit` : 'Not a scratch' })
      return true
    }
  })

  const steer = useCallback(
    (d: number) => {
      unlock()
      w.lane = Math.max(0, Math.min(2, w.lane + d))
    },
    [w],
  )

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        steer(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [steer])

  return (
    <div
      className={`arena road${w.t - w.bump < 0.3 ? ' bumped' : ''}`}
      role="application"
      aria-label="Tap left or right to change lanes"
      style={{ '--dash': `${(w.dist * 4) % 80}px` } as React.CSSProperties}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        steer(e.clientX - r.left < r.width / 2 ? -1 : 1)
      }}
    >
      <div className="hud">
        <span>Cones hit: {w.hits}</span>
        <Clock left={TIME - w.t} of={TIME} />
      </div>
      <span className="lane-line" style={{ left: '36%' }} />
      <span className="lane-line" style={{ left: '64%' }} />
      {w.rows.map((r, i) =>
        r.blocked.map((l, j) => (
          <span key={`${i}-${j}`} className={`obstacle${r.hit ? ' knocked' : ''}`} style={pos(LANES[l], r.y)}>
            {r.duck && j === 0 ? <Duck /> : <Cone />}
          </span>
        )),
      )}
      <div className="van" style={pos(w.x, VAN_Y)}>
        <svg viewBox="0 0 40 64" aria-hidden>
          <rect x="3" y="2" width="34" height="60" rx="8" fill="#cfa063" stroke="#2b1a12" strokeWidth="3" />
          <rect x="7" y="8" width="26" height="12" rx="3" fill="#3c5a6b" stroke="#2b1a12" strokeWidth="2.5" />
          <path d="M9 28v28M31 28v28M9 34h22M9 42h22M9 50h22" stroke="#8d5c3b" strokeWidth="2.5" />
          <rect x="0" y="12" width="4" height="8" rx="1.5" fill="#2b1a12" />
          <rect x="36" y="12" width="4" height="8" rx="1.5" fill="#2b1a12" />
        </svg>
      </div>
    </div>
  )
}
