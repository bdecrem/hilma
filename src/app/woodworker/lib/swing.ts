// Room 2, Swing: Cyriel hung every door in the fridge so their arcs overlap.
// A door turns 90° about its hinge between two positions, and the quarter
// circle it sweeps must be clear: other doors, shelves and the milk all stop
// it. The milk bottle slides any distance in a straight line. One move is one
// swing or one slide. The milk is out when it reaches the exit cell.
import type { Rules } from './engine'

export const SIZE = 6
/** E, S, W, N. */
export const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

export interface SwingDoor {
  label: string
  hinge: [number, number]
  len: number
  /** The two directions (indexes into DIRS) it can point, 90° apart. */
  dirs: [number, number]
}
export interface SwingLevel {
  walls: [number, number][]
  doors: SwingDoor[]
  exit: [number, number]
}
/** doors[i] is 0 or 1 (which of its dirs it points); milk is a cell index. */
export type SwingState = { doors: number[]; milk: number }
export type SwingMove = { door: number } | { milk: number }

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE

export function doorCells(d: SwingDoor, side: number): number[] {
  const [ux, uy] = DIRS[d.dirs[side]]
  const out: number[] = []
  for (let k = 0; k < d.len; k++) out.push((d.hinge[1] + uy * k) * SIZE + d.hinge[0] + ux * k)
  return out
}

/** Cells a door passes through on its way to the other side (the new position included). Null if it would hit the frame. */
export function sweepCells(d: SwingDoor, from: number): number[] | null {
  const [ax, ay] = DIRS[d.dirs[from]]
  const [bx, by] = DIRS[d.dirs[1 - from]]
  const out: number[] = []
  for (let a = 0; a < d.len; a++)
    for (let b = 1; b < d.len; b++) {
      if (a * a + b * b >= d.len * d.len) continue
      const x = d.hinge[0] + ax * a + bx * b
      const y = d.hinge[1] + ay * a + by * b
      if (!inside(x, y)) return null
      out.push(y * SIZE + x)
    }
  return out
}

/** What fills each cell: -2 wall, -3 milk, i a door, -1 empty. */
export function swingGrid(L: SwingLevel, s: SwingState): Int8Array {
  const g = new Int8Array(SIZE * SIZE).fill(-1)
  for (const [x, y] of L.walls) g[y * SIZE + x] = -2
  L.doors.forEach((d, i) => doorCells(d, s.doors[i]).forEach((c) => (g[c] = i)))
  g[s.milk] = -3
  return g
}

/** Why door i can't swing: the first thing in its way (a door index, -2 wall, -3 milk, -4 frame), or null if it can. */
export function swingBlocker(L: SwingLevel, s: SwingState, i: number, g = swingGrid(L, s)): number | null {
  const cells = sweepCells(L.doors[i], s.doors[i])
  if (!cells) return -4
  for (const c of cells) if (g[c] !== -1 && g[c] !== i) return g[c]
  return null
}

/** Cells the milk can reach in one straight slide. */
export function milkTargets(L: SwingLevel, s: SwingState, g = swingGrid(L, s)): number[] {
  const out: number[] = []
  const x0 = s.milk % SIZE, y0 = Math.floor(s.milk / SIZE)
  for (const [dx, dy] of DIRS)
    for (let x = x0 + dx, y = y0 + dy; inside(x, y) && g[y * SIZE + x] === -1; x += dx, y += dy) out.push(y * SIZE + x)
  return out
}

export function swingRules(L: SwingLevel): Rules<SwingState, SwingMove> {
  const exit = L.exit[1] * SIZE + L.exit[0]
  return {
    moves(s) {
      const g = swingGrid(L, s)
      const out: SwingMove[] = []
      L.doors.forEach((_, i) => {
        if (swingBlocker(L, s, i, g) === null) out.push({ door: i })
      })
      for (const c of milkTargets(L, s, g)) out.push({ milk: c })
      return out
    },
    apply(s, m) {
      if ('door' in m) {
        if (swingBlocker(L, s, m.door) !== null) return null
        const doors = s.doors.slice()
        doors[m.door] = 1 - doors[m.door]
        return { doors, milk: s.milk }
      }
      if (!milkTargets(L, s).includes(m.milk)) return null
      return { doors: s.doors, milk: m.milk }
    },
    solved: (s) => s.milk === exit,
    key: (s) => s.doors.join('') + ':' + s.milk,
  }
}
