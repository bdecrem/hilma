'use client'

import { useEffect, useRef } from 'react'

const LAYERS = [
  '#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81',
  '#D4A574', '#FC913A', '#FF4E50', '#F9D423', '#FF6B81',
  '#B4E33D', '#FC913A', '#D4A574', '#FF4E50', '#F9D423',
]
const BG = '#FFF8E7'
const CELL = 3

export default function Erosion() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array | null>(null)
  const colsRef = useRef(0)
  const rowsRef = useRef(0)
  const windRef = useRef({ x: 0.7, y: -0.1 })

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
      const cols = colsRef.current
      const rows = rowsRef.current

      // Init: horizontal sediment layers filling bottom 70%
      const grid = new Uint8Array(cols * rows) // 0 = empty, 1-15 = layer color
      const landTop = Math.floor(rows * 0.3)
      for (let r = landTop; r < rows; r++) {
        const layerIdx = Math.floor((r - landTop) / ((rows - landTop) / LAYERS.length))
        for (let c = 0; c < cols; c++) {
          // Add some initial variation — a few valleys/hills
          const heightMod = Math.sin(c * 0.02) * 8 + Math.sin(c * 0.05 + 1) * 5
          if (r > landTop + heightMod) {
            grid[r * cols + c] = Math.min(LAYERS.length, layerIdx + 1)
          }
        }
      }
      gridRef.current = grid
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    let raf: number
    let frame = 0

    // Pre-compute layer colors as pixel data
    const layerRGB: [number, number, number][] = LAYERS.map(hex => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return [r, g, b]
    })
    const bgRGB: [number, number, number] = [255, 248, 231]

    const draw = () => {
      frame++
      const cols = colsRef.current
      const rows = rowsRef.current
      const grid = gridRef.current
      if (!grid) { raf = requestAnimationFrame(draw); return }

      // Erosion step: for each exposed cell, chance to erode based on wind
      const wind = windRef.current
      const stepsPerFrame = 5

      for (let step = 0; step < stepsPerFrame; step++) {
        // Pick random cells to try eroding
        for (let i = 0; i < cols * 2; i++) {
          const c = Math.floor(Math.random() * cols)
          const r = Math.floor(Math.random() * rows)
          const idx = r * cols + c
          if (grid[idx] === 0) continue

          // Check if exposed (has empty neighbor)
          let exposed = false
          if (r > 0 && grid[(r - 1) * cols + c] === 0) exposed = true
          if (r < rows - 1 && grid[(r + 1) * cols + c] === 0) exposed = true
          if (c > 0 && grid[r * cols + c - 1] === 0) exposed = true
          if (c < cols - 1 && grid[r * cols + c + 1] === 0) exposed = true

          if (!exposed) continue

          // Erode: remove cell and deposit it downwind
          if (Math.random() < 0.3) {
            const val = grid[idx]
            grid[idx] = 0

            // Particle flies in wind direction and settles
            let px = c + wind.x * (5 + Math.random() * 15)
            let py = r + wind.y * (5 + Math.random() * 15)

            // Gravity: particle falls down
            py = Math.min(rows - 1, py + Math.random() * 5)
            px = Math.max(0, Math.min(cols - 1, Math.round(px)))
            py = Math.round(py)

            // Find landing spot (stack on top of existing terrain)
            if (px >= 0 && px < cols) {
              for (let ry = py; ry < rows; ry++) {
                if (ry === rows - 1 || grid[(ry + 1) * cols + px] !== 0) {
                  if (grid[ry * cols + px] === 0) {
                    grid[ry * cols + px] = val
                  }
                  break
                }
              }
            }
          }
        }
      }

      // Render using ImageData for speed
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const imageData = ctx.createImageData(cols, rows)
      const data = imageData.data

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const gridIdx = r * cols + c
          const pixIdx = gridIdx * 4
          const val = grid[gridIdx]

          if (val === 0) {
            data[pixIdx] = bgRGB[0]
            data[pixIdx + 1] = bgRGB[1]
            data[pixIdx + 2] = bgRGB[2]
          } else {
            const rgb = layerRGB[val - 1] || layerRGB[0]
            data[pixIdx] = rgb[0]
            data[pixIdx + 1] = rgb[1]
            data[pixIdx + 2] = rgb[2]
          }
          data[pixIdx + 3] = 255
        }
      }

      // Scale up: draw at grid resolution then stretch
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = cols
      tempCanvas.height = rows
      const tctx = tempCanvas.getContext('2d')!
      tctx.putImageData(imageData, 0, 0)

      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tempCanvas, 0, 0, W, H)

      // Wind indicator
      ctx.globalAlpha = 0.2
      const cx = W - 50, cy = 40
      ctx.strokeStyle = '#FF4E50'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + wind.x * 25, cy + wind.y * 25)
      ctx.stroke()
      // Arrowhead
      ctx.beginPath()
      ctx.arc(cx + wind.x * 25, cy + wind.y * 25, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#FF4E50'
      ctx.fill()
      ctx.globalAlpha = 1

      // Hint
      if (frame < 200) {
        ctx.globalAlpha = Math.max(0, 1 - frame / 200) * 0.25
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillText('drag to change the wind', W / 2, H - 25)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Drag to change wind direction
    let dragging = false
    let dragStart = { x: 0, y: 0 }

    const onStart = (cx: number, cy: number) => {
      dragging = true
      dragStart = { x: cx, y: cy }
    }
    const onMove = (cx: number, cy: number) => {
      if (!dragging) return
      const dx = (cx - dragStart.x) / 100
      const dy = (cy - dragStart.y) / 100
      windRef.current = {
        x: Math.max(-2, Math.min(2, dx)),
        y: Math.max(-1, Math.min(1, dy)),
      }
    }
    const onEnd = () => { dragging = false }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      onStart(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      onMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchend', () => onEnd())

    canvas.addEventListener('mousedown', (e: MouseEvent) => onStart(e.clientX, e.clientY))
    canvas.addEventListener('mousemove', (e: MouseEvent) => onMove(e.clientX, e.clientY))
    canvas.addEventListener('mouseup', () => onEnd())

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
        cursor: 'grab',
        touchAction: 'none',
        background: BG,
      }}
    />
  )
}
