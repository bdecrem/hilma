'use client'

import { useEffect, useId, useRef } from 'react'

// The live mascot for the web — the same bird, geometry and pose math as
// apps/feynd/Feynd/AnimatedDodo.swift (art space is head-centred: head
// r=26 at 0,0, feet at y=58). Idle loop by default; `launch` plays the
// v3 entrance first (pop, sprout boing, eyes open, cheeks, hello hop).
// Transforms only, no path morphing; respects prefers-reduced-motion.

type Pose = {
  sx: number; sy: number; roll: number; y: number; sprout: number; spread: number
  eyeY: number; pupil: number; px: number; py: number; wing: number; cheek: number
}

const bell = (u: number) => (u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0)
const easeOutBack = (u: number) => { const c = 1.70158, t = u - 1; return 1 + (c + 1) * t * t * t + c * t * t }
const hash01 = (n: number, salt: number) => { const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v) }
const blinkShape = (u: number) => (u > 0 && u < 1 ? 1 - 0.95 * Math.sin(u * Math.PI) : 1)
const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
const base = (): Pose => ({ sx: 1, sy: 1, roll: 0, y: 0, sprout: 0, spread: 0, eyeY: 1, pupil: 1, px: 0, py: 0, wing: 0, cheek: 0.6 })

function idle(t: number, seed: number, reduce: boolean): Pose {
  const p = base()
  const breath = 0.025 * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 3.2 + seed))
  p.sy = 1 + breath
  p.sx = 1 - breath * 0.6
  if (reduce) return p
  p.spread = 4 * Math.sin((t * 2 * Math.PI) / 3.2 + seed + 0.9)
  p.sprout = 2 * Math.sin((t * 2 * Math.PI) / 5.1 + seed)
  const cycle = 4.0 + (hash01(Math.floor(t / 4.0), seed) - 0.5) * 2.0
  const cy = Math.floor(t / cycle)
  const inCycle = t - cy * cycle
  const blinkAt = 0.6 + hash01(cy, seed + 5) * (cycle - 1.2)
  let eye = blinkShape((inCycle - blinkAt) / 0.12)
  if (hash01(cy, seed + 9) > 0.72) eye = Math.min(eye, blinkShape((inCycle - blinkAt - 0.22) / 0.12))
  p.eyeY = eye
  const lu = ((t + seed * 3) % 8) / 8
  if (lu > 0.62 && lu < 0.78) p.px = -2
  else if (lu > 0.8 && lu < 0.92) p.px = 2
  return p
}

function hop(u01: number): Pose {
  const p = base()
  const u = clamp01(u01)
  if (u < 0.13) { const a = u / 0.13; p.sy = 1 - 0.06 * a; p.sx = 1 + 0.06 * a }
  else {
    const ju = (u - 0.13) / 0.75, h = bell(ju)
    p.y = -20 * h; p.sy = 0.96 + 0.12 * h; p.sx = 2 - p.sy
    if (ju > 1) { p.sy = 0.94; p.sx = 1.06 }
  }
  const su = Math.max(0, u - 0.2)
  p.sprout = 14 * Math.exp(-3.2 * su) * Math.sin(su * 14)
  p.wing = 42 * bell(u / 0.5) + 42 * bell((u - 0.45) / 0.5)
  p.cheek = 0.6 + 0.3 * bell(u)
  return p
}

function launch(t: number): Pose {
  const p = base()
  const pop = easeOutBack(clamp01(t / 0.45))
  p.sx = pop; p.sy = pop
  const su = Math.max(0, t - 0.4)
  p.sprout = 14 * Math.exp(-3.4 * su) * Math.sin(su * 15)
  p.wing = 42 * bell(su / 0.5) + 26 * bell((su - 0.55) / 0.45)
  if (t < 0.5) p.eyeY = 0.05
  else { const ou = clamp01((t - 0.5) / 0.22); p.eyeY = Math.min(1, easeOutBack(ou)); p.pupil = 1 + 0.15 * (1 - ou) }
  p.eyeY = Math.min(p.eyeY, blinkShape((t - 1.15) / 0.12), blinkShape((t - 1.37) / 0.12))
  p.cheek = 0.6 * clamp01((t - 0.7) / 0.3)
  return p
}

function compose(t: number, seed: number, withLaunch: boolean, reduce: boolean): Pose {
  if (reduce) { const p = idle(t, seed, true); p.eyeY = 1; return p }
  if (!withLaunch) return idle(t, seed, false)
  if (t < 1.5) return launch(t)
  const hu = (t - 1.5) / 0.6
  const a = idle(t, seed, false)
  if (hu < 1.05) {
    const h = hop(hu)
    a.sx = h.sx; a.sy = h.sy; a.y = h.y; a.sprout += h.sprout; a.wing = h.wing; a.cheek = h.cheek
    if (hu < 0.9) a.eyeY = 1
  }
  return a
}

export default function DodoMascot({
  size = 64,
  seed = 0,
  launch: withLaunch = false,
  shadow = true,
  crop = 'full',
  className,
}: {
  size?: number
  seed?: number
  launch?: boolean
  shadow?: boolean
  /** 'face' = the app-icon crop: head and sprout only, square. */
  crop?: 'full' | 'face'
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const id = (k: string) => `${uid}-${k}`
  const refs = useRef<Record<string, SVGGElement | SVGEllipseElement | null>>({})
  const set = (k: string) => (el: SVGGElement | SVGEllipseElement | null) => { refs.current[k] = el }

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const r = refs.current
    let raf = 0
    const start = performance.now()
    const frame = (now: number) => {
      const t = (now - start) / 1000
      const p = compose(t, seed, withLaunch, reduce)
      r.rig?.setAttribute('transform', `translate(0 58) translate(0 ${p.y}) scale(${p.sx} ${p.sy}) rotate(${p.roll}) translate(0 -58)`)
      r.sprout?.setAttribute('transform', `rotate(${p.sprout} 0 -26)`)
      r.leafL?.setAttribute('transform', `rotate(${-p.spread} 0 -26)`)
      r.leafR?.setAttribute('transform', `rotate(${p.spread} 0 -26)`)
      const ey = p.pupil * p.eyeY
      r.eyeL?.setAttribute('transform', `translate(${-9.4 + p.px} ${-2 + p.py}) scale(${p.pupil} ${ey})`)
      r.eyeR?.setAttribute('transform', `translate(${9.4 + p.px} ${-2 + p.py}) scale(${p.pupil} ${ey})`)
      r.wingL?.setAttribute('transform', `rotate(${p.wing} -18 26)`)
      r.wingR?.setAttribute('transform', `rotate(${-p.wing} 18 26)`)
      r.cheeks?.setAttribute('opacity', String(p.cheek))
      if (r.shadow) {
        const lift = Math.min(1, -p.y / 26)
        const s = Math.min(1, p.sx)
        r.shadow.setAttribute('transform', `translate(0 60) scale(${s * (1 - 0.35 * lift)} ${s * (1 - 0.3 * lift)}) translate(0 -60)`)
        r.shadow.setAttribute('opacity', String(0.13 * (1 - 0.5 * lift)))
      }
      if (!reduce || t < 0.1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [seed, withLaunch])

  // Full: 124 wide × 134 tall art box (room for the hop and the shadow).
  // Face: a square around the head, the way the app icon crops the mark.
  const face = crop === 'face'
  return (
    <svg
      className={className}
      width={size}
      height={face ? size : (size * 134) / 124}
      viewBox={face ? '-30 -42 60 60' : '-62 -66 124 134'}
      aria-hidden="true"
      style={{ overflow: face ? 'hidden' : 'visible', display: 'block' }}
    >
      <defs>
        <radialGradient id={id('head')} cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#93B3C6" /><stop offset="0.55" stopColor="#7C9EB2" /><stop offset="1" stopColor="#5F8398" /></radialGradient>
        <radialGradient id={id('body')} cx="0.4" cy="0.28" r="0.85"><stop offset="0" stopColor="#8FB0C4" /><stop offset="0.6" stopColor="#7C9EB2" /><stop offset="1" stopColor="#5A7E93" /></radialGradient>
        <radialGradient id={id('wing')} cx="0.35" cy="0.3" r="0.9"><stop offset="0" stopColor="#7EA2B6" /><stop offset="1" stopColor="#5C8095" /></radialGradient>
        <radialGradient id={id('face')} cx="0.5" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFFBF0" /><stop offset="0.7" stopColor="#F9EFDA" /><stop offset="1" stopColor="#EBDDBE" /></radialGradient>
        <radialGradient id={id('belly')} cx="0.5" cy="0.35" r="0.7"><stop offset="0" stopColor="#FFFBF0" /><stop offset="1" stopColor="#EBDDBE" /></radialGradient>
        <linearGradient id={id('beak')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F8C86E" /><stop offset="0.5" stopColor="#F0A830" /><stop offset="1" stopColor="#D08A1C" /></linearGradient>
        <linearGradient id={id('foot')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F3B546" /><stop offset="1" stopColor="#D9931F" /></linearGradient>
        <linearGradient id={id('leafL')} x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#8CC470" /><stop offset="1" stopColor="#63A24F" /></linearGradient>
        <linearGradient id={id('leafR')} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#6FAE5C" /><stop offset="1" stopColor="#4E8C3E" /></linearGradient>
        <radialGradient id={id('cheek')} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#F2A19A" /><stop offset="0.6" stopColor="#F2A19A" stopOpacity="0.7" /><stop offset="1" stopColor="#F2A19A" stopOpacity="0" /></radialGradient>
        <radialGradient id={id('eye')} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#4A5560" /><stop offset="0.72" stopColor="#33383E" /><stop offset="1" stopColor="#22262B" /></radialGradient>
      </defs>

      {shadow && <ellipse ref={set('shadow')} cx="0" cy="60" rx="21" ry="3.6" fill="#3E3324" opacity="0.13" />}

      <g ref={set('rig')}>
        <g>
          <rect x="-9" y="44" width="6" height="12" rx="3" fill={`url(#${id('foot')})`} />
          <rect x="-13" y="53" width="12" height="5" rx="2.5" fill={`url(#${id('foot')})`} />
          <rect x="-9.2" y="55.6" width="1.6" height="2.4" rx="0.8" fill="#C9821F" opacity="0.55" />
          <rect x="-5.6" y="55.6" width="1.6" height="2.4" rx="0.8" fill="#C9821F" opacity="0.55" />
          <rect x="3" y="44" width="6" height="12" rx="3" fill={`url(#${id('foot')})`} />
          <rect x="1" y="53" width="12" height="5" rx="2.5" fill={`url(#${id('foot')})`} />
          <rect x="4" y="55.6" width="1.6" height="2.4" rx="0.8" fill="#C9821F" opacity="0.55" />
          <rect x="7.6" y="55.6" width="1.6" height="2.4" rx="0.8" fill="#C9821F" opacity="0.55" />
        </g>
        <ellipse cx="0" cy="32" rx="20" ry="16" fill={`url(#${id('body')})`} />
        <ellipse cx="0" cy="35" rx="12" ry="10" fill={`url(#${id('belly')})`} />
        <path d="M-9 27 Q0 23 9 27" fill="none" stroke="#5A7E93" strokeWidth="0.9" strokeLinecap="round" opacity="0.35" />
        <g ref={set('wingL')}>
          <g transform="rotate(20 -23 29)">
            <rect x="-30" y="24" width="14" height="11" rx="5.5" fill={`url(#${id('wing')})`} />
            <path d="M-27 31.5 Q-23 29 -18.5 31.2" fill="none" stroke="#4E7186" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          </g>
        </g>
        <g ref={set('wingR')}>
          <g transform="rotate(-20 23 29)">
            <rect x="16" y="24" width="14" height="11" rx="5.5" fill={`url(#${id('wing')})`} />
            <path d="M18.5 31.2 Q23 29 27 31.5" fill="none" stroke="#4E7186" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          </g>
        </g>
        <g ref={set('sprout')}>
          <path d="M-0.9 -26 C-1.1 -28.6 -0.4 -30.3 2.2 -32 C2.8 -30.7 2.2 -28.6 1.3 -26 Z" fill="#6FAE5C" />
          <g ref={set('leafL')}>
            <path d="M0.9 -30.9 C-3.9 -36.5 -11.3 -37.4 -16.1 -34.4 C-13.9 -28.7 -5.7 -27.4 0.9 -30.9 Z" fill={`url(#${id('leafL')})`} />
            <path d="M0 -31.2 Q-7 -33.8 -14.2 -34.2" fill="none" stroke="#FFFFFF" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
          </g>
          <g ref={set('leafR')}>
            <path d="M1.7 -32.2 C3.9 -37.8 10.9 -39.6 16.1 -37.8 C15.2 -32.2 8.3 -29.2 1.7 -32.2 Z" fill={`url(#${id('leafR')})`} />
            <path d="M2.6 -32.6 Q8.5 -35.6 14.4 -37.2" fill="none" stroke="#FFFFFF" strokeWidth="0.7" strokeLinecap="round" opacity="0.4" />
          </g>
        </g>
        <circle cx="0" cy="0" r="26" fill={`url(#${id('head')})`} />
        <path d="M-7 -24.5 q-1.4 -2.6 -0.4 -4.6" fill="none" stroke="#5F8398" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        <path d="M-3.2 -25.6 q-0.6 -2.6 0.6 -4.4" fill="none" stroke="#5F8398" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        <path d="M-10.6 -22.6 q-1.8 -2 -1.4 -4.2" fill="none" stroke="#5F8398" strokeWidth="1" strokeLinecap="round" opacity="0.55" />
        <path d="M-20 4 C-20 -7 -15 -13 -6.5 -12 Q0 -7.5 6.5 -12 C15 -13 20 -7 20 4 C20 16 11 24 0 24 C-11 24 -20 16 -20 4 Z" fill={`url(#${id('face')})`} />
        <g ref={set('cheeks')} opacity="0.6">
          <ellipse cx="-15.6" cy="8.4" rx="5.4" ry="3.6" fill={`url(#${id('cheek')})`} />
          <ellipse cx="15.6" cy="8.4" rx="5.4" ry="3.6" fill={`url(#${id('cheek')})`} />
        </g>
        <g ref={set('eyeL')} transform="translate(-9.4 -2)">
          <circle cx="0" cy="0" r="5.5" fill={`url(#${id('eye')})`} />
          <circle cx="1.8" cy="-2" r="2.1" fill="#FFFFFF" />
          <circle cx="-1.9" cy="2.3" r="0.9" fill="#FFFFFF" opacity="0.75" />
        </g>
        <g ref={set('eyeR')} transform="translate(9.4 -2)">
          <circle cx="0" cy="0" r="5.5" fill={`url(#${id('eye')})`} />
          <circle cx="-1.8" cy="-2" r="2.1" fill="#FFFFFF" />
          <circle cx="1.9" cy="2.3" r="0.9" fill="#FFFFFF" opacity="0.75" />
        </g>
        <ellipse cx="0" cy="6.3" rx="6.8" ry="5" fill={`url(#${id('beak')})`} />
        <ellipse cx="-2.2" cy="3.6" rx="2" ry="1" fill="#FFFFFF" opacity="0.32" />
        <circle cx="-2.6" cy="5" r="0.95" fill="#C9821F" />
        <circle cx="2.6" cy="5" r="0.95" fill="#C9821F" />
        <path d="M-5.6 8.2 Q0 10.6 5.6 8.2" fill="none" stroke="#C9821F" strokeWidth="0.7" strokeLinecap="round" opacity="0.55" />
      </g>
    </svg>
  )
}
