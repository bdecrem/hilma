'use client'

import { useEffect, useRef } from 'react'

const CELL = 4 // pixels per sand grain

// Citrus sand colors: [R, G, B]
const COLORS: [number, number, number][] = [
  [255, 78, 80],   // blood orange #FF4E50
  [252, 145, 58],  // tangerine #FC913A
  [249, 212, 35],  // mango #F9D423
  [180, 227, 61],  // lime #B4E33D
  [255, 107, 129], // grapefruit #FF6B81
  [212, 165, 116], // amber #D4A574 — legacy watermark
]

// Slight shade variation per grain for texture
function shade(base: number, amount: number): number {
  return Math.max(0, Math.min(255, base + amount))
}

export default function SandPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d', { alpha: false })!

    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const cols = Math.floor(W / CELL)
    const rows = Math.floor(H / CELL)

    // Grid: 0 = empty, 1-6 = color index+1
    const grid = new Uint8Array(cols * rows)
    // Per-grain shade offset for texture (-15 to +15)
    const shades = new Int8Array(cols * rows)

    let colorIdx = 0
    let pouring = false
    let pourX = 0
    let pourY = 0
    let animId = 0
    let showHint = true
    let hintOpacity = 1
    let hintTimer = 0

    // Pre-compute background ImageData (warm lemon → soft peach gradient)
    const imgData = ctx.createImageData(W, H)
    const bgData = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      const t = y / H
      // #FFFDE7 → #FFECD2
      const r = Math.round(255)
      const g = Math.round(253 - (253 - 236) * t)
      const b = Math.round(231 - (231 - 210) * t)
      for (let x = 0; x < W; x++) {
        const base = (y * W + x) * 4
        bgData[base] = r
        bgData[base + 1] = g
        bgData[base + 2] = b
        bgData[base + 3] = 255
      }
    }

    function pour(px: number, py: number) {
      const cx = Math.floor(px / CELL)
      const cy = Math.floor(py / CELL)
      const r = 3
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue
          if (Math.random() > 0.55) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const idx = ny * cols + nx
            if (grid[idx] === 0) {
              grid[idx] = colorIdx + 1
              shades[idx] = Math.round((Math.random() - 0.5) * 30) as unknown as number
            }
          }
        }
      }
    }

    function update() {
      for (let y = rows - 2; y >= 0; y--) {
        // Alternate scan direction to prevent directional bias
        const leftFirst = (y + Math.floor(Date.now() / 100)) % 2 === 0
        for (let xi = 0; xi < cols; xi++) {
          const x = leftFirst ? xi : cols - 1 - xi
          const idx = y * cols + x
          if (grid[idx] === 0) continue

          const below = (y + 1) * cols + x
          if (grid[below] === 0) {
            grid[below] = grid[idx]
            shades[below] = shades[idx]
            grid[idx] = 0
            shades[idx] = 0
          } else {
            const canL = x > 0 && grid[(y + 1) * cols + x - 1] === 0
            const canR = x < cols - 1 && grid[(y + 1) * cols + x + 1] === 0
            if (canL && canR) {
              const dest = Math.random() < 0.5
                ? (y + 1) * cols + x - 1
                : (y + 1) * cols + x + 1
              grid[dest] = grid[idx]
              shades[dest] = shades[idx]
              grid[idx] = 0
              shades[idx] = 0
            } else if (canL) {
              grid[(y + 1) * cols + x - 1] = grid[idx]
              shades[(y + 1) * cols + x - 1] = shades[idx]
              grid[idx] = 0
              shades[idx] = 0
            } else if (canR) {
              grid[(y + 1) * cols + x + 1] = grid[idx]
              shades[(y + 1) * cols + x + 1] = shades[idx]
              grid[idx] = 0
              shades[idx] = 0
            }
          }
        }
      }
    }

    function render() {
      const data = imgData.data
      // Reset to background
      data.set(bgData)

      // Paint sand grains
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const cell = grid[gy * cols + gx]
          if (cell === 0) continue
          const [br, bg_, bb] = COLORS[cell - 1]
          const s = shades[gy * cols + gx]
          const r = shade(br, s)
          const g = shade(bg_, s)
          const b = shade(bb, s)

          // Fill CELL×CELL pixels
          for (let py = 0; py < CELL; py++) {
            const row = (gy * CELL + py) * W
            for (let px = 0; px < CELL; px++) {
              const base = (row + gx * CELL + px) * 4
              data[base] = r
              data[base + 1] = g
              data[base + 2] = b
              // data[base + 3] already 255 from bgData reset
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0)
    }

    function drawUI() {
      // Color dot indicator — top right
      const [r, g, b] = COLORS[colorIdx]
      const dotX = W - 28
      const dotY = 28
      ctx.beginPath()
      ctx.arc(dotX, dotY, 13, 0, Math.PI * 2)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2.5
      ctx.stroke()

      // Hint text — fades after 4 seconds
      if (showHint && hintOpacity > 0) {
        hintTimer++
        if (hintTimer > 180) {
          hintOpacity = Math.max(0, hintOpacity - 0.012)
          if (hintOpacity <= 0) showHint = false
        }
        ctx.globalAlpha = hintOpacity
        ctx.fillStyle = 'rgba(80, 60, 40, 0.75)'
        ctx.font = '13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('drag to pour · double-tap to change color', W / 2, H - 24)
        ctx.globalAlpha = 1
      }
    }

    function loop() {
      if (pouring) pour(pourX, pourY)
      update()
      render()
      drawUI()
      animId = requestAnimationFrame(loop)
    }

    // Seed a small initial pile at center bottom
    const seedX = Math.floor(cols / 2)
    const seedY = rows - 1
    for (let i = 0; i < 8; i++) {
      const x = seedX + i - 4
      if (x >= 0 && x < cols) {
        grid[seedY * cols + x] = 3 // mango
        shades[seedY * cols + x] = Math.round((Math.random() - 0.5) * 20) as unknown as number
      }
    }

    animId = requestAnimationFrame(loop)

    // Input handling
    function getPos(e: MouseEvent | TouchEvent): [number, number] {
      const rect = canvas.getBoundingClientRect()
      if ('touches' in e) {
        const t = e.touches[0] || e.changedTouches[0]
        return [t.clientX - rect.left, t.clientY - rect.top]
      }
      return [(e as MouseEvent).clientX - rect.left, (e as MouseEvent).clientY - rect.top]
    }

    let lastTap = 0

    function onDown(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      const now = Date.now()
      if (now - lastTap < 280) {
        // Double tap → cycle color
        colorIdx = (colorIdx + 1) % COLORS.length
        lastTap = 0
        pouring = false
        return
      }
      lastTap = now
      const [x, y] = getPos(e)
      pouring = true
      pourX = x
      pourY = y
    }

    function onMove(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      if (!pouring) return
      const [x, y] = getPos(e)
      pourX = x
      pourY = y
    }

    function onUp() {
      pouring = false
    }

    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('touchstart', onDown, { passive: false })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)

    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('touchstart', onDown)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  return (
    <main
      style={{
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        width: '100dvw',
        height: '100dvh',
        background: 'linear-gradient(180deg, #FFFDE7, #FFECD2)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
    </main>
  )
}
