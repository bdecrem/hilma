'use client'
// Room 2: the fridge. Tap a door and it swings on its hinge (the dashed arc
// is the path it needs clear); drag the milk in a straight line.
import { useEffect, useRef, useState } from 'react'
import { SIZE, doorCells, milkTargets, swingBlocker, swingGrid, type SwingLevel, type SwingMove, type SwingState } from '../lib/swing'
import { creak, knock, thunk, unlock, yip } from '../sfx'
import { cellOf, grain } from './look'
import { Bowl, DogBowl, Dust, Goal, Mark, useBump, useDust } from './parts'
import type { BoardProps } from './types'

/** The angle of a door on each side, the second one reached by the short way round. */
function angles(d: SwingLevel['doors'][number]): [number, number] {
  const a = d.dirs[0] * 90
  return [a, a + (((d.dirs[1] - d.dirs[0] + 4) % 4) === 1 ? 90 : -90)]
}

export default function SwingBoard({ room, skin, item, data, state, hint, won, move }: BoardProps<SwingLevel, SwingState, SwingMove>) {
  const board = useRef<HTMLDivElement>(null)
  const [bumped, bump] = useBump()
  const [blame, setBlame] = useState<number | null>(null)
  const [dust, puff] = useDust()
  const drag = useRef<{ x: number; y: number; c: number; axis: 'x' | 'y' | null; lo: number; hi: number; off: number } | null>(null)
  const [off, setOff] = useState<{ axis: 'x' | 'y'; px: number } | null>(null)
  useEffect(() => {
    if (!won || skin !== 'treats') return
    const t = setTimeout(yip, 1300)
    return () => clearTimeout(t)
  }, [won, skin])
  const mx = state.milk % SIZE, my = Math.floor(state.milk / SIZE)

  const swing = (i: number) => {
    if (won) return
    unlock()
    if (move({ door: i })) {
      creak()
      return
    }
    thunk()
    bump(i)
    const by = swingBlocker(data, state, i)
    setBlame(by)
    setTimeout(() => setBlame(null), 700)
  }

  /** How far the milk can slide along one axis, in cells, each way. */
  const reach = (axis: 'x' | 'y'): [number, number] => {
    const t = milkTargets(data, state)
    let lo = 0, hi = 0
    for (const c of t) {
      const cx = c % SIZE, cy = Math.floor(c / SIZE)
      if (axis === 'x' && cy === my) (lo = Math.min(lo, cx - mx), hi = Math.max(hi, cx - mx))
      if (axis === 'y' && cx === mx) (lo = Math.min(lo, cy - my), hi = Math.max(hi, cy - my))
    }
    return [lo, hi]
  }
  const slideMilk = (dx: number, dy: number) => {
    if (!dx && !dy) return
    const to = (my + dy) * SIZE + mx + dx
    if (move({ milk: to })) {
      knock(Math.abs(dx + dy))
      puff(mx + 0.5 + dx + Math.sign(dx) * 0.5, my + 0.5 + dy + Math.sign(dy) * 0.5, dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3)
    } else thunk()
  }
  const down = (e: React.PointerEvent) => {
    if (won) return
    unlock()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, c: cellOf(board.current, SIZE), axis: null, lo: 0, hi: 0, off: 0 }
  }
  const moveP = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const rx = e.clientX - d.x, ry = e.clientY - d.y
    if (!d.axis) {
      if (Math.hypot(rx, ry) < 8) return
      d.axis = Math.abs(rx) > Math.abs(ry) ? 'x' : 'y'
      ;[d.lo, d.hi] = reach(d.axis)
    }
    const raw = d.axis === 'x' ? rx : ry
    d.off = Math.max(d.lo * d.c, Math.min(d.hi * d.c, raw))
    setOff({ axis: d.axis, px: d.off })
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    setOff(null)
    if (!d || !d.axis) return
    const n = Math.round(d.off / d.c)
    if (d.axis === 'x') slideMilk(n, 0)
    else slideMilk(0, n)
  }
  const milkKey = (e: React.KeyboardEvent) => {
    const k = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
    if (!k || won) return
    e.preventDefault()
    unlock()
    const [lo, hi] = reach(k[0] ? 'x' : 'y')
    const step = k[0] || k[1]
    if (step < lo || step > hi) (thunk(), bump(-3))
    else slideMilk(k[0], k[1])
  }

  const g = swingGrid(data, state)
  const milkHint = hint && 'milk' in hint ? hint.milk : null
  const leaving = won

  return (
    <div className="stage has-dest">
      <div className="frame fridge">
        <div className="notch" style={{ top: `calc(var(--f) + var(--c) * ${data.exit[1]} + 4px)` }} />
        <div className="board grid6 cold" ref={board} role="group" aria-label="The fridge. Tap doors to swing them, drag the milk.">
          <div className="exit-row" style={{ top: `calc(var(--c) * ${data.exit[1]})` }} />
          <svg className="arcs" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
            {data.doors.map((d, i) => {
              const [a0, a1] = angles(d)
              const r = d.len - 0.5
              const cx = d.hinge[0] + 0.5, cy = d.hinge[1] + 0.5
              const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]
              const [x0, y0] = p(a0), [x1, y1] = p(a1)
              const blocked = swingBlocker(data, state, i, g) !== null
              return <path key={i} className={blocked ? 'blocked' : ''} d={`M${x0} ${y0} A${r} ${r} 0 0 ${a1 > a0 ? 1 : 0} ${x1} ${y1}`} />
            })}
          </svg>
          {!won && <Goal style={{ left: `calc(var(--c) * ${data.exit[0]} + 3px)`, top: `calc(var(--c) * ${data.exit[1]} + 3px)`, width: 'calc(var(--c) - 6px)', height: 'calc(var(--c) - 6px)' }} />}
          {data.walls.map(([x, y], i) => (
            <span key={i} className="wall" style={{ '--x': x, '--y': y } as React.CSSProperties} />
          ))}
          {data.doors.map((d, i) => {
            const gr = grain(room, i + 1)
            const ang = angles(d)[state.doors[i]]
            const h = hint && 'door' in hint && hint.door === i
            return (
              <button
                key={i}
                type="button"
                className={`door${bumped === i ? ' wobble' : ''}${blame === i ? ' blame' : ''}${h ? ' hinted' : ''}`}
                style={{ ...gr.style, '--x': d.hinge[0], '--y': d.hinge[1], '--len': d.len, transform: `rotate(${ang}deg)` } as React.CSSProperties}
                aria-label={`${d.label} door, ${doorCells(d, state.doors[i]).length} cells long. Press to swing it.`}
                onClick={() => swing(i)}
              >
                <span className="plank">
                  <span className="lbl" style={{ transform: Math.cos((ang * Math.PI) / 180) < -0.1 ? 'rotate(180deg)' : undefined }}>{d.label}</span>
                  <span className="knob" />
                  {gr.nail && <span className="nail" style={{ left: gr.nail.left, top: '68%' }} />}
                </span>
                <span className="pin" />
              </button>
            )
          })}
          <button
            type="button"
            className={`milk${skin ? ` ${skin}` : ''}${off ? ' dragging' : ''}${bumped === -3 || blame === -3 ? ' wobble blame' : ''}`}
            style={{
              '--x': mx,
              '--y': my,
              transform: leaving ? 'translateX(calc(var(--c) * 1.6)) scale(.55)' : off ? (off.axis === 'x' ? `translateX(${off.px}px)` : `translateY(${off.px}px)`) : undefined,
              opacity: leaving ? 0 : undefined,
              transition: leaving ? 'transform .7s cubic-bezier(.5,0,.7,1), opacity .5s .35s' : undefined,
            } as React.CSSProperties}
            aria-label={`The ${item.toLowerCase()}. Drag it, or use the arrow keys.`}
            onPointerDown={down}
            onPointerMove={moveP}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={milkKey}
          >
            <span className="cap" />
            <span className="lbl">{item}</span>
            {!won && <Mark />}
          </button>
          {milkHint !== null && (
            <span className="ghost" style={{ '--x': milkHint % SIZE, '--y': Math.floor(milkHint / SIZE) } as React.CSSProperties} />
          )}
          <Dust dust={dust} />
        </div>
      </div>
      <div className={`dest ${skin === 'treats' ? 'dogbowl' : 'bowl'}${won ? ' on' : ''}`} style={{ top: `calc(var(--f) + var(--c) * ${data.exit[1] - 1})` }} aria-hidden>
        {skin === 'treats' ? <DogBowl /> : <Bowl />}
      </div>
    </div>
  )
}
