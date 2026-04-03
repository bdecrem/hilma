'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const G = 0.5 // gravitational constant

interface Body {
  x: number; y: number
  vx: number; vy: number
  mass: number
  radius: number
  color: string
  trail: { x: number; y: number }[]
  maxTrail: number
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')
}

function blendColors(c1: string, m1: number, c2: string, m2: number): string {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  const total = m1 + m2
  return rgbToHex(
    (r1 * m1 + r2 * m2) / total,
    (g1 * m1 + g2 * m2) / total,
    (b1 * m1 + b2 * m2) / total,
  )
}

export default function L21() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bodiesRef = useRef<Body[]>([])

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
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L21')
    let raf: number
    let frame = 0

    // Seed 3 initial bodies
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2
      const dist = Math.min(W, H) * 0.15
      const cx = W / 2 + Math.cos(angle) * dist
      const cy = H / 2 + Math.sin(angle) * dist
      // Orbital velocity perpendicular to radius
      const speed = 0.8
      bodiesRef.current.push({
        x: cx, y: cy,
        vx: -Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
        mass: 30 + Math.random() * 40,
        radius: 8 + Math.random() * 6,
        color: CITRUS[i % CITRUS.length],
        trail: [],
        maxTrail: 120,
      })
    }

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background with slight fade for trail persistence
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.globalAlpha = 0.15
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1

      // Full background every 300 frames to prevent infinite buildup
      if (frame % 300 === 1) {
        ctx.globalAlpha = 1
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      const bodies = bodiesRef.current

      // Physics: gravitational attraction between all pairs
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]
          const b = bodies[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distSq = dx * dx + dy * dy
          const dist = Math.sqrt(distSq)

          // Merge on collision
          if (dist < a.radius + b.radius) {
            const newMass = a.mass + b.mass
            // Conservation of momentum
            a.vx = (a.vx * a.mass + b.vx * b.mass) / newMass
            a.vy = (a.vy * a.mass + b.vy * b.mass) / newMass
            // Weighted position
            a.x = (a.x * a.mass + b.x * b.mass) / newMass
            a.y = (a.y * a.mass + b.y * b.mass) / newMass
            a.color = blendColors(a.color, a.mass, b.color, b.mass)
            a.mass = newMass
            a.radius = Math.sqrt(a.radius * a.radius + b.radius * b.radius)
            a.maxTrail = Math.min(200, a.maxTrail + 30)
            bodies.splice(j, 1)
            j--
            continue
          }

          // Gravity (with softening to prevent extreme forces)
          const force = G * a.mass * b.mass / (distSq + 100)
          const fx = force * dx / dist
          const fy = force * dy / dist

          a.vx += fx / a.mass
          a.vy += fy / a.mass
          b.vx -= fx / b.mass
          b.vy -= fy / b.mass
        }
      }

      // Update positions and trails
      for (const body of bodies) {
        body.x += body.vx
        body.y += body.vy

        // Soft boundary — push back from edges
        const margin = 50
        if (body.x < margin) body.vx += 0.1
        if (body.x > W - margin) body.vx -= 0.1
        if (body.y < margin) body.vy += 0.1
        if (body.y > H - margin) body.vy -= 0.1

        // Trail
        body.trail.push({ x: body.x, y: body.y })
        if (body.trail.length > body.maxTrail) body.trail.shift()
      }

      // Draw trails
      for (const body of bodies) {
        if (body.trail.length < 2) continue
        for (let i = 1; i < body.trail.length; i++) {
          const t = i / body.trail.length
          ctx.beginPath()
          ctx.moveTo(body.trail[i - 1].x, body.trail[i - 1].y)
          ctx.lineTo(body.trail[i].x, body.trail[i].y)
          ctx.strokeStyle = body.color
          ctx.lineWidth = body.radius * 0.3 * t
          ctx.globalAlpha = t * 0.5
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Draw bodies
      for (const body of bodies) {
        // Glow
        ctx.beginPath()
        ctx.arc(body.x, body.y, body.radius * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = body.color
        ctx.globalAlpha = 0.1
        ctx.fill()

        // Body
        ctx.beginPath()
        ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2)
        ctx.fillStyle = body.color
        ctx.globalAlpha = 0.85
        ctx.fill()

        // Highlight
        ctx.beginPath()
        ctx.arc(body.x - body.radius * 0.25, body.y - body.radius * 0.25, body.radius * 0.35, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.globalAlpha = 0.5
        ctx.fill()

        ctx.globalAlpha = 1
      }

      // Hint
      if (bodies.length < 4 && frame < 300) {
        ctx.globalAlpha = 0.2 + Math.sin(frame * 0.03) * 0.08
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText('tap to add mass', W / 2, H - 30)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Body count
      if (bodies.length > 1) {
        ctx.globalAlpha = 0.25
        ctx.font = '11px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText(`${bodies.length} bodies`, 16, H - 16)
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    const handleTap = (cx: number, cy: number) => {
      const color = CITRUS[Math.floor(Math.random() * CITRUS.length)]
      const mass = 20 + Math.random() * 50

      // Give it a slight velocity perpendicular to center
      const dx = cx - W / 2
      const dy = cy - H / 2
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const speed = 0.5 + Math.random() * 0.5

      bodiesRef.current.push({
        x: cx, y: cy,
        vx: (-dy / dist) * speed,
        vy: (dx / dist) * speed,
        mass,
        radius: 5 + Math.sqrt(mass) * 0.8,
        color,
        trail: [],
        maxTrail: 120,
      })

      // Cap
      if (bodiesRef.current.length > 30) bodiesRef.current.shift()
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

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
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
