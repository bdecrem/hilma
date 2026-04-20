// Replace today's 8 concepts with 5 hand-drafted sketches.
// Themes: Mako on the bus + beauty filter crash + Onion/Infowars.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COLS = 52
const ROWS = 20

type Fills = number[][] // per-row list of column indices to fill

function mkGrid(fills: Fills): number[][] {
  if (fills.length !== ROWS) throw new Error(`expected ${ROWS} rows, got ${fills.length}`)
  return fills.map((cols) => {
    const row = new Array(COLS).fill(0)
    for (const c of cols) {
      if (c < 0 || c >= COLS) throw new Error(`col ${c} out of range`)
      row[c] = 1
    }
    return row
  })
}

// Helpers
const range = (a: number, b: number) => {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}
const sparse = (...cs: number[]) => cs

// ─────────────────────────────────────────────────────────────────────────
// 1. CROWN ON AN EMPTY BUS SEAT
//    A wide bench with a small crown sitting off-center (left of center).
// ─────────────────────────────────────────────────────────────────────────
const crownOnSeat: Fills = [
  [],                                                              // 0
  [],                                                              // 1
  [],                                                              // 2
  sparse(10, 13, 16),                                              // 3  spike tips
  sparse(10, 13, 16),                                              // 4
  [10, 11, 13, 14, 16, 17],                                        // 5  spikes thicker
  range(10, 17),                                                   // 6  crown band
  range(10, 17),                                                   // 7  crown body
  range(10, 17),                                                   // 8  crown base
  [],                                                              // 9  gap
  range(3, 48),                                                    // 10 seat slab top
  range(3, 48),                                                    // 11 seat slab bottom
  [6, 7, 44, 45],                                                  // 12 legs
  [6, 7, 44, 45],                                                  // 13
  [6, 7, 44, 45],                                                  // 14
  [6, 7, 44, 45],                                                  // 15
  [6, 7, 44, 45],                                                  // 16
  [6, 7, 44, 45],                                                  // 17
  [6, 7, 44, 45],                                                  // 18
  range(1, 50),                                                    // 19 floor
]

// ─────────────────────────────────────────────────────────────────────────
// 2. FACE SPLIT — FILTER ON / FILTER CRASHED
//    Left half: clean oval head + eye + mouth.
//    Right half: scattered 2×2 pixel blocks, no outline.
//    Vertical dashed seam at col 26.
// ─────────────────────────────────────────────────────────────────────────
const faceSplit: Fills = [
  [],                                                              // 0
  range(17, 26),                                                   // 1  top of head (left half arc)
  [14, 15, 16, 26],                                                // 2  curve down + seam
  [12, 13, 26, 30, 31, 40, 41],                                    // 3  left edge + seam + glitch blocks
  [11, 30, 31, 40, 41],                                            // 4
  [10, 26, 34, 35],                                                // 5  seam dash + glitch
  [10, 34, 35, 44, 45],                                            // 6
  [9, 26, 44, 45],                                                 // 7
  [9, 15, 16, 30, 31, 38, 39],                                     // 8  eye (left cols 15-16) + glitch
  [9, 30, 31, 38, 39],                                             // 9
  [9, 26, 46, 47],                                                 // 10 seam dash + far-right fragment
  [9, 46, 47],                                                     // 11
  [9, 18, 19, 20, 21, 22, 32, 33, 42, 43],                         // 12 mouth (left cols 18-22) + glitch
  [10, 26, 32, 33, 42, 43],                                        // 13 seam dash
  [10, 36, 37],                                                    // 14
  [11, 36, 37],                                                    // 15
  [12, 13, 26, 48, 49],                                            // 16 seam dash + stray far-right
  [14, 15, 16, 48, 49],                                            // 17
  range(17, 26),                                                   // 18 chin (left half)
  [],                                                              // 19
]

// ─────────────────────────────────────────────────────────────────────────
// 3. ROW OF CROWNED HEADS, ONE BARE
//    8 small heads across the 52-wide canvas. 7 wearing crowns, 1 bare.
//    Each head block is ~6 cols wide. Heads at cols 2,8,14,20,26,32,38,44.
//    The bare head is the 6th from left (at col 32) — asymmetric placement.
// ─────────────────────────────────────────────────────────────────────────
const headSlots = [2, 8, 14, 20, 26, 32, 38, 44] // leftmost col of each head
const bareIndex = 5 // 6th head is the commoner
function headAt(baseCol: number, bare: boolean): { rows: { row: number; cols: number[] }[] } {
  // A head block occupies cols baseCol..baseCol+5 (6 wide).
  // Crown spikes rows 4-5, crown band row 6, head rows 7-13, neck row 14-15, shoulders 16-18.
  const result: { row: number; cols: number[] }[] = []
  if (!bare) {
    result.push({ row: 4, cols: [baseCol + 1, baseCol + 3, baseCol + 5].filter(c => c - baseCol <= 5) })
    result.push({ row: 5, cols: [baseCol + 1, baseCol + 3, baseCol + 5].filter(c => c - baseCol <= 5) })
    result.push({ row: 6, cols: range(baseCol, baseCol + 5) })
  }
  result.push({ row: 8, cols: [baseCol + 1, baseCol + 2, baseCol + 3, baseCol + 4] })
  result.push({ row: 9, cols: [baseCol, baseCol + 1, baseCol + 2, baseCol + 3, baseCol + 4, baseCol + 5] })
  result.push({ row: 10, cols: [baseCol, baseCol + 1, baseCol + 2, baseCol + 3, baseCol + 4, baseCol + 5] })
  result.push({ row: 11, cols: [baseCol + 1, baseCol + 2, baseCol + 3, baseCol + 4] })
  result.push({ row: 13, cols: [baseCol + 2, baseCol + 3] })              // neck
  result.push({ row: 14, cols: [baseCol + 2, baseCol + 3] })
  result.push({ row: 15, cols: range(baseCol, baseCol + 5) })             // shoulders
  result.push({ row: 16, cols: range(baseCol, baseCol + 5) })
  return { rows: result }
}

const rowOfHeads: Fills = Array.from({ length: ROWS }, () => [] as number[])
for (let i = 0; i < headSlots.length; i++) {
  const { rows } = headAt(headSlots[i], i === bareIndex)
  for (const r of rows) {
    for (const c of r.cols) if (c < COLS) rowOfHeads[r.row].push(c)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. CLIFF OF DESCENDING BARS — the subscriber plummet
//    Bars start tall at col 3 and step down to zero at col 46.
//    10 bars, each 4 cols wide with 1-col gap. Heights step down.
// ─────────────────────────────────────────────────────────────────────────
const cliff: Fills = Array.from({ length: ROWS }, () => [] as number[])
// Baseline at row 18. Draw a floor line across.
for (const c of range(0, 51)) cliff[18].push(c)
// 10 bars, each 4 wide + 1 gap, starting at col 3.
const barHeights = [17, 16, 14, 11, 8, 5, 3, 2, 1, 1] // rows above baseline
for (let i = 0; i < barHeights.length; i++) {
  const x0 = 3 + i * 5
  const h = barHeights[i]
  const topRow = 18 - h
  for (let r = topRow; r <= 17; r++) {
    for (let c = x0; c < x0 + 4; c++) {
      if (c < COLS) cliff[r].push(c)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 5. BROKEN MIRROR WITH A CROWN FRAGMENTING INSIDE
//    Oval-ish mirror outline + radial cracks from a center point.
//    Inside the shards, a crown's outline is visible as fragments.
// ─────────────────────────────────────────────────────────────────────────
const mirror: Fills = Array.from({ length: ROWS }, () => [] as number[])
// Mirror frame (rectangular outline cols 4-47, rows 1-18)
for (const c of range(4, 47)) { mirror[1].push(c); mirror[18].push(c) }
for (const r of range(2, 17)) { mirror[r].push(4); mirror[r].push(47) }
// Radial cracks from center (row 10, col 26)
// Crack 1: diagonal up-left
const crack1 = [[2, 10], [3, 12], [4, 14], [5, 16], [6, 18], [7, 20], [8, 22], [9, 24]]
// Crack 2: diagonal up-right
const crack2 = [[2, 44], [3, 42], [4, 40], [5, 38], [6, 36], [7, 34], [8, 32], [9, 29]]
// Crack 3: horizontal-ish down-left
const crack3 = [[11, 23], [12, 21], [13, 19], [14, 17], [15, 15], [16, 13]]
// Crack 4: down-right
const crack4 = [[11, 29], [12, 31], [13, 33], [14, 35], [15, 37], [16, 39]]
for (const [r, c] of [...crack1, ...crack2, ...crack3, ...crack4]) {
  if (r >= 0 && r < ROWS && c > 4 && c < 47) mirror[r].push(c)
}
// Crown fragments scattered in the shards
// Shard 1 (top-left): partial crown spikes
mirror[4].push(9, 11, 13)
mirror[5].push(9, 10, 11, 12, 13)
// Shard 2 (top-right): broken crown band
mirror[4].push(37, 38, 39, 41, 42)
mirror[5].push(37, 38, 41, 42)
// Shard 3 (bottom-left): partial spike
mirror[13].push(8, 10)
mirror[14].push(8, 9, 10, 11)
// Shard 4 (bottom-right): jewel dot / gem
mirror[14].push(42, 43)
mirror[15].push(41, 42, 43, 44)
mirror[16].push(42, 43)

// ─────────────────────────────────────────────────────────────────────────

const concepts = [
  {
    name: 'crown on an empty bus seat',
    blurb: 'she left it where she sat',
    grid: mkGrid(crownOnSeat),
  },
  {
    name: 'a face split down the middle — filter on / filter crashed',
    blurb: 'one half of her stayed',
    grid: mkGrid(faceSplit),
  },
  {
    name: 'a row of crowned heads, one bare',
    blurb: 'count the commoner',
    grid: mkGrid(rowOfHeads),
  },
  {
    name: 'a cliff of descending bars',
    blurb: 'one hundred forty thousand in sixty seconds',
    grid: mkGrid(cliff),
  },
  {
    name: 'a broken mirror with a crown fragmenting inside it',
    blurb: 'she broke it herself',
    grid: mkGrid(mirror),
  },
]

const date = process.argv[2] || '2026-04-20'
const path = join(__dirname, '..', 'public', 'amber-noon', `concepts-${date}.json`)
const file = JSON.parse(readFileSync(path, 'utf8'))
file.concepts = concepts
writeFileSync(path, JSON.stringify(file, null, 2) + '\n')

console.log(`→ wrote ${concepts.length} concepts to ${path}\n`)
for (const c of concepts) {
  console.log(`── ${c.name} — "${c.blurb}"`)
  for (const row of c.grid) console.log(row.map((v) => (v ? '#' : '.')).join(''))
  console.log('')
}
