'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Citrus blob colors [R, G, B]
const CITRUS: [number, number, number][] = [
  [255, 78, 80],   // blood orange
  [252, 145, 58],  // tangerine
  [249, 212, 35],  // mango
  [180, 227, 61],  // lime
  [255, 107, 129], // grapefruit
  [252, 145, 58],  // tangerine
  [255, 78, 80],   // blood orange
  [249, 212, 35],  // mango
]

interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  r2: number // r² precomputed
  rgb: [number, number, number]
  phase: number
}

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

export default function LavaPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d', { alpha: false })!
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W
    canvas.height = H

    // Low-res grid for metaball field, upscaled to canvas with smoothing
    const SCALE = 4
    const GW = Math.floor(W / SCALE)
    const GH = Math.floor(H / SCALE)

    const off = document.createElement('canvas')
    off.width = GW
    off.height = GH
    const offCtx = off.getContext('2d', { alpha: false })!

    const [c1, c2] = pickGradientColors('lava')
    const bg1 = parseHex(c1)
    const bg2 = parseHex(c2)

    // Blob radius ~10% of grid width, slightly varied
    const BASE_R = GW * 0.1
    const blobs: Blob[] = []
    for (let i = 0; i < 8; i++) {
      const r = BASE_R * (0.8 + Math.random() * 0.4)
      blobs.push({
        x: GW * (0.1 + Math.random() * 0.8),
        y: GH * (0.2 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r2: r * r,
        rgb: CITRUS[i % CITRUS.length],
        phase: Math.random() * Math.PI * 2,
      })
    }

    let t = 0
    let animId: number

    const imgData = offCtx.createImageData(GW, GH)
    const data = imgData.data
    // Pre-fill alpha to 255
    for (let i = 3; i < data.length; i += 4) data[i] = 255

    // Hint fade
    let hintAlpha = 1
    let hintFrames = 0

    const loop = () => {
      // Physics update
      t += 0.008
      for (const b of blobs) {
        // Lava lamp buoyancy: bottom of screen is "hot" → blobs rise
        // y=0 is top, y=GH is bottom. Bottom blobs get upward force (vy decreases).
        const ny = b.y / GH // 0=top, 1=bottom
        b.vy -= (ny - 0.5) * 0.018

        // Sinusoidal drift for organic motion
        b.vx += Math.sin(t * 1.1 + b.phase) * 0.004
        b.vy += Math.cos(t * 0.75 + b.phase * 1.2) * 0.003

        // Damping
        b.vx *= 0.993
        b.vy *= 0.993

        // Speed cap
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
        if (spd > 0.65) { b.vx *= 0.65 / spd; b.vy *= 0.65 / spd }

        b.x += b.vx
        b.y += b.vy

        // Soft wall bounce — use half-radius as margin
        const margin = Math.sqrt(b.r2) * 0.5
        if (b.x < margin) { b.x = margin; b.vx = Math.abs(b.vx) * 0.65 }
        if (b.x > GW - margin) { b.x = GW - margin; b.vx = -Math.abs(b.vx) * 0.65 }
        if (b.y < margin) { b.y = margin; b.vy = Math.abs(b.vy) * 0.65 }
        if (b.y > GH - margin) { b.y = GH - margin; b.vy = -Math.abs(b.vy) * 0.65 }
      }

      // Render metaball field into low-res ImageData
      const n = blobs.length
      for (let py = 0; py < GH; py++) {
        const tY = py / (GH - 1)
        for (let px = 0; px < GW; px++) {
          const tX = px / (GW - 1)
          // Diagonal background gradient
          const bgT = (tX + tY) * 0.5
          const bgR = (bg1[0] + (bg2[0] - bg1[0]) * bgT) | 0
          const bgG = (bg1[1] + (bg2[1] - bg1[1]) * bgT) | 0
          const bgB_ = (bg1[2] + (bg2[2] - bg1[2]) * bgT) | 0

          // Metaball energy field: sum of r²/d²
          let e = 0, wr = 0, wg = 0, wb = 0, wt = 0
          for (let i = 0; i < n; i++) {
            const b = blobs[i]
            const dx = px - b.x
            const dy = py - b.y
            const ei = b.r2 / (dx * dx + dy * dy + 0.5)
            e += ei
            // Weight by ei² for color blending — closer blobs dominate
            const w = ei * ei
            wr += b.rgb[0] * w
            wg += b.rgb[1] * w
            wb += b.rgb[2] * w
            wt += w
          }

          const idx = (py * GW + px) << 2

          if (e >= 1.0) {
            // Inside blob: weighted average of blob colors
            const inv = 1 / (wt + 1e-6)
            data[idx]     = Math.min(255, wr * inv) | 0
            data[idx + 1] = Math.min(255, wg * inv) | 0
            data[idx + 2] = Math.min(255, wb * inv) | 0
          } else if (e > 0.7) {
            // Soft edge: smoothstep blend between background and blob color
            const s = (e - 0.7) / 0.3
            const sm = s * s * (3 - 2 * s) // smoothstep
            const inv = 1 / (wt + 1e-6)
            const cr = Math.min(255, wr * inv) | 0
            const cg = Math.min(255, wg * inv) | 0
            const cb = Math.min(255, wb * inv) | 0
            data[idx]     = (bgR + (cr - bgR) * sm) | 0
            data[idx + 1] = (bgG + (cg - bgG) * sm) | 0
            data[idx + 2] = (bgB_ + (cb - bgB_) * sm) | 0
          } else {
            data[idx]     = bgR
            data[idx + 1] = bgG
            data[idx + 2] = bgB_
          }
          // alpha already 255 (pre-filled)
        }
      }

      offCtx.putImageData(imgData, 0, 0)

      // Draw to main canvas scaled up with bilinear smoothing
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 0, 0, W, H)

      // Amber watermark — tiny dot bottom-right
      ctx.fillStyle = 'rgba(212, 165, 116, 0.35)'
      ctx.beginPath()
      ctx.arc(W - 18, H - 18, 4, 0, Math.PI * 2)
      ctx.fill()

      // Hint text: "tap to add" — fades after 4 seconds
      if (hintAlpha > 0) {
        hintFrames++
        if (hintFrames > 200) hintAlpha = Math.max(0, hintAlpha - 0.015)
        ctx.globalAlpha = hintAlpha * 0.5
        ctx.fillStyle = '#5A3A1A'
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('tap to add', W / 2, H - 22)
        ctx.globalAlpha = 1
      }

      animId = requestAnimationFrame(loop)
    }

    loop()

    const onPointerDown = (e: PointerEvent) => {
      if (blobs.length >= 16) return
      const gx = (e.clientX / W) * GW
      const gy = (e.clientY / H) * GH
      const r = BASE_R * (0.8 + Math.random() * 0.35)
      blobs.push({
        x: gx,
        y: gy,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.55,
        r2: r * r,
        rgb: CITRUS[blobs.length % CITRUS.length],
        phase: Math.random() * Math.PI * 2,
      })
    }

    canvas.addEventListener('pointerdown', onPointerDown)

    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('pointerdown', onPointerDown)
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
          cursor: 'none',
        }}
      />
    </main>
  )
}
