'use client'
// What the four minigames share: a frame loop, and the little drawings they
// throw around (Cyriel's luggage, a duck, a cone).
import { useEffect, useReducer, useRef } from 'react'

/**
 * Calls step(dt, t) every animation frame (t: seconds since the game began)
 * and redraws after each. Stops for good once step returns true.
 */
export function useLoop(step: (dt: number, t: number) => boolean | void) {
  const ref = useRef(step)
  ref.current = step
  const [, draw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let id = 0
    const t0 = performance.now()
    let last = t0
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const stop = ref.current(dt, (now - t0) / 1000)
      draw()
      if (!stop) id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [])
}

/** Arena units are percent of its width (x) and height (y). */
export const pos = (x: number, y: number): React.CSSProperties => ({ left: `${x}%`, top: `${y}%` })

const INK = '#2b1a12'
export type ThingKind = 'passport' | 'toothbrush' | 'socks' | 'chisel' | 'umbrella' | 'box'

/** Cyriel's luggage, one thing at a time. */
export function Thing({ k }: { k: ThingKind }) {
  const o = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" className="thing" aria-hidden>
      {k === 'passport' && (
        <>
          <rect x="5" y="3" width="14" height="18" rx="1.5" fill="#7a1f2a" {...o} />
          <circle cx="12" cy="11" r="3.2" fill="none" stroke="#e8c15a" strokeWidth="1.4" />
          <path d="M8.5 17h7" stroke="#e8c15a" strokeWidth="1.2" />
        </>
      )}
      {k === 'toothbrush' && (
        <>
          <rect x="10.5" y="2" width="3" height="20" rx="1.5" fill="#4fb3a9" {...o} transform="rotate(30 12 12)" />
          <rect x="9" y="1" width="6" height="5" rx="1" fill="#fffdf6" {...o} transform="rotate(30 12 12)" />
        </>
      )}
      {k === 'socks' && <path d="M8 2h6v10l5 4c2 2 0 6-3 5l-7-4c-1-1-1-2-1-3z" fill="#c8323c" {...o} />}
      {k === 'chisel' && (
        <>
          <rect x="10" y="2" width="5" height="11" rx="1.5" fill="#a8652e" {...o} transform="rotate(-25 12 12)" />
          <path d="M11 13h3v7l-1.5 2-1.5-2z" fill="#c9ced3" {...o} transform="rotate(-25 12 12)" />
        </>
      )}
      {k === 'umbrella' && (
        <>
          <path d="M3 11a9 8 0 0 1 18 0z" fill="#3f6fb0" {...o} />
          <path d="M12 11v8a2 2 0 0 1-4 0" fill="none" {...o} />
        </>
      )}
      {k === 'box' && (
        <>
          <rect x="4" y="5" width="16" height="14" rx="1.5" fill="#cfa063" {...o} />
          <path d="M4 10h16M10 5v14" stroke="#8d5c3b" strokeWidth="1.2" />
        </>
      )}
    </svg>
  )
}

export function Duck() {
  return (
    <svg viewBox="0 0 40 34" className="duck" aria-hidden>
      <path d="M6 20c0-7 8-9 14-7 3-8 14-8 15 0 1 4-2 6-4 7 3 6-2 12-12 12S6 28 6 20z" fill="#fffdf6" stroke={INK} strokeWidth="2.2" />
      <path d="M34 11l6 2-6 2z" fill="#f2a33a" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="29" cy="10" r="1.6" fill={INK} />
      <path d="M12 21c4 3 9 3 12 0" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Cone() {
  return (
    <svg viewBox="0 0 30 30" className="cone" aria-hidden>
      <rect x="3" y="23" width="24" height="5" rx="1.5" fill="#e8592a" stroke={INK} strokeWidth="1.8" />
      <path d="M11 4h8l5 19H6z" fill="#f47a3a" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.5 11h11M8 17h14" stroke="#fffdf6" strokeWidth="3" />
    </svg>
  )
}

/** Seconds left, as a bar that runs down. */
export function Clock({ left, of }: { left: number; of: number }) {
  return (
    <span className="clock" aria-hidden>
      <i style={{ width: `${Math.max(0, Math.min(1, left / of)) * 100}%` }} />
    </span>
  )
}
