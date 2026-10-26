'use client'
// Room 3: the breakfast counter. Tilt it (the arrows round the edge, a swipe,
// or the arrow keys) and everything loose rolls until it hits something.
import { useEffect, useRef, useState } from 'react'
import { SIZE, roll, type TiltLevel, type TiltMove, type TiltState } from '../lib/tilt'
import { crack, roll as rollSound, thunk, unlock } from '../sfx'
import { Goal, Mark } from './parts'
import type { BoardProps } from './types'

const ARROWS = [
  { dir: 0, label: 'Tilt right', cls: 'east' },
  { dir: 1, label: 'Tilt toward you', cls: 'south' },
  { dir: 2, label: 'Tilt left', cls: 'west' },
  { dir: 3, label: 'Tilt away', cls: 'north' },
]
const LEAN = ['rotateY(5deg)', 'rotateX(-5deg)', 'rotateY(-5deg)', 'rotateX(5deg)']
const KEYS: Record<string, number> = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 }

export default function TiltBoard({ skin, data, state, hint, won, move }: BoardProps<TiltLevel, TiltState, TiltMove>) {
  const [lean, setLean] = useState<number | null>(null)
  /** While an egg is going down a hole: where everything rolled to, before the room puts it back. */
  const [broken, setBroken] = useState<TiltState | null>(null)
  const [busy, setBusy] = useState(false)
  const [dur, setDur] = useState<number[]>(() => state.map(() => 0))
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [falls, setFalls] = useState<(number | null)[] | null>(null)
  const shown = (broken ?? state).map((c, i) => (c < 0 && falls?.[i] != null ? falls[i]! : c))

  const tilt = (dir: number) => {
    if (won || busy) return
    unlock()
    const r = roll(data, state, dir)
    const cells = Math.max(...r.path.map((p) => p.length - 1))
    if (!cells) {
      thunk()
      setLean(dir)
      setTimeout(() => setLean(null), 180)
      return
    }
    setDur(r.path.map((p) => (p.length - 1) * 0.085))
    setLean(dir)
    setBusy(true)
    rollSound(cells)
    if (r.eggBroke) {
      setBroken(r.state.map((c, i) => (c < 0 ? r.path[i][r.path[i].length - 1] : c)))
      setTimeout(data.rollers[0].kind === 'egg' ? crack : thunk, cells * 85)
      setTimeout(() => {
        setDur(state.map(() => 0))
        setBroken(null)
        setLean(null)
        setBusy(false)
      }, cells * 85 + 1100)
      return
    }
    move(dir)
    // Whatever went down a hole rolls to it first, then sinks.
    const fell = r.state.map((c, i) => (c < 0 && state[i] >= 0 ? r.path[i][r.path[i].length - 1] : null))
    if (fell.some((c) => c !== null)) {
      setFalls(fell)
      setTimeout(() => setFalls(null), cells * 85 + 700)
    }
    setTimeout(() => (setLean(null), setBusy(false)), cells * 85 + 120)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.key in KEYS) || (e.target as HTMLElement)?.closest?.('input,textarea,.scene,.win')) return
      e.preventDefault()
      tilt(KEYS[e.key])
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const fallen = (i: number) => shown[i] < 0
  const sunk = (i: number) => (broken || falls) && data.holes.some(([x, y]) => y * SIZE + x === shown[i])

  return (
    <div className="stage tilt-stage">
      {ARROWS.map((a) => (
        <button key={a.dir} type="button" className={`tilt-btn ${a.cls}${hint === a.dir ? ' hinted' : ''}`} aria-label={a.label} disabled={won} onClick={() => tilt(a.dir)}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
      <div className="tilt-tray" style={{ transform: lean !== null ? `perspective(700px) ${LEAN[lean]}` : undefined }}>
        <div className="frame counter">
          <div
            className="board grid6 butcher"
            role="group"
            aria-label="The counter. Tilt it with the arrow buttons or the arrow keys."
            onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
            onPointerUp={(e) => {
              const s = swipe.current
              swipe.current = null
              if (!s) return
              const dx = e.clientX - s.x, dy = e.clientY - s.y
              if (Math.hypot(dx, dy) < 24) return
              tilt(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3)
            }}
          >
            {data.holes.map(([x, y], i) => (
              <span key={`h${i}`} className="knothole" style={{ '--x': x, '--y': y } as React.CSSProperties} />
            ))}
            {data.nails.map(([x, y], i) => (
              <span key={`n${i}`} className="peg" style={{ '--x': x, '--y': y, '--r': `${(i * 47) % 60 - 30}deg` } as React.CSSProperties} />
            ))}
            {!won && <Goal round style={{ left: `calc(var(--c) * ${data.pan[0]} + 1px)`, top: `calc(var(--c) * ${data.pan[1]} + 1px)`, width: 'calc(var(--c) - 2px)', height: 'calc(var(--c) - 2px)' }} flag={data.pan[1] === 0 ? 'below' : 'top'} />}
            <span className={`pan${skin === 'mug' ? ' mug' : ''}${won ? ' on' : ''}`} style={{ '--x': data.pan[0], '--y': data.pan[1] } as React.CSSProperties}>
              <span className="handle-bar" />
            </span>
            {data.rollers.map((r, i) =>
              fallen(i) ? null : (
                <span
                  key={i}
                  className={`roller ${r.kind}${sunk(i) ? ' sunk' : ''}${i === 0 && won ? ' fried' : ''}${i === 0 && broken ? ' cracking' : ''}`}
                  style={{
                    '--x': shown[i] % SIZE,
                    '--y': Math.floor(shown[i] / SIZE),
                    transitionDuration: `${dur[i]}s`,
                    '--delay': `${dur[i]}s`,
                  } as React.CSSProperties}
                  aria-label={r.label}
                  role="img"
                >
                  {i === 0 && !won && !broken && <Mark />}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
