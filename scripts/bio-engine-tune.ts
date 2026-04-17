// Headless tuner for the bio-engine on the noon experimental branch.
// Runs the Ising dynamics across parameter combinations, reports the overlap
// distribution and success rate. Use this to find params that give ~20-30%
// per-attempt success (so sessions typically resolve in 3-5 attempts).
//
// Run: npx tsx scripts/bio-engine-tune.ts

import { CONCEPTS, COLS, ROWS, type Grid } from '../src/app/amber/noon/experiment/concepts'

// ── physics step (identical shape to the page's implementation) ──────────
function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface Params {
  J: number
  BIAS_STRENGTH: number
  OFF_BIAS: number
  T_START: number
  T_END: number
  DT: number
  ATTEMPT_SECONDS: number
  COOLING: 'linear' | 'exp'
  AFFINITY_RADIUS: number     // 0 = binary bias, >0 = smooth falloff over N cells
  // Crystallization: if annealing-end crispness ≥ LANDING_THRESHOLD, continue
  // physics with strong bias + near-zero T for CRYSTAL_SECONDS more to polish
  // the shape to ground-state crispness.
  LANDING_THRESHOLD?: number
  CRYSTAL_SECONDS?: number
  CRYSTAL_BIAS?: number
  CRYSTAL_OFF?: number
  CRYSTAL_T?: number
}

// Precompute an affinity field: 1.0 at target cells, decaying with distance.
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

// Bias field: smooth blend of BIAS (on target) and OFF (on background),
// weighted by affinity. Thin shapes become fuzzy gradient mountains.
function makeBias(grid: Grid, BIAS: number, OFF: number, radius: number): number[][] {
  const aff = computeAffinity(grid, radius)
  return aff.map(row => row.map(a => a * BIAS + (1 - a) * OFF))
}

function temperatureAt(t: number, p: Params): number {
  const prog = Math.min(1, t / p.ATTEMPT_SECONDS)
  if (p.COOLING === 'linear') return Math.max(p.T_END, p.T_START - (p.T_START - p.T_END) * prog)
  // exponential cooling
  const ratio = p.T_END / p.T_START
  return p.T_START * Math.pow(ratio, prog)
}

function measureCrisp(s: number[][], grid: Grid) {
  let targetSum = 0, targetCount = 0
  let offSum = 0, offCount = 0
  let crispTarget = 0, crispOff = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const sv = s[r][c]
    if (grid[r][c] === 1) {
      targetCount++
      targetSum += Math.max(0, sv)
      if (sv > 0.5) crispTarget++
    } else {
      offCount++
      offSum += Math.max(0, sv)
      if (sv < 0.2) crispOff++
    }
  }
  const targetMean = targetCount === 0 ? 0 : targetSum / targetCount
  const offMean = offCount === 0 ? 0 : offSum / offCount
  const signal = targetMean - offMean
  const crisp = (crispTarget / Math.max(1, targetCount) + crispOff / Math.max(1, offCount)) / 2
  return { signal, targetMean, offMean, crisp }
}

function physicsStep(
  s: number[][], bias: number[][],
  T: number, J: number, dt: number,
) {
  const noiseScale = Math.sqrt(2 * T * dt)
  const sNew: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const up = r > 0 ? s[r - 1][c] : 0
    const dn = r < ROWS - 1 ? s[r + 1][c] : 0
    const lf = c > 0 ? s[r][c - 1] : 0
    const rt = c < COLS - 1 ? s[r][c + 1] : 0
    const h = J * (up + dn + lf + rt) + bias[r][c]
    const drift = Math.tanh(h / T) - s[r][c]
    let v = s[r][c] + dt * drift + noiseScale * gauss()
    if (v > 1) v = 1
    else if (v < -1) v = -1
    sNew[r][c] = v
  }
  // In-place copy so the caller's reference remains the same.
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s[r][c] = sNew[r][c]
}

function runAttempt(grid: Grid, p: Params): {
  signal: number; targetMean: number; offMean: number;
  crispAnneal: number; crispFinal: number; landed: boolean;
} {
  const bias = makeBias(grid, p.BIAS_STRENGTH, p.OFF_BIAS, p.AFFINITY_RADIUS)
  const s: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0).map(() => gauss() * 0.25))

  // Annealing phase.
  let physicsTime = 0
  const annealSteps = Math.floor(p.ATTEMPT_SECONDS / p.DT)
  for (let step = 0; step < annealSteps; step++) {
    physicsStep(s, bias, temperatureAt(physicsTime, p), p.J, p.DT)
    physicsTime += p.DT
  }
  const annealResult = measureCrisp(s, grid)
  const threshold = p.LANDING_THRESHOLD ?? 0.80
  const landed = annealResult.crisp >= threshold

  // Crystallization phase — only if landed.
  if (landed && (p.CRYSTAL_SECONDS ?? 0) > 0) {
    const crystalBias = makeBias(
      grid,
      p.CRYSTAL_BIAS ?? p.BIAS_STRENGTH * 2.5,
      p.CRYSTAL_OFF ?? p.OFF_BIAS * 1.5,
      p.AFFINITY_RADIUS,
    )
    const crystalSteps = Math.floor((p.CRYSTAL_SECONDS ?? 3) / p.DT)
    for (let step = 0; step < crystalSteps; step++) {
      physicsStep(s, crystalBias, p.CRYSTAL_T ?? 0.02, p.J, p.DT)
    }
  }

  const finalResult = measureCrisp(s, grid)
  return {
    signal: finalResult.signal,
    targetMean: finalResult.targetMean,
    offMean: finalResult.offMean,
    crispAnneal: annealResult.crisp,
    crispFinal: finalResult.crisp,
    landed,
  }
}

function evaluate(p: Params, trialsPerConcept: number) {
  const allSignal: number[] = []
  const allCrisp: number[] = []
  const allTgt: number[] = []
  const allOff: number[] = []
  const perConcept: { name: string; signal: number; crisp: number; tgt: number; off: number }[] = []
  for (const concept of CONCEPTS) {
    const signals: number[] = [], crisps: number[] = [], tgts: number[] = [], offs: number[] = []
    for (let t = 0; t < trialsPerConcept; t++) {
      const { signal, targetMean, offMean, crisp } = runAttempt(concept.grid, p)
      signals.push(signal); crisps.push(crisp); tgts.push(targetMean); offs.push(offMean)
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    perConcept.push({ name: concept.name, signal: mean(signals), crisp: mean(crisps), tgt: mean(tgts), off: mean(offs) })
    allSignal.push(...signals); allCrisp.push(...crisps); allTgt.push(...tgts); allOff.push(...offs)
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const std = (a: number[]) => {
    const m = mean(a)
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
  }
  // Define "success" as high crispness (shape clearly visible, background clearly clean).
  const successRate70 = allCrisp.filter(v => v >= 0.70).length / allCrisp.length
  const successRate80 = allCrisp.filter(v => v >= 0.80).length / allCrisp.length
  const successRate90 = allCrisp.filter(v => v >= 0.90).length / allCrisp.length
  return {
    meanSignal: mean(allSignal), stdSignal: std(allSignal),
    meanCrisp: mean(allCrisp), stdCrisp: std(allCrisp),
    meanTgt: mean(allTgt), meanOff: mean(allOff),
    successRate70, successRate80, successRate90,
    perConcept,
  }
}

function fmt(n: number, digits = 3) { return n.toFixed(digits) }

// ── parameter sweep ──────────────────────────────────────────────────────
const BASE: Params = {
  J: 0.4,
  BIAS_STRENGTH: 1.0,
  OFF_BIAS: -0.5,
  T_START: 2.0,
  T_END: 0.08,
  DT: 0.07,
  ATTEMPT_SECONDS: 10,
  COOLING: 'linear',
  AFFINITY_RADIUS: 1.8,
}

function summary(label: string, p: Params, trialsPerConcept: number) {
  const t0 = Date.now()
  const r = evaluate(p, trialsPerConcept)
  const dt = (Date.now() - t0) / 1000
  console.log(`\n── ${label}  [${dt.toFixed(1)}s] ──`)
  console.log(`  J=${p.J}  BIAS=${p.BIAS_STRENGTH}  OFF=${p.OFF_BIAS}  T=${p.T_START}→${p.T_END} ${p.COOLING}  affR=${p.AFFINITY_RADIUS}  dur=${p.ATTEMPT_SECONDS}s`)
  console.log(`  signal=${fmt(r.meanSignal)}  tgt=${fmt(r.meanTgt)}  off=${fmt(r.meanOff)}  crisp=${fmt(r.meanCrisp)}±${fmt(r.stdCrisp)}`)
  console.log(`  success   crisp>70%=${fmt(r.successRate70 * 100, 1)}%   >80%=${fmt(r.successRate80 * 100, 1)}%   >90%=${fmt(r.successRate90 * 100, 1)}%`)
  const sorted = [...r.perConcept].sort((a, b) => a.crisp - b.crisp)
  console.log(`  worst: ${sorted[0].name}=${fmt(sorted[0].crisp)}  best: ${sorted[sorted.length - 1].name}=${fmt(sorted[sorted.length - 1].crisp)}`)
  return r
}

function characterize(label: string, p: Params, runs: number) {
  console.log(`\n── ${label} ──`)
  const hasCrystal = (p.CRYSTAL_SECONDS ?? 0) > 0
  console.log(`  J=${p.J} BIAS=${p.BIAS_STRENGTH} OFF=${p.OFF_BIAS} T=${p.T_START}→${p.T_END} affR=${p.AFFINITY_RADIUS} dur=${p.ATTEMPT_SECONDS}s${hasCrystal ? ` +crystal=${p.CRYSTAL_SECONDS}s@T${p.CRYSTAL_T}bias${p.CRYSTAL_BIAS}` : ''}`)
  const perConcept = new Map<string, { anneal: number[]; final: number[]; landed: boolean[] }>()
  for (const concept of CONCEPTS) {
    const anneal: number[] = [], final: number[] = [], landed: boolean[] = []
    for (let t = 0; t < runs; t++) {
      const r = runAttempt(concept.grid, p)
      anneal.push(r.crispAnneal); final.push(r.crispFinal); landed.push(r.landed)
    }
    perConcept.set(concept.name, { anneal, final, landed })
  }
  const allAnneal: number[] = [], allFinal: number[] = [], allLanded: boolean[] = []
  for (const { anneal, final, landed } of perConcept.values()) {
    allAnneal.push(...anneal); allFinal.push(...final); allLanded.push(...landed)
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const landedRate = allLanded.filter(x => x).length / allLanded.length
  // Crispness of LANDED attempts only — this is what viewers see.
  const landedFinalCrisps = allFinal.filter((_, i) => allLanded[i])
  const landedFinalMean = landedFinalCrisps.length === 0 ? 0 : mean(landedFinalCrisps)
  const landedFinalMin = landedFinalCrisps.length === 0 ? 0 : Math.min(...landedFinalCrisps)
  console.log(`  anneal-only: mean=${fmt(mean(allAnneal))}  landing-rate=${(landedRate * 100).toFixed(1)}%`)
  console.log(`  final (post-crystal): mean=${fmt(mean(allFinal))}`)
  console.log(`  ★ OF LANDED ATTEMPTS: final crisp mean=${fmt(landedFinalMean)}  min=${fmt(landedFinalMin)}`)
  // Per-concept table.
  const rows = [...perConcept.entries()].map(([n, { anneal, final, landed }]) => ({
    n,
    lrate: landed.filter(x => x).length / landed.length,
    annealMean: mean(anneal),
    finalMean: mean(final),
    landedFinalMean: landed.some(x => x) ? mean(final.filter((_, i) => landed[i])) : NaN,
  }))
  rows.sort((a, b) => a.lrate - b.lrate)
  console.log(`  per-concept:  land%  anneal→final  (landed only)`)
  for (const { n, lrate, annealMean, finalMean, landedFinalMean: lfm } of rows) {
    const lfmStr = isNaN(lfm) ? '  —  ' : fmt(lfm)
    console.log(`    ${n.padEnd(20)} ${(lrate * 100).toFixed(0).padStart(3)}%   ${fmt(annealMean)} → ${fmt(finalMean)}   landed=${lfmStr}`)
  }
}

// Simulate full 10-attempt sessions. An attempt "lands" when its annealing
// crispness crosses LANDING_THRESHOLD — the session ends there (crystallization
// would polish the landed state visually in the page, but doesn't change the count).
function simulateSessions(label: string, p: Params, sessions: number) {
  const threshold = p.LANDING_THRESHOLD ?? 0.80
  console.log(`\n── SESSION SIM: ${label}  (landing threshold=${threshold}) ──`)
  const attemptsToSuccess: number[] = []
  const successCrisps: number[] = []
  let fullFails = 0
  for (let sess = 0; sess < sessions; sess++) {
    let lastIdx = -1
    let succeededAt = -1
    let lastFinalCrisp = 0
    for (let attempt = 0; attempt < 10; attempt++) {
      let idx = Math.floor(Math.random() * CONCEPTS.length)
      let guard = 0
      while (idx === lastIdx && guard++ < 8) idx = Math.floor(Math.random() * CONCEPTS.length)
      lastIdx = idx
      const r = runAttempt(CONCEPTS[idx].grid, p)
      if (r.landed) {
        succeededAt = attempt + 1
        lastFinalCrisp = r.crispFinal
        break
      }
    }
    if (succeededAt === -1) fullFails++
    else { attemptsToSuccess.push(succeededAt); successCrisps.push(lastFinalCrisp) }
  }
  if (attemptsToSuccess.length === 0) {
    console.log(`  ALL SESSIONS FAILED (${sessions}/${sessions} full-fail)`)
    return
  }
  attemptsToSuccess.sort((a, b) => a - b)
  const mean = attemptsToSuccess.reduce((a, b) => a + b, 0) / attemptsToSuccess.length
  const median = attemptsToSuccess[Math.floor(attemptsToSuccess.length / 2)]
  const p25 = attemptsToSuccess[Math.floor(attemptsToSuccess.length * 0.25)]
  const p75 = attemptsToSuccess[Math.floor(attemptsToSuccess.length * 0.75)]
  // Distribution.
  const hist = new Array(11).fill(0)
  for (const a of attemptsToSuccess) hist[a]++
  console.log(`  sessions=${sessions}  full-fail=${fullFails} (${(fullFails / sessions * 100).toFixed(1)}%)`)
  console.log(`  attempts-to-success: mean=${mean.toFixed(2)}  median=${median}  IQR=[${p25}..${p75}]`)
  const attemptDur = p.ATTEMPT_SECONDS + (p.CRYSTAL_SECONDS ?? 0) + 1.8  // physics + crystal + hold
  const succDur = p.ATTEMPT_SECONDS + (p.CRYSTAL_SECONDS ?? 0) + 4        // success path holds longer
  console.log(`  ≈ session time: mean=${((mean - 1) * attemptDur + succDur).toFixed(0)}s  (${p.ATTEMPT_SECONDS}s anneal + ${p.CRYSTAL_SECONDS ?? 0}s crystal per attempt)`)
  const successMean = successCrisps.length ? successCrisps.reduce((a, b) => a + b, 0) / successCrisps.length : 0
  const successMin = successCrisps.length ? Math.min(...successCrisps) : 0
  console.log(`  landed attempt final crisp: mean=${fmt(successMean)} min=${fmt(successMin)}`)
  console.log(`  histogram (attempts where success occurred):`)
  for (let i = 1; i <= 10; i++) {
    const bar = '█'.repeat(Math.round(hist[i] / sessions * 50))
    console.log(`    at attempt ${String(i).padStart(2)}:  ${String(hist[i]).padStart(3)}  ${bar}`)
  }
}

async function main() {
  const RUNS = 14

  console.log('\n═══ CRYSTALLIZATION PHASE — polish landed shapes to ground state ═══')
  console.log('Anneal to discovery (threshold 0.78–0.82). If landed, continue physics')
  console.log('with strong bias + near-zero T for 2–3 more seconds. Goal: final crisp ≥ 0.95.\n')

  // Base physics (anneal) tuned for a discovery feel (threshold 0.80, ~30% landing rate).
  const ANNEAL_BASE: Partial<Params> = {
    J: 0.4, BIAS_STRENGTH: 0.22, OFF_BIAS: -0.9, AFFINITY_RADIUS: 1.2,
    T_START: 2.0, T_END: 0.03, DT: 0.07, ATTEMPT_SECONDS: 12,
  }

  const candidates: Array<{ label: string; p: Partial<Params> }> = [
    // No crystallization baseline
    {
      label: 'G0: no crystal (baseline)',
      p: { ...ANNEAL_BASE, LANDING_THRESHOLD: 0.80, CRYSTAL_SECONDS: 0 },
    },
    // Gentle crystallization: keep affinity bias shape, small bias boost, T→0.01
    {
      label: 'G1: crystal 2s, BIAS×2 T=0.01',
      p: { ...ANNEAL_BASE, LANDING_THRESHOLD: 0.80, CRYSTAL_SECONDS: 2, CRYSTAL_BIAS: 0.5, CRYSTAL_OFF: -1.5, CRYSTAL_T: 0.01 },
    },
    {
      label: 'G2: crystal 3s, BIAS×3 T=0.01',
      p: { ...ANNEAL_BASE, LANDING_THRESHOLD: 0.80, CRYSTAL_SECONDS: 3, CRYSTAL_BIAS: 0.7, CRYSTAL_OFF: -2.0, CRYSTAL_T: 0.01 },
    },
    {
      label: 'G3: crystal 3s, BIAS×4 T=0.005',
      p: { ...ANNEAL_BASE, LANDING_THRESHOLD: 0.80, CRYSTAL_SECONDS: 3, CRYSTAL_BIAS: 1.0, CRYSTAL_OFF: -2.5, CRYSTAL_T: 0.005 },
    },
    // Lower landing threshold — more attempts qualify for crystallization
    {
      label: 'G4: threshold=0.75, crystal 3s BIAS=0.8',
      p: { ...ANNEAL_BASE, LANDING_THRESHOLD: 0.75, CRYSTAL_SECONDS: 3, CRYSTAL_BIAS: 0.8, CRYSTAL_OFF: -2.0, CRYSTAL_T: 0.01 },
    },
    {
      label: 'G5: threshold=0.78, crystal 3s BIAS=0.9',
      p: { ...ANNEAL_BASE, LANDING_THRESHOLD: 0.78, CRYSTAL_SECONDS: 3, CRYSTAL_BIAS: 0.9, CRYSTAL_OFF: -2.2, CRYSTAL_T: 0.008 },
    },
    // Harder anneal conditions (weaker bias) + strong crystallization
    {
      label: 'G6: BIAS=0.20 th=0.75, crystal 3s',
      p: { ...ANNEAL_BASE, BIAS_STRENGTH: 0.20, LANDING_THRESHOLD: 0.75, CRYSTAL_SECONDS: 3, CRYSTAL_BIAS: 1.0, CRYSTAL_OFF: -2.5, CRYSTAL_T: 0.005 },
    },
    {
      label: 'G7: BIAS=0.18 th=0.72, crystal 3s',
      p: { ...ANNEAL_BASE, BIAS_STRENGTH: 0.18, LANDING_THRESHOLD: 0.72, CRYSTAL_SECONDS: 3, CRYSTAL_BIAS: 1.0, CRYSTAL_OFF: -2.5, CRYSTAL_T: 0.005 },
    },
  ]
  for (const { label, p } of candidates) {
    characterize(label, { ...BASE, ...p }, RUNS)
  }

  // Session-level simulations for the most promising configs.
  console.log('\n\n═══ SESSION-LEVEL SIMS for top candidates ═══')
  const top: Array<{ label: string; p: Partial<Params> }> = [
    candidates[2], candidates[3], candidates[5], candidates[6], candidates[7],
  ]
  for (const { label, p } of top) {
    simulateSessions(label, { ...BASE, ...p }, 150)
  }
}

main()
