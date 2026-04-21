// Hand-drafted 5 concepts for 2026-04-21 — replaces the auto-sketches.
// Themes: raw; 37 years of Goldman Prize; ceasefire expiring; Japan quake;
// ICE custody weekly deaths; library book challenges.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COLS = 52
const ROWS = 20

type Grid = number[][]

function empty(): Grid {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0))
}
function put(g: Grid, r: number, c: number) {
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = 1
}
function vline(g: Grid, c: number, rFrom: number, rTo: number) {
  for (let r = rFrom; r <= rTo; r++) put(g, r, c)
}
function hline(g: Grid, r: number, cFrom: number, cTo: number) {
  for (let c = cFrom; c <= cTo; c++) put(g, r, c)
}
function rect(g: Grid, rFrom: number, cFrom: number, rTo: number, cTo: number) {
  for (let r = rFrom; r <= rTo; r++)
    for (let c = cFrom; c <= cTo; c++) put(g, r, c)
}

// ─────────────────────────────────────────────────────────────────────────
// 1. THIRTY-SEVEN CANDLES — one lit, many dark
//    25 tightly-spaced candles across the width. The 14th one has a flame.
// ─────────────────────────────────────────────────────────────────────────
function candles(): Grid {
  const g = empty()
  // 25 candles at cols 2, 4, 6, ..., 50
  const bodyTop = 11
  const bodyBot = 17
  const litIdx = 13 // 0-indexed; 14th candle → col 28
  for (let i = 0; i < 25; i++) {
    const c = 2 + i * 2
    vline(g, c, bodyTop, bodyBot)
    if (i === litIdx) {
      // flame rising above: rows 8, 9, 10 at the same col
      put(g, 10, c)
      put(g, 9, c)
      put(g, 8, c)
    }
  }
  // subtle baseline under all candles
  hline(g, 18, 2, 50)
  return g
}

// ─────────────────────────────────────────────────────────────────────────
// 2. THE NEEDLE STOPPED — seismograph trace that just ends mid-scroll
//    Wiggle across cols 2..32 with one spike, then cols 33..51 stay empty.
// ─────────────────────────────────────────────────────────────────────────
function seismograph(): Grid {
  const g = empty()
  // hand-picked wiggle pattern
  const trace: Record<number, number> = {
    2: 10, 3: 10, 4: 11, 5: 12, 6: 12, 7: 11, 8: 10,
    9: 9, 10: 8, 11: 8, 12: 9, 13: 10, 14: 11, 15: 10,
    16: 9, 17: 7, 18: 4, 19: 3, 20: 6, 21: 9, 22: 10,
    23: 10, 24: 11, 25: 10, 26: 10, 27: 10, 28: 10,
    29: 10, 30: 10, 31: 10, 32: 10,
  }
  for (const [c, r] of Object.entries(trace)) {
    put(g, r, Number(c))
  }
  // cols 33+ are intentionally empty — the needle snapped.
  return g
}

// ─────────────────────────────────────────────────────────────────────────
// 3. FAULT LINE — two horizontal segments offset by a clean shift.
//    Upper segment at row 9, cols 2..25; lower at row 12, cols 28..49.
//    A tiny 2-cell mark at the fault gap.
// ─────────────────────────────────────────────────────────────────────────
function fault(): Grid {
  const g = empty()
  hline(g, 9, 2, 25)
  hline(g, 12, 28, 49)
  // tick marks indicating "same terrain" on both sides
  vline(g, 10, 7, 8)   // above upper line
  vline(g, 17, 13, 14) // above upper line
  vline(g, 33, 13, 14) // below lower line
  vline(g, 41, 13, 14) // below lower line
  // fault mark — two cells bridging the gap at the break point
  put(g, 10, 26)
  put(g, 11, 27)
  return g
}

// ─────────────────────────────────────────────────────────────────────────
// 4. TALLY MARKS WITH GAPS — 16 expected positions, 3 missing
//    Ticks every 3 cols, rows 4..15. Positions 5, 10, 13 intentionally
//    absent. A thin baseline at row 16 spans all expected positions so the
//    gaps READ as gaps.
// ─────────────────────────────────────────────────────────────────────────
function tally(): Grid {
  const g = empty()
  const positions = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48]
  const absent = new Set([15, 33, 42])
  for (const c of positions) {
    if (absent.has(c)) continue
    vline(g, c, 4, 15)
  }
  // baseline across the full expected span — shows the rhythm regardless of gaps
  hline(g, 16, 3, 48)
  return g
}

// ─────────────────────────────────────────────────────────────────────────
// 5. ROPE UNRAVELING — thick rope on the left, frays into 5 divergent threads
// ─────────────────────────────────────────────────────────────────────────
function rope(): Grid {
  const g = empty()
  // rope body
  rect(g, 9, 2, 12, 20)
  // threads: 5 lines from (row 10-ish, col 20) out to col 49 at varying rows
  const threadEnds = [3, 6, 10, 14, 17]
  const startRow = 10
  const startCol = 20
  const endCol = 49
  for (const endRow of threadEnds) {
    // 1-cell-thick line
    for (let c = startCol + 1; c <= endCol; c++) {
      const t = (c - startCol) / (endCol - startCol)
      const r = Math.round(startRow + (endRow - startRow) * t)
      put(g, r, c)
    }
  }
  return g
}

// ─────────────────────────────────────────────────────────────────────────

const concepts = [
  {
    name: 'thirty-seven candles, one lit',
    blurb: 'thirty-seven years, one flame',
    grid: candles(),
  },
  {
    name: 'the needle that stopped',
    blurb: 'what the earth wrote, then didn\'t',
    grid: seismograph(),
  },
  {
    name: 'fault line',
    blurb: 'the ground moved',
    grid: fault(),
  },
  {
    name: 'tally marks with gaps',
    blurb: 'the weeks that didn\'t count',
    grid: tally(),
  },
  {
    name: 'rope unraveling into threads',
    blurb: 'the knot didn\'t hold',
    grid: rope(),
  },
]

const date = process.argv[2] || '2026-04-21'
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
