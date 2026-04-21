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
  blurb?: string
  grid?: Grid
  finalGrid?: Grid
  finalSpin?: number[][]
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
  meta?: {
    engine?: string
    landed?: boolean
    weather?: string
    location?: string
    news?: string[]
    // A prose explanation of the stories Amber reacted to today.
    // When present, it replaces the all-caps meta rail on the final screen.
    explanation?: string
  }
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
  const [showDate, setShowDate] = useState(false)
  // Performance concept ticker — "last attempt:" during failures, "landed on:" on win.
  const [conceptDisplay, setConceptDisplay] = useState<{
    label: 'last attempt:' | 'landed on:'
    name: string
    blurb: string
    visible: boolean
  }>({ label: 'last attempt:', name: '', blurb: '', visible: false })
  const [isBare, setIsBare] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  // Latched so the resize function (inside a useEffect closure) can pick up
  // the current text-mode without being re-created. Also used to trigger a
  // re-resize when text appears so the canvas shrinks out of its way.
  const textShownRef = useRef(false)
  const resizeRef = useRef<() => void>(() => {})
  useEffect(() => {
    try { setIsBare(window.self !== window.top) } catch { setIsBare(true) }
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // When the closing text appears, shrink the canvas bounds so the bottom
  // stack gets its own region instead of overlapping the fault/figure.
  useEffect(() => {
    textShownRef.current = showText
    resizeRef.current()
  }, [showText])

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
      const textShown = textShownRef.current
      // Bare (iframe thumbnail): full area. During physics animation: 50% of H.
      // After text appears: shrink to 35% of H and bias up so the bottom stack
      // (closing + meta + explanation + archive) has its own clean region.
      const vFraction = isBare ? 0.88 : (textShown ? 0.34 : 0.50)
      const biasFraction = isBare ? 0 : (textShown ? 0.22 : 0.08)
      const maxCellW = Math.floor(W * 0.94 / COLS)
      const maxCellH = Math.floor(W * vFraction / COLS)
      const vBudget = Math.floor(H * vFraction / ROWS)
      CELL = Math.max(3, Math.min(maxCellW, maxCellH, vBudget))
      bx = Math.floor((W - COLS * CELL) / 2)
      by = Math.floor((H - ROWS * CELL) / 2 - H * biasFraction)
    }
    resizeRef.current = resize
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

    // Build attempt sequence from the baked run. We carry the baked finalSpin
    // through so the renderer can snap to it at end-of-physics — this is what
    // makes the artifact reproducible. The physics animation is cosmetic;
    // the outcome came from the bake and is frozen there.
    const attempts = run.attempts.map(a => {
      const grid = (a.grid ?? a.finalGrid) as Grid
      const tuning = inferTuning(grid)
      return {
        concept: a.concept,
        blurb: a.blurb ?? '',
        grid,
        finalSpin: a.finalSpin,
        ...tuning,
        landed: !a.failed,
      }
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

    const pieceStart = performance.now()
    let dateShown = false

    let raf = 0
    const loop = () => {
      const now = performance.now()
      const wallDelta = Math.min(0.1, (now - lastNow) / 1000)
      lastNow = now
      const isLastAttempt = attemptIdx === attempts.length - 1
      const a = attempts[attemptIdx]

      // Fade in the top-center datestamp eyebrow ~1.5s after the piece starts.
      if (!dateShown && now - pieceStart > 1500) {
        dateShown = true
        setShowDate(true)
      }

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
          // Snap to the baked finalSpin so the visual at end-of-anneal matches
          // what the bake recorded. Stochastic live physics is just cosmetic
          // motion — the actual recorded state is authoritative.
          if (a.finalSpin) {
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
              s[r][c] = a.finalSpin[r][c]
            }
          }
          // The bake already decided which attempt is the winner (the last one).
          // Use that — do not re-adjudicate via live crispness.
          const landed = !!a.landed
          if (landed) {
            phase = 'crystallizing'
            phaseStart = now
            stepAccumulator = 0
            // Show "landed on: [concept]" — highlights with accent color.
            setConceptDisplay({ label: 'landed on:', name: a.concept, blurb: a.blurb, visible: true })
          } else {
            phase = 'holding'
            phaseStart = now
            // Show "last attempt: [concept]" — neutral color, so the viewer sees
            // which concept just dissolved before the next one begins.
            setConceptDisplay({ label: 'last attempt:', name: a.concept, blurb: a.blurb, visible: true })
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

  // Concept ticker fades out once the closing statement takes over.
  const conceptFadeOut = showText
  const conceptOpacity = conceptDisplay.visible && !conceptFadeOut ? 1 : 0
  const conceptIsWinner = conceptDisplay.label === 'landed on:'
  const meta = run.meta

  return (
    <main style={{
      minHeight: '100dvh', background: bg, color: fg,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
    }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0 }} />

      {/* TOP EYEBROW — datestamp, fades in once ~1.5s into the piece. */}
      {!isBare && (
        <div style={{
          position: 'fixed', top: '5vh', left: '50%', transform: 'translateX(-50%)',
          fontSize: 'clamp(11px, 1.5vw, 13px)', letterSpacing: '0.06em',
          color: fgDim, whiteSpace: 'nowrap',
          opacity: showDate ? 0.9 : 0, transition: 'opacity 1.4s ease-in',
          pointerEvents: 'none',
        }}>
          {formatNoonDate(run.date)}
        </div>
      )}

      {/* CONCEPT TICKER — "last attempt:" during failures, "landed on:" on win.
          Anchored top-left so viewers see which concept is dissolving/landing. */}
      {!isBare && (
        <div style={{
          position: 'fixed', top: '12vh', left: '5vw',
          maxWidth: 320, pointerEvents: 'none',
          opacity: conceptOpacity,
          transition: 'opacity 0.8s',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.06em',
            color: conceptIsWinner ? tile : fgDimmer,
            marginBottom: 6,
            textTransform: 'lowercase',
          }}>
            {conceptDisplay.label}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 300, letterSpacing: '0.02em',
            color: conceptIsWinner ? tile : fg,
            lineHeight: 1.3,
          }}>
            {conceptDisplay.name}
          </div>
          {conceptDisplay.blurb && (
            <div style={{
              fontSize: 12, fontStyle: 'italic',
              color: fgDim,
              marginTop: 4, letterSpacing: '0.01em', lineHeight: 1.4,
            }}>
              &ldquo;{conceptDisplay.blurb}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* BOTTOM STACK — closing statement (Fraunces) + either a prose
          explanation (when meta.explanation is present) or the legacy
          all-caps meta rail. Fades in ~1.4s after the piece lands. */}
      {!isBare && (
        <div style={{
          position: 'fixed', bottom: '4vh', left: '50%', transform: 'translateX(-50%)',
          width: isNarrow ? '90vw' : 'min(640px, 86vw)',
          maxHeight: '50vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isNarrow ? 12 : 14,
          opacity: showText ? 1 : 0, transition: 'opacity 1.4s ease-in',
          pointerEvents: showText ? 'auto' : 'none',
        }}>
          <p style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontStyle: 'italic', fontWeight: 300,
            fontSize: 'clamp(13px, 1.6vw, 16px)', lineHeight: 1.55, letterSpacing: '0.005em',
            color: fg, textAlign: 'center', margin: 0,
          }}>
            {run.closingStatement}
          </p>
          {(meta?.location || meta?.weather || run.mood?.name) && (
            <div style={{
              width: '100%',
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
              alignItems: 'baseline', columnGap: 14, rowGap: 6,
              fontSize: 'clamp(10px, 1vw, 11px)', letterSpacing: '0.16em',
              textTransform: 'uppercase', color: fgDim, textAlign: 'center',
            }}>
              {meta?.location && (
                <MetaItem label={meta.location} value={meta.weather ?? ''} accent={tile} />
              )}
              <MetaItem label="mood" value={run.mood.name} accent={tile} />
            </div>
          )}
          {meta?.explanation && (
            <p style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontWeight: 300,
              fontSize: 'clamp(12px, 1.25vw, 14px)', lineHeight: 1.6,
              color: fgDim, textAlign: 'left', margin: 0, width: '100%',
            }}>
              {meta.explanation}
            </p>
          )}
          <div style={{
            fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: fgDimmer,
          }}>
            <a href="/amber/noon/archive" style={{
              color: fgDimmer, textDecoration: 'underline', textUnderlineOffset: 3,
            }}>archive</a>
          </div>
        </div>
      )}
    </main>
  )
}

function MetaItem({ label, value, accent }: { label: string; value: string; accent: string }) {
  if (!value) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      {label && <span style={{ color: accent, opacity: 0.8 }}>{label}</span>}
      <span>{value}</span>
    </span>
  )
}
