'use client'
// Pieces of the set shared by the rooms: sawdust, the bump wobble, the
// appliances at the exits, the hammers on the win card.
import { useCallback, useRef, useState } from 'react'
import { Krul } from './Cyriel'

/** Which piece is wobbling right now (a refused move), and the trigger. */
export function useBump(): [number | null, (i: number) => void] {
  const [b, setB] = useState<{ i: number; n: number } | null>(null)
  const timer = useRef(0)
  const bump = useCallback((i: number) => {
    setB(null)
    requestAnimationFrame(() => setB({ i, n: Date.now() }))
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setB(null), 260)
  }, [])
  return [b ? b.i : null, bump]
}

interface Mote { id: number; x: number; y: number; dx: number; dy: number }

/** Sawdust in cell units; dir is where the piece was heading (0 right, 1 down, 2 left, 3 up). */
export function useDust(): [Mote[], (x: number, y: number, dir: number) => void] {
  const [dust, setDust] = useState<Mote[]>([])
  const id = useRef(0)
  const puff = useCallback((x: number, y: number, dir: number) => {
    const [ux, uy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir]
    const motes = Array.from({ length: 7 }, () => {
      const spread = (Math.random() - 0.5) * 34, push = 6 + Math.random() * 16
      return { id: id.current++, x, y, dx: ux ? ux * push : spread, dy: uy ? uy * push : spread }
    })
    setDust((d) => [...d, ...motes])
    const ids = new Set(motes.map((m) => m.id))
    setTimeout(() => setDust((d) => d.filter((m) => !ids.has(m.id))), 650)
  }, [])
  return [dust, puff]
}

export function Dust({ dust }: { dust: Mote[] }) {
  return (
    <>
      {dust.map((m) => (
        <span
          key={m.id}
          className="dust"
          style={{ left: `calc(var(--c) * ${m.x})`, top: `calc(var(--c) * ${m.y})`, '--dx': `${m.dx}px`, '--dy': `${m.dy}px` } as React.CSSProperties}
        />
      ))}
    </>
  )
}

/** The espresso machine at the cupboard's exit. */
export function Machine() {
  return (
    <svg viewBox="0 0 60 180">
      <defs>
        <linearGradient id="ww-mg" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".12" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="50" height="132" rx="10" fill="#2b2b2e" />
      <rect x="6" y="10" width="50" height="132" rx="10" fill="url(#ww-mg)" />
      <rect x="2" y="74" width="20" height="32" rx="4" fill="#151517" />
      <rect x="10" y="20" width="40" height="6" rx="3" fill="#47474c" />
      <circle className="glow" cx="46" cy="44" r="7" fill="#d9ab4e" />
      <circle cx="46" cy="44" r="3.5" fill="#d9ab4e" />
      <rect x="22" y="112" width="16" height="8" rx="2" fill="#151517" />
      <line className="pour" x1="30" y1="120" x2="30" y2="150" stroke="#6b3b1e" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 146h24l-3 20H21z" fill="#f2e9d6" />
      <path d="M42 150h4a4 4 0 0 1 0 8h-5" fill="none" stroke="#f2e9d6" strokeWidth="2.5" />
      <rect className="crema" x="20" y="148" width="20" height="6" fill="#b5703a" />
      <path className="steam" d="M26 140c-3-4 3-6 0-10M34 140c-3-4 3-6 0-10" stroke="#f2e9d6" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="4" y="166" width="54" height="8" rx="3" fill="#3a3a3f" />
    </svg>
  )
}

/** The cereal bowl the milk is headed for, just outside the fridge. */
export function Bowl() {
  return (
    <svg viewBox="0 0 60 180">
      <path d="M20 58 L40 58 L38 70 L22 70 Z" fill="#f4f1ea" className="carton" />
      <path className="pour milkpour" d="M30 72 L30 122" stroke="#fbf8f0" strokeWidth="4" strokeLinecap="round" />
      <g className="flakes">
        <circle cx="18" cy="124" r="3" fill="#e0a64a" />
        <circle cx="26" cy="121" r="3.4" fill="#d18f35" />
        <circle cx="35" cy="122" r="3" fill="#e9b55e" />
        <circle cx="43" cy="124" r="3.2" fill="#d18f35" />
      </g>
      <ellipse className="milk" cx="30" cy="127" rx="21" ry="4" fill="#fbf8f0" />
      <path d="M6 126 h48 a24 22 0 0 1 -48 0z" fill="#3f6fb0" />
      <path d="M6 126 h48 a24 22 0 0 1 -48 0z" fill="url(#ww-bowl)" />
      <defs>
        <linearGradient id="ww-bowl" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".3" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <path d="M14 140 q16 6 32 0" stroke="#f2e9d6" strokeWidth="2" fill="none" opacity=".6" />
      <rect x="20" y="148" width="20" height="4" rx="2" fill="#2c4f80" />
    </svg>
  )
}

/** One fern frond: leaflets along a curve from the pot, drooping until watered. */
function Frond({ to, c, droop }: { to: [number, number]; c: [number, number]; droop: number }) {
  const leaves = Array.from({ length: 7 }, (_, k) => {
    const t = (k + 1) / 8, u = 1 - t
    const x = u * u * 30 + 2 * u * t * c[0] + t * t * to[0], y = u * u * 124 + 2 * u * t * c[1] + t * t * to[1]
    const s = 1 - t * 0.55
    return <ellipse key={k} cx={x} cy={y} rx={7 * s} ry={2.6 * s} transform={`rotate(${k % 2 ? 35 : -35} ${x} ${y})`} />
  })
  return (
    <g className="frond" style={{ '--droop': `${droop}deg` } as React.CSSProperties}>
      <path d={`M30 124Q${c[0]} ${c[1]} ${to[0]} ${to[1]}`} fill="none" stroke="#3f6a2a" strokeWidth="2" />
      {leaves}
    </g>
  )
}

/** Cyriel's ferns, wilting by the hall cupboard. */
export function Fern() {
  return (
    <svg viewBox="0 0 60 180">
      <g className="drops">
        <circle cx="12" cy="84" r="2.2" />
        <circle cx="20" cy="76" r="1.8" />
        <circle cx="9" cy="70" r="1.6" />
      </g>
      <g className="leaves">
        <Frond to={[-2, 78]} c={[6, 104]} droop={-28} />
        <Frond to={[62, 74]} c={[54, 100]} droop={26} />
        <Frond to={[22, 52]} c={[18, 86]} droop={-16} />
        <Frond to={[44, 56]} c={[44, 88]} droop={18} />
      </g>
      <path d="M12 124h36l-5 34H17z" fill="#b9633f" />
      <path d="M12 124h36l-5 34H17z" fill="url(#ww-bowl)" opacity=".7" />
      <rect x="9" y="120" width="42" height="8" rx="2" fill="#cf7a52" />
      <rect x="14" y="160" width="32" height="4" rx="2" fill="#7d3b20" />
    </svg>
  )
}

/** Krul's bowl, by the back door; Krul comes running when the treats land. */
export function DogBowl() {
  return (
    <svg viewBox="0 0 60 180">
      <g className="pup">
        <Krul x={28} y={130} s={0.85} run />
      </g>
      <g className="kibble">
        <circle cx="22" cy="144" r="2.6" fill="#8a5a2a" />
        <circle cx="29" cy="142" r="2.8" fill="#a8703a" />
        <circle cx="36" cy="144" r="2.6" fill="#7a4a20" />
      </g>
      <path d="M8 146h44l-5 14H13z" fill="#c8323c" />
      <path d="M8 146h44l-5 14H13z" fill="url(#ww-bowl)" />
      <rect x="6" y="143" width="48" height="5" rx="2.5" fill="#e04a50" />
      <text x="30" y="157" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff6e6" letterSpacing=".08em">KRUL</text>
    </svg>
  )
}

/** The courier's envelope, under the desk. */
export function Envelope() {
  return (
    <svg viewBox="0 0 60 40">
      <rect x="5" y="9" width="50" height="28" rx="2" fill="#e8dcc0" />
      <path d="M5 37l20-14M55 37 35 23" stroke="#c6b48e" strokeWidth="1.5" />
      <rect className="card-in" x="20" y="6" width="20" height="13" rx="1.5" fill="#bcd7f0" />
      <path className="flap" d="M5 9h50L30 -8z" fill="#f4ecd4" stroke="#c6b48e" strokeWidth="1" />
      <circle className="seal" cx="30" cy="22" r="4" fill="#c8323c" />
    </svg>
  )
}

export function Hammer({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={on ? '' : 'off'} aria-hidden>
      <rect x="14" y="10" width="4.5" height="20" rx="2" fill="#8d5c3b" transform="rotate(-30 16 20)" />
      <path d="M6 5h15l4 3v4H6z" fill="#5b5f63" transform="rotate(-30 16 20)" />
    </svg>
  )
}

/**
 * Marks the thing you're freeing: a breathing chalk-yellow ring and a bobbing
 * caret. Goes inside the item's element (it inherits its corner radius).
 */
export function Mark({ caret = true }: { caret?: boolean }) {
  return (
    <>
      <span className="ring" aria-hidden />
      {caret && (
        <svg className="caret" viewBox="0 0 16 12" aria-hidden>
          <path d="M2 2h12L8 10.5z" />
        </svg>
      )}
    </>
  )
}

/** Marks where it has to go: a dashed outline in the same yellow, and a paper flag. */
export function Goal({ style, label = 'here!', round = false, flag = 'top' }: { style: React.CSSProperties; label?: string; round?: boolean; flag?: 'top' | 'right' | 'below' }) {
  return (
    <span className={`goal${round ? ' round' : ''}`} style={style} aria-hidden>
      <span className={`flag ${flag}`}>{label}</span>
    </span>
  )
}
