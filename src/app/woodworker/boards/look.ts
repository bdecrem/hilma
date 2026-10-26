// Cyriel's offcuts: the woods every room is built from, and a seeded hand so
// each piece keeps its knots, crooked handle and bent nail between visits.
import type { CSSProperties } from 'react'

export const WOODS = [
  { w1: '#cfa063', w2: '#a8773d', lbl: 'rgba(60,30,8,.55)' }, // oak
  { w1: '#8d5c3b', w2: '#64402a', lbl: 'rgba(255,236,210,.55)' }, // walnut
  { w1: '#b9633f', w2: '#8a4228', lbl: 'rgba(255,230,205,.6)' }, // cherry
  { w1: '#e4c58f', w2: '#c6a067', lbl: 'rgba(70,45,15,.55)' }, // maple
  { w1: '#ddb06a', w2: '#b98844', lbl: 'rgba(70,40,10,.55)' }, // pine
  { w1: '#c3ad86', w2: '#9f8763', lbl: 'rgba(50,35,15,.55)' }, // ash
]

export function rng(seed: number) {
  let s = seed * 9301 + 49297
  return () => (s = (s * 9301 + 49297) % 233280) / 233280
}

export interface Grain {
  style: CSSProperties
  nail: { left: string; top: string } | null
}

/** Wood, knot, handle tilt and maybe a bent nail for piece i of a room. */
export function grain(room: number, i: number): Grain {
  const r = rng(room * 31 + i * 7 + 3)
  const wood = WOODS[(i * 7 + room * 3) % WOODS.length]
  return {
    style: {
      '--w1': wood.w1,
      '--w2': wood.w2,
      '--lbl': wood.lbl,
      '--kx': `${(15 + r() * 70) | 0}%`,
      '--ky': `${(20 + r() * 60) | 0}%`,
      '--tilt': `${((r() - 0.5) * 14).toFixed(1)}deg`,
    } as CSSProperties,
    nail: r() < 0.35 ? { left: `${(10 + r() * 60) | 0}%`, top: `${(15 + r() * 60) | 0}%` } : null,
  }
}

/** Pixels per board cell, read from the element (the CSS owns the size). */
export const cellOf = (el: HTMLElement | null, cols: number) => (el ? el.clientWidth / cols : 60)
