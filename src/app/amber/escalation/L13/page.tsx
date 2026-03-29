'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// L13: FLOW — particles drift through a shifting vector field.
// The field breathes on its own. Tap to release a burst.
// New: flow-field, noise-driven vectors, particle-streams, fade lifecycle.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const MAX_PARTICLES = 600

interface Particle {
  x: number; y: number
  vx: number; vy: number
  color: string
  life: number; maxLife: number
  size: number
}

// Smooth vector field using overlapping sin/cos waves
function fieldAngle(x: number, y: number, t: number): number {
  const s = 0.0025
  return (
    Math.sin(x * s + t * 0.4) * Math.cos(y * s * 1.2 + t * 0.25) +
    Math.sin(x * s * 0.8 - y * s * 1.1 + t * 0.6) * 0.6 +
    Math.cos(x * s * 1.4 + y * s * 0.6 - t * 0.35) * 0.4
  ) * Math.PI * 1.8
}

function spawn(x: number, y: number, count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 1.5
    return {
      x: x + (Math.random() - 0.5) * 30,
      y: y + (Math.random() - 0.5) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 0,
      maxLife: 140 + Math.random() * 220,
      size: 1.5 + Math.random() * 2.5,
    }
  })
}

export default function L13() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let w = c.width = innerWidth, h = c.height = innerHeight
    const [bg1, bg2] = pickGradientColors('L13-flow')
    let t = 0
    let animId: number

    const particles: Particle[] = []

    // Seed with scattered particles at random lifetimes so it starts alive
    for (let i = 0; i < 220; i++) {
      const p = spawn(Math.random() * w, Math.random() * h, 1, w, h)[0]
      p.life = Math.random() * p.maxLife * 0.7
      particles.push(p)
    }

    function fillBg() {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, bg1); g.addColorStop(1, bg2)
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    }

    fillBg()

    const onPointer = (e: PointerEvent) => {
      const burst = spawn(e.clientX, e.clientY, 45, w, h)
      particles.push(...burst)
    }
    const onResize = () => {
      w = c.width = innerWidth; h = c.height = innerHeight
      fillBg()
    }
    c.addEventListener('pointerdown', onPointer)
    addEventListener('resize', onResize)

    const draw = () => {
      t += 0.008

      // Ghost fade — semi-transparent bg layer creates trails
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, bg1); g.addColorStop(1, bg2)
      ctx.globalAlpha = 0.07
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      // Trickle in new edge particles to keep field populated
      while (particles.length < MAX_PARTICLES) {
        const edge = Math.floor(Math.random() * 4)
        let px: number, py: number
        if (edge === 0) { px = Math.random() * w; py = -5 }
        else if (edge === 1) { px = w + 5; py = Math.random() * h }
        else if (edge === 2) { px = Math.random() * w; py = h + 5 }
        else { px = -5; py = Math.random() * h }
        particles.push(spawn(px, py, 1, w, h)[0])
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        if (p.life > p.maxLife) { particles.splice(i, 1); continue }

        // Steer by field
        const angle = fieldAngle(p.x, p.y, t)
        p.vx += Math.cos(angle) * 0.18
        p.vy += Math.sin(angle) * 0.18
        // Damping keeps speed organic
        p.vx *= 0.94; p.vy *= 0.94
        p.x += p.vx; p.y += p.vy

        // Soft wrap
        if (p.x < -10) p.x += w + 20
        if (p.x > w + 10) p.x -= w + 20
        if (p.y < -10) p.y += h + 20
        if (p.y > h + 10) p.y -= h + 20

        // Fade in over 40 frames, fade out over last 60
        const fadeIn = Math.min(p.life / 40, 1)
        const fadeOut = p.life > p.maxLife - 60 ? (p.maxLife - p.life) / 60 : 1
        const alpha = fadeIn * fadeOut * 0.8

        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }

      ctx.globalAlpha = 1
      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      c.removeEventListener('pointerdown', onPointer)
      removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', touchAction: 'none', cursor: 'crosshair' }}
    />
  )
}
