'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const N = 18

// Tile edges as [N, E, S, W], 1 = wire, 0 = no wire
const TILES: readonly (readonly number[])[] = [
  [0,0,0,0],  // 0: empty
  [0,1,0,1],  // 1: horizontal
  [1,0,1,0],  // 2: vertical
  [1,1,0,0],  // 3: corner NE
  [1,0,0,1],  // 4: corner NW
  [0,1,1,0],  // 5: corner SE
  [0,0,1,1],  // 6: corner SW
  [0,1,1,1],  // 7: T (no N — connects E,S,W)
  [1,0,1,1],  // 8: T (no E)
  [1,1,0,1],  // 9: T (no S)
  [1,1,1,0],  // 10: T (no W)
  [1,1,1,1],  // 11: cross
]
const OPPOSITE = [2, 3, 0, 1]
const DIRS: readonly (readonly number[])[] = [[-1,0],[0,1],[1,0],[0,-1]]

// Tile weights — shapes the aesthetic
const WEIGHTS = [2.5, 2, 2, 1.4, 1.4, 1.4, 1.4, 0.8, 0.8, 0.8, 0.8, 0.5]

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Cell {
  possible: Set<number>
  collapsed: number
  flash: number
}

export default function L43() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L43')

    let cells: Cell[][] = []
    let done = false
    let doneAt = 0
    let components: number[][] = []

    function initCells() {
      cells = []
      for (let y = 0; y < N; y++) {
        const row: Cell[] = []
        for (let x = 0; x < N; x++) {
          row.push({
            possible: new Set(Array.from({ length: TILES.length }, (_, i) => i)),
            collapsed: -1,
            flash: 0,
          })
        }
        cells.push(row)
      }
      // Border constraint: no wire can exit the grid
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const p = cells[y][x].possible
          if (y === 0) for (const t of Array.from(p)) if (TILES[t][0] === 1) p.delete(t)
          if (y === N - 1) for (const t of Array.from(p)) if (TILES[t][2] === 1) p.delete(t)
          if (x === 0) for (const t of Array.from(p)) if (TILES[t][3] === 1) p.delete(t)
          if (x === N - 1) for (const t of Array.from(p)) if (TILES[t][1] === 1) p.delete(t)
        }
      }
      done = false
      components = []
    }

    function propagate(sy: number, sx: number) {
      const queue: [number, number][] = [[sy, sx]]
      while (queue.length > 0) {
        const [cy, cx] = queue.shift()!
        const cell = cells[cy][cx]
        for (let dir = 0; dir < 4; dir++) {
          const ny = cy + DIRS[dir][0]
          const nx = cx + DIRS[dir][1]
          if (ny < 0 || ny >= N || nx < 0 || nx >= N) continue
          const neighbor = cells[ny][nx]
          if (neighbor.possible.size === 0) continue
          const myEdges = new Set<number>()
          for (const t of cell.possible) myEdges.add(TILES[t][dir])
          let changed = false
          for (const t of Array.from(neighbor.possible)) {
            if (!myEdges.has(TILES[t][OPPOSITE[dir]])) {
              neighbor.possible.delete(t)
              changed = true
            }
          }
          if (changed) {
            if (neighbor.possible.size === 1) {
              const t = Array.from(neighbor.possible)[0]
              if (neighbor.collapsed === -1) {
                neighbor.collapsed = t
                neighbor.flash = 1
              }
            }
            queue.push([ny, nx])
          }
        }
      }
    }

    function step(): boolean {
      let minEntropy = Infinity
      const candidates: [number, number][] = []
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const c = cells[y][x]
          if (c.collapsed !== -1) continue
          const size = c.possible.size
          if (size <= 1) {
            if (size === 1) {
              c.collapsed = Array.from(c.possible)[0]
              c.flash = 1
            }
            continue
          }
          if (size < minEntropy) {
            minEntropy = size
            candidates.length = 0
            candidates.push([y, x])
          } else if (size === minEntropy) {
            candidates.push([y, x])
          }
        }
      }
      if (candidates.length === 0) return false
      const [y, x] = candidates[Math.floor(Math.random() * candidates.length)]
      const cell = cells[y][x]
      const opts = Array.from(cell.possible)
      const weights = opts.map(t => WEIGHTS[t])
      const totalW = weights.reduce((a, b) => a + b, 0)
      let r = Math.random() * totalW
      let chosen = opts[0]
      for (let i = 0; i < opts.length; i++) {
        r -= weights[i]
        if (r <= 0) { chosen = opts[i]; break }
      }
      cell.possible.clear()
      cell.possible.add(chosen)
      cell.collapsed = chosen
      cell.flash = 1
      propagate(y, x)
      return true
    }

    function computeComponents() {
      const comp: number[][] = Array.from({ length: N }, () => Array(N).fill(-1))
      let nextId = 0
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (comp[y][x] !== -1) continue
          const cell = cells[y][x]
          if (cell.collapsed === -1) continue
          const edges = TILES[cell.collapsed]
          if (edges[0] + edges[1] + edges[2] + edges[3] === 0) continue
          const stack: [number, number][] = [[y, x]]
          comp[y][x] = nextId
          while (stack.length > 0) {
            const [cy, cx] = stack.pop()!
            const cEdges = TILES[cells[cy][cx].collapsed]
            for (let dir = 0; dir < 4; dir++) {
              if (cEdges[dir] === 0) continue
              const ny = cy + DIRS[dir][0]
              const nx = cx + DIRS[dir][1]
              if (ny < 0 || ny >= N || nx < 0 || nx >= N) continue
              if (comp[ny][nx] !== -1) continue
              const ncCell = cells[ny][nx]
              if (ncCell.collapsed === -1) continue
              const nEdges = TILES[ncCell.collapsed]
              if (nEdges[OPPOSITE[dir]] === 1) {
                comp[ny][nx] = nextId
                stack.push([ny, nx])
              }
            }
          }
          nextId++
        }
      }
      return comp
    }

    initCells()
    let raf: number
    let stepAccum = 0

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // BG
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1); grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Collapse steps — pace at ~3 per frame so ~100 frames = ~1.5s for full grid
      if (!done) {
        const stepsThisFrame = 3
        for (let i = 0; i < stepsThisFrame; i++) {
          if (!step()) { done = true; doneAt = Date.now(); components = computeComponents(); break }
        }
      } else if (Date.now() - doneAt > 4000) {
        initCells()
      }

      // Grid dimensions — fill most of the screen
      const pad = Math.min(W, H) * 0.05
      const size = Math.min(W - pad * 2, H - pad * 2)
      const cellSize = size / N
      const gx = (W - size) / 2
      const gy = (H - size) / 2

      // Cell pass
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const cell = cells[y][x]
          const cx = gx + x * cellSize
          const cy = gy + y * cellSize

          // Faint grid
          ctx.strokeStyle = 'rgba(42, 34, 24, 0.06)'
          ctx.lineWidth = 0.5
          ctx.strokeRect(cx, cy, cellSize, cellSize)

          // Flash on collapse
          if (cell.flash > 0.02) {
            ctx.fillStyle = `rgba(255, 248, 231, ${cell.flash * 0.4})`
            ctx.fillRect(cx, cy, cellSize, cellSize)
            cell.flash *= 0.85
          }

          if (cell.collapsed !== -1) {
            const edges = TILES[cell.collapsed]
            if (edges[0] + edges[1] + edges[2] + edges[3] > 0) {
              // Color by component
              const compId = components.length > 0 ? components[y][x] : -1
              const color = compId >= 0 ? CITRUS[compId % CITRUS.length] : '#2A2218'
              drawTile(cx, cy, cellSize, cell.collapsed, color)
            }
          } else if (cell.possible.size > 0) {
            // Uncertainty: faint dot proportional to entropy
            const uncertainty = cell.possible.size / TILES.length
            ctx.fillStyle = `rgba(42, 34, 24, ${0.08 + uncertainty * 0.15})`
            const r = cellSize * 0.08
            ctx.beginPath()
            ctx.arc(cx + cellSize / 2, cy + cellSize / 2, r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // Progress indicator
      let collapsed = 0
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (cells[y][x].collapsed !== -1) collapsed++
      const pct = collapsed / (N * N)
      ctx.fillStyle = 'rgba(42, 34, 24, 0.3)'
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${(pct * 100).toFixed(0)}%`, gx, gy - 10)

      // Hint
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(42, 34, 24, 0.3)'
      ctx.fillText('wave function collapse · tap to regenerate', W / 2, gy + size + 28)

      raf = requestAnimationFrame(draw)
    }

    function drawTile(cx: number, cy: number, size: number, tileIdx: number, color: string) {
      const edges = TILES[tileIdx]
      const midX = cx + size / 2
      const midY = cy + size / 2
      const wireW = Math.max(2, size * 0.09)

      ctx.strokeStyle = color
      ctx.lineWidth = wireW
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (edges[0]) { ctx.moveTo(midX, cy); ctx.lineTo(midX, midY) }
      if (edges[1]) { ctx.moveTo(midX, midY); ctx.lineTo(cx + size, midY) }
      if (edges[2]) { ctx.moveTo(midX, midY); ctx.lineTo(midX, cy + size) }
      if (edges[3]) { ctx.moveTo(cx, midY); ctx.lineTo(midX, midY) }
      ctx.stroke()

      const edgeCount = edges[0] + edges[1] + edges[2] + edges[3]
      // Draw node dot for junctions, corners, dead-ends, and crosses
      const isStraight = (edgeCount === 2 && ((edges[0] && edges[2]) || (edges[1] && edges[3])))
      if (!isStraight) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(midX, midY, wireW * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      // Dead-end cap (single edge)
      if (edgeCount === 1) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(midX, midY, wireW * 1.3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function handleTap() {
      initCells()
    }
    canvas.addEventListener('click', handleTap)
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap() }, { passive: false })

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0,
      width: '100%', height: '100dvh',
      cursor: 'pointer', touchAction: 'none',
    }} />
  )
}
