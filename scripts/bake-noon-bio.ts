// Bake today's Noon artifact using the new bio-engine (Ising physics).
// Reads:
//   public/amber-noon/mood-YYYY-MM-DD.json
//   public/amber-noon/concepts-YYYY-MM-DD.json
// Writes:
//   public/amber-noon/YYYY-MM-DD.json  (NoonRun-compatible shape)
//
// Physics lifted from scripts/bio-engine-per-concept.ts (G3 params).
// Session: up to MAX_ATTEMPTS Ising runs, first lander wins. If no attempt
// lands across MAX_SESSIONS retries, we keep the best (highest finalCrisp).
//
// Usage:
//   npx tsx scripts/bake-noon-bio.ts             (today)
//   npx tsx scripts/bake-noon-bio.ts 2026-04-17

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COLS = 52
const ROWS = 20

// Ising params (G3 — mirrors experiment/page.tsx)
const J = 0.4
const OFF_BIAS = -0.9
const T_START = 2.0
const T_END = 0.03
const DT = 0.07
const ATTEMPT_SECONDS = 12
const LANDING_THRESHOLD = 0.80
const CRYSTAL_SECONDS = 3
const CRYSTAL_BIAS = 1.0
const CRYSTAL_OFF = -2.5
const CRYSTAL_T = 0.005

const MAX_ATTEMPTS = 10
const MAX_SESSIONS = 3

type Grid = number[][]

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

function makeBias(grid: Grid, radius: number, strength: number, off: number): number[][] {
  const aff = computeAffinity(grid, radius)
  return aff.map(row => row.map(a => a * strength + (1 - a) * off))
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

interface AttemptResult {
  annealCrisp: number
  finalCrisp: number
  landed: boolean
  finalSpin: number[][]   // spin field at end (for rendering)
  finalGrid: Grid         // thresholded 0/1 grid (what reader sees)
}

function runAttempt(grid: Grid, radius: number, biasStrength: number): AttemptResult {
  const bias = makeBias(grid, radius, biasStrength, OFF_BIAS)
  const crystalBias = makeBias(grid, radius, CRYSTAL_BIAS, CRYSTAL_OFF)
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
  const finalCrisp = measureCrisp(s, grid)
  // Threshold spin field: > 0 → 1, else 0.
  const finalGrid: Grid = s.map(row => row.map(v => v > 0 ? 1 : 0))
  return { annealCrisp, finalCrisp, landed, finalSpin: s, finalGrid }
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface DailyConcept { name: string; blurb: string; grid: Grid }

function inferTuning(grid: Grid): { radius: number; bias: number } {
  const cells = grid.flat().reduce((a, b) => a + b, 0)
  // Match the experiment's honest landing rates: chunky shapes land ~30-50%
  // of the time, thin shapes need more help. Mean ~3.5 attempts to converge.
  if (cells < 60) return { radius: 2.4, bias: 0.35 }
  if (cells < 120) return { radius: 1.6, bias: 0.22 }
  return { radius: 1.2, bias: 0.18 }
}

function main() {
  const date = process.argv[2] || todayDate()
  const dir = join(__dirname, '..', 'public', 'amber-noon')
  const moodPath = join(dir, `mood-${date}.json`)
  const conceptsPath = join(dir, `concepts-${date}.json`)

  if (!existsSync(moodPath)) throw new Error(`missing ${moodPath}`)
  if (!existsSync(conceptsPath)) throw new Error(`missing ${conceptsPath}`)

  const mood = JSON.parse(readFileSync(moodPath, 'utf8'))
  const { concepts }: { concepts: DailyConcept[] } = JSON.parse(readFileSync(conceptsPath, 'utf8'))

  console.log(`Baking ${date} (mood: ${mood.mood.name}, ${concepts.length} concepts)`)

  const pool = concepts.map(c => ({ ...c, ...inferTuning(c.grid) }))

  // Build a session: up to MAX_ATTEMPTS picks, no two in a row. Run physics
  // per pick; stop at first lander. Retry session up to MAX_SESSIONS.
  interface SessionAttempt {
    concept: DailyConcept & { radius: number; bias: number }
    result: AttemptResult
  }

  let best: { session: SessionAttempt[]; landed: boolean } | null = null
  for (let sess = 0; sess < MAX_SESSIONS; sess++) {
    const session: SessionAttempt[] = []
    let lastIdx = -1
    let landed = false
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      let idx = Math.floor(Math.random() * pool.length)
      let guard = 0
      while (idx === lastIdx && guard++ < 8) idx = Math.floor(Math.random() * pool.length)
      lastIdx = idx
      const c = pool[idx]
      const result = runAttempt(c.grid, c.radius, c.bias)
      session.push({ concept: c, result })
      console.log(`  s${sess} a${i} ${c.name.padEnd(22)} anneal=${result.annealCrisp.toFixed(3)} final=${result.finalCrisp.toFixed(3)} ${result.landed ? 'LANDED' : ''}`)
      if (result.landed) { landed = true; break }
    }
    if (landed) { best = { session, landed: true }; break }
    if (!best) best = { session, landed: false }
    else {
      // keep session with highest max finalCrisp
      const bestMax = Math.max(...best.session.map(x => x.result.finalCrisp))
      const thisMax = Math.max(...session.map(x => x.result.finalCrisp))
      if (thisMax > bestMax) best = { session, landed: false }
    }
  }

  if (!best) throw new Error('no session produced')
  const { session, landed } = best

  // Winner = last attempt (the lander, or the best-we-got).
  const winnerAttempt = session[session.length - 1]
  const attempts = session.map((a, i) => ({
    concept: a.concept.name,
    blurb: a.concept.blurb,
    gridName: a.concept.name,
    grid: a.concept.grid,
    finalGrid: a.result.finalGrid,
    finalSpin: a.result.finalSpin,
    annealCrisp: a.result.annealCrisp,
    finalCrisp: a.result.finalCrisp,
    landed: a.result.landed,
    failed: i !== session.length - 1,
  }))

  const winner = attempts[attempts.length - 1]

  const closingStatement =
    landed
      ? `it came through. ${winner.concept}.`
      : `nothing landed today. just ${winner.concept}, dissolving.`

  const run = {
    date,
    mood: mood.mood,
    reaction: mood.reaction,
    keywords: mood.keywords,
    attempts,
    winner,
    closingStatement,
    meta: {
      engine: 'bio-engine/G3',
      sessions: best ? (landed ? 1 : MAX_SESSIONS) : 0,
      landed,
    },
  }

  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, `${date}.json`)
  writeFileSync(outPath, JSON.stringify(run, null, 2) + '\n')

  console.log(`\n→ ${outPath}`)
  console.log(`  ${attempts.length} attempts; winner: "${winner.concept}" (${landed ? 'LANDED' : 'best-we-got'}, finalCrisp=${winner.finalCrisp.toFixed(3)})`)
}

main()
