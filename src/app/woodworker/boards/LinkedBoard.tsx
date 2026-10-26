'use client'
// Room 4: the cutlery rack. Drag a tray a notch left or right (or pick one
// with ↑↓ and pull with ←→). The strings on the left say who drags whom: an
// arrow from a tray to another means pulling the first drags the second the
// same way; one with a pulley wheel drags it the opposite way.
import { useEffect, useRef, useState } from 'react'
import { pull, spoonDepth, type LinkedLevel, type LinkedMove, type LinkedState } from '../lib/linked'
import { knock, thunk, unlock } from '../sfx'
import { cellOf, grain } from './look'
import { Goal, Mark } from './parts'
import type { BoardProps } from './types'

export default function LinkedBoard({ room, data, state, hint, won, move }: BoardProps<LinkedLevel, LinkedState, LinkedMove>) {
  const rack = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState(0)
  const [stuck, setStuck] = useState<{ tray: number; dir: number; n: number } | null>(null)
  const [moving, setMoving] = useState<number[] | null>(null)
  const drag = useRef<{ tray: number; x: number; c: number; done: number } | null>(null)
  const depth = spoonDepth(data, state)
  const n = data.trays.length
  const cols = data.cols

  const tug = (tray: number, d: 1 | -1) => {
    if (won) return false
    unlock()
    setSel(tray)
    const p = pull(data, state, { tray, d })
    if (p.state && move({ tray, d })) {
      knock(p.delta.filter(Boolean).length)
      setMoving(p.delta)
      setTimeout(() => setMoving(null), 260)
      return true
    }
    thunk()
    setStuck({ tray: p.stuck ?? tray, dir: d, n: Date.now() })
    setTimeout(() => setStuck(null), 600)
    return false
  }

  // Dragging: every half cell past the last notch tries one more notch.
  const down = (e: React.PointerEvent, tray: number) => {
    if (won) return
    unlock()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { tray, x: e.clientX, c: cellOf(rack.current, cols), done: 0 }
    setSel(tray)
  }
  const moveP = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const want = Math.round((e.clientX - d.x) / d.c)
    if (want === d.done) return
    const step = want > d.done ? 1 : -1
    if (tug(d.tray, step)) d.done += step
    else d.x += (want - d.done) * d.c // stuck: take up the slack so it doesn't keep knocking
  }
  const up = () => (drag.current = null)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!rack.current?.contains(document.activeElement)) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (sel + (e.key === 'ArrowUp' ? n - 1 : 1)) % n
        setSel(next)
        rack.current.querySelectorAll<HTMLElement>('.tray')[next]?.focus()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        tug(sel, e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  // String lanes on the left, one per link, LANE cells wide each.
  const lanes = data.links.length
  const LANE = 0.42
  const W = (lanes + 0.6) * LANE
  return (
    <div className="stage linked-stage" style={{ '--lanes': lanes, '--cols': cols, '--rows': n } as React.CSSProperties}>
      <div className="frame cabinet">
        <div className="rack-wrap">
          <svg className="strings" viewBox={`0 0 ${W} ${n}`} aria-hidden>
            {data.links.map((l, j) => {
              const x = (j + 0.5) * LANE
              const ya = l.a + 0.5, yb = l.b + 0.5
              const live = moving && moving[l.a] !== 0 && moving[l.b] !== 0
              return (
                <g key={j} className={`string${live ? ' live' : ''}${l.k < 0 ? ' pulley' : ''}`}>
                  <path d={`M${W} ${ya} H${x} V${yb} H${W - 0.1}`} />
                  <circle cx={x} cy={ya} r={0.07} className="knot" />
                  <path d={`M${W - 0.16} ${yb - 0.11} L${W - 0.02} ${yb} L${W - 0.16} ${yb + 0.11}`} className="head" />
                  {l.k < 0 && <circle cx={x} cy={(ya + yb) / 2} r={0.15} className="wheel" />}
                </g>
              )
            })}
          </svg>
          <div className="rack-col">
          <div className="rack" ref={rack} role="group" aria-label="The cutlery rack. Drag trays left and right.">
            <div className="shaft" style={{ '--x': data.shaft } as React.CSSProperties} />
            <span className={`spoon${won ? ' gone' : ''}`} style={{ '--x': data.shaft, '--d': depth } as React.CSSProperties} aria-hidden>
              {!won && <Mark />}
            </span>
            {data.trays.map((t, i) => {
              const g = grain(room, i + 2)
              const lit = stuck?.tray === i
              const h = hint && hint.tray === i ? hint : null
              return (
                <div key={i} className="row" style={{ '--y': i } as React.CSSProperties}>
                  <span className="groove" style={{ '--lo': t.lo, '--hi': t.hi } as React.CSSProperties} />
                  <button
                    type="button"
                    className={`tray${sel === i ? ' sel' : ''}${lit ? ' stuck' : ''}${moving && moving[i] ? ' pulled' : ''}`}
                    style={{ ...g.style, '--hole': state[i], '--lo': t.lo } as React.CSSProperties}
                    aria-label={`${t.label} tray, hole at column ${state[i] + 1}. Left and right arrows pull it.`}
                    onPointerDown={(e) => down(e, i)}
                    onPointerMove={moveP}
                    onPointerUp={up}
                    onPointerCancel={up}
                    onFocus={() => setSel(i)}
                  >
                    <span className="handle l" />
                    <span className={`lbl ${state[i] >= cols / 2 ? 'before' : 'after'}`} style={{ '--at': state[i] } as React.CSSProperties}>{t.label}</span>
                    <span className={`hole${state[i] === data.shaft ? ' aligned' : ''}`} />
                    <span className="handle r" />
                  </button>
                  {h && <span className="hint" style={{ left: `calc(var(--c) * ${state[i] + 0.5})`, top: '50%', transform: `rotate(${h.d > 0 ? 0 : 180}deg)` }} />}
                </div>
              )
            })}
          </div>
        <div className={`porridge${won ? ' on' : ''}`} style={{ '--x': data.shaft } as React.CSSProperties} aria-hidden>
          {!won && <Goal round style={{ left: `calc(var(--c) * ${data.shaft - 0.2})`, top: '2px', width: 'calc(var(--c) * 1.4)', height: 'calc(var(--c) * .66)' }} flag="right" />}
          <svg viewBox="0 0 60 40">
            <path d="M4 12 h52 a26 24 0 0 1 -52 0z" fill="#e8dcc0" />
            <ellipse cx="30" cy="12" rx="26" ry="5" fill="#f4ecd4" />
            <ellipse cx="30" cy="12" rx="22" ry="3.4" fill="#d9c79c" />
            <circle className="berry" cx="24" cy="11" r="2.2" fill="#8a2f4a" />
            <circle className="berry" cx="34" cy="12" r="2" fill="#5a2a6a" />
          </svg>
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}
