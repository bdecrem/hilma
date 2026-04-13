'use client'

import { useEffect, useRef } from 'react'

// ── Citrus glass colors (R, G, B) ─────────────────────────────────────────────
const GLASS: readonly [number, number, number][] = [
  [255,  78,  80],  // blood orange
  [252, 145,  58],  // tangerine
  [249, 212,  35],  // mango
  [180, 227,  61],  // lime zest
  [255, 107, 129],  // grapefruit pink
  [255, 232, 210],  // coral wash  (near-clear)
  [212, 165, 116],  // amber watermark
  [255, 248, 231],  // warm cream  (clear glass)
]

// Lead line: dark warm charcoal
const LEAD_R = 42, LEAD_G = 31, LEAD_B = 26
const BORDER  = 4   // lead half-width in logical px
const N       = 40  // glass panes
const SPEED   = 0.00055 // breathing speed (rad / ms)

// Weighted random color index — saturated citrus colours dominate
function randCI(): number {
  const r = Math.random()
  if (r < 0.22) return 0  // blood orange
  if (r < 0.44) return 1  // tangerine
  if (r < 0.60) return 2  // mango
  if (r < 0.74) return 3  // lime
  if (r < 0.86) return 4  // grapefruit
  if (r < 0.93) return 6  // amber
  if (r < 0.97) return 5  // coral wash
  return 7                 // warm cream
}

export default function PanePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W   = window.innerWidth
    const H   = window.innerHeight

    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.scale(dpr, dpr)

    // ── Offscreen pixel buffer (logical pixels) ──────────────────────────────
    const off    = document.createElement('canvas')
    off.width    = W
    off.height   = H
    const offCtx = off.getContext('2d', { alpha: false })!
    const imgData = offCtx.createImageData(W, H)
    const buf     = imgData.data

    // ── Seed positions, colors, phases ──────────────────────────────────────
    const seedX     = new Float32Array(N)
    const seedY     = new Float32Array(N)
    const seedCI    = new Uint8Array(N)
    const seedPhase = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      seedX[i]     = Math.random()
      seedY[i]     = Math.random()
      seedCI[i]    = randCI()
      seedPhase[i] = Math.random() * Math.PI * 2
    }

    // ── Lloyd relaxation — 4 passes for well-spaced irregular panes ─────────
    for (let iter = 0; iter < 4; iter++) {
      const sumX = new Float32Array(N)
      const sumY = new Float32Array(N)
      const cnt  = new Int32Array(N)
      const STEP = 6
      for (let py = 0; py < H; py += STEP) {
        for (let px = 0; px < W; px += STEP) {
          let minD = Infinity, near = 0
          for (let i = 0; i < N; i++) {
            const dx = px - seedX[i] * W
            const dy = py - seedY[i] * H
            const d  = dx * dx + dy * dy
            if (d < minD) { minD = d; near = i }
          }
          sumX[near] += px; sumY[near] += py; cnt[near]++
        }
      }
      for (let i = 0; i < N; i++) {
        if (cnt[i] > 0) {
          seedX[i] = sumX[i] / cnt[i] / W
          seedY[i] = sumY[i] / cnt[i] / H
        }
      }
    }

    // Pixel-space seed positions
    const spx = new Float32Array(N)
    const spy = new Float32Array(N)
    for (let i = 0; i < N; i++) { spx[i] = seedX[i] * W; spy[i] = seedY[i] * H }

    // ── Voronoi precomputation ───────────────────────────────────────────────
    const NPIX    = W * H
    const voronoi = new Uint8Array(NPIX)    // nearest seed per pixel
    const edgeDst = new Float32Array(NPIX)  // approx. dist to voronoi edge
    const ctrDst  = new Float32Array(NPIX)  // dist to seed centre
    const maxCDst = new Float32Array(N)     // max ctrDst per seed (for normalisation)

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        let d1 = Infinity, d2 = Infinity, near = 0
        for (let i = 0; i < N; i++) {
          const dx = px - spx[i], dy = py - spy[i]
          const d  = dx * dx + dy * dy
          if (d < d1) { d2 = d1; d1 = d; near = i }
          else if (d < d2) { d2 = d }
        }
        const idx    = py * W + px
        voronoi[idx] = near
        edgeDst[idx] = (Math.sqrt(d2) - Math.sqrt(d1)) * 0.5
        const cd     = Math.sqrt(d1)
        ctrDst[idx]  = cd
        if (cd > maxCDst[near]) maxCDst[near] = cd
      }
    }

    // ── Render ───────────────────────────────────────────────────────────────
    function render(t: number) {
      for (let i = 0; i < NPIX; i++) {
        const pi = i << 2
        const ed = edgeDst[i]

        if (ed < BORDER) {
          // Lead line
          buf[pi]     = LEAD_R
          buf[pi + 1] = LEAD_G
          buf[pi + 2] = LEAD_B
          buf[pi + 3] = 255
        } else {
          const s   = voronoi[i]
          const ci  = seedCI[s]
          const col = GLASS[ci]

          // Glass gradient: brightest at cell centre (convex lens feel)
          const gGrad = 1 - (ctrDst[i] / (maxCDst[s] || 1)) * 0.22

          // Per-cell breathing — slow phase-offset sine
          const breathe = 0.88 + 0.12 * Math.sin(t * SPEED + seedPhase[s])

          const lum = gGrad * breathe

          // Warm backlight tint (+20 red, +12 green, +5 blue)
          buf[pi]     = Math.min(255, col[0] * lum + 20) | 0
          buf[pi + 1] = Math.min(255, col[1] * lum + 12) | 0
          buf[pi + 2] = Math.min(255, col[2] * lum +  5) | 0
          buf[pi + 3] = 255
        }
      }

      offCtx.putImageData(imgData, 0, 0)
      ctx.drawImage(off, 0, 0, W, H)

      // Amber watermark dot
      ctx.fillStyle = 'rgba(212,165,116,0.45)'
      ctx.beginPath()
      ctx.arc(W - 18, H - 18, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Animation loop ───────────────────────────────────────────────────────
    let animId: number
    function loop(t: number) { render(t); animId = requestAnimationFrame(loop) }
    animId = requestAnimationFrame(loop)

    // ── Interaction — tap to cycle glass colour ──────────────────────────────
    let downX = 0, downY = 0
    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId)
      downX = e.clientX; downY = e.clientY
    }
    function onPointerUp(e: PointerEvent) {
      const dx = e.clientX - downX, dy = e.clientY - downY
      if (dx * dx + dy * dy > 144) return  // drag — skip

      const rect = canvas.getBoundingClientRect()
      const px   = Math.floor(e.clientX - rect.left)
      const py   = Math.floor(e.clientY - rect.top)
      if (px < 0 || px >= W || py < 0 || py >= H) return

      const idx = py * W + px
      if (edgeDst[idx] >= BORDER) {
        // Cycle colour; skip lead pixels
        const s = voronoi[idx]
        seedCI[s] = (seedCI[s] + 1) % GLASS.length
      }
    }

    canvas.addEventListener('pointerdown',  onPointerDown)
    canvas.addEventListener('pointerup',    onPointerUp)
    canvas.addEventListener('touchstart',   e => e.preventDefault(), { passive: false })

    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup',   onPointerUp)
    }
  }, [])

  return (
    <main
      style={{
        margin: 0, padding: 0, overflow: 'hidden',
        width: '100dvw', height: '100dvh',
        background: '#2A1F1A',
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
          color: 'rgba(255,190,100,0.55)',
          pointerEvents: 'none',
          animation: 'fadeHint 1s ease-out 5s forwards',
        }}
      >
        tap to shift the glass
      </div>
      <style>{`@keyframes fadeHint { from { opacity: 1 } to { opacity: 0 } }`}</style>
    </main>
  )
}
