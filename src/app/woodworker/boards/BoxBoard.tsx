'use client'
// Room 5: the biscuit tin, a himitsu-bako laid out flat: the lid in the
// middle, the four sides folded down around it. Drag a panel along its slot
// (or focus it and use the arrows). When a hidden pin catches, the panel that
// holds the pin glows for a moment, which is all the box will tell you.
import { useRef, useState } from 'react'
import { STOPS, boxBlocker, type BoxLevel, type BoxMove, type BoxState } from '../lib/box'
import { click, thunk, unlock } from '../sfx'
import { grain } from './look'
import { Mark, useBump } from './parts'
import type { BoardProps } from './types'

/** Each panel's slot axis and which way +1 goes on screen. */
const AXIS: { axis: 'x' | 'y'; sign: number; cls: string }[] = [
  { axis: 'x', sign: 1, cls: 'lid' },
  { axis: 'x', sign: -1, cls: 'north' },
  { axis: 'y', sign: 1, cls: 'east' },
  { axis: 'x', sign: 1, cls: 'south' },
  { axis: 'y', sign: -1, cls: 'west' },
]
const KEYS: Record<string, ['x' | 'y', number]> = { ArrowLeft: ['x', -1], ArrowRight: ['x', 1], ArrowUp: ['y', -1], ArrowDown: ['y', 1] }

export default function BoxBoard({ room, data, state, hint, won, move }: BoardProps<BoxLevel, BoxState, BoxMove>) {
  const [bumped, bump] = useBump()
  const [glow, setGlow] = useState<number | null>(null)
  const drag = useRef<{ panel: number; x: number; y: number; done: number } | null>(null)

  const nudge = (panel: number, d: 1 | -1) => {
    if (won) return false
    unlock()
    if (move({ panel, d })) {
      click()
      return true
    }
    thunk()
    bump(panel)
    const by = boxBlocker(data, state, { panel, d })
    if (by !== null && by >= 0) {
      setGlow(by)
      setTimeout(() => setGlow(null), 650)
    }
    return false
  }

  const down = (e: React.PointerEvent, panel: number) => {
    if (won) return
    unlock()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { panel, x: e.clientX, y: e.clientY, done: 0 }
  }
  const moveP = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const a = AXIS[d.panel]
    const raw = (a.axis === 'x' ? e.clientX - d.x : e.clientY - d.y) * a.sign
    const want = Math.trunc(raw / 22)
    if (want === d.done) return
    const step = want > d.done ? 1 : -1
    if (nudge(d.panel, step)) d.done += step
    else drag.current = null
  }
  const up = () => (drag.current = null)
  const key = (e: React.KeyboardEvent, panel: number) => {
    const k = KEYS[e.key]
    if (!k) return
    const a = AXIS[panel]
    if (k[0] !== a.axis) return
    e.preventDefault()
    nudge(panel, (k[1] * a.sign) as 1 | -1)
  }

  return (
    <div className="stage box-stage">
      <div className={`tin${won ? ' open' : ''}`} role="group" aria-label="The biscuit tin, unfolded: the lid in the middle, the four sides around it.">
        <div className="inside" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="biscuit" style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        {AXIS.map((a, i) => {
          const g = grain(room, i + 4)
          const h = hint && hint.panel === i ? hint : null
          const shift = state[i] * a.sign
          return (
            <button
              key={i}
              type="button"
              className={`bpanel ${a.cls}${bumped === i ? ` wobble-${a.axis}` : ''}${glow === i ? ' glow' : ''}`}
              style={{ ...g.style, '--s': shift } as React.CSSProperties}
              aria-label={`${data.labels[i]}, at notch ${state[i] + 1} of ${STOPS}. ${a.axis === 'x' ? 'Left and right' : 'Up and down'} arrows slide it.`}
              onPointerDown={(e) => down(e, i)}
              onPointerMove={moveP}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={(e) => key(e, i)}
            >
              <span className="inlay" />
              <span className="lbl">{data.labels[i]}</span>
              {i === 0 && !won && (
                <>
                  <Mark caret={false} />
                  <span className="flag lid-flag" aria-hidden>slides off this way →</span>
                </>
              )}
              <span className="notches" aria-hidden>
                {Array.from({ length: STOPS }, (_, k) => (
                  <i key={k} className={k === state[i] ? 'at' : ''} />
                ))}
              </span>
              {h && <span className="hint" style={{ transform: `rotate(${a.axis === 'x' ? (h.d * a.sign > 0 ? 0 : 180) : h.d * a.sign > 0 ? 90 : 270}deg)` }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
