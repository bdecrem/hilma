'use client'

import { useEffect, useRef } from 'react'

// L7: DROPS — tap to drop citrus blobs. gravity, bounce, settle.
// First bright background. Spring arrived.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const BG = '#FFF0F0' // light blush

interface Drop {
  x: number; y: number
  vx: number; vy: number
  r: number
  color: string
  settled: boolean
  squish: number // 1 = round, <1 = squished
}

export default function L7() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const drops: Drop[] = []
    let colorIdx = 0

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const GRAVITY = 0.3
    const BOUNCE = 0.55
    const FRICTION = 0.98

    const addDrop = (x: number, y: number) => {
      const r = 12 + Math.random() * 18
      drops.push({
        x, y: Math.min(y, h * 0.2),
        vx: (Math.random() - 0.5) * 2,
        vy: 0,
        r,
        color: COLORS[colorIdx % COLORS.length],
        settled: false,
        squish: 1,
      })
      colorIdx++
      if (drops.length > 80) drops.shift()
    }

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      addDrop(e.clientX - rect.left, e.clientY - rect.top)
    })
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      addDrop(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top)
    }, { passive: false })

    // Find resting Y considering other settled drops
    const findFloor = (drop: Drop): number => {
      let floor = h - drop.r
      for (const other of drops) {
        if (other === drop || !other.settled) continue
        const dx = drop.x - other.x
        const dist = Math.abs(dx)
        if (dist < drop.r + other.r) {
          const stackY = other.y - other.r * other.squish - drop.r
          if (stackY < floor) floor = stackY
        }
      }
      return floor
    }

    const tick = () => {
      t++

      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      // Physics
      for (const d of drops) {
        if (d.settled) continue

        d.vy += GRAVITY
        d.x += d.vx
        d.y += d.vy
        d.vx *= FRICTION

        // Wall bounce
        if (d.x - d.r < 0) { d.x = d.r; d.vx = Math.abs(d.vx) * BOUNCE }
        if (d.x + d.r > w) { d.x = w - d.r; d.vx = -Math.abs(d.vx) * BOUNCE }

        // Floor / stack collision
        const floor = findFloor(d)
        if (d.y >= floor) {
          d.y = floor
          d.vy = -Math.abs(d.vy) * BOUNCE
          d.squish = 0.7 // squish on impact

          // Settle if barely moving
          if (Math.abs(d.vy) < 1.5) {
            d.settled = true
            d.vy = 0
            d.vx = 0
          }
        }
      }

      // Draw drops
      for (const d of drops) {
        // Recover squish
        d.squish += (1 - d.squish) * 0.08

        ctx.save()
        ctx.translate(d.x, d.y)
        ctx.scale(1 / d.squish, d.squish)

        // Shadow
        ctx.beginPath()
        ctx.ellipse(2, 3, d.r, d.r, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
        ctx.fill()

        // Body
        ctx.beginPath()
        ctx.arc(0, 0, d.r, 0, Math.PI * 2)
        ctx.fillStyle = d.color
        ctx.fill()

        // Highlight
        ctx.beginPath()
        ctx.arc(-d.r * 0.25, -d.r * 0.25, d.r * 0.35, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
        ctx.fill()

        ctx.restore()
      }

      // Legacy amber — tiny dot, top-left
      ctx.fillStyle = `rgba(212, 165, 116, ${0.12 + Math.sin(t * 0.02) * 0.04})`
      ctx.beginPath()
      ctx.arc(20, 20, 3, 0, Math.PI * 2)
      ctx.fill()

      // Hint
      if (t < 180 && drops.length < 4) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('tap to drop', w / 2, h / 2)
      }

      frame = requestAnimationFrame(tick)
    }

    // Seed a few
    setTimeout(() => { addDrop(w * 0.4, 0); addDrop(w * 0.6, 0); addDrop(w * 0.5, 0) }, 300)

    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
