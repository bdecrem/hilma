'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Flower {
  x: number
  y: number
  stemH: number
  maxStemH: number
  petalR: number
  maxPetalR: number
  color: string
  petalCount: number
  phase: number
  swayOffset: number
  growSpeed: number
  bloomDelay: number
  born: number
}

interface Butterfly {
  x: number
  y: number
  vx: number
  vy: number
  wingSpan: number
  color: string
  wingPhase: number
  wanderAngle: number
  targetX: number
  targetY: number
}

interface Blade {
  x: number
  h: number
  lean: number
  color: string
}

interface Petal {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  size: number
  color: string
  opacity: number
}

const PALETTES = {
  flowers: [
    '#FF6B8A', '#FF8FA3', '#FFB4C2', // pinks
    '#FFD93D', '#FFE066', '#FFF3B0', // yellows
    '#FF8C42', '#FFB347',             // oranges
    '#C084FC', '#D8B4FE',             // purples
    '#67E8F9', '#A5F3FC',             // sky blues
    '#FB7185', '#FDA4AF',             // roses
  ],
  butterflies: ['#FF6B8A', '#C084FC', '#FFD93D', '#67E8F9', '#FB923C', '#4ADE80'],
  grass: ['#22C55E', '#16A34A', '#4ADE80', '#86EFAC', '#15803D'],
}

function rand(min: number, max: number) { return Math.random() * (max - min) + min }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

export default function SpringVibes() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flowersRef = useRef<Flower[]>([])
  const butterfliesRef = useRef<Butterfly[]>([])
  const bladesRef = useRef<Blade[]>([])
  const petalsRef = useRef<Petal[]>([])
  const timeRef = useRef(0)
  const initRef = useRef(false)

  const makeFlower = useCallback((x: number, y: number, delay = 0): Flower => ({
    x, y,
    stemH: 0,
    maxStemH: rand(60, 160),
    petalR: 0,
    maxPetalR: rand(8, 22),
    color: pick(PALETTES.flowers),
    petalCount: Math.floor(rand(5, 9)),
    phase: rand(0, Math.PI * 2),
    swayOffset: rand(0, Math.PI * 2),
    growSpeed: rand(0.3, 0.8),
    bloomDelay: delay,
    born: timeRef.current,
  }), [])

  const makeButterfly = useCallback((w: number, h: number): Butterfly => ({
    x: rand(50, w - 50),
    y: rand(50, h * 0.6),
    vx: rand(-0.5, 0.5),
    vy: rand(-0.3, 0.3),
    wingSpan: rand(12, 22),
    color: pick(PALETTES.butterflies),
    wingPhase: rand(0, Math.PI * 2),
    wanderAngle: rand(0, Math.PI * 2),
    targetX: rand(50, w - 50),
    targetY: rand(50, h * 0.6),
  }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initRef.current) return
    initRef.current = true

    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0
    let frame: number

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      // Regenerate grass
      bladesRef.current = []
      for (let i = 0; i < w * 0.4; i++) {
        bladesRef.current.push({
          x: rand(-10, w + 10),
          h: rand(15, 55),
          lean: rand(-0.3, 0.3),
          color: pick(PALETTES.grass),
        })
      }
    }

    resize()
    window.addEventListener('resize', resize)

    // Initial flowers
    const groundY = h * 0.78
    for (let i = 0; i < 25; i++) {
      flowersRef.current.push(makeFlower(rand(30, w - 30), groundY + rand(-20, 20), rand(0, 120)))
    }

    // Butterflies
    for (let i = 0; i < 6; i++) {
      butterfliesRef.current.push(makeButterfly(w, h))
    }

    // Click to plant
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      // Plant 2-4 flowers near click
      const count = Math.floor(rand(2, 5))
      for (let i = 0; i < count; i++) {
        flowersRef.current.push(makeFlower(cx + rand(-30, 30), Math.max(cy, groundY - 40) + rand(-10, 10), i * 15))
        // Burst of petals
        for (let j = 0; j < 5; j++) {
          petalsRef.current.push({
            x: cx + rand(-10, 10), y: cy + rand(-10, 10),
            vx: rand(-2, 2), vy: rand(-3, -0.5),
            rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.05, 0.05),
            size: rand(3, 7), color: pick(PALETTES.flowers), opacity: 1,
          })
        }
      }
    }
    canvas.addEventListener('click', handleClick)

    // Draw sun
    const drawSun = (t: number) => {
      const sx = w * 0.82, sy = h * 0.12, sr = 45
      // Rays
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(t * 0.0003)
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2
        const len = sr + 20 + Math.sin(t * 0.003 + i) * 10
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * (sr + 5), Math.sin(angle) * (sr + 5))
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len)
        ctx.strokeStyle = `rgba(255, 220, 50, ${0.3 + Math.sin(t * 0.004 + i) * 0.15})`
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      ctx.restore()
      // Glow
      const grd = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.5)
      grd.addColorStop(0, 'rgba(255, 240, 100, 0.4)')
      grd.addColorStop(0.5, 'rgba(255, 220, 50, 0.1)')
      grd.addColorStop(1, 'rgba(255, 220, 50, 0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(sx, sy, sr * 2.5, 0, Math.PI * 2)
      ctx.fill()
      // Sun body
      const sunGrd = ctx.createRadialGradient(sx - 8, sy - 8, 0, sx, sy, sr)
      sunGrd.addColorStop(0, '#FFF7AE')
      sunGrd.addColorStop(0.7, '#FFD93D')
      sunGrd.addColorStop(1, '#FFB347')
      ctx.fillStyle = sunGrd
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.fill()
      // Face
      ctx.fillStyle = '#E8A317'
      ctx.beginPath(); ctx.arc(sx - 12, sy - 5, 4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(sx + 12, sy - 5, 4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath()
      ctx.arc(sx, sy + 6, 14, 0.1 * Math.PI, 0.9 * Math.PI)
      ctx.strokeStyle = '#E8A317'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // Draw clouds
    const drawClouds = (t: number) => {
      const clouds = [
        { x: (t * 0.015) % (w + 300) - 150, y: h * 0.1, s: 1.2 },
        { x: (t * 0.01 + 400) % (w + 300) - 150, y: h * 0.18, s: 0.8 },
        { x: (t * 0.008 + 800) % (w + 300) - 150, y: h * 0.06, s: 1.0 },
      ]
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      for (const c of clouds) {
        ctx.beginPath()
        ctx.arc(c.x, c.y, 30 * c.s, 0, Math.PI * 2)
        ctx.arc(c.x + 25 * c.s, c.y - 10 * c.s, 25 * c.s, 0, Math.PI * 2)
        ctx.arc(c.x + 50 * c.s, c.y, 28 * c.s, 0, Math.PI * 2)
        ctx.arc(c.x + 20 * c.s, c.y + 8 * c.s, 22 * c.s, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw grass
    const drawGrass = (t: number) => {
      const gy = groundY + 10
      // Ground
      const groundGrd = ctx.createLinearGradient(0, gy, 0, h)
      groundGrd.addColorStop(0, '#4ADE80')
      groundGrd.addColorStop(0.3, '#22C55E')
      groundGrd.addColorStop(1, '#15803D')
      ctx.fillStyle = groundGrd
      ctx.beginPath()
      ctx.moveTo(0, gy)
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, gy + Math.sin(x * 0.02 + t * 0.001) * 5)
      }
      ctx.lineTo(w, h)
      ctx.lineTo(0, h)
      ctx.fill()

      // Blades
      for (const b of bladesRef.current) {
        const sway = Math.sin(t * 0.002 + b.x * 0.01) * 8 + b.lean * 15
        ctx.beginPath()
        ctx.moveTo(b.x, gy)
        ctx.quadraticCurveTo(b.x + sway * 0.5, gy - b.h * 0.5, b.x + sway, gy - b.h)
        ctx.strokeStyle = b.color
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.stroke()
      }
    }

    // Draw a single flower
    const drawFlower = (f: Flower, t: number) => {
      const age = t - f.born - f.bloomDelay
      if (age < 0) return

      const growT = Math.min(age * f.growSpeed * 0.01, 1)
      f.stemH = f.maxStemH * growT
      const bloomT = Math.max(0, Math.min((growT - 0.6) / 0.4, 1))
      f.petalR = f.maxPetalR * bloomT

      const sway = Math.sin(t * 0.002 + f.swayOffset) * 4 * growT
      const tipX = f.x + sway
      const tipY = f.y - f.stemH

      // Stem
      ctx.beginPath()
      ctx.moveTo(f.x, f.y)
      ctx.quadraticCurveTo(f.x + sway * 0.3, f.y - f.stemH * 0.5, tipX, tipY)
      ctx.strokeStyle = '#16A34A'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.stroke()

      // Leaves
      if (f.stemH > 40) {
        const leafY = f.y - f.stemH * 0.4
        const leafSway = sway * 0.3
        ctx.save()
        ctx.translate(f.x + leafSway, leafY)
        ctx.rotate(-0.3 + Math.sin(t * 0.003 + f.phase) * 0.1)
        ctx.beginPath()
        ctx.ellipse(8, 0, 12, 4, 0.2, 0, Math.PI * 2)
        ctx.fillStyle = '#4ADE80'
        ctx.fill()
        ctx.restore()
      }

      if (bloomT <= 0) return

      // Petals
      ctx.save()
      ctx.translate(tipX, tipY)
      const petalOpen = bloomT * Math.PI * 0.35
      for (let i = 0; i < f.petalCount; i++) {
        const a = (i / f.petalCount) * Math.PI * 2 + f.phase + Math.sin(t * 0.001) * 0.05
        ctx.save()
        ctx.rotate(a)
        ctx.beginPath()
        ctx.ellipse(f.petalR * 0.7, 0, f.petalR, f.petalR * 0.45, petalOpen, 0, Math.PI * 2)
        ctx.fillStyle = f.color
        ctx.globalAlpha = 0.85
        ctx.fill()
        ctx.restore()
      }
      ctx.globalAlpha = 1

      // Center
      const centerGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, f.petalR * 0.35)
      centerGrd.addColorStop(0, '#FFF7AE')
      centerGrd.addColorStop(1, '#FFD93D')
      ctx.beginPath()
      ctx.arc(0, 0, f.petalR * 0.35 * bloomT, 0, Math.PI * 2)
      ctx.fillStyle = centerGrd
      ctx.fill()
      ctx.restore()
    }

    // Draw butterfly
    const drawButterfly = (b: Butterfly, t: number) => {
      // Wander
      if (Math.random() < 0.01) {
        b.targetX = rand(30, w - 30)
        b.targetY = rand(30, groundY - 60)
      }
      const dx = b.targetX - b.x, dy = b.targetY - b.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 2) {
        b.vx += (dx / dist) * 0.03
        b.vy += (dy / dist) * 0.03
      }
      b.vx *= 0.98; b.vy *= 0.98
      b.vy += Math.sin(t * 0.003 + b.wingPhase) * 0.02
      b.x += b.vx; b.y += b.vy

      const wingFlap = Math.sin(t * 0.08 + b.wingPhase) * 0.8 + 0.2
      const angle = Math.atan2(b.vy, b.vx)

      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(angle * 0.3)

      // Wings
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.scale(1, side)
        // Upper wing
        ctx.beginPath()
        ctx.ellipse(-2, -b.wingSpan * 0.4 * wingFlap, b.wingSpan * 0.6, b.wingSpan * 0.4, -0.3, 0, Math.PI * 2)
        ctx.fillStyle = b.color
        ctx.globalAlpha = 0.7
        ctx.fill()
        // Lower wing
        ctx.beginPath()
        ctx.ellipse(3, -b.wingSpan * 0.25 * wingFlap, b.wingSpan * 0.35, b.wingSpan * 0.25, 0.2, 0, Math.PI * 2)
        ctx.fillStyle = b.color
        ctx.globalAlpha = 0.5
        ctx.fill()
        ctx.restore()
      }

      // Body
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.ellipse(0, 0, 2.5, 7, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#1a1a1a'
      ctx.fill()
      // Antennae
      ctx.beginPath()
      ctx.moveTo(0, -6); ctx.quadraticCurveTo(-5, -14, -7, -16)
      ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, -14, 7, -16)
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 0.8
      ctx.stroke()

      ctx.restore()
    }

    // Draw falling petals
    const drawPetals = (t: number) => {
      // Occasionally spawn ambient petals
      if (Math.random() < 0.02) {
        petalsRef.current.push({
          x: rand(0, w), y: -10,
          vx: rand(-0.5, 0.5), vy: rand(0.3, 1),
          rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.02, 0.02),
          size: rand(3, 6), color: pick(PALETTES.flowers), opacity: 0.6,
        })
      }

      petalsRef.current = petalsRef.current.filter(p => {
        p.x += p.vx + Math.sin(t * 0.002 + p.rotation) * 0.3
        p.y += p.vy
        p.rotation += p.rotSpeed
        p.opacity -= 0.001
        if (p.y > h + 10 || p.opacity <= 0) return false

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.fill()
        ctx.restore()
        return true
      })
      ctx.globalAlpha = 1
    }

    // Main loop
    const tick = () => {
      timeRef.current++
      const t = timeRef.current

      // Sky gradient
      const skyGrd = ctx.createLinearGradient(0, 0, 0, h * 0.8)
      skyGrd.addColorStop(0, '#7DD3FC')
      skyGrd.addColorStop(0.4, '#BAE6FD')
      skyGrd.addColorStop(0.8, '#FEF9C3')
      skyGrd.addColorStop(1, '#FDE68A')
      ctx.fillStyle = skyGrd
      ctx.fillRect(0, 0, w, h)

      drawClouds(t)
      drawSun(t)
      drawGrass(t)

      // Flowers (sorted by y for depth)
      const sorted = [...flowersRef.current].sort((a, b) => a.y - b.y)
      for (const f of sorted) drawFlower(f, t)

      drawPetals(t)

      for (const b of butterfliesRef.current) drawButterfly(b, t)

      // Title text
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.font = `bold ${Math.min(w * 0.08, 52)}px system-ui, -apple-system, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.shadowColor = 'rgba(0,0,0,0.1)'
      ctx.shadowBlur = 20
      const bob = Math.sin(t * 0.003) * 3
      ctx.fillText('🌸 spring has sprung 🌸', w / 2, 30 + bob)
      ctx.font = `${Math.min(w * 0.035, 16)}px system-ui, -apple-system, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.shadowBlur = 0
      ctx.fillText('tap anywhere to plant flowers', w / 2, 30 + bob + Math.min(w * 0.08, 52) + 8)
      ctx.restore()

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', handleClick)
    }
  }, [makeFlower, makeButterfly])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full cursor-pointer"
      style={{ touchAction: 'manipulation' }}
    />
  )
}
