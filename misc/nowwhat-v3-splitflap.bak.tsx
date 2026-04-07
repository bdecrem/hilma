'use client'

import { useEffect, useRef } from 'react'

// Target shapes as 10x10 bitmaps
const TARGETS: { name: string; grid: number[][] }[] = [
  { name: 'person', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,0,0,1,1,0,0],
    [0,1,1,0,0,0,0,1,1,0],
  ]},
  { name: 'house', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,0,0,1,1,0,0,1,1],
    [1,1,0,0,1,1,0,0,1,1],
    [1,1,1,1,0,0,1,1,1,1],
    [1,1,1,1,0,0,1,1,1,1],
  ]},
  { name: 'heart', grid: [
    [0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,0,0,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { name: 'exclamation', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
  ]},
  { name: 'circle', grid: [
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,0,0,1,1,1,0],
    [1,1,1,0,0,0,0,1,1,1],
    [1,1,0,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,1,1],
    [1,1,1,0,0,0,0,1,1,1],
    [0,1,1,1,0,0,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],
  ]},
  { name: 'star', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,1,1,0,0,1,1,0,0],
    [0,1,1,0,0,0,0,1,1,0],
    [1,1,0,0,0,0,0,0,1,1],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { name: 'arrow', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,0,1,1,0,1,1,0],
    [1,1,0,0,1,1,0,0,1,1],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
  ]},
  { name: 'tree', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
  ]},
]

const FILLS = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots'] as const
type Fill = (typeof FILLS)[number]

const GS = 10 // grid size

interface Cell {
  // Current display state
  fill: Fill
  brightness: number
  // Flipping
  flipping: boolean
  flipPhase: number    // 0-1, the mechanical flip progress
  flipSpeed: number
  flipTimer: number
  nextFill: Fill
  nextBrightness: number
  // Locked
  locked: boolean
  lockedAt: number
  // Target
  isTarget: boolean
}

interface Box {
  cells: Cell[][]
  phase: 'cycling' | 'resolving' | 'resolved' | 'failing' | 'wiping' | 'won'
  phaseStart: number
  targetName: string
  targetGrid: number[][]
  willSucceed: boolean
  resolveOrder: [number, number][] // order in which target cells lock
  resolveIndex: number
  nextResolveAt: number
}

function randomFill(): Fill {
  return FILLS[Math.floor(Math.random() * FILLS.length)]
}

function makeCell(): Cell {
  const active = Math.random() < 0.45 // only ~45% start flipping
  return {
    fill: randomFill(),
    brightness: 0.3 + Math.random() * 0.5,
    flipping: active,
    flipPhase: active ? Math.random() : 0,
    flipSpeed: 0.015 + Math.random() * 0.03,
    flipTimer: active ? 0 : 30 + Math.floor(Math.random() * 80),
    nextFill: randomFill(),
    nextBrightness: 0.3 + Math.random() * 0.5,
    locked: false,
    lockedAt: 0,
    isTarget: false,
  }
}

function planBox(now: number): Box {
  const target = TARGETS[Math.floor(Math.random() * TARGETS.length)]
  const cells: Cell[][] = Array.from({ length: GS }, () =>
    Array.from({ length: GS }, () => makeCell())
  )

  // Mark target cells
  for (let r = 0; r < GS; r++)
    for (let c = 0; c < GS; c++)
      cells[r][c].isTarget = target.grid[r][c] === 1

  // Build resolve order: spread from a random seed point in the target
  const targetCells: [number, number][] = []
  for (let r = 0; r < GS; r++)
    for (let c = 0; c < GS; c++)
      if (target.grid[r][c]) targetCells.push([c, r])

  // BFS from random seed
  const seed = targetCells[Math.floor(Math.random() * targetCells.length)]
  const visited = new Set<string>()
  const order: [number, number][] = []
  const queue: [number, number][] = [seed]
  visited.add(`${seed[0]},${seed[1]}`)

  while (queue.length > 0) {
    // Pick from front with some randomness
    const idx = Math.random() < 0.7 ? 0 : Math.min(Math.floor(Math.random() * 3), queue.length - 1)
    const [cx, cy] = queue.splice(idx, 1)[0]
    order.push([cx, cy])

    const neighbors: [number, number][] = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]
    for (const [nx, ny] of neighbors) {
      const key = `${nx},${ny}`
      if (nx >= 0 && nx < GS && ny >= 0 && ny < GS && target.grid[ny][nx] && !visited.has(key)) {
        visited.add(key)
        queue.push([nx, ny])
      }
    }
  }

  return {
    cells,
    phase: 'cycling',
    phaseStart: now,
    targetName: target.name,
    targetGrid: target.grid,
    willSucceed: Math.random() < 0.3,
    resolveOrder: order,
    resolveIndex: 0,
    nextResolveAt: now + 2000 + Math.random() * 2000,
  }
}

export default function NowWhatHome() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const SCALE = 3
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

      // Beveled edges
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.18})`
      ctx.fillRect(x, y, size, 1)
      ctx.fillRect(x, y, 1, size)
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.3})`
      ctx.fillRect(x, y + size - 1, size, 1)
      ctx.fillRect(x + size - 1, y, 1, size)
    }

    // Split-flap draw: top or bottom half clipped, with squeeze for flip effect
    function drawCellFlap(
      x: number, y: number, size: number,
      fill: Fill, brightness: number, alpha: number,
      half: 'top' | 'bottom', squeeze: number, // 0=full, 1=flat
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

    const now0 = performance.now()
    const boxes: Box[] = [
      planBox(now0),
      planBox(now0 - 3000),
      planBox(now0 - 6000),
      planBox(now0 - 10000),
    ]

    let globalWipeAt = now0 + 120000 // 2 minutes

    function drawScanlines() {
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1)
      }
    }

    let frame = 0
    const tick = () => {
      const now = performance.now()

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      // Global wipe every 2 minutes
      if (now > globalWipeAt) {
        for (let b = 0; b < 4; b++) {
          boxes[b] = planBox(now + b * 1500)
        }
        globalWipeAt = now + 120000
      }

      // Layout: 4 boxes across the bottom
      const boxPx = GS * CELL
      const gap = Math.max(4, Math.floor(W * 0.025))
      const totalW = boxPx * 4 + gap * 3
      const startX = Math.floor((W - totalW) / 2)
      const boxY = H - boxPx - Math.floor(H * 0.08)

      for (let b = 0; b < 4; b++) {
        const box = boxes[b]
        const bx = startX + b * (boxPx + gap)
        const by = boxY

        // --- Update cells ---
        for (let r = 0; r < GS; r++) {
          for (let c = 0; c < GS; c++) {
            const cell = box.cells[r][c]

            if (cell.locked) continue

            if (cell.flipping) {
              cell.flipPhase += cell.flipSpeed
              if (cell.flipPhase >= 1) {
                // Complete the flip
                cell.fill = cell.nextFill
                cell.brightness = cell.nextBrightness
                cell.flipPhase = 0

                // Pause between flips most of the time
                if (Math.random() < 0.6) {
                  cell.flipping = false
                  cell.flipTimer = 20 + Math.floor(Math.random() * 60)
                } else {
                  cell.nextFill = randomFill()
                  cell.nextBrightness = 0.3 + Math.random() * 0.5
                }
              }
            } else {
              cell.flipTimer--
              if (cell.flipTimer <= 0) {
                cell.flipping = true
                cell.nextFill = randomFill()
                cell.nextBrightness = 0.3 + Math.random() * 0.5
                cell.flipSpeed = 0.03 + Math.random() * 0.05
              }
            }
          }
        }

        // --- Phase logic ---
        const elapsed = now - box.phaseStart

        if (box.phase === 'cycling') {
          // After initial cycling, start resolving
          if (elapsed > 1500 + Math.random() * 500) {
            box.phase = 'resolving'
            box.phaseStart = now
            box.nextResolveAt = now + 200 + Math.random() * 400
          }
        }

        if (box.phase === 'resolving') {
          // Gradually lock in cells
          if (now > box.nextResolveAt && box.resolveIndex < box.resolveOrder.length) {
            const [cx, cy] = box.resolveOrder[box.resolveIndex]
            const cell = box.cells[cy][cx]

            if (box.willSucceed || box.resolveIndex < box.resolveOrder.length * 0.5) {
              // Lock correctly
              cell.locked = true
              cell.lockedAt = now
              cell.fill = FILLS[Math.floor(Math.random() * 3)] // prefer solid/checker/stripe
              cell.brightness = 0.65 + Math.random() * 0.35
              cell.flipping = false
              cell.flipPhase = 0
            } else {
              // Lock wrong cells or skip — causes failure
              // Lock a random non-target cell instead sometimes
              const wrongR = Math.floor(Math.random() * GS)
              const wrongC = Math.floor(Math.random() * GS)
              const wrongCell = box.cells[wrongR][wrongC]
              if (!wrongCell.locked) {
                wrongCell.locked = true
                wrongCell.lockedAt = now
                wrongCell.brightness = 0.4 + Math.random() * 0.3
                wrongCell.flipping = false
              }
            }

            box.resolveIndex++

            // Speed up as we go
            const progress = box.resolveIndex / box.resolveOrder.length
            const interval = box.willSucceed
              ? 150 + (1 - progress) * 300
              : 100 + (1 - progress) * 200
            box.nextResolveAt = now + interval + Math.random() * interval * 0.5
          }

          // Check completion
          if (box.resolveIndex >= box.resolveOrder.length) {
            if (box.willSucceed) {
              // Lock any remaining target cells
              for (let r = 0; r < GS; r++)
                for (let c = 0; c < GS; c++)
                  if (box.cells[r][c].isTarget && !box.cells[r][c].locked) {
                    box.cells[r][c].locked = true
                    box.cells[r][c].lockedAt = now
                    box.cells[r][c].brightness = 0.7 + Math.random() * 0.3
                    box.cells[r][c].flipping = false
                  }

              // Unlock non-target cells
              for (let r = 0; r < GS; r++)
                for (let c = 0; c < GS; c++)
                  if (!box.cells[r][c].isTarget) {
                    box.cells[r][c].locked = false
                    box.cells[r][c].brightness = 0.1
                    box.cells[r][c].flipping = false
                    box.cells[r][c].flipTimer = 9999
                  }

              box.phase = 'resolved'
              box.phaseStart = now
            } else {
              box.phase = 'failing'
              box.phaseStart = now
            }
          }
        }

        if (box.phase === 'resolved') {
          // Brief flash, then hold as won
          if (elapsed > 0 && now - box.phaseStart > 800) {
            box.phase = 'won'
            box.phaseStart = now
          }
        }

        if (box.phase === 'failing') {
          // Hold the mess briefly, then wipe
          if (now - box.phaseStart > 1500) {
            box.phase = 'wiping'
            box.phaseStart = now
            // Unlock everything and speed up flipping
            for (let r = 0; r < GS; r++)
              for (let c = 0; c < GS; c++) {
                const cell = box.cells[r][c]
                cell.locked = false
                cell.flipping = Math.random() < 0.5
                cell.flipSpeed = 0.03 + Math.random() * 0.04
                cell.flipTimer = Math.floor(Math.random() * 30)
              }
          }
        }

        if (box.phase === 'wiping') {
          if (now - box.phaseStart > 1200) {
            // Reset this box with a new target
            Object.assign(box, planBox(now))
          }
        }

        // --- Draw cells ---
        for (let r = 0; r < GS; r++) {
          for (let c = 0; c < GS; c++) {
            const cell = box.cells[r][c]
            const px = bx + c * CELL
            const py = by + r * CELL

            if (box.phase === 'won' && !cell.isTarget) {
              // Dark empty cell for won state
              continue
            }

            if (cell.locked) {
              // Locked cell: solid, maybe gentle pulse
              const age = (now - cell.lockedAt) / 1000
              const flash = age < 0.15
              const resolvedPulse = box.phase === 'resolved'
                ? 0.2 * Math.sin((now - box.phaseStart) * 0.015)
                : 0
              const wonBreath = box.phase === 'won'
                ? 0.08 * Math.sin(now * 0.001 + r * 0.3 + c * 0.2)
                : 0
              const br = Math.min(1, cell.brightness + (flash ? 0.4 : 0) + resolvedPulse + wonBreath)
              const alpha = box.phase === 'wiping'
                ? Math.max(0, 1 - (now - box.phaseStart) / 800)
                : 0.9
              drawPixelBlock(px, py, CELL, cell.fill, br, alpha)
            } else if (cell.flipping && cell.flipPhase > 0) {
              // Split-flap animation
              const phase = cell.flipPhase
              if (phase < 0.5) {
                // Old content, top half squeezing shut
                const squeeze = phase * 2
                drawCellFlap(px, py, CELL, cell.fill, cell.brightness, 0.5, 'bottom', 0)
                drawCellFlap(px, py, CELL, cell.fill, cell.brightness, 0.5, 'top', squeeze)
              } else {
                // New content, bottom half opening
                const squeeze = 1 - (phase - 0.5) * 2
                drawCellFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, 0.5, 'top', 0)
                drawCellFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, 0.5, 'bottom', squeeze)
              }
            } else if (!cell.flipping && cell.flipTimer < 9999) {
              // Paused between flips — show current
              drawPixelBlock(px, py, CELL, cell.fill, cell.brightness, 0.35)
            }

            // Faint grid line
            ctx.fillStyle = 'rgba(255,255,255,0.02)'
            ctx.fillRect(px + CELL - 1, py, 1, CELL)
            ctx.fillRect(px, py + CELL - 1, CELL, 1)
          }
        }

        // Box border (very subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'
        ctx.lineWidth = 1
        ctx.strokeRect(bx - 0.5, by - 0.5, boxPx + 1, boxPx + 1)
      }

      drawScanlines()

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
      <div className="fixed inset-0 z-10 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
        <h1
          className="text-5xl sm:text-7xl font-light tracking-[0.12em] text-white"
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            opacity: 0,
            animation: 'textFadeIn 3s ease-out 1.5s forwards',
          }}
        >
          Now what?
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
