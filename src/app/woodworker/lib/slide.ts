// Room 1, Slide: drawers and planks on rails. Each piece slides along its own
// length; one move is one piece slid any distance. Piece 0 is the item, on the
// exit row, free when it reaches the gap in the right wall.
import type { Rules } from './engine'

export const SIZE = 6

export interface SlidePiece {
  label: string
  h: boolean
  len: number
  /** Row of a horizontal piece, column of a vertical one. */
  line: number
}
export interface SlideLevel {
  pieces: SlidePiece[]
  exitRow: number
}
/** pos[i]: column of a horizontal piece, row of a vertical one. */
export type SlideState = number[]
export type SlideMove = { piece: number; to: number }

export function cellsOf(p: SlidePiece, at: number): number[] {
  const out: number[] = []
  for (let k = 0; k < p.len; k++) out.push(p.h ? p.line * SIZE + at + k : (at + k) * SIZE + p.line)
  return out
}

function grid(L: SlideLevel, s: SlideState): Int8Array {
  const g = new Int8Array(SIZE * SIZE).fill(-1)
  L.pieces.forEach((p, i) => cellsOf(p, s[i]).forEach((c) => (g[c] = i)))
  return g
}

/** The furthest piece i can go each way: [lowest, highest] position. */
export function slideRange(L: SlideLevel, s: SlideState, i: number, g = grid(L, s)): [number, number] {
  const p = L.pieces[i]
  const free = (at: number) => g[p.h ? p.line * SIZE + at : at * SIZE + p.line] === -1
  let lo = s[i]
  while (lo > 0 && free(lo - 1)) lo--
  let hi = s[i]
  while (hi + p.len < SIZE && free(hi + p.len)) hi++
  return [lo, hi]
}

export function slideRules(L: SlideLevel): Rules<SlideState, SlideMove> {
  return {
    moves(s) {
      const g = grid(L, s)
      const out: SlideMove[] = []
      L.pieces.forEach((_, i) => {
        const [lo, hi] = slideRange(L, s, i, g)
        for (let p = lo; p <= hi; p++) if (p !== s[i]) out.push({ piece: i, to: p })
      })
      return out
    },
    apply(s, m) {
      const [lo, hi] = slideRange(L, s, m.piece)
      if (m.to < lo || m.to > hi || m.to === s[m.piece]) return null
      const n = s.slice()
      n[m.piece] = m.to
      return n
    },
    solved: (s) => s[0] === SIZE - L.pieces[0].len,
    key: (s) => s.join(''),
  }
}
