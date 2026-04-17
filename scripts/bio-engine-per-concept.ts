// Per-concept success-rate measurement for the bio-engine.
// Uses the exact G3 params the page currently runs, and reports landing
// rate + final crispness per concept over N trials.
// Run: npx tsx scripts/bio-engine-per-concept.ts

import { CONCEPTS, COLS, ROWS, type Grid } from '../src/app/amber/noon/experiment/concepts'

// ── page params (must stay in sync with src/app/amber/noon/experiment/page.tsx) ──
const J = 0.4
const BIAS_STRENGTH = 0.22
const OFF_BIAS = -0.9
const AFFINITY_RADIUS = 1.2
const T_START = 2.0
const T_END = 0.03
const DT = 0.07
const ATTEMPT_SECONDS = 12
const LANDING_THRESHOLD = 0.80
const CRYSTAL_SECONDS = 3
const CRYSTAL_BIAS = 1.0
const CRYSTAL_OFF = -2.5
const CRYSTAL_T = 0.005

const TRIALS = 100

function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function computeAffinity(grid: Grid, radius: number): number[][] {
  if (radius <= 0) return grid.map(row => row.map(v => (v === 1 ? 1 : 0)))
  const aff: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  const R = Math.ceil(radius) + 1
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] === 1) { aff[r][c] = 1.0; continue }
    let minD = Infinity
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      if (grid[rr][cc] === 1) {
        const d = Math.hypot(dr, dc)
        if (d < minD) minD = d
      }
    }
    aff[r][c] = minD === Infinity ? 0 : Math.max(0, 1 - minD / radius)
  }
  return aff
}

function makeBias(grid: Grid, BIAS: number, OFF: number): number[][] {
  const aff = computeAffinity(grid, AFFINITY_RADIUS)
  return aff.map(row => row.map(a => a * BIAS + (1 - a) * OFF))
}

function measureCrisp(s: number[][], grid: Grid): number {
  let ct = 0, co = 0, tc = 0, oc = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] === 1) { tc++; if (s[r][c] > 0.5) ct++ }
    else { oc++; if (s[r][c] < 0.2) co++ }
  }
  return (ct / Math.max(1, tc) + co / Math.max(1, oc)) / 2
}

function step(s: number[][], bias: number[][], T: number) {
  const noiseScale = Math.sqrt(2 * T * DT)
  const sNew: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const up = r > 0 ? s[r - 1][c] : 0
    const dn = r < ROWS - 1 ? s[r + 1][c] : 0
    const lf = c > 0 ? s[r][c - 1] : 0
    const rt = c < COLS - 1 ? s[r][c + 1] : 0
    const h = J * (up + dn + lf + rt) + bias[r][c]
    const drift = Math.tanh(h / T) - s[r][c]
    let v = s[r][c] + DT * drift + noiseScale * gauss()
    if (v > 1) v = 1; else if (v < -1) v = -1
    sNew[r][c] = v
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s[r][c] = sNew[r][c]
}

function runAttempt(grid: Grid): { annealCrisp: number; finalCrisp: number; landed: boolean } {
  const bias = makeBias(grid, BIAS_STRENGTH, OFF_BIAS)
  const crystalBias = makeBias(grid, CRYSTAL_BIAS, CRYSTAL_OFF)
  const s: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0).map(() => gauss() * 0.25))
  let t = 0
  const annealSteps = Math.floor(ATTEMPT_SECONDS / DT)
  for (let i = 0; i < annealSteps; i++) {
    const T = Math.max(T_END, T_START - (T_START - T_END) * (t / ATTEMPT_SECONDS))
    step(s, bias, T)
    t += DT
  }
  const annealCrisp = measureCrisp(s, grid)
  const landed = annealCrisp >= LANDING_THRESHOLD
  if (landed) {
    const crystalSteps = Math.floor(CRYSTAL_SECONDS / DT)
    for (let i = 0; i < crystalSteps; i++) step(s, crystalBias, CRYSTAL_T)
  }
  return { annealCrisp, finalCrisp: measureCrisp(s, grid), landed }
}

function mean(a: number[]) { return a.reduce((x, y) => x + y, 0) / a.length }

function main() {
  console.log(`\nPer-concept stats  (${TRIALS} trials/concept, G3 params)\n`)
  console.log(`concept               | targets | land% | anneal  final  | landed-final`)
  console.log(`──────────────────────┼─────────┼───────┼────────────────┼─────────────`)
  const rows: { name: string; cells: number; land: number; anneal: number; fin: number; landedFin: number }[] = []
  for (const concept of CONCEPTS) {
    const cells = concept.grid.flat().reduce((s, v) => s + v, 0)
    const anneal: number[] = [], fin: number[] = [], landed: boolean[] = []
    for (let i = 0; i < TRIALS; i++) {
      const r = runAttempt(concept.grid)
      anneal.push(r.annealCrisp); fin.push(r.finalCrisp); landed.push(r.landed)
    }
    const landRate = landed.filter(x => x).length / TRIALS
    const landedFin = landed.some(x => x) ? mean(fin.filter((_, i) => landed[i])) : NaN
    rows.push({ name: concept.name, cells, land: landRate, anneal: mean(anneal), fin: mean(fin), landedFin })
  }
  rows.sort((a, b) => a.land - b.land)
  for (const r of rows) {
    const lfStr = isNaN(r.landedFin) ? '  —  ' : r.landedFin.toFixed(3)
    console.log(
      `${r.name.padEnd(22)}|   ${String(r.cells).padStart(3)}   | ${(r.land * 100).toFixed(0).padStart(3)}%  |  ${r.anneal.toFixed(3)}  ${r.fin.toFixed(3)} |   ${lfStr}`
    )
  }
  const allLand = rows.map(r => r.land)
  console.log(`\nsummary: overall land-rate=${(mean(allLand) * 100).toFixed(1)}%  min=${(Math.min(...allLand) * 100).toFixed(0)}%  max=${(Math.max(...allLand) * 100).toFixed(0)}%`)
}

main()
