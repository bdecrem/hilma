'use client'

import { useEffect, useRef, useCallback } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'
const TRAIL_ALPHA = 0.018
const G = 800
const MIN_DIST = 18
const BODY_COUNT_INIT = 5

interface Body {
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  radius: number
  color: string
  trail: { x: number; y: number }[]
}

function randomBody(w: number, h: number, colorIndex?: number): Body {
  const mass = 40 + Math.random() * 80
  const ci = colorIndex !== undefined ? colorIndex % CITRUS.length : Math.floor(Math.random() * CITRUS.length)
  return {
    x: w * 0.2 + Math.random() * w * 0.6,
    y: h * 0.2 + Math.random() * h * 0.6,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 60,
    mass,
    radius: 4 + Math.sqrt(mass) * 0.55,
    color: CITRUS[ci],
    trail: [],
  }
}

export default function OrbitPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)
  const bodiesRef = useRef<Body[]>([])
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const launchRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const colorIdxRef = useRef(0)

  const init = useCallback((canvas: HTMLCanvasElement, bg: HTMLCanvasElement) => {
    const w = canvas.width
    const h = canvas.height

    // Draw gradient background once on bg canvas
    const bctx = bg.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('orbit')
    const grad = bctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, bg1)
    grad.addColorStop(1, bg2)
    bctx.fillStyle = grad
    bctx.fillRect(0, 0, w, h)

    // Spawn initial bodies in a loose cluster
    bodiesRef.current = []
    for (let i = 0; i < BODY_COUNT_INIT; i++) {
      bodiesRef.current.push(randomBody(w, h, i))
    }
    // Give them orbital velocities relative to center of mass
    applyOrbitalVelocities(bodiesRef.current)
  }, [])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const bg = bgRef.current
    if (!canvas || !bg) return
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = w
    canvas.height = h
    bg.width = w
    bg.height = h
    init(canvas, bg)
  }, [init])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let frameCount = 0

    const loop = (time: number) => {
      rafRef.current = requestAnimationFrame(loop)
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.033)
      lastTimeRef.current = time
      frameCount++

      const w = canvas.width
      const h = canvas.height
      const bodies = bodiesRef.current

      // Physics step
      stepPhysics(bodies, dt, w, h)

      // Draw: fade with semi-transparent bg rect for trail effect
      ctx.fillStyle = `rgba(255,248,231,${TRAIL_ALPHA})`
      ctx.fillRect(0, 0, w, h)

      // Draw trails
      for (const b of bodies) {
        if (b.trail.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(b.trail[0].x, b.trail[0].y)
        for (let i = 1; i < b.trail.length; i++) {
          ctx.lineTo(b.trail[i].x, b.trail[i].y)
        }
        ctx.strokeStyle = b.color
        ctx.lineWidth = b.radius * 0.4
        ctx.lineCap = 'round'
        ctx.globalAlpha = 0.55
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Draw bodies
      for (const b of bodies) {
        // Glow
        const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 3)
        glow.addColorStop(0, b.color + 'CC')
        glow.addColorStop(1, b.color + '00')
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.radius * 3, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.globalAlpha = 0.35
        ctx.fill()
        ctx.globalAlpha = 1

        // Core
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
        ctx.fillStyle = b.color
        ctx.fill()

        // White highlight
        ctx.beginPath()
        ctx.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fill()
      }

      // Amber watermark — once per 300 frames briefly
      if (frameCount % 300 < 6) {
        ctx.font = '11px monospace'
        ctx.fillStyle = AMBER
        ctx.globalAlpha = 0.3
        ctx.fillText('amber', 18, h - 18)
        ctx.globalAlpha = 1
      }

      // Hint text fades out
      if (frameCount < 140) {
        ctx.font = '13px monospace'
        ctx.fillStyle = '#D4A574'
        ctx.globalAlpha = Math.max(0, 1 - frameCount / 120)
        ctx.textAlign = 'center'
        ctx.fillText('tap to launch · drag to aim', w / 2, h - 30)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Input handlers
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e)
    launchRef.current = { ...pos, t: Date.now() }
  }

  const handleUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!launchRef.current) return
    const canvas = canvasRef.current!
    const pos = getPos(e)
    const start = launchRef.current
    launchRef.current = null

    const dx = pos.x - start.x
    const dy = pos.y - start.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const speed = Math.min(dist * 1.4, 200)

    const mass = 50 + Math.random() * 70
    const ci = colorIdxRef.current++ % CITRUS.length
    const newBody: Body = {
      x: start.x,
      y: start.y,
      vx: dist > 5 ? (dx / dist) * speed : (Math.random() - 0.5) * 80,
      vy: dist > 5 ? (dy / dist) * speed : (Math.random() - 0.5) * 80,
      mass,
      radius: 4 + Math.sqrt(mass) * 0.55,
      color: CITRUS[ci],
      trail: [],
    }
    bodiesRef.current.push(newBody)
    if (bodiesRef.current.length > 18) {
      bodiesRef.current.splice(0, 1)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#FFECD2' }}>
      <canvas
        ref={bgRef}
        style={{ position: 'absolute', inset: 0 }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onTouchStart={handleDown}
        onTouchEnd={handleUp}
      />
    </div>
  )
}

// ─── Physics ───────────────────────────────────────────────────────────────

function stepPhysics(bodies: Body[], dt: number, w: number, h: number) {
  const n = bodies.length

  // Accumulate accelerations
  const ax = new Array(n).fill(0)
  const ay = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x
      const dy = bodies[j].y - bodies[i].y
      let dist = Math.sqrt(dx * dx + dy * dy)
      dist = Math.max(dist, MIN_DIST)

      const force = G * bodies[i].mass * bodies[j].mass / (dist * dist)
      const fx = (force * dx) / dist
      const fy = (force * dy) / dist

      ax[i] += fx / bodies[i].mass
      ay[i] += fy / bodies[i].mass
      ax[j] -= fx / bodies[j].mass
      ay[j] -= fy / bodies[j].mass
    }
  }

  // Soft center attraction — gentle pull to keep bodies on screen
  const cx = w / 2
  const cy = h / 2
  for (let i = 0; i < n; i++) {
    const dx = cx - bodies[i].x
    const dy = cy - bodies[i].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > w * 0.35) {
      const strength = 0.012 * (dist - w * 0.35)
      ax[i] += (dx / dist) * strength
      ay[i] += (dy / dist) * strength
    }
  }

  // Integrate
  for (let i = 0; i < n; i++) {
    bodies[i].vx += ax[i] * dt
    bodies[i].vy += ay[i] * dt

    // Soft speed cap
    const spd = Math.sqrt(bodies[i].vx ** 2 + bodies[i].vy ** 2)
    if (spd > 400) {
      bodies[i].vx = (bodies[i].vx / spd) * 400
      bodies[i].vy = (bodies[i].vy / spd) * 400
    }

    bodies[i].x += bodies[i].vx * dt
    bodies[i].y += bodies[i].vy * dt

    // Record trail (every ~2 frames worth of movement)
    const trail = bodies[i].trail
    const last = trail[trail.length - 1]
    if (!last || Math.hypot(bodies[i].x - last.x, bodies[i].y - last.y) > 3) {
      trail.push({ x: bodies[i].x, y: bodies[i].y })
      if (trail.length > 120) trail.shift()
    }
  }
}

function applyOrbitalVelocities(bodies: Body[]) {
  // Compute center of mass
  let totalMass = 0
  let cx = 0
  let cy = 0
  for (const b of bodies) {
    cx += b.x * b.mass
    cy += b.y * b.mass
    totalMass += b.mass
  }
  cx /= totalMass
  cy /= totalMass

  // Give each body a velocity perpendicular to radius, scaled for circular orbit
  for (const b of bodies) {
    const dx = b.x - cx
    const dy = b.y - cy
    const r = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
    const speed = Math.sqrt(G * totalMass / r) * 0.28
    b.vx = (-dy / r) * speed
    b.vy = (dx / r) * speed
  }
}
