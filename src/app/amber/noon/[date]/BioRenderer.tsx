'use client'

// Noon renderer driven by a baked bio-engine session.
// Plays the baked attempt sequence at 52×20 with live Ising physics,
// crystallizes on the winner, holds, then fades in mood/reaction/closing.

import { useEffect, useRef, useState } from 'react'

const COLS = 52
const ROWS = 20

// Ising params — G3, mirror experiment/page.tsx
const J = 0.4
const OFF_BIAS = -0.9
const T_START = 2.0
const T_END = 0.03
const DT = 0.07
const PHYSICS_RATE = 1.0
const ATTEMPT_SECONDS = 12
const LANDING_THRESHOLD = 0.80
const CRYSTAL_SECONDS = 3
const CRYSTAL_BIAS = 1.0
const CRYSTAL_OFF = -2.5
const CRYSTAL_T = 0.005
const HOLD_SUCCESS_S = 2.5
const HOLD_FAIL_S = 1.2

const PALETTES: Record<string, string> = {
  night:   '#0A0A0A',
  hearth:  '#1A110A',
  ink:     '#0C1424',
  petrol:  '#0A1C1A',
  bruise:  '#150826',
  oxblood: '#1C0808',
}
const ACCENTS: Record<string, string> = {
  lime:   '#C6FF3C',
  sodium: '#FF7A1A',
  uv:     '#A855F7',
}

type Grid = number[][]
type Fill = 'solid' | 'checker' | 'hstripe' | 'vstripe' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'hstripe', 'vstripe', 'dots']

interface Attempt {
  concept: string
  blurb: string
  grid?: Grid
  finalGrid?: Grid
  failed: boolean
  landed?: boolean
}

interface NoonRun {
  date: string
  mood: { name: string; reason: string; palette: string; accent: string; bgColor?: string; tileColor?: string }
  reaction?: string
  attempts: Attempt[]
  winner: Attempt
  closingStatement: string
  meta?: { engine?: string; landed?: boolean }
}

function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function makeField(v: number): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(v))
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

function inferTuning(grid: Grid): { radius: number; bias: number } {
  const cells = grid.flat().reduce((a, b) => a + b, 0)
  if (cells < 60) return { radius: 3.2, bias: 0.80 }
  if (cells < 120) return { radius: 2.4, bias: 0.45 }
  return { radius: 1.8, bias: 0.30 }
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

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  spin: number, fill: Fill, tile: string,
) {
  if (spin <= 0) return
  const gamma = 1.6
  const a = Math.pow(Math.min(1, spin), gamma)
  ctx.globalAlpha = a
  ctx.fillStyle = tile
  switch (fill) {
    case 'solid':
      ctx.fillRect(x, y, w - 1, w - 1); break
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

function formatNoonDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const [, y, mm, dd] = m
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${months[parseInt(mm, 10) - 1] || mm} ${parseInt(dd, 10)}, ${y}`
}

export default function BioRenderer({ run }: { run: NoonRun }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showText, setShowText] = useState(false)
  const [currentConcept, setCurrentConcept] = useState<string>('')
  const [isBare, setIsBare] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    try { setIsBare(window.self !== window.top) } catch { setIsBare(true) }
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const bg = run.mood.bgColor ?? PALETTES[run.mood.palette] ?? '#0A0A0A'
  const tile = run.mood.tileColor ?? ACCENTS[run.mood.accent] ?? '#C6FF3C'
  // Text color: pick readable complement to bg (dark on light, light on dark).
  const isLightBg = (() => {
    const hex = bg.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 140
  })()
  const fg = isLightBg ? '#2A2A2A' : '#E8E8E8'
  const fgDim = isLightBg ? 'rgba(42,42,42,0.55)' : 'rgba(232,232,232,0.55)'
  const fgDimmer = isLightBg ? 'rgba(42,42,42,0.35)' : 'rgba(232,232,232,0.35)'

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
      // Bare (iframe thumbnail): center vertically, full cell height. Otherwise bias up for text room.
      const maxCellH = Math.floor(W * (isBare ? 0.88 : 0.50) / COLS * (ROWS / COLS > 0 ? 1 : 1))
      const vBudget = Math.floor(H * (isBare ? 0.88 : 0.50) / ROWS)
      CELL = Math.max(3, Math.min(maxCellW, maxCellH, vBudget))
      bx = Math.floor((W - COLS * CELL) / 2)
      by = Math.floor((H - ROWS * CELL) / 2 - (isBare ? 0 : H * 0.08))
    }
    resize()
    window.addEventListener('resize', resize)

    // Bare mode: skip the live animation — just draw the winner grid statically
    // so iframed thumbnails don't keep spinning CPU.
    if (isBare) {
      const winnerGrid = (run.winner.finalGrid ?? run.winner.grid) as Grid
      const drawStatic = () => {
        resize()
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = tile
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (winnerGrid?.[r]?.[c] === 1) {
            ctx.fillRect(bx + c * CELL, by + r * CELL, CELL - 1, CELL - 1)
          }
        }
      }
      drawStatic()
      const onResize = () => drawStatic()
      window.addEventListener('resize', onResize)
      return () => {
        window.removeEventListener('resize', resize)
        window.removeEventListener('resize', onResize)
      }
    }

    // Build attempt sequence from the baked run.
    const attempts = run.attempts.map(a => {
      const grid = (a.grid ?? a.finalGrid) as Grid
      const tuning = inferTuning(grid)
      return { concept: a.concept, grid, ...tuning, landed: !a.failed || !!a.landed }
    })
    if (!attempts.length) return

    let s: number[][] = makeField(0)
    let bias: number[][] = makeField(0)
    let crystalBias: number[][] = makeField(0)
    let fills: Fill[][] = makeFillMap()
    let attemptIdx = 0
    let physicsTime = 0
    let crystalTime = 0
    let phase: 'running' | 'crystallizing' | 'holding' | 'final' = 'running'
    let phaseStart = performance.now()
    let lastNow = performance.now()
    let stepAccumulator = 0
    let textShown = false

    function initAttempt() {
      const a = attempts[attemptIdx]
      bias = makeBias(a.grid, a.radius, a.bias, OFF_BIAS)
      crystalBias = makeBias(a.grid, a.radius, CRYSTAL_BIAS, CRYSTAL_OFF)
      fills = makeFillMap()
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s[r][c] = gauss() * 0.25
      physicsTime = 0
      crystalTime = 0
      phase = 'running'
      phaseStart = performance.now()
      setCurrentConcept(a.concept)
    }

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
        if (v > 1) v = 1; else if (v < -1) v = -1
        sNew[r][c] = v
      }
      s = sNew
    }

    function currentT() {
      const budget = ATTEMPT_SECONDS * PHYSICS_RATE
      return Math.max(T_END, T_START - (T_START - T_END) * (physicsTime / budget))
    }

    initAttempt()

    function draw() {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        drawCell(ctx, bx + c * CELL, by + r * CELL, CELL, s[r][c], fills[r][c], tile)
      }
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#000'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
      ctx.globalAlpha = 1
    }

    let raf = 0
    const loop = () => {
      const now = performance.now()
      const wallDelta = Math.min(0.1, (now - lastNow) / 1000)
      lastNow = now
      const isLastAttempt = attemptIdx === attempts.length - 1
      const a = attempts[attemptIdx]

      if (phase === 'running') {
        stepAccumulator += wallDelta * PHYSICS_RATE
        let stepsThisFrame = 0
        while (stepAccumulator >= DT && stepsThisFrame < 12
               && physicsTime < ATTEMPT_SECONDS * PHYSICS_RATE) {
          step(DT, currentT(), bias)
          physicsTime += DT
          stepAccumulator -= DT
          stepsThisFrame++
        }
        if (physicsTime >= ATTEMPT_SECONDS * PHYSICS_RATE) {
          const crisp = measureCrisp(s, a.grid)
          const landed = isLastAttempt || crisp >= LANDING_THRESHOLD
          if (landed) {
            phase = 'crystallizing'
            phaseStart = now
            stepAccumulator = 0
          } else {
            phase = 'holding'
            phaseStart = now
          }
        }
      } else if (phase === 'crystallizing') {
        stepAccumulator += wallDelta * PHYSICS_RATE
        let stepsThisFrame = 0
        while (stepAccumulator >= DT && stepsThisFrame < 12
               && crystalTime < CRYSTAL_SECONDS * PHYSICS_RATE) {
          step(DT, CRYSTAL_T, crystalBias)
          crystalTime += DT
          stepAccumulator -= DT
          stepsThisFrame++
        }
        if (crystalTime >= CRYSTAL_SECONDS * PHYSICS_RATE) {
          // Snap to clean target.
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (a.grid[r][c] === 1) { s[r][c] = 1; fills[r][c] = 'solid' }
            else s[r][c] = 0
          }
          phase = 'holding'
          phaseStart = now
          stepAccumulator = 0
        }
      } else if (phase === 'holding') {
        const held = (now - phaseStart) / 1000
        const holdFor = isLastAttempt ? HOLD_SUCCESS_S : HOLD_FAIL_S
        if (held >= holdFor) {
          if (isLastAttempt) {
            phase = 'final'
            if (!textShown) { textShown = true; setShowText(true) }
          } else {
            attemptIdx++
            initAttempt()
          }
        }
      }

      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  // Re-run when the run data identity changes, or when bare mode resolves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, isBare])

  return (
    <main style={{
      minHeight: '100dvh', background: bg, color: fg,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
    }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0 }} />

      {/* Running state: tiny concept label — hidden in bare (iframe) mode */}
      {!isBare && (
      <div style={{
        position: 'fixed', top: '4vh', left: '5vw',
        fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: fgDim,
        opacity: showText ? 0 : 1, transition: 'opacity 0.6s',
        pointerEvents: 'none',
      }}>
        amber · noon · {formatNoonDate(run.date)} · {currentConcept}
      </div>
      )}

      {/* Final text panel — hidden in bare (iframe) mode */}
      {!isBare && (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: isNarrow ? '4vh 5vw' : '5vh 5vw',
        opacity: showText ? 1 : 0, transition: 'opacity 1.4s ease-in',
        pointerEvents: showText ? 'auto' : 'none',
      }}>
        <div>
          <div style={{
            fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: fgDim,
          }}>
            amber · noon · {formatNoonDate(run.date)}
          </div>
          <h1 style={{
            marginTop: 10,
            fontSize: isNarrow ? 22 : 32,
            fontWeight: 300, letterSpacing: '0.01em', color: fg,
            display: isNarrow ? 'flex' : 'inline', flexDirection: 'column', gap: isNarrow ? 4 : 0,
          }}>
            <span>{run.mood.name}</span>
            <span style={{ color: fgDim, fontSize: isNarrow ? 14 : 20, marginLeft: isNarrow ? 0 : 12 }}>
              {isNarrow ? '' : '— '}{run.mood.reason}
            </span>
          </h1>
        </div>
        <div style={{ maxWidth: 780, fontSize: isNarrow ? 13 : 14, lineHeight: 1.6, color: fg }}>
          {run.reaction && <p style={{ marginBottom: 14 }}>{run.reaction}</p>}
          <p style={{ color: tile, fontStyle: 'italic' }}>{run.closingStatement}</p>
          <div style={{
            marginTop: 12, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: fgDimmer,
            display: 'flex', gap: 14, flexWrap: 'wrap',
          }}>
            <span>{run.meta?.engine ?? 'bio-engine'} · winner: {run.winner.concept}</span>
            <a href="/amber/noon/archive" style={{ color: fgDimmer, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              archive
            </a>
          </div>
        </div>
      </div>
      )}
    </main>
  )
}
