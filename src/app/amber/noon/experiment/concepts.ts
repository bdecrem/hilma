// Ten spring-day concepts at 52×20 for the bio-engine experiment.
// Each is drawn procedurally — `1` = target cell, `0` = not.
//
// The idea: these are the set of planted targets the Ising dynamics
// must converge to. Not random objects — themed, evocative, varied.

export const COLS = 52
export const ROWS = 20
export type Grid = number[][]

function mk(fn: (c: number, r: number) => boolean): Grid {
  const g: Grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (fn(c, r)) g[r][c] = 1
  return g
}

// 1. SUN — disk with 8 short rays
const SUN: Grid = mk((c, r) => {
  const d = Math.hypot(c - 26, (r - 10) * 1.15)
  if (d <= 3.2) return true
  // rays, each 2 cells long, starting just outside the disk
  const rays: [number, number][][] = [
    [[26, 4], [26, 5]],           // up
    [[26, 15], [26, 16]],         // down
    [[19, 10], [20, 10]],         // left
    [[32, 10], [33, 10]],         // right
    [[21, 5], [22, 6]],           // upper-left
    [[30, 5], [31, 6]],           // upper-right
    [[21, 15], [22, 14]],         // lower-left
    [[30, 15], [31, 14]],         // lower-right
  ]
  for (const ray of rays) for (const [rc, rr] of ray) if (c === rc && r === rr) return true
  return false
})

// 2. KITE — diamond outline + cross brace + tail with bow ties
const KITE: Grid = mk((c, r) => {
  // Diamond outline: dx + dy*2 == 8 (16 wide × 8 tall)
  const dx = Math.abs(c - 26), dy = Math.abs(r - 4) * 2
  const edge = dx + dy
  if (edge >= 7 && edge <= 8) return true
  // Cross braces
  if (r === 4 && c >= 19 && c <= 33) return true
  if (c === 26 && r >= 1 && r <= 7) return true
  // Tail — wavy line from the bottom of the diamond
  for (let tr = 9; tr <= 18; tr++) {
    const wave = Math.round(Math.sin((tr - 9) * 0.8) * 2.5)
    if (c === 26 + wave && r === tr) return true
    // Bow ties every 3 rows
    if ((tr - 9) % 3 === 1) {
      if (r === tr && (c === 26 + wave - 2 || c === 26 + wave + 2)) return true
    }
  }
  return false
})

// 3. TULIP — stem, leaf, cup-shaped flower with three peaks
const TULIP: Grid = mk((c, r) => {
  // Stem
  if ((c === 26 || c === 25) && r >= 8 && r <= 18) return true
  // Leaf — long curved shape sweeping left
  if (r === 12 && c >= 19 && c <= 25) return true
  if (r === 13 && c >= 17 && c <= 24) return true
  if (r === 11 && c >= 21 && c <= 25) return true
  if (r === 14 && c >= 19 && c <= 22) return true
  // Flower — three petals at the top
  // Peaks
  if (r === 2 && (c === 22 || c === 26 || c === 30)) return true
  // Middle rows of each petal
  if (r === 3) {
    if ((c >= 21 && c <= 23) || (c >= 25 && c <= 27) || (c >= 29 && c <= 31)) return true
  }
  // Cup body (the bowl of the tulip)
  if (r === 4 && c >= 20 && c <= 32) return true
  if (r === 5 && c >= 20 && c <= 32) return true
  if (r === 6 && c >= 21 && c <= 31) return true
  if (r === 7 && c >= 23 && c <= 29) return true
  return false
})

// 4. BUTTERFLY — symmetric 4-wing silhouette with body + antennae
const BUTTERFLY: Grid = mk((c, r) => {
  // Body
  if ((c === 25 || c === 26) && r >= 6 && r <= 14) return true
  // Head
  if (r === 5 && (c === 25 || c === 26)) return true
  // Antennae
  if (r === 4 && (c === 24 || c === 27)) return true
  if (r === 3 && (c === 23 || c === 28)) return true
  // Upper-left wing (disk)
  const ul = Math.hypot(c - 20, (r - 8) * 1.1)
  if (ul <= 5) return true
  // Upper-right wing
  const ur = Math.hypot(c - 32, (r - 8) * 1.1)
  if (ur <= 5) return true
  // Lower-left wing (smaller)
  const ll = Math.hypot(c - 20, (r - 14) * 1.1)
  if (ll <= 3.5) return true
  // Lower-right wing
  const lr = Math.hypot(c - 32, (r - 14) * 1.1)
  if (lr <= 3.5) return true
  // Carve out a slim crescent so wings read as separate from body
  // (nothing to do — body sits on top visually since wings are filled)
  return false
})

// 5. BICYCLE — two wheel rings + frame triangle + seat + handlebars
const BICYCLE: Grid = mk((c, r) => {
  const dB = Math.hypot(c - 12, (r - 13) * 1.2)
  const dF = Math.hypot(c - 40, (r - 13) * 1.2)
  // Wheel rings
  if ((dB >= 3.5 && dB <= 4.5) || (dF >= 3.5 && dF <= 4.5)) return true
  // Hubs
  if (dB < 0.9 || dF < 0.9) return true
  // Spokes (horizontal + vertical through each hub)
  if (r === 13 && ((c >= 9 && c <= 15) || (c >= 37 && c <= 43))) return true
  if ((c === 12 || c === 40) && r >= 10 && r <= 16) return true
  // Frame: seat tube, head tube, top tube, chain stay
  if (c === 22 && r >= 5 && r <= 13) return true         // seat tube
  if (c === 34 && r >= 6 && r <= 13) return true         // head tube
  if (r === 6 && c >= 22 && c <= 34) return true         // top tube
  if (r === 13 && c >= 12 && c <= 40) return true        // chain stay
  // Seat
  if (r === 4 && c >= 20 && c <= 24) return true
  // Handlebars + stem
  if (r === 5 && c >= 32 && c <= 38) return true
  if (c === 36 && r === 5) return true
  return false
})

// 6. BIRD ON A WIRE — horizontal wire across the middle + small bird silhouette
const BIRD_WIRE: Grid = mk((c, r) => {
  // Wire — long horizontal line (spanning most of the grid)
  if (r === 12 && c >= 2 && c <= 49) return true
  // Slight dip near the bird from its weight
  if (r === 12 && c >= 22 && c <= 30) return false
  if (r === 13 && c >= 22 && c <= 30) return true
  // Bird body (perched)
  if (r === 10 && c >= 24 && c <= 28) return true
  if (r === 11 && c >= 23 && c <= 29) return true
  if (r === 12 && c >= 24 && c <= 28) return true
  // Head
  if (r === 8 && c >= 25 && c <= 27) return true
  if (r === 9 && c >= 24 && c <= 28) return true
  // Beak
  if (r === 9 && c === 29) return true
  // Tail
  if (r === 10 && c === 22) return true
  if (r === 11 && c === 21) return true
  // Feet
  if ((r === 13 || r === 14) && (c === 25 || c === 27)) return true
  return false
})

// 7. CLOUD — bumpy cloud outline (three lobes on top, flatish bottom)
const CLOUD: Grid = mk((c, r) => {
  // Three circle lobes for the top, sitting at different heights
  const l1 = Math.hypot(c - 17, (r - 9) * 1.3)   // left lobe
  const l2 = Math.hypot(c - 26, (r - 7) * 1.3)   // center lobe (tallest)
  const l3 = Math.hypot(c - 35, (r - 9) * 1.3)   // right lobe
  if (l1 <= 4 || l2 <= 5 || l3 <= 4) return true
  // Bottom — flat-ish span
  if (r === 12 && c >= 13 && c <= 40) return true
  if (r === 13 && c >= 15 && c <= 38) return true
  // Fill gaps between lobes at the middle rows
  if ((r === 10 || r === 11) && c >= 14 && c <= 39) return true
  return false
})

// 8. WATERING CAN — side profile with handle + spout + droplets
const WATERING_CAN: Grid = mk((c, r) => {
  // Body — a trapezoid tapered toward top
  // Rows 10-16, narrowing from bottom
  for (let rr = 10; rr <= 16; rr++) {
    const inset = Math.max(0, 16 - rr) * 0 // keep rectangular for now
    const left = 22 - inset
    const right = 34 + inset
    if (r === rr && (c === left || c === right)) return true  // sides
    if (r === 16 && c >= left && c <= right) return true      // bottom
    if (r === 10 && c >= left && c <= right) return true      // top
  }
  // Handle — arched top, off the back (left)
  if (r === 8 && c >= 18 && c <= 25) return true
  if (r === 9 && (c === 18 || c === 25)) return true
  // Spout — tapering upward-right
  if (r === 10 && c >= 35 && c <= 39) return true
  if (r === 9 && c >= 37 && c <= 41) return true
  if (r === 8 && c >= 39 && c <= 42) return true
  if (r === 7 && c >= 41 && c <= 43) return true
  // Water droplets trailing from the spout
  if (r === 9 && c === 45) return true
  if (r === 11 && c === 46) return true
  if (r === 13 && c === 47) return true
  if (r === 15 && c === 48) return true
  return false
})

// 9. BLOSSOM BRANCH — diagonal branch with flower clusters
const BLOSSOM: Grid = mk((c, r) => {
  // Main branch — diagonal from lower-left to upper-right
  for (let i = 0; i < 42; i++) {
    const bc = 5 + i
    const br = 17 - Math.floor(i * 0.3)
    if (c === bc && r === br) return true
    if (c === bc && r === br - 1 && i > 3) return true  // thickness
  }
  // Side twig
  for (let i = 0; i < 6; i++) {
    const bc = 18 + i
    const br = 11 - Math.floor(i * 0.4)
    if (c === bc && r === br) return true
  }
  // Blossom clusters — 5-petal flowers at various points
  const blossomCenters: [number, number][] = [
    [12, 14], [20, 11], [28, 8], [36, 7], [44, 6], [16, 12], [32, 7], [40, 6],
  ]
  for (const [cx, cy] of blossomCenters) {
    // Petals: center + 5 surrounding cells
    if (c === cx && r === cy) return true
    if (c === cx - 1 && r === cy) return true
    if (c === cx + 1 && r === cy) return true
    if (c === cx && r === cy - 1) return true
    if (c === cx && r === cy + 1) return true
  }
  return false
})

// 10. SWING — two ropes descending from a horizontal support, seat at bottom
const SWING: Grid = mk((c, r) => {
  // Support — horizontal line near the top (e.g., a branch)
  if (r === 2 && c >= 8 && c <= 44) return true
  if (r === 3 && (c === 10 || c === 20 || c === 30 || c === 40)) return true  // short knuckles
  // Ropes — two verticals descending with slight outward bow
  for (let rr = 2; rr <= 15; rr++) {
    // Left rope
    const leftC = 20 + Math.round((rr - 2) * -0.15)
    // Right rope
    const rightC = 32 + Math.round((rr - 2) * 0.15)
    if (r === rr && (c === leftC || c === rightC)) return true
  }
  // Seat — a horizontal board
  if (r === 16 && c >= 17 && c <= 35) return true
  if (r === 17 && c >= 17 && c <= 35) return true
  // Side edges of seat (ends of board)
  if (c === 17 && (r === 15 || r === 16)) return true
  if (c === 35 && (r === 15 || r === 16)) return true
  return false
})

// Per-concept physics tuning. `radius` = how far the "magnet" reaches out
// from target cells; `bias` = how strongly a target cell is pulled up.
// Values chosen via scripts/bio-engine-sweep-2d.ts to give every concept
// a ~20–40% per-attempt land rate (chunky shapes stay near 100%,
// which is fine — the wiry ones are the ones that needed help).
export const CONCEPTS: { name: string; grid: Grid; radius: number; bias: number }[] = [
  { name: 'sun',            grid: SUN,          radius: 2.8, bias: 0.40 },
  { name: 'kite',           grid: KITE,         radius: 2.0, bias: 0.40 },
  { name: 'tulip',          grid: TULIP,        radius: 1.2, bias: 0.22 },
  { name: 'butterfly',      grid: BUTTERFLY,    radius: 1.2, bias: 0.22 },
  { name: 'bicycle',        grid: BICYCLE,      radius: 3.6, bias: 1.10 },
  { name: 'bird on a wire', grid: BIRD_WIRE,    radius: 2.0, bias: 0.40 },
  { name: 'cloud',          grid: CLOUD,        radius: 1.2, bias: 0.22 },
  { name: 'watering can',   grid: WATERING_CAN, radius: 2.0, bias: 0.40 },
  { name: 'blossom branch', grid: BLOSSOM,      radius: 2.8, bias: 0.22 },
  { name: 'swing',          grid: SWING,        radius: 2.0, bias: 0.40 },
]
