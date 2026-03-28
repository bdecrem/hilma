'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface Vortex {
  x: number
  y: number
  strength: number
  decay: number
  color: string
}

interface Particle {
  x: number
  y: number
  color: string
  size: number
}

export default function VortexPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const resize = () => {
      const prev = { w: canvas.width, h: canvas.height }
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      if (prev.w > 0) drawBg(1)
    }
    resize()
    window.addEventListener('resize', resize)

    const [bg1, bg2] = pickGradientColors('vortex')

    const vortices: Vortex[] = []
    const particles: Particle[] = []
    const N = 600

    const drawBg = (alpha: number) => {
      const w = canvas.width
      const h = canvas.height
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, hexToRgba(bg1, alpha))
      grad.addColorStop(1, hexToRgba(bg2, alpha))
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }

    const initParticles = () => {
      particles.length = 0
      for (let i = 0; i < N; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
          size: 0.8 + Math.random() * 2.2,
        })
      }
      // Sprinkle a few amber particles as watermark
      for (let i = 0; i < 20; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          color: AMBER,
          size: 1.5,
        })
      }
    }

    const spawnVortex = (x: number, y: number) => {
      const strength = (Math.random() > 0.5 ? 1 : -1) * (3000 + Math.random() * 6000)
      vortices.push({
        x,
        y,
        strength,
        decay: 0.992 + Math.random() * 0.006,
        color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
      })
      if (vortices.length > 10) vortices.shift()
    }

    drawBg(1)
    initParticles()

    for (let i = 0; i < 5; i++) {
      spawnVortex(
        80 + Math.random() * (canvas.width - 160),
        80 + Math.random() * (canvas.height - 160)
      )
    }

    let frameCount = 0
    let animId: number

    const draw = () => {
      animId = requestAnimationFrame(draw)
      frameCount++

      const w = canvas.width
      const h = canvas.height

      // Trail fade
      drawBg(0.07)

      // Decay vortex strengths
      for (const v of vortices) {
        v.strength *= v.decay
      }

      // Periodically spawn new vortex to keep energy up
      if (frameCount % 220 === 0) {
        spawnVortex(
          80 + Math.random() * (w - 160),
          80 + Math.random() * (h - 160)
        )
      }

      // Update particles
      for (const p of particles) {
        let vx = 0
        let vy = 0
        let nearColor = p.color
        let nearDist = Infinity

        for (const v of vortices) {
          const dx = p.x - v.x
          const dy = p.y - v.y
          const dist2 = dx * dx + dy * dy
          if (dist2 < 64) continue
          // Tangential vortex velocity
          const spd = v.strength / (dist2 + 3000)
          vx += -dy * spd
          vy += dx * spd
          const dist = Math.sqrt(dist2)
          if (dist < nearDist) {
            nearDist = dist
            nearColor = v.color
          }
        }

        // Gentle attractor toward center to prevent all particles drifting off
        const cx = w / 2
        const cy = h / 2
        vx += (cx - p.x) * 0.0001
        vy += (cy - p.y) * 0.0001

        // Speed cap
        const spd = Math.sqrt(vx * vx + vy * vy)
        if (spd > 5) {
          vx *= 5 / spd
          vy *= 5 / spd
        }

        p.x += vx
        p.y += vy

        // Wrap edges
        if (p.x < -10) p.x += w + 20
        if (p.x > w + 10) p.x -= w + 20
        if (p.y < -10) p.y += h + 20
        if (p.y > h + 10) p.y -= h + 20

        // Absorb nearby vortex color
        if (nearDist < 250 && p.color !== AMBER) {
          p.color = nearColor
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = hexToRgba(p.color, 0.82)
        ctx.fill()
      }

      // Vortex glow halos
      for (const v of vortices) {
        const r = 15 + Math.min(70, Math.abs(v.strength) / 80)
        const grd = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, r)
        grd.addColorStop(0, hexToRgba(v.color, 0.35))
        grd.addColorStop(0.5, hexToRgba(v.color, 0.12))
        grd.addColorStop(1, hexToRgba(v.color, 0))
        ctx.beginPath()
        ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()
      }
    }

    draw()

    const handlePointer = (x: number, y: number) => {
      spawnVortex(x, y)
      // White flash on tap
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    canvas.addEventListener('click', (e) => handlePointer(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const t = e.touches[0]
      handlePointer(t.clientX, t.clientY)
    }, { passive: false })

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
    />
  )
}
