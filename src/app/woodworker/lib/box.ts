// Room 5, Puzzle box: Cyriel took up himitsu-bako, so the biscuit tin is now a
// secret box. Five panels (the lid and four sides) each slide a notch at a
// time between three stops. Hidden pins: a panel crosses from one stop to the
// next only while one other panel sits where its pin is clear. The lid comes
// off at its last stop. One move is one panel, one notch.
import type { Rules } from './engine'

export const PANELS = ['lid', 'north', 'east', 'south', 'west'] as const
export const STOPS = 3

export interface BoxLevel {
  labels: string[]
  /** gates[i][c]: to cross between stop c and c+1, panel `by` must be at one of `at`. */
  gates: { by: number; at: number[] }[][]
}
export type BoxState = number[]
export type BoxMove = { panel: number; d: 1 | -1 }

/** The panel whose pin catches this move, or -1 at the end of the slot. Null when it slides. */
export function boxBlocker(L: BoxLevel, s: BoxState, m: BoxMove): number | null {
  const to = s[m.panel] + m.d
  if (to < 0 || to >= STOPS) return -1
  const g = L.gates[m.panel][Math.min(s[m.panel], to)]
  return g.at.includes(s[g.by]) ? null : g.by
}

export function boxRules(L: BoxLevel): Rules<BoxState, BoxMove> {
  return {
    moves: (s) => s.flatMap((_, panel) => [{ panel, d: -1 as const }, { panel, d: 1 as const }]),
    apply(s, m) {
      if (boxBlocker(L, s, m) !== null) return null
      const n = s.slice()
      n[m.panel] += m.d
      return n
    },
    solved: (s) => s[0] === STOPS - 1,
    key: (s) => s.join(''),
  }
}
