'use client'

import { useEffect, useRef } from 'react'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const BG_COLOR = '#FFF8E7'
const CELL = 4 // pixels per cell
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] // up, right, down, left

interface Ant {
  x: number; y: number
  dir: number // 0-3 index into DIRS
  color: string
}

export default function L29() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array | null>(null)
  const antsRef = useRef<Ant[]>([])
  const colsRef = useRef(0)
  const rowsRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      colsRef.current = Math.floor(W / CELL)
      rowsRef.current = Math.floor(H / CELL)
      gridRef.current = new Uint8Array(colsRef.current * rowsRef.current)
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    let raf: number
    let frame = 0
    let stepCount = 0

    // Seed first ant at center
    antsRef.current = [{
      x: Math.floor(colsRef.current / 2),
      y: Math.floor(rowsRef.current / 2),
      dir: 0,
      color: CITRUS[0],
    }]

    const draw = () => {
      frame++
      const cols = colsRef.current
      const rows = rowsRef.current
      const grid = gridRef.current
      if (!grid) { raf = requestAnimationFrame(draw); return }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Only clear on first frame
      if (frame === 1) {
        ctx.fillStyle = BG_COLOR
        ctx.fillRect(0, 0, W, H)
      }

      // Run multiple steps per frame for speed
      const stepsPerFrame = Math.min(50 + Math.floor(stepCount / 500) * 10, 200)

      for (let s = 0; s < stepsPerFrame; s++) {
        for (const ant of antsRef.current) {
          const idx = ant.y * cols + ant.x
          if (idx < 0 || idx >= grid.length) continue

          const isOn = grid[idx]

          // Turn: on white → right, on color → left
          if (isOn === 0) {
            ant.dir = (ant.dir + 1) % 4 // right
          } else {
            ant.dir = (ant.dir + 3) % 4 // left
          }

          // Flip cell
          grid[idx] = isOn === 0 ? 1 : 0

          // Draw cell
          const px = ant.x * CELL
          const py = ant.y * CELL
          if (isOn === 0) {
            ctx.fillStyle = ant.color
            ctx.globalAlpha = 0.7
          } else {
            ctx.fillStyle = BG_COLOR
            ctx.globalAlpha = 1
          }
          ctx.fillRect(px, py, CELL, CELL)
          ctx.globalAlpha = 1

          // Move forward
          ant.x += DIRS[ant.dir][0]
          ant.y += DIRS[ant.dir][1]

          // Wrap
          if (ant.x < 0) ant.x = cols - 1
          if (ant.x >= cols) ant.x = 0
          if (ant.y < 0) ant.y = rows - 1
          if (ant.y >= rows) ant.y = 0
        }
        stepCount++
      }

      // Draw ant positions
      for (const ant of antsRef.current) {
        ctx.fillStyle = '#2A2218'
        ctx.fillRect(ant.x * CELL, ant.y * CELL, CELL, CELL)
      }

      // Step counter
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.font = '11px monospace'
      ctx.fillText(`${stepCount.toLocaleString()} steps · ${antsRef.current.length} ant${antsRef.current.length > 1 ? 's' : ''}`, 12, H - 12)

      // Hint
      if (frame < 120) {
        ctx.globalAlpha = Math.max(0, 1 - frame / 120) * 0.25
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillText('tap to add an ant. wait for the highway.', W / 2, H - 30)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Tap to add ant
    const handleTap = (cx: number, cy: number) => {
      const ax = Math.floor(cx / CELL)
      const ay = Math.floor(cy / CELL)
      antsRef.current.push({
        x: ax, y: ay,
        dir: Math.floor(Math.random() * 4),
        color: CITRUS[antsRef.current.length % CITRUS.length],
      })
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
        background: BG_COLOR,
      }}
    />
  )
}
