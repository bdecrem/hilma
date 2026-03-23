'use client'

import { useEffect, useRef } from 'react'

interface Bloom {
  x: number
  y: number
  radius: number
  maxRadius: number
  hue: number
  saturation: number
  speed: number
  phase: number
  born: number
  layers: number
  rotSpeed: number
  shape: 'circle' | 'arc' | 'ring'
  opacity: number
}

interface Tendril {
  points: { x: number; y: number }[]
  hue: number
  width: number
  phase: number
  speed: number
  life: number
  maxLife: number
}

interface Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  hue: number
  width: number
  opacity: number
}

function rand(a: number, b: number) { return Math.random() * (b - a) + a }

const SPRING_HUES = [340, 350, 10, 30, 45, 55, 140, 160, 270, 290, 310, 200]

export default function SpringAbstract() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    blooms: [] as Bloom[],
    tendrils: [] as Tendril[],
    ripples: [] as Ripple[],
    t: 0,
    warmth: 0, // slowly rises like the season turning
    bgHue: 200,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const s = stateRef.current
    let w = 0, h = 0, frame: number

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Seed initial blooms
    const addBloom = (x: number, y: number, burst = false) => {
      const count = burst ? Math.floor(rand(3, 7)) : 1
      for (let i = 0; i < count; i++) {
        const bx = x + (burst ? rand(-80, 80) : 0)
        const by = y + (burst ? rand(-80, 80) : 0)
        s.blooms.push({
          x: bx, y: by,
          radius: 0,
          maxRadius: rand(20, 120),
          hue: SPRING_HUES[Math.floor(rand(0, SPRING_HUES.length))],
          saturation: rand(50, 90),
          speed: rand(0.2, 0.8),
          phase: rand(0, Math.PI * 2),
          born: s.t,
          layers: Math.floor(rand(2, 6)),
          rotSpeed: rand(-0.003, 0.003),
          shape: (['circle', 'arc', 'ring'] as const)[Math.floor(rand(0, 3))],
          opacity: rand(0.15, 0.5),
        })
      }
      // Add ripples on click
      if (burst) {
        for (let i = 0; i < 3; i++) {
          s.ripples.push({
            x, y,
            radius: rand(5, 20),
            maxRadius: rand(100, 300),
            hue: SPRING_HUES[Math.floor(rand(0, SPRING_HUES.length))],
            width: rand(1, 4),
            opacity: rand(0.4, 0.8),
          })
        }
      }
    }

    const addTendril = (x: number, y: number) => {
      const angle = rand(0, Math.PI * 2)
      const len = Math.floor(rand(30, 80))
      const pts: { x: number; y: number }[] = []
      let cx = x, cy = y, a = angle
      for (let i = 0; i < len; i++) {
        pts.push({ x: cx, y: cy })
        a += rand(-0.3, 0.3)
        const step = rand(3, 8)
        cx += Math.cos(a) * step
        cy += Math.sin(a) * step
      }
      s.tendrils.push({
        points: pts,
        hue: SPRING_HUES[Math.floor(rand(0, SPRING_HUES.length))],
        width: rand(1, 4),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.5, 2),
        life: 0,
        maxLife: len,
      })
    }

    // Initial seeds
    for (let i = 0; i < 12; i++) addBloom(rand(50, w - 50), rand(50, h - 50))
    for (let i = 0; i < 6; i++) addTendril(rand(50, w - 50), rand(50, h - 50))

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      addBloom(e.clientX - rect.left, e.clientY - rect.top, true)
      addTendril(e.clientX - rect.left, e.clientY - rect.top)
      addTendril(e.clientX - rect.left, e.clientY - rect.top)
    }
    canvas.addEventListener('click', handleClick)

    // Spontaneous growth
    const spontaneous = () => {
      if (s.blooms.length < 60) addBloom(rand(0, w), rand(0, h))
      if (s.tendrils.length < 20) addTendril(rand(0, w), rand(0, h))
    }

    const drawBloom = (b: Bloom) => {
      const age = (s.t - b.born) * b.speed * 0.01
      const growT = Math.min(age, 1)
      b.radius = b.maxRadius * easeOut(growT)

      if (b.radius < 0.5) return

      const breathe = 1 + Math.sin(s.t * 0.003 + b.phase) * 0.08
      const r = b.radius * breathe

      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(s.t * b.rotSpeed + b.phase)

      for (let i = b.layers; i >= 0; i--) {
        const layerR = r * ((i + 1) / (b.layers + 1))
        const layerHue = (b.hue + i * 15) % 360
        const layerAlpha = b.opacity * (0.3 + 0.7 * (i / b.layers)) * growT

        ctx.beginPath()

        if (b.shape === 'circle') {
          ctx.arc(0, 0, layerR, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${layerHue}, ${b.saturation}%, ${55 + i * 8}%, ${layerAlpha})`
          ctx.fill()
        } else if (b.shape === 'arc') {
          const sweep = Math.PI * (0.8 + Math.sin(s.t * 0.002 + i) * 0.4)
          const startAngle = i * 0.5 + Math.sin(s.t * 0.001 + b.phase) * 0.3
          ctx.arc(0, 0, layerR, startAngle, startAngle + sweep)
          ctx.lineWidth = rand(2, 6) * (layerR / b.maxRadius)
          ctx.strokeStyle = `hsla(${layerHue}, ${b.saturation}%, ${55 + i * 8}%, ${layerAlpha})`
          ctx.lineCap = 'round'
          ctx.stroke()
        } else {
          ctx.arc(0, 0, layerR, 0, Math.PI * 2)
          ctx.lineWidth = 1 + i * 0.8
          ctx.strokeStyle = `hsla(${layerHue}, ${b.saturation}%, ${55 + i * 8}%, ${layerAlpha * 0.7})`
          ctx.stroke()
        }
      }

      ctx.restore()
    }

    const drawTendril = (t: Tendril) => {
      t.life += t.speed
      const visible = Math.min(Math.floor(t.life), t.points.length)
      if (visible < 2) return

      ctx.beginPath()
      ctx.moveTo(t.points[0].x, t.points[0].y)
      for (let i = 1; i < visible; i++) {
        const p = t.points[i]
        const wobble = Math.sin(s.t * 0.004 + i * 0.2 + t.phase) * 3
        const nx = p.x + wobble
        const ny = p.y + Math.cos(s.t * 0.003 + i * 0.15) * 2
        if (i < visible - 1) {
          const next = t.points[i + 1]
          ctx.quadraticCurveTo(nx, ny, (nx + next.x + wobble) / 2, (ny + next.y) / 2)
        } else {
          ctx.lineTo(nx, ny)
        }
      }

      const fade = Math.max(0, 1 - (t.life - t.maxLife * 0.7) / (t.maxLife * 0.3))
      ctx.strokeStyle = `hsla(${t.hue}, 60%, 60%, ${0.3 * fade})`
      ctx.lineWidth = t.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()

      // Glow at tip
      if (visible < t.points.length) {
        const tip = t.points[visible - 1]
        const grd = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 12)
        grd.addColorStop(0, `hsla(${t.hue}, 80%, 70%, ${0.4 * fade})`)
        grd.addColorStop(1, `hsla(${t.hue}, 80%, 70%, 0)`)
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, 12, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const drawRipple = (r: Ripple): boolean => {
      r.radius += 1.5
      r.opacity -= 0.008
      if (r.opacity <= 0 || r.radius > r.maxRadius) return false
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${r.hue}, 70%, 65%, ${r.opacity})`
      ctx.lineWidth = r.width
      ctx.stroke()
      return true
    }

    function easeOut(t: number) { return 1 - Math.pow(1 - t, 3) }

    const tick = () => {
      s.t++

      // Warmth slowly rises — background shifts from cool to warm
      s.warmth = Math.min(s.warmth + 0.0001, 1)
      const bgLightness = 96 - s.warmth * 4
      s.bgHue = 200 + s.warmth * 40 // blue → warm blue-green

      // Soft layered background
      ctx.fillStyle = `hsl(${s.bgHue}, ${15 + s.warmth * 10}%, ${bgLightness}%)`
      ctx.fillRect(0, 0, w, h)

      // Large ambient color fields — slow moving
      for (let i = 0; i < 3; i++) {
        const fx = w * (0.3 + 0.4 * Math.sin(s.t * 0.0003 + i * 2.1))
        const fy = h * (0.3 + 0.4 * Math.cos(s.t * 0.0004 + i * 1.7))
        const fr = Math.min(w, h) * (0.2 + 0.15 * Math.sin(s.t * 0.0005 + i))
        const fHue = (SPRING_HUES[i * 3] + s.t * 0.02) % 360
        const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr)
        grd.addColorStop(0, `hsla(${fHue}, 40%, 80%, ${0.08 + s.warmth * 0.04})`)
        grd.addColorStop(1, `hsla(${fHue}, 40%, 80%, 0)`)
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(fx, fy, fr, 0, Math.PI * 2)
        ctx.fill()
      }

      // Tendrils
      s.tendrils = s.tendrils.filter(t => t.life < t.maxLife * 1.5)
      for (const t of s.tendrils) drawTendril(t)

      // Blooms
      s.blooms = s.blooms.filter(b => {
        const age = (s.t - b.born) * b.speed * 0.01
        return age < 8 // fade out old ones
      })
      for (const b of s.blooms) drawBloom(b)

      // Ripples
      s.ripples = s.ripples.filter(drawRipple)

      // Spontaneous growth
      if (s.t % 90 === 0) spontaneous()

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', handleClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full cursor-crosshair"
      style={{ touchAction: 'manipulation' }}
    />
  )
}
