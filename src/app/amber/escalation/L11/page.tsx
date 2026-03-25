'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// L11: FLOCK — creatures with simple rules create emergent movement.
// Composition tier begins. Multiple systems interact.
// Tap to scatter. Hold to attract.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const COUNT = 60

interface Boid {
  x: number; y: number; vx: number; vy: number
  color: string; size: number
}

export default function L11() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let w = c.width = innerWidth, h = c.height = innerHeight
    const [bg1, bg2] = pickGradientColors('L11-flock')
    let mouseX = w / 2, mouseY = h / 2
    let pressing = false
    let scattered = false
    let t = 0

    const boids: Boid[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 3 + Math.random() * 4,
    }))

    c.addEventListener('pointermove', e => { mouseX = e.clientX; mouseY = e.clientY })
    c.addEventListener('pointerdown', () => { pressing = true; scattered = true; setTimeout(() => scattered = false, 300) })
    c.addEventListener('pointerup', () => { pressing = false })
    addEventListener('resize', () => { w = c.width = innerWidth; h = c.height = innerHeight })

    const draw = () => {
      t++
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, bg1); g.addColorStop(1, bg2)
      ctx.fillStyle = g
      ctx.globalAlpha = 0.15
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      for (const b of boids) {
        let ax = 0, ay = 0
        let cx = 0, cy = 0, cn = 0
        let sx = 0, sy = 0, sn = 0

        // Flocking rules
        for (const o of boids) {
          if (o === b) continue
          const dx = o.x - b.x, dy = o.y - b.y
          const d = Math.hypot(dx, dy)

          if (d < 120) {
            // Alignment
            ax += o.vx; ay += o.vy

            // Cohesion
            cx += o.x; cy += o.y; cn++

            // Separation
            if (d < 30) {
              sx -= dx / d; sy -= dy / d; sn++
            }
          }
        }

        if (cn > 0) {
          b.vx += (ax / cn - b.vx) * 0.03 // align
          b.vy += (ay / cn - b.vy) * 0.03
          b.vx += (cx / cn - b.x) * 0.001 // cohere
          b.vy += (cy / cn - b.y) * 0.001
        }
        if (sn > 0) {
          b.vx += sx * 0.15 // separate
          b.vy += sy * 0.15
        }

        // Mouse interaction
        const mdx = mouseX - b.x, mdy = mouseY - b.y
        const md = Math.hypot(mdx, mdy) + 1
        if (pressing && !scattered && md < 250) {
          b.vx += mdx / md * 0.3 // attract
          b.vy += mdy / md * 0.3
        }
        if (scattered && md < 300) {
          b.vx -= mdx / md * 4 // scatter
          b.vy -= mdy / md * 4
        }

        // Speed limit
        const speed = Math.hypot(b.vx, b.vy)
        const maxSpeed = 3.5
        if (speed > maxSpeed) { b.vx = b.vx / speed * maxSpeed; b.vy = b.vy / speed * maxSpeed }

        b.x += b.vx; b.y += b.vy

        // Wrap
        if (b.x < -20) b.x += w + 40
        if (b.x > w + 20) b.x -= w + 40
        if (b.y < -20) b.y += h + 40
        if (b.y > h + 20) b.y -= h + 40

        // Draw — teardrop shape pointing in direction of movement
        const angle = Math.atan2(b.vy, b.vx)
        const s = b.size * (1 + speed * 0.1)

        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(s * 1.5, 0)
        ctx.lineTo(-s * 0.5, -s * 0.7)
        ctx.quadraticCurveTo(-s * 0.2, 0, -s * 0.5, s * 0.7)
        ctx.closePath()
        ctx.fillStyle = b.color
        ctx.fill()
        ctx.restore()
      }

      requestAnimationFrame(draw)
    }

    // Fill background initially
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, bg1); g.addColorStop(1, bg2)
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    draw()
  }, [])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', touchAction: 'none', cursor: 'crosshair' }} />
}
