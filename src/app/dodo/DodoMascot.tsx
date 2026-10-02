'use client'

import { useEffect, useId, useMemo, useRef } from 'react'

// The live mascot for the web: the jelly dodo (the brand since 2026-10-01),
// a port of the `dodo` body in misc/dodo-redesign/jelly-dodos.html and of
// apps/feynd/Feynd/JellyDodo.swift — a superellipse with gaussian bumps (a
// tuft, a curl, two wing nubs, two feet), a radial jelly gradient, an inner
// rim shadow and rim light, a subsurface glow, the kawaii face and
// world-fixed speculars. Drawn in the page's spec units inside the same
// 124 × 134 art box the previous bird used (feet on y = 58), so DodoFrame's
// placement maths did not move.
//
// Pose maths is the old bird's: squash/stretch/hop/roll anchored at the
// feet, blinks, a look-around. Since a jelly has no limbs, `sprout` leans
// the tuft, `wing` puffs the wing nubs, `squint` draws the > < eyes and
// `mouth` opens the little honk mouth. `beat` plays a one-shot reaction
// over the idle loop (the showcase hero changes it per scene): hop, cheer,
// point (a lean toward the screen), peek (rises from below the ground
// line). Bump `beatKey` to replay. Respects prefers-reduced-motion.

type Pose = {
  sx: number; sy: number; roll: number; y: number; sprout: number; spread: number
  eyeY: number; pupil: number; px: number; py: number; wing: number; cheek: number
  squint: number; mouth: number
  /** Explicit right-wing puff (default mirrors `wing`); reactions use it. */
  wingR?: number
}

export type Beat = 'idle' | 'hop' | 'cheer' | 'point' | 'peek'
const BEAT_SECS: Record<Beat, number> = { idle: 0, hop: 0.6, cheer: 1.6, point: 2.0, peek: 1.0 }

export type JellyColor = 'sky' | 'pink' | 'peach' | 'mint' | 'lemon' | 'grape' | 'cherry' | 'lime'
/** The art pages' colourways: light · base · deep, and the inner-rim shadow. */
export const JELLY: Record<JellyColor, { c: [string, string, string]; rim: string }> = {
  sky: { c: ['#DCF6FF', '#5EC6EC', '#2689BD'], rim: 'rgba(8,75,120,.5)' },
  pink: { c: ['#FFE0EF', '#FF9FC8', '#E9649D'], rim: 'rgba(185,30,100,.55)' },
  peach: { c: ['#FFE6CF', '#FFAA82', '#F06C55'], rim: 'rgba(215,70,45,.5)' },
  mint: { c: ['#E2FFF4', '#91E9CC', '#4DC5A2'], rim: 'rgba(25,135,105,.5)' },
  lemon: { c: ['#FFF8C8', '#FFD43A', '#E0A100'], rim: 'rgba(140,85,0,.5)' },
  grape: { c: ['#EFE2FF', '#A77BF2', '#6A3FC4'], rim: 'rgba(50,10,120,.55)' },
  cherry: { c: ['#FF9A96', '#FF2B36', '#BF0D1C'], rim: 'rgba(110,0,10,.55)' },
  lime: { c: ['#EFFFD0', '#A3E45C', '#4C9F2A'], rim: 'rgba(30,95,10,.5)' },
}
const INK = '#2A1F2B'

const bell = (u: number) => (u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0)
const easeOutBack = (u: number) => { const c = 1.70158, t = u - 1; return 1 + (c + 1) * t * t * t + c * t * t }
const hash01 = (n: number, salt: number) => { const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v) }
const blinkShape = (u: number) => (u > 0 && u < 1 ? 1 - 0.95 * Math.sin(u * Math.PI) : 1)
const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
const base = (): Pose => ({ sx: 1, sy: 1, roll: 0, y: 0, sprout: 0, spread: 0, eyeY: 1, pupil: 1, px: 0, py: 0, wing: 0, cheek: 0.6, squint: 0, mouth: 0 })

// ---- the outline (the page's makeOutline for the dodo spec) ------------------
const A = 39, BT = 36, BB = 42, N_EXP = 2.4, NP = 72, HP = Math.PI / 2
const CORE = Math.max(A, BT)
const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d }

/** `tuft` leans the head tuft (radians); `wL` / `wR` add height to the wing nubs. */
function outline(tuft = 0, wL = 0, wR = 0): [number, number][] {
  const bumps: { at: number; h: number; w: number; dir?: number }[] = [
    { at: -HP + 0.05, h: 9, w: 0.07, dir: -HP - 0.15 + tuft },
    { at: -0.38, h: 9, w: 0.09, dir: -0.95 },
    { at: 0.3, h: 6 + wR, w: 0.16 },
    { at: Math.PI - 0.3, h: 6 + wL, w: 0.16 },
    { at: HP - 0.42, h: 4, w: 0.11 },
    { at: HP + 0.42, h: 4, w: 0.11 },
  ]
  const pts: [number, number][] = []
  for (let i = 0; i < NP; i++) {
    const t = -HP + (i / NP) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t)
    let x = A * Math.sign(c) * Math.pow(Math.abs(c), 2 / N_EXP)
    let y = (s < 0 ? BT : BB) * Math.sign(s) * Math.pow(Math.abs(s), 2 / N_EXP)
    for (const b of bumps) {
      const d = b.h * Math.exp(-Math.pow(Math.abs(angDiff(t, b.at)) / b.w, 2) / 2)
      if (d < 0.01) continue
      if (b.dir !== undefined) { x += Math.cos(b.dir) * d; y += Math.sin(b.dir) * d }
      else { x += c * d; y += s * d }
    }
    pts.push([x, y])
  }
  return pts
}
/** The page's bodyPath: quadratic curves through the midpoints, one smooth blob. */
function pathOf(p: [number, number][]): string {
  const n = p.length
  const f = (v: number) => v.toFixed(2)
  let d = `M${f((p[n - 1][0] + p[0][0]) / 2)} ${f((p[n - 1][1] + p[0][1]) / 2)}`
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    d += `Q${f(p[i][0])} ${f(p[i][1])} ${f((p[i][0] + p[j][0]) / 2)} ${f((p[i][1] + p[j][1]) / 2)}`
  }
  return d + 'Z'
}
const REST = outline()
const REST_D = pathOf(REST)
const CX = REST.reduce((s, p) => s + p[0], 0) / REST.length
const CY = REST.reduce((s, p) => s + p[1], 0) / REST.length
const BOTTOM = Math.max(...REST.map((p) => p[1]))
const TOP = Math.min(...REST.map((p) => p[1]))
/** Spec origin → art box: the feet stand on y = 58, like the old bird's. */
const LIFT = 58 - BOTTOM
/** The body's centre in art-box units (for the square 'face' crop). */
export const BODY_CENTER_Y = (TOP + BOTTOM) / 2 + LIFT
export const BODY_HEIGHT = BOTTOM - TOP

// ---- poses ---------------------------------------------------------------------
function idle(t: number, seed: number, reduce: boolean): Pose {
  const p = base()
  const breath = 0.025 * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 3.2 + seed))
  p.sy = 1 + breath
  p.sx = 1 - breath * 0.6
  if (reduce) return p
  p.wing = 1.2 * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 3.2 + seed + 0.9))
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
  if (u < 0.13) { const a = u / 0.13; p.sy = 1 - 0.08 * a; p.sx = 1 + 0.08 * a }
  else {
    const ju = (u - 0.13) / 0.75, h = bell(ju)
    p.y = -20 * h; p.sy = 0.96 + 0.14 * h; p.sx = 2 - p.sy
    if (ju > 1) { p.sy = 0.92; p.sx = 1.08 }
  }
  const su = Math.max(0, u - 0.2)
  p.sprout = 14 * Math.exp(-3.2 * su) * Math.sin(su * 14)
  p.wing = 42 * bell(u / 0.5) + 42 * bell((u - 0.45) / 0.5)
  p.cheek = 0.6 + 0.3 * bell(u)
  p.mouth = 0.6 * bell((u - 0.1) / 0.7)
  return p
}

// Reactions overlay the idle pose `a` at progress u ∈ [0, 1).
function react(kind: Beat, u: number, a: Pose) {
  switch (kind) {
    case 'idle':
      return
    case 'hop': {
      const h = hop(u)
      a.sx = h.sx; a.sy = h.sy; a.y = h.y; a.sprout += h.sprout; a.wing = h.wing; a.cheek = h.cheek; a.mouth = h.mouth
      if (u < 0.9) a.eyeY = 1
      return
    }
    case 'cheer': {
      const j = bell(u / 0.4) + bell((u - 0.45) / 0.4)
      a.y = -18 * j
      a.sy = 1 + 0.08 * j; a.sx = 1 - 0.06 * j
      a.wing = 48 + 10 * Math.sin(u * 46)
      a.cheek = 0.95
      a.pupil = 1.08
      // Happy closed eyes and an open honk through the two jumps, a blink to land.
      a.eyeY = u < 0.86 ? 0.05 : Math.min(1, easeOutBack(clamp01((u - 0.86) / 0.1)))
      a.mouth = u < 0.86 ? 0.75 + 0.25 * Math.sin(u * 30) : 0.9 * (1 - clamp01((u - 0.86) / 0.14))
      a.sprout += 10 * Math.sin(u * 22) * (1 - u)
      return
    }
    case 'point': {
      // No wing to raise: the jelly leans toward the screen, puffs the near
      // nub and looks over.
      const up = u < 0.2 ? easeInOut(u / 0.2) : u > 0.82 ? 1 - easeInOut((u - 0.82) / 0.18) : 1
      a.wingR = 40 * up
      a.roll = 7 * up
      a.sx = 1 + 0.03 * up; a.sy = 1 + 0.05 * up
      a.px = 2.4 * up
      a.sprout += -8 * up
      a.cheek = 0.6 + 0.25 * up
      a.mouth = 0.35 * up
      return
    }
    case 'peek': {
      const rise = easeOutBack(clamp01(u / 0.55))
      a.y = 34 * (1 - rise)
      a.eyeY = u < 0.4 ? 0.08 : Math.min(1, easeOutBack(clamp01((u - 0.4) / 0.2)))
      a.eyeY = Math.min(a.eyeY, blinkShape((u - 0.78) / 0.1))
      a.pupil = u > 0.4 ? 1.1 : 1
      a.cheek = 0.6 + 0.3 * clamp01((u - 0.5) / 0.3)
      a.mouth = 0.5 * bell((u - 0.45) / 0.5)
      return
    }
  }
}

// The launch: drop in from above, land in a big squash, wobble out of it
// with a surprised "o", a double blink, then the idle loop (the app's splash).
function launch(t: number): Pose {
  const p = base()
  if (t < 0.42) {
    const d = clamp01(t / 0.42)
    p.y = -70 * (1 - d * d)
    p.sx = 0.92; p.sy = 1.12
    p.eyeY = 1; p.pupil = 1.1
    return p
  }
  const s = t - 0.42
  const squash = Math.exp(-4.2 * s) * Math.cos(s * 17)
  p.sx = 1 + 0.32 * squash
  p.sy = 1 - 0.3 * squash
  p.mouth = clamp01(0.9 - s * 0.9)
  p.pupil = 1 + 0.12 * clamp01(1 - s)
  p.sprout = 16 * Math.exp(-3 * s) * Math.sin(s * 15)
  p.wing = 30 * Math.exp(-3 * s) * Math.abs(Math.sin(s * 12))
  p.eyeY = Math.min(blinkShape((s - 0.9) / 0.12), blinkShape((s - 1.12) / 0.12))
  p.cheek = 0.6
  return p
}

function compose(t: number, seed: number, withLaunch: boolean, reduce: boolean): Pose {
  if (reduce) { const p = idle(t, seed, true); p.eyeY = 1; return p }
  if (!withLaunch) return idle(t, seed, false)
  if (t < 1.7) return launch(t)
  const hu = (t - 1.7) / 0.6
  const a = idle(t, seed, false)
  if (hu < 1.05) {
    const h = hop(hu)
    a.sx = h.sx; a.sy = h.sy; a.y = h.y; a.sprout += h.sprout; a.wing = h.wing; a.cheek = h.cheek; a.mouth = h.mouth
    if (hu < 0.9) a.eyeY = 1
  }
  return a
}

const f2 = (v: number) => v.toFixed(2)

export default function DodoMascot({
  size = 64,
  seed = 0,
  launch: withLaunch = false,
  shadow = true,
  crop = 'full',
  beat = 'idle',
  beatKey = 0,
  still,
  gaze = 0,
  color = 'sky',
  className,
}: {
  size?: number
  seed?: number
  launch?: boolean
  shadow?: boolean
  /** One-shot reaction over the idle loop; replayed whenever `beatKey` changes. */
  beat?: Beat
  beatKey?: number
  /** Freeze one frame with the reaction at this progress (0–1) — for exports. */
  still?: number
  /** Gaze offset in art units (−3…3): a glance to the side, for stills. */
  gaze?: number
  /** Colourway; the mascot is sky, the others are the critter colours. */
  color?: JellyColor
  /** 'face' = the app-icon crop: a square around the body, the way the icon frames it. */
  crop?: 'full' | 'face'
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const id = (k: string) => `${uid}-${k}`
  const refs = useRef<Record<string, SVGElement | null>>({})
  const set = (k: string) => (el: SVGElement | null) => { refs.current[k] = el }
  const reaction = useRef<{ kind: Beat; start: number } | null>(null)
  const pal = JELLY[color]

  useEffect(() => {
    reaction.current = beat === 'idle' ? null : { kind: beat, start: performance.now() }
  }, [beat, beatKey])

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const r = refs.current
    let raf = 0
    const start = performance.now()
    let lastShape = ''
    const frame = (now: number) => {
      const t = still !== undefined ? 0.7 : (now - start) / 1000
      const p = compose(t, seed, withLaunch, reduce)
      const rx = reaction.current
      if (still !== undefined) {
        if (beat !== 'idle') react(beat, Math.min(0.999, Math.max(0, still)), p)
        p.px += gaze
      } else if (rx && !reduce) {
        const u = (now - rx.start) / (BEAT_SECS[rx.kind] * 1000)
        if (u >= 1) reaction.current = null
        else react(rx.kind, u, p)
      }
      // Rig: squash/stretch/roll about the feet, lifted by the hop.
      r.rig?.setAttribute('transform', `translate(0 58) translate(0 ${f2(p.y)}) scale(${f2(p.sx)} ${f2(p.sy)}) rotate(${f2(p.roll)}) translate(0 -58)`)
      // Body: the outline flexes with the tuft and the wing nubs.
      const wL = p.wing * 0.08, wR = (p.wingR ?? p.wing) * 0.08
      const key = `${f2(p.sprout)}|${f2(wL)}|${f2(wR)}`
      if (key !== lastShape) {
        lastShape = key
        r.body?.setAttribute('d', pathOf(outline((p.sprout * Math.PI) / 180 * 0.6, wL, wR)))
      }
      // Eyes: open (scaled), happy-closed, or > <.
      const open = p.squint < 0.5 && p.eyeY >= 0.3
      const ey = Math.max(0.3, p.eyeY)
      for (const side of ['L', 'R'] as const) {
        const sgn = side === 'L' ? -1 : 1
        const g = r['eye' + side]
        g?.setAttribute('transform', `translate(${f2(14 * sgn + p.px * 0.8)} ${f2(-9 + p.py * 0.8)})`)
        r['open' + side]?.setAttribute('transform', `scale(${f2(p.pupil)} ${f2(p.pupil * ey)})`)
        r['open' + side]?.setAttribute('display', open ? '' : 'none')
        r['lid' + side]?.setAttribute('display', !open && p.squint < 0.5 ? '' : 'none')
        r['squint' + side]?.setAttribute('display', p.squint >= 0.5 ? '' : 'none')
      }
      const m = Math.min(1, Math.max(0, p.mouth))
      if (r.mouth) {
        r.mouth.setAttribute('display', m > 0.02 ? '' : 'none')
        r.mouth.setAttribute('rx', f2(1.1 + 1.3 * m))
        r.mouth.setAttribute('ry', f2(1.3 + 2.0 * m))
      }
      r.cheeks?.setAttribute('opacity', f2(Math.min(1, p.cheek / 0.6)))
      if (r.shadow) {
        const lift = Math.min(1, -p.y / 26)
        const s = Math.min(1, p.sx)
        r.shadow.setAttribute('transform', `translate(0 60) scale(${f2(s * (1 - 0.35 * lift))} ${f2(s * (1 - 0.3 * lift))}) translate(0 -60)`)
        r.shadow.setAttribute('opacity', f2(0.16 * (1 - 0.5 * lift)))
      }
      if (still === undefined && (!reduce || t < 0.1 || reaction.current)) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [seed, withLaunch, still, beat, gaze])

  // Speculars sit relative to the body's centroid, like the page's.
  const hx = CX - A * 0.42, hy = CY - BT * 0.5
  const face = crop === 'face'
  // Face: a square around the body with the icon's margins (body ≈ 72% of the tile).
  const faceBox = useMemo(() => { const s = BODY_HEIGHT / 0.72; return `${f2(-s / 2)} ${f2(BODY_CENTER_Y - s / 2)} ${f2(s)} ${f2(s)}` }, [])
  return (
    <svg
      className={className}
      width={size}
      height={face ? size : (size * 134) / 124}
      viewBox={face ? faceBox : '-62 -66 124 134'}
      aria-hidden="true"
      style={{ overflow: face ? 'hidden' : 'visible', display: 'block' }}
    >
      <defs>
        <path id={id('body')} ref={set('body')} d={REST_D} />
        <clipPath id={id('clip')}><use href={`#${id('body')}`} /></clipPath>
        <filter id={id('blurD')} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id={id('blurL')} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
        <radialGradient id={id('jelly')} gradientUnits="userSpaceOnUse" cx={CX - CORE * 0.35} cy={CY - CORE * 0.5} r={CORE * 1.35}>
          <stop offset="0" stopColor={pal.c[0]} /><stop offset="0.5" stopColor={pal.c[1]} /><stop offset="1" stopColor={pal.c[2]} />
        </radialGradient>
        <radialGradient id={id('white')}><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></radialGradient>
        <radialGradient id={id('belly')}><stop offset="0" stopColor="#F0FCFF" stopOpacity="0.7" /><stop offset="1" stopColor="#F0FCFF" stopOpacity="0" /></radialGradient>
        <radialGradient id={id('blush')}><stop offset="0" stopColor="#FF5A82" stopOpacity="0.42" /><stop offset="1" stopColor="#FF5A82" stopOpacity="0" /></radialGradient>
        <radialGradient id={id('spec')}><stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" /><stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.35" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></radialGradient>
        <linearGradient id={id('beak')} gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="13"><stop offset="0" stopColor="#FFD56C" /><stop offset="1" stopColor="#F3962A" /></linearGradient>
      </defs>

      {shadow && <ellipse ref={set('shadow')} cx="0" cy="60" rx="27" ry="4.2" fill="#3C1E3C" opacity="0.16" />}

      <g ref={set('rig')}>
        <g transform={`translate(0 ${f2(LIFT)})`}>
          <use href={`#${id('body')}`} fill={`url(#${id('jelly')})`} />
          <g clipPath={`url(#${id('clip')})`}>
            {/* Inner rim: the page blurs the outside in with an offset shadow
                (dark, pushed up-left, shadowBlur 14) and a light (white, pushed
                down-right, blur 8). A blurred stroke of the shifted outline,
                clipped to the body, reads the same. */}
            <g fill="none" stroke={pal.rim} transform="translate(-2 -5)" filter={`url(#${id('blurD')})`}>
              <use href={`#${id('body')}`} strokeWidth="16" opacity="0.9" />
            </g>
            <g fill="none" stroke="#FFFFFF" transform="translate(1.5 4)" filter={`url(#${id('blurL')})`}>
              <use href={`#${id('body')}`} strokeWidth="10" opacity="0.75" />
            </g>
            {/* Subsurface glow near the bottom. */}
            <ellipse cx={CX + CORE * 0.1} cy={BOTTOM - CORE * 0.32} rx={CORE * 0.75} ry={CORE * 0.35} fill={`url(#${id('white')})`} opacity="0.28" />
            {/* The face: belly glow, blush, eyes, beak, honk. */}
            <ellipse cx="0" cy="24" rx="20" ry="16" fill={`url(#${id('belly')})`} />
            <g ref={set('cheeks')}>
              <ellipse cx="-23" cy="4" rx="6.5" ry="4.55" fill={`url(#${id('blush')})`} />
              <ellipse cx="23" cy="4" rx="6.5" ry="4.55" fill={`url(#${id('blush')})`} />
            </g>
            {(['L', 'R'] as const).map((side) => {
              const sgn = side === 'L' ? -1 : 1
              const r = 4.6, rr = r * 1.15, s = sgn < 0 ? 1 : -1
              return (
                <g key={side} ref={set('eye' + side)} transform={`translate(${14 * sgn} -9)`}>
                  <g ref={set('open' + side)}>
                    <ellipse cx="0" cy="0" rx={r} ry={r * 1.12} fill={INK} />
                    <circle cx={-r * 0.32} cy={-r * 0.38} r={r * 0.36} fill="#FFFFFF" />
                    <circle cx={r * 0.35} cy={r * 0.4} r={r * 0.15} fill="#FFFFFF" opacity="0.8" />
                  </g>
                  <path ref={set('lid' + side)} display="none" d={`M${f2(-r * 0.85 * Math.SQRT1_2)} ${f2(-r * 0.5 + r * 0.85 * Math.SQRT1_2)} A${f2(r * 0.85)} ${f2(r * 0.85)} 0 0 0 ${f2(r * 0.85 * Math.SQRT1_2)} ${f2(-r * 0.5 + r * 0.85 * Math.SQRT1_2)}`}
                    fill="none" stroke={INK} strokeWidth={Math.max(2, r * 0.38)} strokeLinecap="round" />
                  <path ref={set('squint' + side)} display="none" d={`M${f2(-s * rr * 0.7)} ${f2(-rr * 0.6)} L${f2(s * rr * 0.55)} 0 L${f2(-s * rr * 0.7)} ${f2(rr * 0.6)}`}
                    fill="none" stroke={INK} strokeWidth={Math.max(2, rr * 0.42)} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )
            })}
            <path d="M-8 -1 Q0 -6 8 -1 Q8 7 2 12 Q0 14 -2 12 Q-8 7 -8 -1 Z" fill={`url(#${id('beak')})`} />
            <ellipse cx="0" cy="10.6" rx="2.6" ry="2.2" fill="#E0742A" />
            <ellipse cx="-3.6" cy="0" rx="2.2" ry="1.1" transform="rotate(-11.5 -3.6 0)" fill="#FFFFFF" opacity="0.75" />
            <ellipse ref={set('mouth')} display="none" cx="0" cy="16.9" rx="1.1" ry="1.3" fill="#7A1F33" />
            {/* World-fixed speculars. */}
            <g transform={`translate(${f2(hx)} ${f2(hy)}) rotate(-31.5) scale(1 0.5)`}>
              <circle r={A * 0.38} fill={`url(#${id('spec')})`} />
            </g>
            <ellipse cx={hx - A * 0.08} cy={hy - BT * 0.02} rx={A * 0.07} ry={A * 0.045} transform={`rotate(-34.4 ${f2(hx - A * 0.08)} ${f2(hy - BT * 0.02)})`} fill="#FFFFFF" opacity="0.95" />
            <ellipse cx={CX + A * 0.55} cy={CY + BB * 0.35} rx={A * 0.05} ry={A * 0.11} transform={`rotate(-17.2 ${f2(CX + A * 0.55)} ${f2(CY + BB * 0.35)})`} fill="#FFFFFF" opacity="0.55" />
          </g>
        </g>
      </g>
    </svg>
  )
}
