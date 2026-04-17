// 2D sweep: for each concept, vary (AFFINITY_RADIUS, BIAS_STRENGTH) and
// find a combo that yields ~20–40% land rate. Per-concept tuple baked
// into concepts.ts after.
// Run: npx tsx scripts/bio-engine-sweep-2d.ts

import { CONCEPTS, COLS, ROWS, type Grid } from '../src/app/amber/noon/experiment/concepts'

const J = 0.4
const OFF_BIAS = -0.9
const T_START = 2.0
const T_END = 0.03
const DT = 0.07
const ATTEMPT_SECONDS = 12
const LANDING_THRESHOLD = 0.80
const TRIALS = 40

const RADII = [1.2, 2.0, 2.8, 3.6]
const BIASES = [0.22, 0.40, 0.60, 0.85, 1.10, 1.40]

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

function makeBias(grid: Grid, radius: number, bias: number): number[][] {
  const aff = computeAffinity(grid, radius)
  return aff.map(row => row.map(a => a * bias + (1 - a) * OFF_BIAS))
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

function landRate(grid: Grid, radius: number, bias: number): number {
  const biasField = makeBias(grid, radius, bias)
  let wins = 0
  for (let t = 0; t < TRIALS; t++) {
    const s: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0).map(() => gauss() * 0.25))
    let time = 0
    const steps = Math.floor(ATTEMPT_SECONDS / DT)
    for (let i = 0; i < steps; i++) {
      const T = Math.max(T_END, T_START - (T_START - T_END) * (time / ATTEMPT_SECONDS))
      stepPhys(s, biasField, T)
      time += DT
    }
    if (measureCrisp(s, grid) >= LANDING_THRESHOLD) wins++
  }
  return wins / TRIALS
}

function main() {
  console.log(`\n2D sweep: per-concept (radius × bias) → land rate. Target: ~20–40%.\n`)
  const picks: { name: string; radius: number; bias: number; land: number }[] = []
  for (const concept of CONCEPTS) {
    console.log(`── ${concept.name} ──`)
    const header = '  R\\B  |' + BIASES.map(b => ` ${b.toFixed(2)} `).join('|')
    console.log(header)
    let best: { radius: number; bias: number; land: number } | null = null
    for (const r of RADII) {
      const cells: number[] = []
      for (const b of BIASES) cells.push(landRate(concept.grid, r, b))
      const row = `  r=${r.toFixed(1)}|` + cells.map(c => `  ${(c * 100).toFixed(0).padStart(3)}%`).join('|')
      console.log(row)
      cells.forEach((land, i) => {
        // Prefer combos inside [0.20, 0.40]; among those, smallest bias first, then smallest radius.
        if (land >= 0.20 && land <= 0.40) {
          if (!best || BIASES[i] < best.bias || (BIASES[i] === best.bias && r < best.radius)) {
            best = { radius: r, bias: BIASES[i], land }
          }
        }
      })
    }
    if (!best) {
      // Fall back: combo with land rate closest to 0.30 (accept anything)
      let fallback = { radius: RADII[0], bias: BIASES[0], land: 0 }
      let bestDist = Infinity
      for (const r of RADII) for (const b of BIASES) {
        const land = landRate(concept.grid, r, b)
        const d = Math.abs(land - 0.30)
        if (d < bestDist) { bestDist = d; fallback = { radius: r, bias: b, land } }
      }
      best = fallback
    }
    const pick = best as { radius: number; bias: number; land: number }
    picks.push({ name: concept.name, radius: pick.radius, bias: pick.bias, land: pick.land })
    console.log(`  → pick r=${pick.radius.toFixed(1)} bias=${pick.bias.toFixed(2)} (~${(pick.land * 100).toFixed(0)}%)`)
    console.log('')
  }
  console.log('\n═══ RECOMMENDED PER-CONCEPT TUPLES ═══')
  for (const p of picks) {
    console.log(`  ${p.name.padEnd(22)} radius=${p.radius.toFixed(1)}  bias=${p.bias.toFixed(2)}   (~${(p.land * 100).toFixed(0)}% land)`)
  }
  console.log('\n// Copy-paste into concepts.ts:')
  for (const p of picks) {
    console.log(`  { name: '${p.name}', grid: ${p.name.toUpperCase().replace(/ /g, '_').replace('ON_A_WIRE', '_WIRE')}, radius: ${p.radius}, bias: ${p.bias} },`)
  }
}

main()
