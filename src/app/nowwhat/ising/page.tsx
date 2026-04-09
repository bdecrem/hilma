'use client'

import { useEffect, useRef } from 'react'

/**
 * "Luck of the Draw" engine for Now What?
 *
 * An agent tries to build a shape by activating cells one at a time, spreading
 * from a seed. Each activated cell gets a RANDOM tile (fill + brightness).
 *
 * Momentum: similar neighboring tiles reinforce each other → agent spreads faster
 * Entropy: mismatched neighbors fight → agent slows, cells can fall back
 *
 * Outcome is genuinely emergent — good luck compounds, bad luck compounds.
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
interface HaikuCandidate { id: string; concept: string; name: string; grid: Grid; fillPercent: number; createdAt: string }

const FALLBACK_SHAPES: Shape[] = [
  { name: 'person', grid: emb([[0,0,1,1,0,0],[0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,1,1,1,1],[0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,0,0,1,1]]) },
  { name: 'heart', grid: emb([[0,1,1,0,0,1,1,0],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,0],[0,0,1,1,1,1,0,0],[0,0,0,1,1,0,0,0]]) },
  { name: 'tree', grid: emb([[0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,1,1,1,1],[0,1,1,1,1,0],[1,1,1,1,1,1],[0,0,1,1,0,0],[0,0,1,1,0,0]]) },
  { name: 'house', grid: emb([[0,0,0,1,1,0,0,0],[0,0,1,1,1,1,0,0],[0,1,1,1,1,1,1,0],[1,1,1,1,1,1,1,1],[1,1,0,0,0,0,1,1],[1,1,0,0,0,0,1,1],[1,1,1,1,1,1,1,1]]) },
  { name: 'star', grid: emb([[0,0,0,1,1,0,0,0],[0,0,0,1,1,0,0,0],[1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,0],[0,0,1,1,1,1,0,0],[0,1,1,0,0,1,1,0],[1,1,0,0,0,0,1,1]]) },
]

// ── Tiles & Cells ───────────────────────────────────────

type Fill = 'solid' | 'checker' | 'stripe_h' | 'stripe_v' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
function randomFill(): Fill { return FILLS[Math.floor(Math.random() * FILLS.length)] }

interface Cell {
  isTarget: boolean
  // Activation state
  active: boolean
  activatedAt: number
  falling: boolean       // cell is losing its hold
  // Tile properties (the "luck")
  fill: Fill
  brightness: number
  // Visual animation — match production split-flap behavior
  flipping: boolean
  flipPhase: number
  flipSpeed: number
  flipTimer: number
  nextFill: Fill
  nextBrightness: number
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

type Phase = 'idle' | 'building' | 'cascade' | 'won' | 'failing' | 'dark'

interface Box {
  cells: Cell[][]
  phase: Phase
  phaseStart: number
  shape: Shape
  // Agent state
  frontier: { r: number; c: number; score: number }[]
  momentum: number       // 0-1, how well things are going
  buildSpeed: number     // ms between activations
  nextBuildAt: number
  seedR: number; seedC: number
  wonPulse: number
  totalTarget: number
  activatedCount: number
}

// How well a cell "fits" with its active neighbors (0 = terrible, 1 = perfect)
function tileHarmony(cells: Cell[][], r: number, c: number): number {
  const cell = cells[r][c]
  let totalScore = 0
  let neighbors = 0

  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      const n = cells[nr][nc]
      if (n.active && !n.falling) {
        neighbors++
        // Same fill type = strong harmony
        const fillMatch = cell.fill === n.fill ? 0.5 : 0.15
        // Similar brightness = harmony
        const brMatch = 1 - Math.abs(cell.brightness - n.brightness)
        totalScore += fillMatch + brMatch * 0.5
      }
    }
  }

  if (neighbors === 0) return 0.6 // no context = slight optimism
  return totalScore / neighbors
}

function getFrontier(cells: Cell[][]): { r: number; c: number; score: number }[] {
  const f: { r: number; c: number; score: number }[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!cells[r][c].isTarget || cells[r][c].active) continue
      // Has at least one active neighbor?
      let hasActiveNeighbor = false
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && cells[nr][nc].active && !cells[nr][nc].falling) {
          hasActiveNeighbor = true
          break
        }
      }
      if (hasActiveNeighbor) f.push({ r, c, score: 0 })
    }
  }
  return f
}

function makeBox(now: number, shape: Shape): Box {
  const cells: Cell[][] = []
  let totalTarget = 0

  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = []
    for (let c = 0; c < COLS; c++) {
      const isTarget = shape.grid[r][c] === 1
      if (isTarget) totalTarget++
      const startActive = Math.random() < 0.45
      row.push({
        isTarget,
        active: false,
        activatedAt: 0,
        falling: false,
        fill: randomFill(),
        brightness: 0.15 + Math.random() * 0.45,
        flipping: startActive,
        flipPhase: startActive ? Math.random() : 0,
        flipSpeed: 0.013 + Math.random() * 0.025,
        flipTimer: startActive ? 0 : 10 + Math.floor(Math.random() * 50),
        nextFill: randomFill(),
        nextBrightness: 0.15 + Math.random() * 0.45,
      })
    }
    cells.push(row)
  }

  // Pick a random seed from target cells
  const targetCells: [number, number][] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (shape.grid[r][c]) targetCells.push([r, c])

  const [seedR, seedC] = targetCells[Math.floor(Math.random() * targetCells.length)]

  // Activate seed cell
  cells[seedR][seedC].active = true
  cells[seedR][seedC].activatedAt = now

  return {
    cells,
    phase: 'idle',
    phaseStart: now,
    shape,
    frontier: [],
    momentum: 0.5,
    buildSpeed: 180,
    nextBuildAt: now + 800, // brief pause before building starts
    seedR, seedC,
    wonPulse: 0,
    totalTarget,
    activatedCount: 1,
  }
}

// ── Rendering ───────────────────────────────────────────

export default function LuckEngine() {
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
          life, maxLife: life, size: 1 + Math.random(),
        })
      }
    }

    function drawPixelBlock(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number) {
      const r = Math.floor(brightness * 255)
      ctx.fillStyle = `rgba(${r},${r},${r},${alpha})`
      switch (fill) {
        case 'solid':
          ctx.fillRect(x + 1, y + 1, size - 2, size - 2); break
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
          ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + size - 3, y + 2, 1, 1)
          ctx.fillRect(x + 2, y + size - 3, 1, 1); ctx.fillRect(x + size - 3, y + size - 3, 1, 1)
          break
      }
      // Bevel
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.18})`
      ctx.fillRect(x, y, size, 1); ctx.fillRect(x, y, 1, size)
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.3})`
      ctx.fillRect(x, y + size - 1, size, 1); ctx.fillRect(x + size - 1, y, 1, size)
    }

    function drawCellFlap(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number, half: 'top'|'bottom', squeeze: number) {
      ctx.save()
      if (half === 'top') {
        ctx.beginPath(); ctx.rect(x, y, size, Math.ceil(size / 2)); ctx.clip()
        ctx.translate(0, squeeze * (size / 2) * 0.5); ctx.scale(1, 1 - squeeze * 0.5)
      } else {
        ctx.beginPath(); ctx.rect(x, y + Math.floor(size / 2), size, Math.ceil(size / 2)); ctx.clip()
        ctx.translate(0, -squeeze * (size / 2) * 0.5); ctx.scale(1, 1 - squeeze * 0.5)
      }
      drawPixelBlock(x, y, size, fill, brightness, alpha * (1 - squeeze * 0.3))
      ctx.restore()
    }

    function drawScanlines() {
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
    }

    // Haiku pipeline
    let pendingShape: Shape | null = null
    let fetchingShape = false
    function fetchHaikuShape() {
      if (fetchingShape) return
      fetchingShape = true
      fetch('/api/nowwhat/gen2', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.candidate?.grid) {
            pendingShape = { name: data.candidate.name || data.concept, grid: data.candidate.grid, concept: data.concept, candidate: data.candidate }
          }
          fetchingShape = false
        })
        .catch(() => { fetchingShape = false })
    }
    fetchHaikuShape()

    function nextShape(): Shape {
      if (pendingShape) {
        const s = pendingShape
        pendingShape = null
        fetchHaikuShape()
        return s
      }
      return FALLBACK_SHAPES[Math.floor(Math.random() * FALLBACK_SHAPES.length)]
    }

    const now0 = performance.now()
    let box: Box = makeBox(now0, FALLBACK_SHAPES[Math.floor(Math.random() * FALLBACK_SHAPES.length)])

    let frame = 0
    const tick = () => {
      const now = performance.now()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      const boxPx = COLS * CELL
      const boxPy = ROWS * CELL
      const bx = Math.floor((W - boxPx) / 2)
      const by = Math.floor((H - boxPy) / 2)
      const elapsed = now - box.phaseStart

      // ── Phase: idle (brief pause, show seed) ──
      if (box.phase === 'idle' && elapsed > 600) {
        box.phase = 'building'
        box.phaseStart = now
        box.nextBuildAt = now + 100
      }

      // ── Phase: building ──
      if (box.phase === 'building' && now >= box.nextBuildAt) {
        const frontier = getFrontier(box.cells)

        if (frontier.length === 0) {
          // No more frontier — check if we won
          const progress = box.activatedCount / box.totalTarget
          if (progress > 0.75) {
            box.phase = 'won'
            box.phaseStart = now
            box.wonPulse = 0
            emitParticles(bx + boxPx / 2, by + boxPy / 2, 20, 0.8, 40)
          } else {
            box.phase = 'failing'
            box.phaseStart = now
          }
        } else {
          // Pick a frontier cell (weighted by neighbor count)
          const weighted = frontier.flatMap(f => {
            const nn = [[-1,0],[1,0],[0,-1],[0,1]].filter(([dr,dc]) => {
              const nr = f.r+dr, nc = f.c+dc
              return nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&box.cells[nr][nc].active&&!box.cells[nr][nc].falling
            }).length
            return Array(nn * 2 + 1).fill(f)
          })
          const pick = weighted[Math.floor(Math.random() * weighted.length)]
          const cell = box.cells[pick.r][pick.c]

          // Activate it — random tile (the luck)
          cell.active = true
          cell.activatedAt = now
          cell.fill = randomFill()
          cell.brightness = 0.55 + Math.random() * 0.45
          cell.flipping = true
          cell.flipPhase = 0
          cell.flipSpeed = 0.016 + Math.random() * 0.035
          box.activatedCount++

          // Check harmony with neighbors
          const harmony = tileHarmony(box.cells, pick.r, pick.c)

          // Update momentum — biased slightly toward success
          box.momentum += (harmony - 0.4) * 0.12
          box.momentum = Math.max(0, Math.min(1, box.momentum))

          // Momentum affects build speed
          // High momentum = faster building, low momentum = slower
          // But never too fast — keep it watchable
          box.buildSpeed = 150 + (1 - box.momentum) * 350

          // Low momentum: chance that a random active cell falls back
          if (box.momentum < 0.2 && Math.random() < (0.2 - box.momentum) * 1.0) {
            // Find a random active non-seed cell to deactivate
            const actives: [number, number][] = []
            for (let r = 0; r < ROWS; r++)
              for (let c = 0; c < COLS; c++)
                if (box.cells[r][c].active && !box.cells[r][c].falling && !(r === box.seedR && c === box.seedC))
                  actives.push([r, c])
            if (actives.length > 0) {
              const [fr, fc] = actives[Math.floor(Math.random() * actives.length)]
              box.cells[fr][fc].falling = true
              box.cells[fr][fc].flipping = true
              box.cells[fr][fc].flipPhase = 0
            }
          }

          // High momentum: chance to boost a neighbor's brightness
          if (box.momentum > 0.7 && Math.random() < 0.3) {
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nr = pick.r+dr, nc = pick.c+dc
              if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&box.cells[nr][nc].active&&!box.cells[nr][nc].falling) {
                box.cells[nr][nc].brightness = Math.min(1, box.cells[nr][nc].brightness + 0.15)
              }
            }
          }

          box.nextBuildAt = now + box.buildSpeed + Math.random() * box.buildSpeed * 0.5

          // Check for catastrophic entropy (momentum bottomed out)
          if (box.momentum < 0.03) {
            box.phase = 'failing'
            box.phaseStart = now
          }

          // Check for win (enough cells activated)
          const progress = box.activatedCount / box.totalTarget
          if (progress > 0.8 && box.momentum > 0.3) {
            // Don't instant-fill — switch to a cascade phase
            box.phase = 'cascade' as Phase
            box.phaseStart = now
          }
        }
      }

      // ── Phase: cascade (gradual fill of remaining cells) ──
      if ((box.phase as string) === 'cascade') {
        // Find remaining inactive target cells
        const remaining: [number, number][] = []
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (box.cells[r][c].isTarget && !box.cells[r][c].active)
              remaining.push([r, c])

        if (remaining.length === 0) {
          box.phase = 'won'
          box.phaseStart = now
          box.wonPulse = 0
          emitParticles(bx + boxPx / 2, by + boxPy / 2, 25, 0.9, 45)
        } else {
          // Fill 1-2 cells per frame, accelerating
          const fillCount = Math.min(remaining.length, 1 + Math.floor(elapsed / 400))
          for (let i = 0; i < fillCount; i++) {
            // Pick one with an active neighbor preferentially
            let pick: [number, number] | null = null
            for (const [r, c] of remaining) {
              let hasNeighbor = false
              for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const nr = r+dr, nc = c+dc
                if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&box.cells[nr][nc].active) { hasNeighbor = true; break }
              }
              if (hasNeighbor) { pick = [r, c]; break }
            }
            if (!pick) pick = remaining[0]
            const [pr, pc] = pick
            const cell = box.cells[pr][pc]
            cell.active = true
            cell.activatedAt = now + i * 60
            cell.fill = randomFill()
            cell.brightness = 0.55 + Math.random() * 0.45
            cell.flipping = true
            cell.flipPhase = 0
            cell.flipSpeed = 0.03 + Math.random() * 0.03
            remaining.splice(remaining.indexOf(pick), 1)
          }
        }
      }

      // ── Update falling cells ──
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          if (cell.falling) {
            cell.brightness *= 0.95
            if (cell.brightness < 0.05) {
              cell.active = false
              cell.falling = false
              box.activatedCount = Math.max(0, box.activatedCount - 1)
            }
          }
        }

      // ── Phase: won ──
      if (box.phase === 'won') {
        box.wonPulse = Math.sin(elapsed * 0.004) * 0.12
        if (elapsed > 500 && box.shape.candidate && !box.shape.candidate.id.startsWith('saved-')) {
          fetch('/api/nowwhat/gen2', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate: box.shape.candidate }),
          }).catch(() => {})
          box.shape.candidate.id = 'saved-' + box.shape.candidate.id
        }
        if (elapsed > 5000) {
          box.phase = 'dark'
          box.phaseStart = now
        }
      }

      // ── Phase: failing ──
      if (box.phase === 'failing') {
        // Gradually dissolve — cells fall one at a time
        const failProgress = elapsed / 3000
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            const cell = box.cells[r][c]
            if (cell.active && !cell.falling) {
              // Cells at the edges fall first, spreading inward
              const distFromSeed = Math.abs(r - box.seedR) + Math.abs(c - box.seedC)
              const maxDist = ROWS + COLS
              const fallThreshold = (1 - distFromSeed / maxDist) * failProgress
              if (Math.random() < fallThreshold * 0.04) {
                cell.falling = true
                cell.flipping = true
                cell.flipPhase = 0
              }
            }
            if (cell.falling) {
              cell.brightness *= 0.96
            }
          }
        if (elapsed > 3500) {
          box.phase = 'dark'
          box.phaseStart = now
        }
      }

      // ── Phase: dark ──
      if ((box.phase as string) === 'dark' && elapsed > 600) {
        box = makeBox(now, nextShape())
      }

        // ── Update flip animations (match production) ──
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          if (cell.active && box.phase === 'won') continue // won cells don't flip

          if (cell.flipping) {
            cell.flipPhase += cell.flipSpeed
            if (cell.flipPhase >= 1) {
              cell.fill = cell.nextFill
              cell.brightness = cell.nextBrightness
              cell.flipPhase = 0
              if (cell.active) {
                // Active cells flip less
                cell.flipping = false
                cell.flipTimer = 20 + Math.floor(Math.random() * 40)
              } else if (Math.random() < 0.4) {
                cell.flipping = false
                cell.flipTimer = Math.floor(8 + Math.random() * 35)
              } else {
                cell.nextFill = randomFill()
                cell.nextBrightness = 0.15 + Math.random() * 0.45
              }
            }
          } else if (!cell.active) {
            cell.flipTimer--
            if (cell.flipTimer <= 0) {
              cell.flipping = true
              cell.nextFill = randomFill()
              cell.nextBrightness = 0.15 + Math.random() * 0.45
              cell.flipSpeed = 0.016 + Math.random() * 0.035
            }
          }
        }

      // ── Draw cells ──
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          const px = bx + c * CELL
          const py = by + r * CELL

          if ((box.phase as string) === 'dark') continue

          if (box.phase === 'won' && !cell.isTarget) continue
          if (box.phase === 'won' && cell.isTarget && !cell.active) continue

          let alpha = 0
          let br = cell.brightness

          if (box.phase === 'won') {
            if (cell.isTarget && cell.active) {
              br = Math.min(1, 0.65 + box.wonPulse + Math.sin(now * 0.001 + r * 0.3 + c * 0.2) * 0.08)
              alpha = 0.9
            } else {
              continue
            }
          } else if (cell.active && !cell.falling) {
            // Locked-in active cell — bright
            const age = (now - cell.activatedAt) / 1000
            const flash = age < 0.15 ? 0.3 : 0
            br = Math.min(1, cell.brightness + flash)
            alpha = 0.85
          } else if (cell.falling) {
            alpha = Math.max(0.05, cell.brightness * 0.7)
          } else if (cell.flipping && cell.flipPhase > 0) {
            // Inactive cycling cell — faint, like production background noise
            alpha = 0.35
          } else if (cell.flipTimer < 99999) {
            // Paused between flips
            alpha = 0.2
          } else {
            continue
          }

          if (alpha < 0.02) continue

          if (cell.flipping && cell.flipPhase > 0 && cell.flipPhase < 1) {
            const phase = cell.flipPhase
            if (phase < 0.5) {
              const squeeze = phase * 2
              drawCellFlap(px, py, CELL, cell.fill, br, alpha, 'bottom', 0)
              drawCellFlap(px, py, CELL, cell.fill, br, alpha, 'top', squeeze)
            } else {
              const squeeze = 1 - (phase - 0.5) * 2
              drawCellFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, alpha, 'top', 0)
              drawCellFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, alpha, 'bottom', squeeze)
            }
          } else {
            drawPixelBlock(px, py, CELL, cell.fill, br, alpha)
          }

          // Grid lines
          ctx.fillStyle = 'rgba(255,255,255,0.02)'
          ctx.fillRect(px + CELL - 1, py, 1, CELL)
          ctx.fillRect(px, py + CELL - 1, CELL, 1)
        }
      }

      // Momentum bar (green = good, red = bad)
      const mBar = Math.floor(boxPx * box.momentum)
      const mY = by + boxPy + 4
      const mR = Math.floor(255 * (1 - box.momentum))
      const mG = Math.floor(200 * box.momentum)
      ctx.fillStyle = `rgba(${mR},${mG},60,0.35)`
      ctx.fillRect(bx, mY, mBar, 1)

      // Concept label
      const label = box.shape.concept || box.shape.name
      ctx.font = '4px sans-serif'
      ctx.fillStyle = box.phase === 'won' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'
      ctx.textAlign = 'center'
      ctx.fillText(label, bx + boxPx / 2, mY + 8)

      // Box border
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      ctx.strokeRect(bx - 0.5, by - 0.5, boxPx + 1, boxPy + 1)

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97; p.life--
        if (p.life <= 0) { particles.splice(i, 1); continue }
        const a = p.life / p.maxLife
        ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.size), Math.ceil(p.size))
      }

      drawScanlines()
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="min-h-dvh bg-black overflow-hidden relative">
      <canvas ref={canvasRef} className="fixed inset-0" style={{ imageRendering: 'pixelated' }} />
      <div className="fixed top-0 left-0 z-10 p-4" style={{ pointerEvents: 'none' }}>
        <h1 className="text-sm font-light tracking-[0.12em] text-white/40"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif", opacity: 0, animation: 'textFadeIn 2s ease-out 1s forwards' }}>
          Now what? <span className="text-white/15 ml-2">luck engine</span>
        </h1>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');
        @keyframes textFadeIn { from { opacity: 0; } to { opacity: 0.88; } }
      `}</style>
    </div>
  )
}
