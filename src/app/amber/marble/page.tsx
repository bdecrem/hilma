'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Citrus palette as [R, G, B]
const CITRUS: [number, number, number][] = [
  [255, 78, 80],    // blood orange
  [252, 145, 58],   // tangerine
  [249, 212, 35],   // mango
  [180, 227, 61],   // lime zest
  [255, 107, 129],  // grapefruit pink
  [212, 165, 116],  // amber (legacy watermark color)
]

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

export default function MarblePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight

    // Main canvas at DPR resolution
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.scale(dpr, dpr)

    // Off-screen 1× pixel buffer for manipulation
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const offCtx = off.getContext('2d', { alpha: false })!
    const imgData = offCtx.createImageData(W, H)
    const buf = imgData.data

    // Pre-fill alpha channel to 255
    for (let i = 3; i < buf.length; i += 4) buf[i] = 255

    // Reusable copy buffer — allocated once to avoid GC pressure
    const copy = new Uint8ClampedArray(buf.length)

    // Initialize background gradient
    const [c1, c2] = pickGradientColors('marble')
    const [r1, g1, b1] = parseHex(c1)
    const [r2, g2, b2] = parseHex(c2)
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1)
      const br = (r1 + (r2 - r1) * t) | 0
      const bg = (g1 + (g2 - g1) * t) | 0
      const bb = (b1 + (b2 - b1) * t) | 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        buf[i] = br
        buf[i + 1] = bg
        buf[i + 2] = bb
      }
    }

    // Color cycling state
    let colorIdx = 0

    // Pour a solid circle of citrus color
    function pourDrop(cx: number, cy: number, radius: number) {
      const [cr, cg, cb] = CITRUS[colorIdx % CITRUS.length]
      colorIdx++
      const r2 = radius * radius
      const x0 = Math.max(0, (cx - radius) | 0)
      const x1 = Math.min(W - 1, (cx + radius + 1) | 0)
      const y0 = Math.max(0, (cy - radius) | 0)
      const y1 = Math.min(H - 1, (cy + radius + 1) | 0)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy
          if (dx * dx + dy * dy <= r2) {
            const i = (y * W + x) * 4
            buf[i] = cr
            buf[i + 1] = cg
            buf[i + 2] = cb
          }
        }
      }
    }

    // Comb/drag: pull pixels from ax,ay toward bx,by with Gaussian falloff
    function combDrag(ax: number, ay: number, bx: number, by: number, radius: number) {
      const ddx = bx - ax
      const ddy = by - ay
      const len = Math.sqrt(ddx * ddx + ddy * ddy)
      if (len < 0.5) return

      const nx = ddx / len
      const ny = ddy / len
      const strength = Math.min(len * 1.8, 70)
      const r2 = radius * radius
      // sigma² = r² * 0.28 → soft-ish Gaussian
      const sigma2 = r2 * 0.28

      // Bounding box of the affected zone
      const bx0 = Math.max(0, (Math.min(ax, bx) - radius) | 0)
      const bx1 = Math.min(W - 1, (Math.max(ax, bx) + radius) | 0)
      const by0 = Math.max(0, (Math.min(ay, by) - radius) | 0)
      const by1 = Math.min(H - 1, (Math.max(ay, by) + radius) | 0)

      // Snapshot current state before writing
      copy.set(buf)

      for (let y = by0; y <= by1; y++) {
        for (let x = bx0; x <= bx1; x++) {
          // Perpendicular distance from the drag line (through ax,ay with direction nx,ny)
          const px = x - ax
          const py = y - ay
          const dot = px * nx + py * ny
          const perpX = px - dot * nx
          const perpY = py - dot * ny
          const perpDist2 = perpX * perpX + perpY * perpY

          if (perpDist2 >= r2) continue

          // Gaussian falloff perpendicular to drag direction
          const falloff = Math.exp(-perpDist2 / sigma2)
          const moveX = (nx * strength * falloff) | 0
          const moveY = (ny * strength * falloff) | 0

          // Source pixel is behind the drag direction
          const srcX = x - moveX
          const srcY = y - moveY

          if (srcX >= 0 && srcX < W && srcY >= 0 && srcY < H) {
            const di = (y * W + x) * 4
            const si = (srcY * W + srcX) * 4
            buf[di]     = copy[si]
            buf[di + 1] = copy[si + 1]
            buf[di + 2] = copy[si + 2]
          }
        }
      }
    }

    function render() {
      offCtx.putImageData(imgData, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(off, 0, 0, W, H)
      // Amber watermark — tiny dot bottom-right
      ctx.fillStyle = 'rgba(212,165,116,0.40)'
      ctx.beginPath()
      ctx.arc(W - 18, H - 18, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Pour initial drops scattered across the canvas
    const initialDrops = [
      { x: W * 0.27, y: H * 0.22, r: 58 },
      { x: W * 0.75, y: H * 0.35, r: 50 },
      { x: W * 0.50, y: H * 0.60, r: 55 },
      { x: W * 0.15, y: H * 0.65, r: 45 },
      { x: W * 0.88, y: H * 0.72, r: 42 },
      { x: W * 0.60, y: H * 0.15, r: 38 },
    ]
    initialDrops.forEach(d => pourDrop(d.x, d.y, d.r))

    // Auto-marble: a slow horizontal sweep to give the piece life on load
    // Simulate a comb moving across y=H*0.42 from left to right
    const sweepY = H * 0.42
    for (let x = 0; x < W - 8; x += 8) {
      combDrag(x, sweepY, x + 8, sweepY, 90)
    }
    // A second shorter sweep going the other way at y=H*0.58
    for (let x = W; x > 8; x -= 8) {
      combDrag(x, H * 0.58, x - 8, H * 0.58, 70)
    }

    render()

    // Interaction
    let isDown = false
    let lastX = 0, lastY = 0
    let totalDist = 0

    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId)
      isDown = true
      lastX = e.clientX
      lastY = e.clientY
      totalDist = 0
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDown) return
      const x = e.clientX
      const y = e.clientY
      const dx = x - lastX
      const dy = y - lastY
      totalDist += Math.sqrt(dx * dx + dy * dy)
      combDrag(lastX, lastY, x, y, 85)
      render()
      lastX = x
      lastY = y
    }

    function onPointerUp(e: PointerEvent) {
      if (!isDown) return
      isDown = false
      if (totalDist < 8) {
        // Tap: pour a new drop
        const dropR = 32 + Math.random() * 28
        pourDrop(e.clientX, e.clientY, dropR)
        render()
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
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
        background: '#FFECD2',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
        }}
      />
      {/* Hint text — fades after 4s */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#6B3A1F',
          opacity: 0.65,
          pointerEvents: 'none',
          animation: 'fadeHint 1s ease-out 4s forwards',
        }}
      >
        tap to pour · drag to marble
      </div>
      <style>{`
        @keyframes fadeHint {
          from { opacity: 0.65; }
          to { opacity: 0; }
        }
      `}</style>
    </main>
  )
}
