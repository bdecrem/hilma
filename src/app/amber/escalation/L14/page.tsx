'use client'

// L14: TERRITORY — tap to claim. seeds drift, regions shift, borders breathe.
// Composition tier. Voronoi field with physics-driven seeds.
// New techniques: voronoi, distance-field, cellular, territory.

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

interface Seed {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  phase: number
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

export default function L14() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let W = (c.width = innerWidth)
    let H = (c.height = innerHeight)
    const [bg1, bg2] = pickGradientColors('L14-territory')

    const seeds: Seed[] = []

    const addSeed = (x: number, y: number) => {
      seeds.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
        phase: Math.random() * Math.PI * 2,
      })
    }

    // Seed 9 initial territories
    for (let i = 0; i < 9; i++) {
      addSeed(W * 0.1 + Math.random() * W * 0.8, H * 0.1 + Math.random() * H * 0.8)
    }

    c.addEventListener('pointerdown', (e) => {
      addSeed(e.clientX, e.clientY)
      // Flash ripple
      ctx.save()
      ctx.beginPath()
      ctx.arc(e.clientX, e.clientY, 30, 0, Math.PI * 2)
      ctx.strokeStyle = '#FFF8E7'
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.8
      ctx.stroke()
      ctx.restore()
    })

    // Off-screen canvas rendered at reduced resolution for performance
    const SCALE = 6
    const vW = Math.ceil(W / SCALE)
    const vH = Math.ceil(H / SCALE)
    const offscreen = document.createElement('canvas')
    offscreen.width = vW
    offscreen.height = vH
    const vCtx = offscreen.getContext('2d')!

    let raf: number

    const animate = () => {
      const t = Date.now() / 1000

      // Update seeds — slow drift with soft wall bounce
      for (const s of seeds) {
        s.x += s.vx
        s.y += s.vy
        if (s.x < 20 || s.x > W - 20) { s.vx *= -1; s.x = Math.max(20, Math.min(W - 20, s.x)) }
        if (s.y < 20 || s.y > H - 20) { s.vy *= -1; s.y = Math.max(20, Math.min(H - 20, s.y)) }
      }

      // Render Voronoi field at low resolution
      const img = vCtx.createImageData(vW, vH)
      const d = img.data

      for (let py = 0; py < vH; py++) {
        for (let px = 0; px < vW; px++) {
          const wx = px * SCALE
          const wy = py * SCALE

          let d1 = Infinity
          let d2 = Infinity
          let nearest: Seed | null = null

          for (const s of seeds) {
            const dx = wx - s.x
            const dy = wy - s.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < d1) { d2 = d1; d1 = dist; nearest = s }
            else if (dist < d2) { d2 = dist }
          }

          if (!nearest) continue

          // Edge = gap between nearest and second-nearest
          const edge = d2 - d1

          // Pulse: breathe based on seed phase + time
          const pulse = 0.75 + Math.sin(t * 1.2 + nearest.phase) * 0.12

          // Border glow: pixels near Voronoi edges get a cream highlight
          const borderZone = SCALE * 2.5
          const borderStrength = Math.max(0, 1 - edge / borderZone)

          const [r, g, b] = hexToRgb(nearest.color)

          // Blend toward cream at borders
          const cream = [255, 248, 231]
          const fr = Math.round(r + (cream[0] - r) * borderStrength * 0.6)
          const fg = Math.round(g + (cream[1] - g) * borderStrength * 0.6)
          const fb = Math.round(b + (cream[2] - b) * borderStrength * 0.6)

          const alpha = pulse * 210

          const idx = (py * vW + px) * 4
          d[idx] = fr
          d[idx + 1] = fg
          d[idx + 2] = fb
          d[idx + 3] = alpha
        }
      }

      vCtx.putImageData(img, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Draw Voronoi scaled up with smoothing
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(offscreen, 0, 0, W, H)
      ctx.restore()

      // Draw seed markers — pulsing dots
      for (const s of seeds) {
        const pulse = 1 + Math.sin(t * 1.2 + s.phase) * 0.25
        // Outer ring
        ctx.beginPath()
        ctx.arc(s.x, s.y, 7 * pulse, 0, Math.PI * 2)
        ctx.strokeStyle = s.color
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.6
        ctx.stroke()
        // Core dot
        ctx.beginPath()
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = '#FFF8E7'
        ctx.globalAlpha = 0.9
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Amber watermark — D4A574, subtle
      ctx.save()
      ctx.font = `${Math.max(11, W * 0.012)}px monospace`
      ctx.fillStyle = '#D4A574'
      ctx.globalAlpha = 0.18
      ctx.textAlign = 'right'
      ctx.fillText('amber', W - 16, H - 14)
      ctx.restore()

      // Tap hint
      if (seeds.length < 12) {
        ctx.save()
        ctx.globalAlpha = 0.22 + Math.sin(t * 1.5) * 0.08
        ctx.fillStyle = '#2A2218'
        ctx.font = `${Math.max(13, W * 0.017)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('tap to claim', W / 2, H - 36)
        ctx.restore()
      }

      raf = requestAnimationFrame(animate)
    }

    animate()

    const onResize = () => {
      W = c.width = innerWidth
      H = c.height = innerHeight
    }
    addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
    />
  )
}
