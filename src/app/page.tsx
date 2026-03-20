'use client'

import { useEffect, useRef, useCallback } from 'react'

// Inspired by Hilma af Klint — organic forms, spiritual geometry, flowing color

const PALETTE = [
  [255, 107, 107],  // coral
  [78, 205, 196],   // teal
  [255, 230, 109],  // gold
  [168, 130, 235],  // lavender
  [255, 139, 148],  // rose
  [100, 220, 180],  // mint
  [255, 180, 100],  // amber
  [140, 170, 255],  // periwinkle
]

interface Orb {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  baseRadius: number
  color: number[]
  targetColor: number[]
  phase: number
  speed: number
  breathSpeed: number
}

interface Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  opacity: number
  color: number[]
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbsRef = useRef<Orb[]>([])
  const ripplesRef = useRef<Ripple[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const timeRef = useRef(0)
  const frameRef = useRef(0)

  const initOrbs = useCallback((w: number, h: number) => {
    const orbs: Orb[] = []
    const count = Math.min(8, Math.max(5, Math.floor((w * h) / 120000)))
    for (let i = 0; i < count; i++) {
      const color = PALETTE[i % PALETTE.length]
      orbs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 0,
        baseRadius: w * (0.12 + Math.random() * 0.14),
        color: [...color],
        targetColor: [...PALETTE[(i + 1) % PALETTE.length]],
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4,
        breathSpeed: 0.005 + Math.random() * 0.008,
      })
    }
    return orbs
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (orbsRef.current.length === 0) {
        orbsRef.current = initOrbs(w, h)
      } else {
        orbsRef.current.forEach(orb => {
          orb.baseRadius = w * (0.12 + Math.random() * 0.14)
        })
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    const handleTouchMove = (e: TouchEvent) => {
      mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const handleClick = (e: MouseEvent) => {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: Math.max(w, h) * 0.5,
        opacity: 0.6,
        color,
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('click', handleClick)

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const dist = (x1: number, y1: number, x2: number, y2: number) =>
      Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      timeRef.current += 0.016

      const t = timeRef.current
      const orbs = orbsRef.current
      const mouse = mouseRef.current

      // Dark background with slight fade (trails)
      ctx.fillStyle = 'rgba(8, 8, 12, 0.08)'
      ctx.fillRect(0, 0, w, h)

      // Every ~3 seconds, fully clear to prevent ghosting buildup
      if (Math.floor(t * 60) % 180 === 0) {
        ctx.fillStyle = '#08080c'
        ctx.fillRect(0, 0, w, h)
      }

      // Update and draw orbs
      for (const orb of orbs) {
        // Drift
        orb.x += orb.vx * orb.speed
        orb.y += orb.vy * orb.speed

        // Soft bounce
        if (orb.x < -orb.baseRadius * 0.5) orb.vx = Math.abs(orb.vx)
        if (orb.x > w + orb.baseRadius * 0.5) orb.vx = -Math.abs(orb.vx)
        if (orb.y < -orb.baseRadius * 0.5) orb.vy = Math.abs(orb.vy)
        if (orb.y > h + orb.baseRadius * 0.5) orb.vy = -Math.abs(orb.vy)

        // Mouse influence — gentle attraction
        const d = dist(mouse.x, mouse.y, orb.x, orb.y)
        if (d < 400 && d > 1) {
          const force = 0.15 / (d * 0.01)
          orb.vx += ((mouse.x - orb.x) / d) * force * 0.01
          orb.vy += ((mouse.y - orb.y) / d) * force * 0.01
        }

        // Damping
        orb.vx *= 0.998
        orb.vy *= 0.998

        // Breathing radius
        orb.phase += orb.breathSpeed
        orb.radius = orb.baseRadius * (0.85 + 0.15 * Math.sin(orb.phase))

        // Color cycling
        for (let i = 0; i < 3; i++) {
          orb.color[i] = lerp(orb.color[i], orb.targetColor[i], 0.003)
        }
        if (Math.abs(orb.color[0] - orb.targetColor[0]) < 2) {
          orb.targetColor = [...PALETTE[Math.floor(Math.random() * PALETTE.length)]]
        }

        // Draw orb — layered radial gradients for depth
        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius
        )
        const [r, g, b] = orb.color.map(Math.round)
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.35)`)
        gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.12)`)
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.04)`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
        ctx.fill()

        // Inner glow — brighter core
        const innerGrad = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius * 0.3
        )
        innerGrad.addColorStop(0, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, 0.2)`)
        innerGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.fillStyle = innerGrad
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, orb.radius * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw connections between nearby orbs
      ctx.lineWidth = 1
      for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) {
          const d = dist(orbs[i].x, orbs[i].y, orbs[j].x, orbs[j].y)
          const maxDist = (orbs[i].radius + orbs[j].radius) * 1.2
          if (d < maxDist) {
            const alpha = (1 - d / maxDist) * 0.08
            const [r1, g1, b1] = orbs[i].color.map(Math.round)
            const [r2, g2, b2] = orbs[j].color.map(Math.round)
            const gradient = ctx.createLinearGradient(
              orbs[i].x, orbs[i].y, orbs[j].x, orbs[j].y
            )
            gradient.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${alpha})`)
            gradient.addColorStop(1, `rgba(${r2}, ${g2}, ${b2}, ${alpha})`)
            ctx.strokeStyle = gradient
            ctx.beginPath()
            ctx.moveTo(orbs[i].x, orbs[i].y)
            // Curved connections
            const mx = (orbs[i].x + orbs[j].x) / 2 + Math.sin(t + i) * 30
            const my = (orbs[i].y + orbs[j].y) / 2 + Math.cos(t + j) * 30
            ctx.quadraticCurveTo(mx, my, orbs[j].x, orbs[j].y)
            ctx.stroke()
          }
        }
      }

      // Geometric overlay — rotating ring of dots (Hilma af Klint inspired)
      const cx = w / 2
      const cy = h / 2
      const ringRadius = Math.min(w, h) * 0.28
      const dotCount = 36
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + t * 0.15
        const wobble = Math.sin(t * 0.5 + i * 0.3) * 15
        const px = cx + Math.cos(angle) * (ringRadius + wobble)
        const py = cy + Math.sin(angle) * (ringRadius + wobble)
        const size = 1.5 + Math.sin(t + i * 0.5) * 0.8
        const color = PALETTE[i % PALETTE.length]
        const alpha = 0.15 + Math.sin(t * 0.8 + i * 0.2) * 0.1
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`
        ctx.beginPath()
        ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Inner ring — counter-rotating
      const innerRadius = ringRadius * 0.55
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2 - t * 0.1
        const wobble = Math.sin(t * 0.7 + i * 0.5) * 10
        const px = cx + Math.cos(angle) * (innerRadius + wobble)
        const py = cy + Math.sin(angle) * (innerRadius + wobble)
        const size = 1 + Math.sin(t * 1.2 + i) * 0.5
        const color = PALETTE[(i + 3) % PALETTE.length]
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.12)`
        ctx.beginPath()
        ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Ripples
      const ripples = ripplesRef.current
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        r.radius += 4
        r.opacity *= 0.97
        if (r.opacity < 0.01) {
          ripples.splice(i, 1)
          continue
        }
        const [cr, cg, cb] = r.color
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${r.opacity})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
        ctx.stroke()

        // Second ring
        if (r.radius > 30) {
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${r.opacity * 0.4})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Title text — rendered on canvas for seamless integration
      ctx.save()
      ctx.globalAlpha = 0.9
      ctx.font = `900 ${Math.min(w * 0.18, 160)}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.letterSpacing = '-0.04em'

      // Text glow
      const textGradient = ctx.createLinearGradient(cx - 200, cy, cx + 200, cy)
      const hue1 = (t * 20) % 360
      textGradient.addColorStop(0, `hsla(${hue1}, 70%, 85%, 0.95)`)
      textGradient.addColorStop(0.5, `hsla(${(hue1 + 40) % 360}, 60%, 90%, 0.95)`)
      textGradient.addColorStop(1, `hsla(${(hue1 + 80) % 360}, 70%, 85%, 0.95)`)
      ctx.fillStyle = textGradient
      ctx.fillText('hilma', cx, cy)

      ctx.restore()
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('click', handleClick)
    }
  }, [initOrbs])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 cursor-crosshair"
    />
  )
}
