'use client'

import { useEffect, useRef } from 'react'

/**
 * Ising Model experiment for Now What?
 *
 * Real statistical mechanics: cells are "spins" that want to align with neighbors.
 * Temperature controls chaos vs order. High temp = entropy wins. Low temp = shapes crystallize.
 * We seed target shapes into the grid and slowly cool the system.
 * The outcome is genuinely emergent — not predetermined.
 */

const COLS = 26
const ROWS = 10

type Grid = number[][]

function mk(fn: (c: number, r: number) => boolean): Grid {
  const g: Grid = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) row.push(fn(c, r) ? 1 : 0)
    g.push(row)
  }
  return g
}

function emb(s: number[][]): Grid {
  const sR = s.length, sC = s[0].length
  const oR = Math.floor((ROWS - sR) / 2), oC = Math.floor((COLS - sC) / 2)
  return mk((c, r) => {
    const lr = r - oR, lc = c - oC
    return lr >= 0 && lr < sR && lc >= 0 && lc < sC && s[lr][lc] === 1
  })
}

// ── Shapes ──────────────────────────────────────────────

interface Shape { name: string; grid: Grid; concept?: string; candidate?: HaikuCandidate }

interface HaikuCandidate {
  id: string; concept: string; name: string; grid: Grid; fillPercent: number; createdAt: string
}

// Fallback shapes if API is unavailable
const FALLBACK_SHAPES: Shape[] = [
  { name: 'person', grid: emb([
    [0,0,1,1,0,0],[0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,1,1,1,1],
    [0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,0,0,1,1],
  ])},
  { name: 'heart', grid: emb([
    [0,1,1,0,0,1,1,0],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],[0,0,1,1,1,1,0,0],[0,0,0,1,1,0,0,0],
  ])},
  { name: 'tree', grid: emb([
    [0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,1,1,1,1],[0,1,1,1,1,0],
    [1,1,1,1,1,1],[0,0,1,1,0,0],[0,0,1,1,0,0],
  ])},
]

// ── Ising simulation ────────────────────────────────────

// Spin: +1 (wants to be part of shape) or -1 (wants to be empty)
// External field: biases target cells toward +1
// Temperature: controls randomness of spin flips

interface IsingCell {
  spin: number           // +1 or -1
  isTarget: boolean
  // Visual state
  fill: Fill
  brightness: number
  flipPhase: number      // for split-flap animation
  flipping: boolean
  prevSpin: number
}

type Fill = 'solid' | 'checker' | 'stripe_h' | 'stripe_v' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
function randomFill(): Fill { return FILLS[Math.floor(Math.random() * FILLS.length)] }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

type Phase = 'hot' | 'cooling' | 'cold' | 'won' | 'lost' | 'dark'

interface Box {
  cells: IsingCell[][]
  phase: Phase
  phaseStart: number
  temperature: number     // starts high (~4), cools to low (~0.5)
  targetTemp: number      // where we're cooling to
  coolingRate: number     // how fast we cool
  externalField: number   // bias toward target shape
  shape: Shape
  wonPulse: number
}

function makeBox(now: number, shape: Shape): Box {
  const cells: IsingCell[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: IsingCell[] = []
    for (let c = 0; c < COLS; c++) {
      const isTarget = shape.grid[r][c] === 1
      // Start fully random — no bias
      const spin = Math.random() < 0.5 ? 1 : -1
      row.push({
        spin,
        isTarget,
        fill: randomFill(),
        brightness: 0.15 + Math.random() * 0.2,
        flipPhase: 0,
        flipping: false,
        prevSpin: spin,
      })
    }
    cells.push(row)
  }

  return {
    cells,
    phase: 'hot',
    phaseStart: now,
    temperature: 5.0,                           // start very hot — pure chaos
    targetTemp: 0.2 + Math.random() * 0.3,      // cool to near-frozen
    coolingRate: 0.0008 + Math.random() * 0.0006, // SLOW cooling — watch the struggle
    externalField: 0.4 + Math.random() * 0.4,    // gentle pull — shape has to earn it
    shape,
    wonPulse: 0,
  }
}

// Compute energy change if we flip spin at (r, c)
// Hamiltonian: -J * sum(s_i * s_j) - h * s_i * target_i
function deltaEnergy(cells: IsingCell[][], r: number, c: number, field: number): number {
  const s = cells[r][c].spin
  const isTarget = cells[r][c].isTarget

  // Sum of neighbor spins (4-connected)
  let neighborSum = 0
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      neighborSum += cells[nr][nc].spin
    }
  }

  // Also count diagonal neighbors with reduced weight
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      neighborSum += cells[nr][nc].spin * 0.4
    }
  }

  // J = coupling constant (how much neighbors influence)
  const J = 1.0

  // External field: target cells want to be +1, non-target want to be -1
  const h = isTarget ? field : -field * 0.3

  // Energy change from flipping: dE = 2 * s * (J * neighborSum + h)
  return 2 * s * (J * neighborSum + h)
}

// Metropolis-Hastings step: flip if energy decreases, or probabilistically if it increases
function metropolisStep(cells: IsingCell[][], temperature: number, field: number, steps: number) {
  for (let i = 0; i < steps; i++) {
    const r = Math.floor(Math.random() * ROWS)
    const c = Math.floor(Math.random() * COLS)

    const dE = deltaEnergy(cells, r, c, field)

    if (dE <= 0 || Math.random() < Math.exp(-dE / Math.max(temperature, 0.01))) {
      const cell = cells[r][c]
      cell.prevSpin = cell.spin
      cell.spin *= -1

      // Trigger visual flip
      if (!cell.flipping) {
        cell.flipping = true
        cell.flipPhase = 0
        cell.fill = randomFill()
        cell.brightness = cell.spin > 0
          ? 0.5 + Math.random() * 0.5
          : 0.1 + Math.random() * 0.2
      }
    }
  }
}

function scoreBox(cells: IsingCell[][]): { correct: number; total: number } {
  let correct = 0, total = 0
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (cells[r][c].isTarget) {
        total++
        if (cells[r][c].spin > 0) correct++
      }
    }
  return { correct, total }
}

// ── Rendering ───────────────────────────────────────────

export default function IsingExperiment() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const SCALE = Math.max(2, Math.min(3, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)))
    let W = 0, H = 0

    const resize = () => {
      W = Math.floor(window.innerWidth / SCALE)
      H = Math.floor(window.innerHeight / SCALE)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const CELL = 6
    const particles: Particle[] = []

    function emitParticles(x: number, y: number, count: number, speed: number, life: number) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x, y,
          vx: Math.cos(a) * speed * (0.3 + Math.random()),
          vy: Math.sin(a) * speed * (0.3 + Math.random()),
          life, maxLife: life,
          size: 1 + Math.random(),
        })
      }
    }

    function drawPixelBlock(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number) {
      const r = Math.floor(brightness * 255)
      ctx.fillStyle = `rgba(${r},${r},${r},${alpha})`

      switch (fill) {
        case 'solid':
          ctx.fillRect(x + 1, y + 1, size - 2, size - 2)
          break
        case 'checker':
          for (let px = 0; px < size - 2; px++)
            for (let py = 0; py < size - 2; py++)
              if ((px + py) % 2 === 0) ctx.fillRect(x + 1 + px, y + 1 + py, 1, 1)
          break
        case 'stripe_h':
          for (let py = 0; py < size - 2; py++)
            if (py % 2 === 0) ctx.fillRect(x + 1, y + 1 + py, size - 2, 1)
          break
        case 'stripe_v':
          for (let px = 0; px < size - 2; px++)
            if (px % 2 === 0) ctx.fillRect(x + 1 + px, y + 1, 1, size - 2)
          break
        case 'dots':
          ctx.fillRect(x + 2, y + 2, 1, 1)
          ctx.fillRect(x + size - 3, y + 2, 1, 1)
          ctx.fillRect(x + 2, y + size - 3, 1, 1)
          ctx.fillRect(x + size - 3, y + size - 3, 1, 1)
          break
      }

      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.18})`
      ctx.fillRect(x, y, size, 1)
      ctx.fillRect(x, y, 1, size)
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.3})`
      ctx.fillRect(x, y + size - 1, size, 1)
      ctx.fillRect(x + size - 1, y, 1, size)
    }

    function drawCellFlap(
      x: number, y: number, size: number,
      fill: Fill, brightness: number, alpha: number,
      half: 'top' | 'bottom', squeeze: number,
    ) {
      ctx.save()
      if (half === 'top') {
        ctx.beginPath()
        ctx.rect(x, y, size, Math.ceil(size / 2))
        ctx.clip()
        const sy = squeeze * (size / 2)
        ctx.translate(0, sy * 0.5)
        ctx.scale(1, 1 - squeeze * 0.5)
      } else {
        ctx.beginPath()
        ctx.rect(x, y + Math.floor(size / 2), size, Math.ceil(size / 2))
        ctx.clip()
        const sy = squeeze * (size / 2)
        ctx.translate(0, -sy * 0.5)
        ctx.scale(1, 1 - squeeze * 0.5)
      }
      drawPixelBlock(x, y, size, fill, brightness, alpha * (1 - squeeze * 0.3))
      ctx.restore()
    }

    function drawScanlines() {
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1)
      }
    }

    // Haiku shape pipeline
    let pendingShape: Shape | null = null
    let fetchingShape = false

    function fetchHaikuShape() {
      if (fetchingShape) return
      fetchingShape = true
      fetch('/api/nowwhat/gen2', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.candidate?.grid) {
            pendingShape = {
              name: data.candidate.name || data.concept,
              grid: data.candidate.grid,
              concept: data.concept,
              candidate: data.candidate,
            }
          }
          fetchingShape = false
        })
        .catch(() => { fetchingShape = false })
    }
    // Start first fetch
    fetchHaikuShape()

    function nextShape(): Shape {
      if (pendingShape) {
        const s = pendingShape
        pendingShape = null
        fetchHaikuShape() // queue next
        return s
      }
      // Fallback while waiting
      return FALLBACK_SHAPES[Math.floor(Math.random() * FALLBACK_SHAPES.length)]
    }

    // Init 1 box
    const now0 = performance.now()
    let boxes: Box[] = [
      makeBox(now0, FALLBACK_SHAPES[Math.floor(Math.random() * FALLBACK_SHAPES.length)]),
    ]

    let frame = 0
    const tick = () => {
      const now = performance.now()

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      const boxPx = COLS * CELL
      const boxPy = ROWS * CELL
      const startX = Math.floor((W - boxPx) / 2)
      const boxY = Math.floor((H - boxPy) / 2)

      for (let b = 0; b < 1; b++) {
        let box = boxes[b]
        const bx = startX
        const by = boxY
        const elapsed = now - box.phaseStart

        // ── Physics step ──
        const stepsPerFrame = Math.floor(ROWS * COLS * 0.8)

        if (box.phase === 'hot') {
          // Pure chaos — no field, just random noise
          metropolisStep(box.cells, box.temperature, 0, stepsPerFrame)
          if (elapsed > 1500) {
            box.phase = 'cooling'
            box.phaseStart = now
          }
        }

        if (box.phase === 'cooling') {
          const coolElapsed = (now - box.phaseStart) / 1000

          // Very slow cooling — takes ~8-12 seconds
          box.temperature = Math.max(box.targetTemp, box.temperature - box.coolingRate)

          // Field ramps up slowly — shape barely whispers at first, then pulls harder
          const coolProgress = Math.min(1, coolElapsed / 10)
          const field = box.externalField * coolProgress * coolProgress // quadratic ramp — slow start, strong finish

          // Fewer steps at lower temperatures so individual flips are visible
          const dynSteps = Math.max(4, Math.floor(stepsPerFrame * (0.2 + box.temperature / 5 * 0.8)))
          metropolisStep(box.cells, box.temperature, field, dynSteps)

          // Check periodically after we're past halfway cooled
          if (coolProgress > 0.6) {
            const { correct, total } = scoreBox(box.cells)
            const accuracy = correct / total

            // Won: shape clearly formed
            if (accuracy > 0.82 && box.temperature < 1.0) {
              box.phase = 'won'
              box.phaseStart = now
              box.wonPulse = 0
              emitParticles(bx + boxPx / 2, by + boxPy / 2, 20, 0.8, 40)
            }

            // Lost: temperature is low but shape didn't form
            if (box.temperature <= box.targetTemp + 0.05 && accuracy < 0.7) {
              box.phase = 'lost'
              box.phaseStart = now
            }

            // Timeout: been cooling too long
            if (coolElapsed > 14) {
              if (accuracy > 0.75) {
                box.phase = 'won'
                box.phaseStart = now
                box.wonPulse = 0
                emitParticles(bx + boxPx / 2, by + boxPy / 2, 15, 0.6, 35)
              } else {
                box.phase = 'lost'
                box.phaseStart = now
              }
            }
          }
        }

        if (box.phase === 'cold') {
          // Frozen — minimal flips
          metropolisStep(box.cells, box.targetTemp, box.externalField, Math.floor(stepsPerFrame * 0.1))
        }

        if (box.phase === 'won') {
          box.wonPulse = Math.sin(elapsed * 0.004) * 0.15
          // No more flips — frozen in success
          // Save winner if it came from Haiku
          if (elapsed > 500 && box.shape.candidate && !box.shape.candidate.id.startsWith('saved-')) {
            fetch('/api/nowwhat/gen2', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidate: box.shape.candidate }),
            }).catch(() => {})
            box.shape.candidate.id = 'saved-' + box.shape.candidate.id
          }
          // Hold the win, then move on
          if (elapsed > 5000) {
            box.phase = 'dark'
            box.phaseStart = now
          }
        }

        if (box.phase === 'lost') {
          // Wipe: dissolve all cells rapidly
          const wipeProgress = elapsed / 1500
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const cell = box.cells[r][c]
              // Random cells go dark based on progress
              const cellHash = (r * 31 + c * 17 + box.phaseStart) % 100 / 100
              if (cellHash < wipeProgress) {
                cell.spin = -1
                cell.brightness *= 0.9
              }
            }
          }
          if (elapsed > 1800) {
            box.phase = 'dark'
            box.phaseStart = now
          }
        }

        if (box.phase === 'dark') {
          if (elapsed > 600) {
            boxes[b] = makeBox(now, nextShape())
            box = boxes[b]
          }
        }

        // ── Update visual state ──
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const cell = box.cells[r][c]

            if (cell.flipping) {
              cell.flipPhase += 0.06 + box.temperature * 0.02
              if (cell.flipPhase >= 1) {
                cell.flipping = false
                cell.flipPhase = 0
              }
            }

            // Update brightness based on spin and temperature
            const targetBr = cell.spin > 0
              ? 0.5 + Math.random() * 0.01 + (cell.isTarget ? 0.2 : 0)
              : 0.08 + Math.random() * 0.01
            cell.brightness += (targetBr - cell.brightness) * 0.08
          }
        }

        // ── Draw cells ──
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const cell = box.cells[r][c]
            const px = bx + c * CELL
            const py = by + r * CELL

            if (box.phase === 'dark') continue

            let alpha = cell.spin > 0 ? 0.75 : 0.15
            let br = cell.brightness

            if (box.phase as string === 'dark') continue

            if (box.phase === 'won') {
              if (cell.isTarget && cell.spin > 0) {
                br = Math.min(1, 0.7 + box.wonPulse)
                alpha = 0.9
              } else {
                continue // don't draw non-target cells — clean silhouette
              }
            }

            if (box.phase === 'lost') {
              if (cell.spin < 0 || cell.brightness < 0.05) continue
            }

            if (cell.flipping && cell.flipPhase > 0 && cell.flipPhase < 1) {
              const phase = cell.flipPhase
              if (phase < 0.5) {
                const squeeze = phase * 2
                drawCellFlap(px, py, CELL, cell.fill, br, alpha, 'bottom', 0)
                drawCellFlap(px, py, CELL, cell.fill, br, alpha, 'top', squeeze)
              } else {
                const squeeze = 1 - (phase - 0.5) * 2
                drawCellFlap(px, py, CELL, cell.fill, br, alpha, 'top', 0)
                drawCellFlap(px, py, CELL, cell.fill, br, alpha, 'bottom', squeeze)
              }
            } else {
              drawPixelBlock(px, py, CELL, cell.fill, br, alpha)
            }

            // Faint grid
            ctx.fillStyle = 'rgba(255,255,255,0.02)'
            ctx.fillRect(px + CELL - 1, py, 1, CELL)
            ctx.fillRect(px, py + CELL - 1, CELL, 1)
          }
        }

        // Temperature indicator (subtle bar below box)
        const tempNorm = Math.min(1, box.temperature / 5)
        const barW = Math.floor(boxPx * tempNorm)
        const barY = by + boxPy + 4
        ctx.fillStyle = `rgba(${Math.floor(255 * tempNorm)}, ${Math.floor(80 * (1 - tempNorm))}, ${Math.floor(40 * (1 - tempNorm))}, 0.3)`
        ctx.fillRect(bx, barY, barW, 1)

        // Concept label below
        const label = box.shape.concept || box.shape.name
        ctx.font = '4px sans-serif'
        ctx.fillStyle = box.phase === 'won' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'
        ctx.textAlign = 'center'
        ctx.fillText(label, bx + boxPx / 2, barY + 8)

        // Box border
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'
        ctx.lineWidth = 1
        ctx.strokeRect(bx - 0.5, by - 0.5, boxPx + 1, boxPy + 1)
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        p.vx *= 0.97; p.vy *= 0.97
        p.life--
        if (p.life <= 0) { particles.splice(i, 1); continue }
        const a = p.life / p.maxLife
        ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.size), Math.ceil(p.size))
      }

      drawScanlines()

      // Title
      // (handled by HTML overlay)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="min-h-dvh bg-black overflow-hidden relative">
      <canvas
        ref={canvasRef}
        className="fixed inset-0"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="fixed top-0 left-0 z-10 p-4" style={{ pointerEvents: 'none' }}>
        <h1
          className="text-sm font-light tracking-[0.12em] text-white/40"
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            opacity: 0,
            animation: 'textFadeIn 2s ease-out 1s forwards',
          }}
        >
          Now what? <span className="text-white/15 ml-2">ising model</span>
        </h1>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');
        @keyframes textFadeIn {
          from { opacity: 0; }
          to { opacity: 0.88; }
        }
      `}</style>
    </div>
  )
}
