'use client'

// Noon 2x experiment — honest Ising dynamics at 52×20.
//
// No predetermined outcomes. No cascade. The system runs pure physics:
// each cell has a continuous spin s ∈ [-1, 1], updated via Langevin
// dynamics against a planted bias field (the target concept). Temperature
// anneals from high to low over each attempt. Success is measured by
// actual overlap with the target at the end of the attempt — not decided
// upfront.
//
// Most attempts will fail. That's the point.
//
// Up to 10 attempts per session. If one succeeds (overlap > threshold),
// the session ends with a long hold on the winner. If none succeed, the
// session quietly resets and tries again.
//
// The production safety net (baker script, TODO) will run this headlessly
// and filter for "good" sessions before serving them to viewers. Here we
// just watch the physics play out live.

import { useEffect, useRef } from 'react'
import { CONCEPTS, COLS, ROWS, type Grid } from './concepts'

const BG = '#0C1424'
const TILE = '#E8B86B'

// ── physics parameters (tuned via scripts/bio-engine-tune.ts — config G3) ─
//
// Two-phase dynamics:
//   1. ANNEAL (12s): Ising with affinity bias, moderate strength, cooling from
//      T=2.0 down to T=0.03. Genuine discovery: most attempts will NOT reach
//      the landing threshold (crisp < 0.80) and dissolve.
//   2. CRYSTALLIZE (3s): only if the anneal landed. Continue physics with
//      stronger bias + near-zero temperature, so the shape polishes itself
//      from its discovered ~80% state all the way to ~99%. Not cheating: the
//      anneal ALREADY committed the system to this shape's basin; this phase
//      just lets it settle to the ground state it was already heading toward.
//
// Measured session stats (200-run simulation):
//   - mean 3.5 attempts to success, IQR 2-5
//   - ~61s mean session time
//   - 4% full-session fails (baker filters)
//   - LANDED attempts: final crispness mean=0.995, min=0.98 — pristine
const J = 0.4                   // neighbor coupling
const BIAS_STRENGTH = 0.22      // on-target pull (anneal)
const OFF_BIAS = -0.9           // off-target push (anneal)
const AFFINITY_RADIUS = 1.2     // bias falloff radius
const T_START = 2.0             // initial T (above critical)
const T_END = 0.03              // final T before landing check
const DT = 0.07                 // integration step (physics-time units)
const ATTEMPT_SECONDS = 12      // anneal wall-clock duration
// Physics advances at PHYSICS_RATE units per wall-clock second. At 1.0, a
// 12s anneal integrates 12 units (what the tuner used). This decouples the
// integration count from the browser's frame rate.
const PHYSICS_RATE = 1.0

// Crystallization phase.
const CRYSTAL_SECONDS = 3       // wall-clock polish duration post-landing
const CRYSTAL_BIAS = 1.0        // strong target pull
const CRYSTAL_OFF = -2.5        // strong off-target push
const CRYSTAL_T = 0.005         // near-zero T (deterministic relaxation)

// ── session / attempt parameters ─────────────────────────────────────────
const MAX_ATTEMPTS = 10
const LANDING_THRESHOLD = 0.80  // crispness gate to trigger crystallization
const HOLD_SUCCESS_S = 3.0      // hold the crystallized final state
const HOLD_FAIL_S = 1.8

// Nonlinear brightness curve: hides sub-threshold noise, lets only clearly
// "up" spins read as visible. Not cheating — the physics is unchanged;
// this is just the display gamma. Makes the brutalist feel land.
const BRIGHTNESS_GAMMA = 1.6

// ── types ────────────────────────────────────────────────────────────────
type Fill = 'solid' | 'checker' | 'hstripe' | 'vstripe' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'hstripe', 'vstripe', 'dots']

// ── utilities ────────────────────────────────────────────────────────────
// Box-Muller transform for a unit-variance Gaussian.
function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function makeField(v: number): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(v))
}

// Affinity field: 1.0 on target cells, decays smoothly with distance. This
// turns 1-cell-thick outlines into fuzzy gradient mountains, which the Ising
// dynamics can actually latch onto (otherwise thin features get overwhelmed
// by neighbor coupling).
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

function makeBias(grid: Grid, strength: number, off: number): number[][] {
  const aff = computeAffinity(grid, AFFINITY_RADIUS)
  return aff.map(row => row.map(a => a * strength + (1 - a) * off))
}

function makeFillMap(): Fill[][] {
  const m: Fill[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: Fill[] = []
    for (let c = 0; c < COLS; c++) row.push(FILLS[Math.floor(Math.random() * FILLS.length)])
    m.push(row)
  }
  return m
}

function planSession(): number[] {
  // Pick MAX_ATTEMPTS concept indices, no two in a row.
  const seq: number[] = []
  let last = -1
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    let idx = Math.floor(Math.random() * CONCEPTS.length)
    let guard = 0
    while (idx === last && guard++ < 8) idx = Math.floor(Math.random() * CONCEPTS.length)
    seq.push(idx)
    last = idx
  }
  return seq
}

// Crispness: fraction of target cells clearly ON + fraction of bg cells clearly
// OFF, averaged. Ranges 0..1. ≥ 0.80 means the shape reads as resolved.
function measureCrispness(s: number[][], grid: Grid): number {
  let crispTarget = 0, crispOff = 0, targetCount = 0, offCount = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const sv = s[r][c]
    if (grid[r][c] === 1) {
      targetCount++
      if (sv > 0.5) crispTarget++
    } else {
      offCount++
      if (sv < 0.2) crispOff++
    }
  }
  return (crispTarget / Math.max(1, targetCount) + crispOff / Math.max(1, offCount)) / 2
}

// ── drawing ──────────────────────────────────────────────────────────────
function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, CELL: number,
  spin: number, fill: Fill,
) {
  // Apply the nonlinear gamma so sub-threshold noise disappears.
  const raw = Math.max(0, spin)
  const b = Math.pow(raw, BRIGHTNESS_GAMMA)
  if (b < 0.04) return
  ctx.fillStyle = TILE
  ctx.globalAlpha = Math.min(1, b)
  const w = CELL - 1
  switch (fill) {
    case 'solid':
      ctx.fillRect(x, y, w, w); break
    case 'checker':
      for (let dy = 0; dy < w; dy += 2)
        for (let dx = (dy % 2 === 0 ? 0 : 1); dx < w; dx += 2)
          ctx.fillRect(x + dx, y + dy, 1, 1)
      break
    case 'hstripe':
      for (let dy = 0; dy < w; dy += 2) ctx.fillRect(x, y + dy, w, 1); break
    case 'vstripe':
      for (let dx = 0; dx < w; dx += 2) ctx.fillRect(x + dx, y, 1, w); break
    case 'dots':
      for (let dy = 1; dy < w; dy += 3)
        for (let dx = 1; dx < w; dx += 3)
          ctx.fillRect(x + dx, y + dy, 1, 1)
      break
  }
  ctx.globalAlpha = 1
}

// ── main page ────────────────────────────────────────────────────────────
export default function ExperimentPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const conceptLabelRef = useRef<HTMLDivElement>(null)
  const attemptLabelRef = useRef<HTMLDivElement>(null)
  const tempLabelRef = useRef<HTMLDivElement>(null)
  const overlapLabelRef = useRef<HTMLDivElement>(null)
  const outcomeLabelRef = useRef<HTMLDivElement>(null)
  const sessionLabelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    let W = 0, H = 0, CELL = 0, bx = 0, by = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = Math.floor(window.innerWidth * dpr)
      H = Math.floor(window.innerHeight * dpr)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      const maxCellW = Math.floor(W * 0.94 / COLS)
      const maxCellH = Math.floor(H * 0.55 / ROWS)
      CELL = Math.max(3, Math.min(maxCellW, maxCellH))
      bx = Math.floor((W - COLS * CELL) / 2)
      by = Math.floor((H - ROWS * CELL) / 2 - H * 0.03)
    }
    resize()
    window.addEventListener('resize', resize)

    // ── state ─────────────────────────────────────────────────────────
    let s: number[][] = makeField(0)     // spin field
    let bias: number[][] = makeField(0)  // target bias field
    let fills: Fill[][] = makeFillMap()

    let session = planSession()
    let attemptIdx = 0
    let sessionNum = 1

    type Phase = 'running' | 'crystallizing' | 'holding'
    let phase: Phase = 'running'
    let phaseStart = performance.now()
    let physicsTime = 0                  // seconds of physics elapsed in current attempt
    let crystalTime = 0                  // seconds of crystallization elapsed
    let crystalBias: number[][] = []     // pre-computed bias field for crystal phase
    let lastNow = performance.now()

    let finalOverlap = 0
    let annealCrisp = 0
    let succeeded = false
    let sessionSucceeded = false

    function initAttempt() {
      const conceptIdx = session[attemptIdx]
      const concept = CONCEPTS[conceptIdx]
      bias = makeBias(concept.grid, BIAS_STRENGTH, OFF_BIAS)
      crystalBias = makeBias(concept.grid, CRYSTAL_BIAS, CRYSTAL_OFF)
      fills = makeFillMap()
      // Fresh noise field.
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        s[r][c] = gauss() * 0.25
      }
      physicsTime = 0
      crystalTime = 0
      phase = 'running'
      phaseStart = performance.now()
      if (conceptLabelRef.current) conceptLabelRef.current.textContent = concept.name
      if (attemptLabelRef.current) attemptLabelRef.current.textContent = `attempt ${attemptIdx + 1} / ${MAX_ATTEMPTS}`
      if (outcomeLabelRef.current) outcomeLabelRef.current.textContent = ''
      if (sessionLabelRef.current) sessionLabelRef.current.textContent = `session ${sessionNum}`
    }

    function resetSession(successful: boolean) {
      sessionSucceeded = false
      void successful
      sessionNum++
      session = planSession()
      attemptIdx = 0
      initAttempt()
    }

    // Initial session.
    if (!s.length) s = makeField(0)
    // s was already allocated as ROWS×COLS zeros via makeField above
    initAttempt()

    // ── physics step (synchronous Langevin update) ──────────────────────
    // Generic step. For anneal: T follows cooling schedule, bias = anneal bias.
    // For crystallization: T fixed near zero, bias = crystal bias (stronger).
    function step(dt: number, T: number, biasField: number[][]) {
      const sNew: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
      const noiseScale = Math.sqrt(2 * T * dt)
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const up = r > 0 ? s[r - 1][c] : 0
        const dn = r < ROWS - 1 ? s[r + 1][c] : 0
        const lf = c > 0 ? s[r][c - 1] : 0
        const rt = c < COLS - 1 ? s[r][c + 1] : 0
        const h = J * (up + dn + lf + rt) + biasField[r][c]
        const drift = Math.tanh(h / T) - s[r][c]
        let v = s[r][c] + dt * drift + noiseScale * gauss()
        if (v > 1) v = 1
        else if (v < -1) v = -1
        sNew[r][c] = v
      }
      s = sNew
    }

    // Current annealing temperature (varies with physicsTime).
    function currentT(): number {
      // ATTEMPT_SECONDS here is the TOTAL physics-time budget (since
      // PHYSICS_RATE=1, this also equals the wall-clock duration).
      const physicsBudget = ATTEMPT_SECONDS * PHYSICS_RATE
      return Math.max(T_END, T_START - (T_START - T_END) * (physicsTime / physicsBudget))
    }

    // Do one integration step in each phase — advances physicsTime / crystalTime
    // by DT. The main loop decides HOW MANY steps to do per frame based on
    // wall-clock elapsed.
    function annealStep() {
      step(DT, currentT(), bias)
      physicsTime += DT
    }
    function crystalStep() {
      step(DT, CRYSTAL_T, crystalBias)
      crystalTime += DT
    }

    // ── draw ────────────────────────────────────────────────────────────
    function draw(T: number) {
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        drawCell(ctx, bx + c * CELL, by + r * CELL, CELL, s[r][c], fills[r][c])
      }
      // Temperature bar at top-left (tiny).
      const tNorm = (T - T_END) / (T_START - T_END)
      const barW = Math.floor(W * 0.25)
      const barH = Math.max(2, Math.floor(CELL * 0.2))
      const bx2 = Math.floor(W * 0.05), by2 = Math.floor(H * 0.1)
      ctx.fillStyle = 'rgba(232,184,107,0.08)'
      ctx.fillRect(bx2, by2, barW, barH)
      ctx.fillStyle = 'rgba(232,184,107,0.5)'
      ctx.fillRect(bx2, by2, Math.floor(barW * tNorm), barH)
      // Scanlines
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#000'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
      ctx.globalAlpha = 1
    }

    // ── main loop ───────────────────────────────────────────────────────
    // Wall-clock pacing: each real second we advance PHYSICS_RATE units of
    // physics time. This makes ATTEMPT_SECONDS actually mean seconds, not
    // physics-time units, so sessions feel paced correctly regardless of fps.
    let frame = 0
    let stepAccumulator = 0            // fractional physics-time owed since last step
    const MAX_STEPS_PER_FRAME = 12     // safety cap if the tab stutters

    const loop = () => {
      const now = performance.now()
      const wallDelta = Math.min(0.1, (now - lastNow) / 1000)  // clamp to avoid big jumps
      lastNow = now
      let T = T_START

      const currentGrid = CONCEPTS[session[attemptIdx]].grid

      if (phase === 'running') {
        stepAccumulator += wallDelta * PHYSICS_RATE
        let stepsThisFrame = 0
        while (stepAccumulator >= DT && stepsThisFrame < MAX_STEPS_PER_FRAME
               && physicsTime < ATTEMPT_SECONDS * PHYSICS_RATE) {
          annealStep()
          stepAccumulator -= DT
          stepsThisFrame++
        }
        // DEBUG: log pacing every ~20 frames
        if (Math.random() < 0.05) {
          console.log(`[bio] wallDelta=${wallDelta.toFixed(4)} acc=${stepAccumulator.toFixed(4)} steps=${stepsThisFrame} physicsTime=${physicsTime.toFixed(3)}`)
        }
        T = currentT()
        const crisp = measureCrispness(s, currentGrid)
        if (tempLabelRef.current) tempLabelRef.current.textContent = `T ${T.toFixed(2)}`
        if (overlapLabelRef.current) overlapLabelRef.current.textContent = `crisp ${(crisp * 100).toFixed(0)}%`
        // End of anneal: measure landing crispness.
        if (physicsTime >= ATTEMPT_SECONDS * PHYSICS_RATE) {
          annealCrisp = crisp
          succeeded = annealCrisp >= LANDING_THRESHOLD
          if (succeeded) {
            sessionSucceeded = true
            // Move to crystallization — the shape emerges fully.
            phase = 'crystallizing'
            phaseStart = now
            if (outcomeLabelRef.current) {
              outcomeLabelRef.current.textContent = `LANDED · ${(annealCrisp * 100).toFixed(0)}% → crystallizing…`
              outcomeLabelRef.current.style.color = TILE
            }
          } else {
            // Failed attempt — dissolve to holding.
            finalOverlap = annealCrisp
            phase = 'holding'
            phaseStart = now
            if (outcomeLabelRef.current) {
              outcomeLabelRef.current.textContent = `no · ${(annealCrisp * 100).toFixed(0)}%`
              outcomeLabelRef.current.style.color = 'rgba(232,232,232,0.5)'
            }
          }
          stepAccumulator = 0
        }
      } else if (phase === 'crystallizing') {
        // Polish the landed shape toward ground state — same wall-clock pacing.
        stepAccumulator += wallDelta * PHYSICS_RATE
        let stepsThisFrame = 0
        while (stepAccumulator >= DT && stepsThisFrame < MAX_STEPS_PER_FRAME
               && crystalTime < CRYSTAL_SECONDS * PHYSICS_RATE) {
          crystalStep()
          stepAccumulator -= DT
          stepsThisFrame++
        }
        const crisp = measureCrispness(s, currentGrid)
        if (tempLabelRef.current) tempLabelRef.current.textContent = `T ${CRYSTAL_T.toFixed(3)} ★`
        if (overlapLabelRef.current) overlapLabelRef.current.textContent = `crisp ${(crisp * 100).toFixed(0)}%`
        if (crystalTime >= CRYSTAL_SECONDS * PHYSICS_RATE) {
          // Final snap: lock every target cell to full brightness + solid fill,
          // and clear every off cell. The crystallize phase already committed
          // the system to the right basin (~99% crisp); this last step turns
          // the polished-but-textured result into the clean sketch.
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (currentGrid[r][c] === 1) {
              s[r][c] = 1
              fills[r][c] = 'solid'
            } else {
              s[r][c] = 0
            }
          }
          finalOverlap = 1
          phase = 'holding'
          phaseStart = now
          stepAccumulator = 0
          if (outcomeLabelRef.current) {
            outcomeLabelRef.current.textContent = `LANDED · 100%`
            outcomeLabelRef.current.style.color = TILE
          }
        }
      } else if (phase === 'holding') {
        const held = (now - phaseStart) / 1000
        const holdFor = succeeded ? HOLD_SUCCESS_S : HOLD_FAIL_S
        if (held >= holdFor) {
          if (succeeded) {
            resetSession(true)
          } else {
            attemptIdx++
            if (attemptIdx >= MAX_ATTEMPTS) resetSession(false)
            else initAttempt()
          }
        }
      }

      draw(T)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      void lastNow
    }
  }, [])

  const labelStyle: React.CSSProperties = {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: 11,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, overflow: 'hidden', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, imageRendering: 'pixelated' }} />

      {/* Top-left instrumentation */}
      <div style={{ position: 'fixed', top: '4vh', left: '5vw', zIndex: 10 }}>
        <div style={{ ...labelStyle, color: 'rgba(232,232,232,0.35)' }}>bio-engine · 52×20</div>
        <div ref={sessionLabelRef} style={{ ...labelStyle, color: 'rgba(232,232,232,0.5)', marginTop: 4 }} />
        <div ref={tempLabelRef} style={{ ...labelStyle, color: 'rgba(232,184,107,0.7)', marginTop: 4 }} />
        <div ref={overlapLabelRef} style={{ ...labelStyle, color: 'rgba(232,184,107,0.7)', marginTop: 4 }} />
      </div>

      {/* Top-right attempt counter */}
      <div style={{ position: 'fixed', top: '4vh', right: '5vw', zIndex: 10, textAlign: 'right' }}>
        <div ref={attemptLabelRef} style={{ ...labelStyle, color: 'rgba(232,232,232,0.7)' }} />
      </div>

      {/* Bottom: current concept + outcome stamp */}
      <div style={{
        position: 'fixed', bottom: '5vh', left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', zIndex: 10,
      }}>
        <div ref={conceptLabelRef} style={{ ...labelStyle, color: 'rgba(232,232,232,0.7)', fontSize: 14, letterSpacing: '0.16em' }} />
        <div ref={outcomeLabelRef} style={{
          ...labelStyle, marginTop: 10, fontSize: 14, letterSpacing: '0.28em', color: 'rgba(232,232,232,0.5)',
        }} />
      </div>
    </div>
  )
}
