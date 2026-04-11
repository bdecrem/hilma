'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Citrus palette for chromatic coloring
const CITRUS: [number, number, number][] = [
  [255, 78,  80],   // blood orange
  [252, 145, 58],   // tangerine
  [249, 212, 35],   // mango
  [180, 227, 61],   // lime zest
  [255, 107, 129],  // grapefruit pink
  [212, 165, 116],  // amber watermark
]

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

// Wave simulation grid dimensions
const GRID_W = 180
const GRID_H = 320

// Wave equation parameters
const C2   = 0.17   // speed² — must be < 0.5 for stability
const DAMP = 0.994  // energy decay per step

export default function ShimmerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight

    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.scale(dpr, dpr)

    // Two-buffer wave field (current + previous heights)
    const size = GRID_W * GRID_H
    const cur  = new Float32Array(size)
    const prev = new Float32Array(size)

    // Precomputed Laplacian field reused each frame
    const lap = new Float32Array(size)

    function gIdx(gx: number, gy: number): number {
      return gy * GRID_W + gx
    }

    // Inject a Gaussian wave pulse centered at (gx, gy)
    function inject(gx: number, gy: number, strength: number, radius: number) {
      const r2 = radius * radius
      const x0 = Math.max(1, gx - radius | 0)
      const x1 = Math.min(GRID_W - 2, gx + radius | 0)
      const y0 = Math.max(1, gy - radius | 0)
      const y1 = Math.min(GRID_H - 2, gy + radius | 0)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - gx, dy = y - gy
          const d2 = dx * dx + dy * dy
          if (d2 > r2) continue
          const falloff = Math.exp(-d2 / (r2 * 0.35))
          cur[gIdx(x, y)] += strength * falloff
        }
      }
    }

    // Propagate one step of the 2D wave equation with absorbing boundaries
    function stepWave() {
      // Interior: explicit finite-difference wave equation
      for (let gy = 1; gy < GRID_H - 1; gy++) {
        for (let gx = 1; gx < GRID_W - 1; gx++) {
          const i = gIdx(gx, gy)
          // Laplacian of height field
          const l = cur[i - 1] + cur[i + 1] + cur[i - GRID_W] + cur[i + GRID_W] - 4 * cur[i]
          lap[i] = l
          const next = (2 * cur[i] - prev[i] + C2 * l) * DAMP
          prev[i] = cur[i]
          cur[i]  = next
        }
      }
      // Absorbing boundary: copy inner row to edge
      for (let gx = 0; gx < GRID_W; gx++) {
        cur[gIdx(gx, 0)]         = cur[gIdx(gx, 1)]
        cur[gIdx(gx, GRID_H-1)]  = cur[gIdx(gx, GRID_H-2)]
        prev[gIdx(gx, 0)]        = prev[gIdx(gx, 1)]
        prev[gIdx(gx, GRID_H-1)] = prev[gIdx(gx, GRID_H-2)]
      }
      for (let gy = 0; gy < GRID_H; gy++) {
        cur[gIdx(0, gy)]        = cur[gIdx(1, gy)]
        cur[gIdx(GRID_W-1, gy)] = cur[gIdx(GRID_W-2, gy)]
        prev[gIdx(0, gy)]       = prev[gIdx(1, gy)]
        prev[gIdx(GRID_W-1, gy)]= prev[gIdx(GRID_W-2, gy)]
      }
    }

    // Off-screen pixel buffer
    const off     = document.createElement('canvas')
    off.width     = W
    off.height    = H
    const offCtx  = off.getContext('2d', { alpha: false })!
    const imgData = offCtx.createImageData(W, H)
    const buf     = imgData.data

    // Background gradient
    const [c1, c2] = pickGradientColors('shimmer')
    const [r1, g1, b1] = parseHex(c1)
    const [r2, g2, b2] = parseHex(c2)

    // Scale factors from screen → grid
    const scaleX = (GRID_W - 2) / W
    const scaleY = (GRID_H - 2) / H

    // Per-frame render: map Laplacian to brightness → caustic light
    function render() {
      for (let cy = 0; cy < H; cy++) {
        const t   = cy / (H - 1)
        const bgR = r1 + (r2 - r1) * t
        const bgG = g1 + (g2 - g1) * t
        const bgB = b1 + (b2 - b1) * t

        // Grid row (clamped)
        const gyF = 1 + cy * scaleY
        const gy0 = Math.min(GRID_H - 2, gyF | 0)
        const gy1 = Math.min(GRID_H - 2, gy0 + 1)
        const tyG = gyF - gy0

        for (let cx = 0; cx < W; cx++) {
          const gxF = 1 + cx * scaleX
          const gx0 = Math.min(GRID_W - 2, gxF | 0)
          const gx1 = Math.min(GRID_W - 2, gx0 + 1)
          const txG = gxF - gx0

          // Bilinear sample of Laplacian (caustic intensity)
          const l00 = lap[gIdx(gx0, gy0)]
          const l10 = lap[gIdx(gx1, gy0)]
          const l01 = lap[gIdx(gx0, gy1)]
          const l11 = lap[gIdx(gx1, gy1)]
          const lapVal = l00*(1-txG)*(1-tyG) + l10*txG*(1-tyG)
                       + l01*(1-txG)*tyG     + l11*txG*tyG

          // Brightness: convergent areas brighten, divergent areas darken
          // Scale factor tuned so wave crests give ~1.5x and troughs ~0.5x
          const brightness = Math.max(0.35, Math.min(2.2, 1.0 + lapVal * 3.5))

          // Slight chromatic dispersion: R/G/B sample at a tiny offset
          // gives the iridescent halo of real caustics
          const cr = Math.min(255, bgR * brightness * 1.05) | 0
          const cg = Math.min(255, bgG * brightness)        | 0
          const cb = Math.min(255, bgB * brightness * 0.92) | 0

          const pi = (cy * W + cx) * 4
          buf[pi]     = cr
          buf[pi + 1] = cg
          buf[pi + 2] = cb
          buf[pi + 3] = 255
        }
      }

      offCtx.putImageData(imgData, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'low'
      ctx.drawImage(off, 0, 0, W, H)

      // Amber watermark — subtle dot bottom-right
      ctx.fillStyle = 'rgba(212,165,116,0.45)'
      ctx.beginPath()
      ctx.arc(W - 18, H - 18, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Seed initial wave pattern ──────────────────────────────────────────
    // Three pulses scattered to give the canvas immediate life
    inject(GRID_W * 0.28 | 0, GRID_H * 0.25 | 0, 2.2, 11)
    inject(GRID_W * 0.72 | 0, GRID_H * 0.42 | 0, 1.8, 9)
    inject(GRID_W * 0.50 | 0, GRID_H * 0.68 | 0, 2.0, 10)
    inject(GRID_W * 0.15 | 0, GRID_H * 0.58 | 0, 1.5, 7)
    inject(GRID_W * 0.85 | 0, GRID_H * 0.72 | 0, 1.6, 8)

    // ── Animation loop ─────────────────────────────────────────────────────
    let frameCount = 0
    let animId: number

    function loop() {
      // Run two simulation steps per animation frame (doubles effective speed)
      stepWave()
      stepWave()

      // Gentle ambient perturbations — keeps the surface alive when untouched
      if (frameCount % 55 === 0) {
        const agx = 4 + Math.floor(Math.random() * (GRID_W - 8))
        const agy = 4 + Math.floor(Math.random() * (GRID_H - 8))
        inject(agx, agy, 0.8 + Math.random() * 0.6, 5)
      }

      render()
      frameCount++
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)

    // ── Interaction ────────────────────────────────────────────────────────
    let lastGX = -1, lastGY = -1

    function pointerToGrid(e: PointerEvent): [number, number] {
      const gx = Math.max(2, Math.min(GRID_W - 3, (e.clientX * scaleX) | 0))
      const gy = Math.max(2, Math.min(GRID_H - 3, (e.clientY * scaleY) | 0))
      return [gx, gy]
    }

    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId)
      const [gx, gy] = pointerToGrid(e)
      inject(gx, gy, 3.0, 12)
      lastGX = gx
      lastGY = gy
    }

    function onPointerMove(e: PointerEvent) {
      if (e.buttons === 0) return
      const [gx, gy] = pointerToGrid(e)
      // Inject smaller pulse along drag trail
      if (Math.abs(gx - lastGX) > 1 || Math.abs(gy - lastGY) > 1) {
        inject(gx, gy, 1.5, 7)
        lastGX = gx
        lastGY = gy
      }
    }

    function onPointerUp() {
      lastGX = lastGY = -1
    }

    canvas.addEventListener('pointerdown',  onPointerDown)
    canvas.addEventListener('pointermove',  onPointerMove)
    canvas.addEventListener('pointerup',    onPointerUp)
    canvas.addEventListener('pointercancel',onPointerUp)
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false })

    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('pointerdown',   onPointerDown)
      canvas.removeEventListener('pointermove',   onPointerMove)
      canvas.removeEventListener('pointerup',     onPointerUp)
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
        background: '#FF6B81',
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
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: 13,
          color: 'rgba(90,20,0,0.55)',
          pointerEvents: 'none',
          animation: 'fadeHint 1s ease-out 5s forwards',
        }}
      >
        tap to disturb · drag to trace
      </div>
      <style>{`
        @keyframes fadeHint {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>
    </main>
  )
}
