'use client'
// Room 1: the espresso cupboard. Drag a piece along its length; it stops at
// whatever is in the way and snaps to the nearest cell when you let go.
import { useRef, useState } from 'react'
import { SIZE, slideRange, type SlideLevel, type SlideMove, type SlideState } from '../lib/slide'
import { knock, thunk, unlock } from '../sfx'
import { cellOf, grain } from './look'
import { Dust, Goal, Machine, Mark, useBump, useDust } from './parts'
import type { BoardProps } from './types'

export default function SlideBoard({ room, data, state, hint, won, move }: BoardProps<SlideLevel, SlideState, SlideMove>) {
  const board = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; x: number; y: number; c: number; lo: number; hi: number; off: number; bumped: boolean } | null>(null)
  const [dragOff, setDragOff] = useState<{ i: number; off: number } | null>(null)
  const [bumped, bump] = useBump()
  const [dust, puff] = useDust()

  const commit = (i: number, to: number) => {
    if (to === state[i]) return
    const p = data.pieces[i]
    if (move({ piece: i, to })) {
      knock(Math.abs(to - state[i]))
      const lead = to > state[i]
      const x = p.h ? (lead ? to + p.len : to) : p.line + 0.5
      const y = p.h ? p.line + 0.5 : lead ? to + p.len : to
      puff(x, y, p.h ? (lead ? 0 : 2) : lead ? 1 : 3)
    }
  }

  const down = (e: React.PointerEvent, i: number) => {
    if (won || (e.button !== undefined && e.button !== 0)) return
    unlock()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const [lo, hi] = slideRange(data, state, i)
    drag.current = { i, x: e.clientX, y: e.clientY, c: cellOf(board.current, SIZE), lo: lo - state[i], hi: hi - state[i], off: 0, bumped: false }
  }
  const moveP = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const raw = data.pieces[d.i].h ? e.clientX - d.x : e.clientY - d.y
    d.off = Math.max(d.lo * d.c, Math.min(d.hi * d.c, raw))
    if (!d.bumped && (raw < d.lo * d.c - d.c * 0.35 || raw > d.hi * d.c + d.c * 0.35)) {
      d.bumped = true
      thunk()
    }
    setDragOff({ i: d.i, off: d.off })
  }
  const up = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setDragOff(null)
    commit(d.i, state[d.i] + Math.round(d.off / d.c))
  }
  const key = (e: React.KeyboardEvent, i: number) => {
    if (won) return
    const p = data.pieces[i]
    const keys: Record<string, number> = p.h ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 }
    const d = keys[e.key]
    if (!d) return
    e.preventDefault()
    unlock()
    const [lo, hi] = slideRange(data, state, i)
    const to = state[i] + d
    if (to < lo || to > hi) (bump(i), thunk())
    else commit(i, to)
  }

  return (
    <div className="stage has-dest">
      <div className="frame">
        <div className="notch" style={{ top: `calc(var(--f) + var(--c) * ${data.exitRow} + 4px)` }} />
        <div className="board grid6" ref={board} role="group" aria-label="Cupboard wall. Slide pieces along their length.">
          <div className="exit-row" style={{ top: `calc(var(--c) * ${data.exitRow})` }} />
          {data.pieces.map((p, i) => {
            const g = grain(room, i)
            const x = p.h ? state[i] : p.line, y = p.h ? p.line : state[i]
            const off = dragOff?.i === i ? dragOff.off : 0
            const leaving = won && i === 0
            const h = hint && hint.piece === i ? hint : null
            return (
              <button
                key={i}
                type="button"
                className={`piece ${p.h ? 'h' : 'v'}${p.len === 3 ? ' long' : ''}${i === 0 ? ' target capsule' : ''}${dragOff?.i === i ? ' dragging' : ''}${bumped === i ? (p.h ? ' bump-a' : ' bump-b') : ''}`}
                style={{
                  ...(i === 0 ? {} : g.style),
                  '--x': x, '--y': y, '--w': p.h ? p.len : 1, '--h': p.h ? 1 : p.len,
                  transform: leaving ? 'translateX(calc(var(--c) * 1.6)) scale(.55)' : off ? (p.h ? `translateX(${off}px)` : `translateY(${off}px)`) : undefined,
                  opacity: leaving ? 0 : undefined,
                  transition: leaving ? 'transform .7s cubic-bezier(.5,0,.7,1), opacity .5s .35s' : undefined,
                } as React.CSSProperties}
                aria-label={`${p.label}, ${i === 0 ? 'the capsule you need' : p.h ? 'slides left and right' : 'slides up and down'}`}
                onPointerDown={(e) => down(e, i)}
                onPointerMove={moveP}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={(e) => key(e, i)}
              >
                {i !== 0 && <span className="panel" />}
                {i !== 0 && (p.len === 3 && p.h ? null : <span className="handle" />)}
                {i !== 0 && g.nail && <span className="nail" style={g.nail} />}
                <span className="lbl">{p.label}</span>
                {i === 0 && !won && <Mark />}
                {h && <span className="hint" style={{ transform: `rotate(${p.h ? (h.to > state[i] ? 0 : 180) : h.to > state[i] ? 90 : 270}deg)` }} />}
              </button>
            )
          })}
          <Dust dust={dust} />
        </div>
      </div>
      {!won && <Goal style={{ left: 'calc(var(--c) * 6 + var(--f) * 2 - 8px)', top: `calc(var(--f) + var(--c) * ${data.exitRow} - 4px)`, width: 'calc(var(--c) * 1.05)', height: 'calc(var(--c) + 8px)' }} />}
      <div className={`dest${won ? ' on' : ''}`} style={{ top: `calc(var(--f) + var(--c) * ${data.exitRow - 1})` }} aria-hidden>
        <Machine />
      </div>
    </div>
  )
}
