// Per-concept affinity-radius sweep.
// For each concept, try several AFFINITY_RADIUS values and report landing
// rate. Goal: find the smallest radius that gives ~20–30% land rate for
// each shape, so hard/easy concepts all land at a similar cadence.
// Run: npx tsx scripts/bio-engine-sweep-radius.ts

import { CONCEPTS, COLS, ROWS, type Grid } from '../src/app/amber/noon/experiment/concepts'

// ── shared physics (G3 params) ───────────────────────────────────────────
const J = 0.4
const BIAS_STRENGTH = 0.22
const OFF_BIAS = -0.9
const T_START = 2.0
const T_END = 0.03
const DT = 0.07
const ATTEMPT_SECONDS = 12
const LANDING_THRESHOLD = 0.80

const TRIALS = 60  // per (concept, radius) pair
const RADII = [1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6]

function gauss() {
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

function makeBias(grid: Grid, radius: number): number[][] {
  const aff = computeAffinity(grid, radius)
  return aff.map(row => row.map(a => a * BIAS_STRENGTH + (1 - a) * OFF_BIAS))
}

function measureCrisp(s: number[][], grid: Grid): number {
  let ct = 0, co = 0, tc = 0, oc = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] === 1) { tc++; if (s[r][c] > 0.5) ct++ }
    else { oc++; if (s[r][c] < 0.2) co++ }
  }
  return (ct / Math.max(1, tc) + co / Math.max(1, oc)) / 2
}

function stepPhys(s: number[][], bias: number[][], T: number) {
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

function landRate(grid: Grid, radius: number): { land: number; anneal: number } {
  const bias = makeBias(grid, radius)
  let wins = 0
  let sumCrisp = 0
  for (let t = 0; t < TRIALS; t++) {
    const s: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0).map(() => gauss() * 0.25))
    let time = 0
    const steps = Math.floor(ATTEMPT_SECONDS / DT)
    for (let i = 0; i < steps; i++) {
      const T = Math.max(T_END, T_START - (T_START - T_END) * (time / ATTEMPT_SECONDS))
      stepPhys(s, bias, T)
      time += DT
    }
    const crisp = measureCrisp(s, grid)
    sumCrisp += crisp
    if (crisp >= LANDING_THRESHOLD) wins++
  }
  return { land: wins / TRIALS, anneal: sumCrisp / TRIALS }
}

function main() {
  console.log(`\nAffinity-radius sweep  (${TRIALS} trials/cell)\n`)
  const header = 'concept               |' + RADII.map(r => `  r=${r.toFixed(1)} `).join('|')
  console.log(header)
  console.log('─'.repeat(header.length))
  const picks: { name: string; pick: number; land: number }[] = []
  for (const concept of CONCEPTS) {
    const row: { radius: number; land: number; anneal: number }[] = []
    for (const r of RADII) row.push({ radius: r, ...landRate(concept.grid, r) })
    const cells = row.map(x => `  ${(x.land * 100).toFixed(0).padStart(3)}% `).join('|')
    console.log(`${concept.name.padEnd(22)}|${cells}`)
    // Pick the smallest radius with land rate in [0.18, 0.45] sweet spot.
    // If none lands in that band, take the one closest to 0.30.
    const inBand = row.filter(x => x.land >= 0.18 && x.land <= 0.45)
    let pick: { radius: number; land: number; anneal: number }
    if (inBand.length > 0) pick = inBand[0]  // smallest radius in band
    else pick = row.reduce((best, x) => Math.abs(x.land - 0.30) < Math.abs(best.land - 0.30) ? x : best, row[0])
    picks.push({ name: concept.name, pick: pick.radius, land: pick.land })
  }
  console.log('\nRecommended per-concept radius:')
  for (const p of picks) {
    console.log(`  ${p.name.padEnd(22)} r=${p.pick.toFixed(1)}  (~${(p.land * 100).toFixed(0)}% land)`)
  }
}

main()
