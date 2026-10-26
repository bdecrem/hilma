// The Woodworker's level generator: random boards per mechanic, solved
// exactly, kept only when the par hits the target and every piece matters.
//   npx tsx scripts/woodworker/gen.ts            → prints a level per room as JSON
//   npx tsx scripts/woodworker/gen.ts swing 9    → one mechanic, one par
// The printed layouts are pasted into src/app/woodworker/lib/levels.ts;
// scripts/woodworker/check.ts proves the pars there.
import { distances, solve } from '../../src/app/woodworker/lib/engine'
import { SIZE, swingRules, doorCells, type SwingLevel, type SwingState, type SwingMove } from '../../src/app/woodworker/lib/swing'
import { tiltRules, type TiltLevel } from '../../src/app/woodworker/lib/tilt'
import { linkedRules, type LinkedLevel } from '../../src/app/woodworker/lib/linked'
import { boxRules, PANELS, STOPS, type BoxLevel } from '../../src/app/woodworker/lib/box'

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const int = (r: () => number, n: number) => Math.floor(r() * n)

function genSwing(par: number, seed = 1) {
  for (let tries = 0; tries < 200_000; tries++) {
    const r = mulberry(seed + tries)
    const used = new Set<number>()
    const exit: [number, number] = [5, 2]
    used.add(exit[1] * SIZE + exit[0])
    const walls: [number, number][] = []
    for (let k = int(r, 3); k > 0; k--) {
      const c = int(r, 36)
      if (used.has(c)) continue
      used.add(c)
      walls.push([c % SIZE, Math.floor(c / SIZE)])
    }
    used.delete(exit[1] * SIZE + exit[0])
    const doors: SwingLevel['doors'] = []
    const sides: number[] = []
    const want = 5 + int(r, 3)
    for (let k = 0; k < 60 && doors.length < want; k++) {
      const d0 = int(r, 4)
      const d = { label: '', hinge: [int(r, 6), int(r, 6)] as [number, number], len: r() < 0.7 ? 2 : 3, dirs: [d0, (d0 + (r() < 0.5 ? 1 : 3)) % 4] as [number, number] }
      const side = int(r, 2)
      const okSide = (sd: number) => {
        const [ux, uy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][d.dirs[sd]]
        const ex = d.hinge[0] + ux * (d.len - 1), ey = d.hinge[1] + uy * (d.len - 1)
        return ex >= 0 && ey >= 0 && ex < SIZE && ey < SIZE
      }
      if (!okSide(0) || !okSide(1)) continue
      const cells = doorCells(d, side)
      if (cells.some((c) => used.has(c) || c === exit[1] * SIZE + exit[0])) continue
      cells.forEach((c) => used.add(c))
      doors.push(d)
      sides.push(side)
    }
    if (doors.length < 5) continue
    const free = [...Array(36).keys()].filter((c) => !used.has(c) && c % SIZE <= 1)
    if (!free.length) continue
    const L: SwingLevel = { walls, doors, exit }
    const R = swingRules(L)
    const start: SwingState = { doors: sides, milk: free[int(r, free.length)] }
    const dist = distances(R, start)
    if (!dist) continue
    for (const { s, d } of dist.values()) {
      if (d !== par || s.milk % SIZE > 1) continue
      const path = solve(R, s)!
      const swung = new Set(path.filter((m): m is { door: number } => 'door' in m).map((m) => m.door))
      if (swung.size < Math.min(doors.length, 4)) continue
      return { level: L, start: s, par, path, seed: seed + tries }
    }
  }
  throw new Error('no swing level')
}

function genTilt(par: number, seed = 1) {
  for (let tries = 0; tries < 400_000; tries++) {
    const r = mulberry(seed + tries)
    const taken = new Set<number>()
    const pick = () => {
      for (;;) {
        const c = int(r, 36)
        if (!taken.has(c)) return taken.add(c), [c % SIZE, Math.floor(c / SIZE)] as [number, number]
      }
    }
    const pan = pick()
    const nails = Array.from({ length: 4 + int(r, 5) }, pick)
    const holes = Array.from({ length: 1 + int(r, 3) }, pick)
    const at = [pick(), pick(), pick()].map(([x, y]) => y * SIZE + x)
    const L: TiltLevel = { nails, holes, pan, rollers: [{ kind: 'egg', label: 'Egg' }, { kind: 'onion', label: 'Onion' }, { kind: 'jar', label: 'Jam' }] }
    const path = solve(tiltRules(L), at)
    if (!path || path.length !== par) continue
    // The onion and the jam must both earn their place: without either one, no solution this short.
    const without = (i: number) => {
      const s = at.slice()
      s[i] = -1
      const p = solve(tiltRules(L), s)
      return !p || p.length > par
    }
    if (!without(1) || !without(2)) continue
    return { level: L, start: at, par, path, seed: seed + tries }
  }
  throw new Error('no tilt level')
}

function genLinked(par: number, seed = 1) {
  for (let tries = 0; tries < 400_000; tries++) {
    const r = mulberry(seed + tries)
    const cols = 6, shaft = 2 + int(r, 2)
    const trays = Array.from({ length: 5 }, () => {
      const w = 3 + int(r, 3)
      const lo = Math.max(0, Math.min(shaft - int(r, w), cols - w))
      return { label: '', lo, hi: lo + w - 1 }
    }).map((t) => (t.lo <= shaft && t.hi >= shaft ? t : null))
    if (trays.some((t) => !t)) continue
    const links: LinkedLevel['links'] = []
    for (let k = 4 + int(r, 3); k > 0; k--) {
      const a = int(r, 5), b = int(r, 5)
      if (a === b || links.some((l) => l.a === a && l.b === b)) continue
      links.push({ a, b, k: r() < 0.5 ? 1 : -1 })
    }
    if (links.length < 4) continue
    const L: LinkedLevel = { cols, trays: trays as LinkedLevel['trays'], links, shaft }
    const R = linkedRules(L)
    const loose = linkedRules({ ...L, links: [] })
    const start = L.trays.map((t) => t.lo + int(r, t.hi - t.lo + 1))
    const dist = distances(R, start)
    if (!dist) continue
    for (const { s, d } of dist.values()) {
      if (d !== par || s.filter((c) => c === shaft).length > 1) continue
      // The strings must cost something: untied, the same trays line up in far fewer moves.
      if (solve(loose, s)!.length > par - 4) continue
      const path = solve(R, s)!
      if (new Set(path.map((m) => m.tray)).size < 4) continue
      return { level: L, start: s, par, path, seed: seed + tries }
    }
  }
  throw new Error('no linked level')
}

function genBox(par: number, seed = 1) {
  for (let tries = 0; tries < 400_000; tries++) {
    const r = mulberry(seed + tries)
    const gates = PANELS.map((_, i) =>
      Array.from({ length: STOPS - 1 }, () => {
        let by = int(r, PANELS.length - 1)
        if (by >= i) by++
        const at = [0, 1, 2].filter(() => r() < 0.45)
        return { by, at: at.length ? at : [int(r, 3)] }
      }),
    )
    const L: BoxLevel = { labels: [...PANELS], gates }
    const R = boxRules(L)
    const start = PANELS.map(() => 0)
    const path = solve(R, start)
    if (!path || path.length !== par) continue
    if (new Set(path.map((m) => m.panel)).size < PANELS.length) continue
    // Room to explore: at least two panels move from the start.
    if (R.moves(start).filter((m) => R.apply(start, m)).length < 2) continue
    return { level: L, start, par, path, seed: seed + tries }
  }
  throw new Error('no box level')
}

const gens: Record<string, (par: number, seed?: number) => unknown> = { swing: genSwing, tilt: genTilt, linked: genLinked, box: genBox }
const [only, parArg, seedArg] = process.argv.slice(2)
if (only) console.log(JSON.stringify(gens[only](Number(parArg), Number(seedArg ?? 1))))
else for (const [k, p] of [['swing', 9], ['tilt', 7], ['linked', 10], ['box', 12]] as const) console.log(k, JSON.stringify(gens[k](p)))
