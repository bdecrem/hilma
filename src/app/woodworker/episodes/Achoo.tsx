'use client'
// Achoo: Cyriel tosses and turns in bed with a cold. Every so often: ah…
// ah… CHOO, and a sneeze drops straight down from wherever their nose was.
// Slide the tissue box under it. Ten sneezes, each a little quicker.
import { useEffect, useRef } from 'react'
import type { Result } from '../lib/episodes'
import { pff, sneeze, thunk, unlock } from '../sfx'
import { pos, useLoop } from './loop'

export const SNEEZES = 10
const BOX_Y = 86
const HEAD_Y = 17

interface Drop {
  x: number
  y: number
  v: number
  /** Caught or splatted, and when. */
  out: 'caught' | 'splat' | null
  at: number
}
interface World {
  t: number
  head: { x: number; to: number; turn: number }
  box: number
  keys: number
  phase: 'wait' | 'ah'
  until: number
  done: number
  drops: Drop[]
  caught: number
  end: number | null
}

export default function Achoo({ onDone }: { onDone(r: Result): void }) {
  const arena = useRef<HTMLDivElement>(null)
  const w = useRef<World>({ t: 0, head: { x: 50, to: 50, turn: 0 }, box: 50, keys: 0, phase: 'wait', until: 1.2, done: 0, drops: [], caught: 0, end: null }).current

  useLoop((dt, t) => {
    w.t = t
    const k = w.done / SNEEZES
    const h = w.head
    if (t >= h.turn) {
      h.to = 14 + Math.random() * 72
      h.turn = t + 1.4 - k * 0.7 + Math.random() * 0.6
    }
    h.x += (h.to - h.x) * Math.min(1, dt * (1.6 + k * 2.4))
    w.box = Math.max(12, Math.min(88, w.box + w.keys * 130 * dt))
    if (w.end === null && t >= w.until) {
      if (w.phase === 'wait' && w.done < SNEEZES) {
        w.phase = 'ah'
        w.until = t + 0.75 - k * 0.25
      } else if (w.phase === 'ah') {
        sneeze()
        w.drops.push({ x: h.x, y: HEAD_Y + 6, v: 52 + k * 40, out: null, at: 0 })
        w.done++
        w.phase = 'wait'
        w.until = t + 0.9 - k * 0.45 + Math.random() * 0.4
      }
    }
    for (const d of w.drops) {
      if (d.out) continue
      d.y += d.v * dt
      if (d.y >= BOX_Y - 3) {
        d.out = Math.abs(d.x - w.box) < 13 ? 'caught' : 'splat'
        d.at = t
        if (d.out === 'caught') (w.caught++, pff())
        else thunk()
      }
    }
    w.drops = w.drops.filter((d) => !d.out || t - d.at < 0.6)
    if (w.end === null && w.done === SNEEZES && w.drops.every((d) => d.out)) w.end = t + 0.8
    if (w.end !== null && t >= w.end) {
      onDone({ score: w.caught, max: SNEEZES, label: `${w.caught} of ${SNEEZES} sneezes caught` })
      return true
    }
  })

  useEffect(() => {
    const held = new Set<string>()
    const set = () => (w.keys = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0))
    const dn = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      held.add(e.key)
      set()
    }
    const up = (e: KeyboardEvent) => (held.delete(e.key), set())
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => (window.removeEventListener('keydown', dn), window.removeEventListener('keyup', up))
  }, [w])

  const follow = (e: React.PointerEvent) => {
    const r = arena.current!.getBoundingClientRect()
    w.box = Math.max(12, Math.min(88, ((e.clientX - r.left) / r.width) * 100))
  }

  return (
    <div
      ref={arena}
      className="arena sickbed"
      role="application"
      aria-label="Move the tissue box under the sneezes"
      onPointerDown={(e) => (unlock(), (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId), follow(e))}
      onPointerMove={follow}
    >
      <div className="hud">
        <span>Caught: {w.caught} / {SNEEZES}</span>
        <span>{SNEEZES - w.done} to go</span>
      </div>
      <img className={`sniffly${w.phase === 'ah' ? ' ah' : ''}`} src="/woodworker/cyriel/head.svg" alt="" style={pos(w.head.x, HEAD_Y)} />
      <span className="red-nose" style={pos(w.head.x + 0.5, HEAD_Y + 4.9)} />
      {w.phase === 'ah' && (
        <span className="ah-bubble" style={pos(w.head.x, HEAD_Y - 9)}>
          ah… ah…
        </span>
      )}
      <div className="duvet" />
      {w.drops.map((d, i) => (
        <span key={i} className={`drop${d.out ? ` ${d.out}` : ''}`} style={pos(d.x, d.y)} />
      ))}
      <div className="tissues" style={pos(w.box, BOX_Y)}>
        <span className="pluck" />
      </div>
    </div>
  )
}
