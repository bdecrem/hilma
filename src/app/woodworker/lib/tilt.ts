// Room 3, Tilt: the breakfast counter isn't level, and Cyriel's fix was to
// make it tip. One move is one tilt; everything loose rolls until it hits the
// rim, a nail, or something else. A knot hole swallows whatever rolls over it,
// and an egg that goes down one breaks. The egg is done when it rolls into the pan.
import type { Rules } from './engine'
import { DIRS } from './swing'

export const SIZE = 6

export interface TiltLevel {
  nails: [number, number][]
  holes: [number, number][]
  pan: [number, number]
  /** Roller 0 is the egg (or the lemon): it must not go down a hole. */
  rollers: { kind: 'egg' | 'onion' | 'jar' | 'lemon' | 'honey' | 'drops'; label: string }[]
}
/** Cell index per roller, -1 once it went down a hole. */
export type TiltState = number[]
/** An index into DIRS: 0 right, 1 down, 2 left, 3 up. */
export type TiltMove = number

export interface Roll {
  state: TiltState
  /** The cell each roller passed through last on its way (its fall spot when it fell). */
  path: number[][]
  eggBroke: boolean
}

/** Tip the counter: every roller rolls, the ones nearest the low edge first. */
export function roll(L: TiltLevel, s: TiltState, dir: TiltMove): Roll {
  const [dx, dy] = DIRS[dir]
  const cell = (x: number, y: number) => y * SIZE + x
  const nails = new Set(L.nails.map(([x, y]) => cell(x, y)))
  const holes = new Set(L.holes.map(([x, y]) => cell(x, y)))
  const pan = cell(...L.pan)
  const order = s.map((_, i) => i).filter((i) => s[i] >= 0)
  const lead = (c: number) => (c % SIZE) * dx + Math.floor(c / SIZE) * dy
  order.sort((a, b) => lead(s[b]) - lead(s[a]))
  const at = s.slice()
  const path: number[][] = s.map((c) => [c])
  let eggBroke = false
  for (const i of order) {
    if (i === 0 && at[0] === pan) continue
    let x = at[i] % SIZE, y = Math.floor(at[i] / SIZE)
    for (;;) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
      const c = cell(nx, ny)
      if (nails.has(c)) break
      if (at.some((o, j) => j !== i && o === c)) break
      if (c === pan && i !== 0) break
      x = nx
      y = ny
      path[i].push(c)
      if (holes.has(c)) {
        at[i] = -1
        if (i === 0) eggBroke = true
        break
      }
      at[i] = c
      if (c === pan) break
    }
  }
  return { state: at, path, eggBroke }
}

export function tiltRules(L: TiltLevel): Rules<TiltState, TiltMove> {
  const pan = L.pan[1] * SIZE + L.pan[0]
  return {
    moves: () => [0, 1, 2, 3],
    apply(s, m) {
      const r = roll(L, s, m)
      if (r.eggBroke || r.state.every((c, i) => c === s[i])) return null
      return r.state
    },
    solved: (s) => s[0] === pan,
    key: (s) => s.join(','),
  }
}
