'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Walker {
  pos: number // 0-1 around the loop
  speed: number
  color: string
  size: number
}

export default function Stairs() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dirRef = useRef(1) // 1 = clockwise, -1 = reverse

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
    const [bg1, bg2] = pickGradientColors('stairs')

    // 4-sided impossible staircase — Penrose stairs
    // Each side has steps that go "up" but connect back to where they started
    const STEPS_PER_SIDE = 6
    const TOTAL_STEPS = STEPS_PER_SIDE * 4

    // Walkers
    const walkers: Walker[] = []
    for (let i = 0; i < 8; i++) {
      walkers.push({
        pos: i / 8,
        speed: 0.0008 + Math.random() * 0.0004,
        color: CITRUS[i % CITRUS.length],
        size: 6 + Math.random() * 4,
      })
    }

    // Get stair path point at position t (0-1)
    function getStairPoint(t: number, cx: number, cy: number, size: number): { x: number; y: number; depth: number } {
      const side = Math.floor(t * 4) % 4
      const sideT = (t * 4) % 1
      const step = Math.floor(sideT * STEPS_PER_SIDE)
      const stepT = (sideT * STEPS_PER_SIDE) % 1

      // Isometric projection constants
      const isoX = size * 0.5
      const isoY = size * 0.25
      const stepH = size * 0.035 // height per step
      const stepW = 1 / STEPS_PER_SIDE

      let x = 0, y = 0, depth = 0

      // Each side goes in a different direction (forming a square loop)
      // The "impossible" part: each side's steps go up, but the loop closes
      const baseHeight = side * STEPS_PER_SIDE * stepH
      const localHeight = (step + stepT) * stepH

      switch (side) {
        case 0: // right-going (front)
          x = cx + (-0.5 + sideT) * isoX + (0.5) * isoX
          y = cy + (-0.5 + sideT) * isoY * 0.5 + (0.5) * isoY - localHeight
          depth = sideT
          break
        case 1: // up-going (right)
          x = cx + (0.5) * isoX + (0.5 - sideT) * isoX
          y = cy + (0.5 - sideT) * isoY * 0.5 + (-0.5 + sideT) * isoY * -0.5 - localHeight
          depth = 1 - sideT
          break
        case 2: // left-going (back)
          x = cx + (0.5 - sideT) * isoX + (-0.5) * isoX
          y = cy + (0.5 - sideT) * isoY * -0.5 + (-0.5) * isoY - localHeight
          depth = 1 - sideT
          break
        case 3: // down-going (left)
          x = cx + (-0.5) * isoX + (-0.5 + sideT) * isoX
          y = cy + (-0.5 + sideT) * isoY * -0.5 + (0.5 - sideT) * isoY * 0.5 - localHeight
          depth = sideT
          break
      }

      // The impossible trick: wrap height back to start
      // Total accumulated height is cancelled by the visual illusion
      y += baseHeight * 0.6

      return { x, y, depth }
    }

    let raf: number
    let frame = 0

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2
      const cy = H / 2 + 30
      const size = Math.min(W, H) * 0.7

      // Draw stair outline — trace the full path
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'

      // Draw step surfaces
      for (let i = 0; i < TOTAL_STEPS; i++) {
        const t1 = i / TOTAL_STEPS
        const t2 = (i + 1) / TOTAL_STEPS
        const p1 = getStairPoint(t1, cx, cy, size)
        const p2 = getStairPoint(t2, cx, cy, size)
        const side = Math.floor(t1 * 4) % 4

        const stepColor = CITRUS[side]

        // Step tread (top surface)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)

        // Step riser (vertical face) — offset down
        const riserH = size * 0.035
        ctx.lineTo(p2.x, p2.y + riserH)
        ctx.lineTo(p1.x, p1.y + riserH)
        ctx.closePath()

        ctx.fillStyle = stepColor
        ctx.globalAlpha = 0.25 + (i % STEPS_PER_SIDE) * 0.03
        ctx.fill()
        ctx.strokeStyle = stepColor
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Draw continuous path line
      ctx.beginPath()
      for (let i = 0; i <= 200; i++) {
        const t = i / 200
        const p = getStairPoint(t, cx, cy, size)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.closePath()
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Update and draw walkers
      for (const w of walkers) {
        w.pos += w.speed * dirRef.current
        if (w.pos > 1) w.pos -= 1
        if (w.pos < 0) w.pos += 1

        const p = getStairPoint(w.pos, cx, cy, size)

        // Shadow
        ctx.beginPath()
        ctx.ellipse(p.x, p.y + 12, w.size * 0.8, w.size * 0.3, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.1)'
        ctx.fill()

        // Body (simple circle figure)
        ctx.beginPath()
        ctx.arc(p.x, p.y - w.size, w.size, 0, Math.PI * 2)
        ctx.fillStyle = w.color
        ctx.globalAlpha = 0.85
        ctx.fill()

        // Head
        ctx.beginPath()
        ctx.arc(p.x, p.y - w.size * 2.3, w.size * 0.55, 0, Math.PI * 2)
        ctx.fillStyle = w.color
        ctx.fill()

        // Walking legs — simple oscillating lines
        const legPhase = w.pos * Math.PI * 20
        const legSpread = Math.sin(legPhase) * w.size * 0.5
        ctx.strokeStyle = w.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + legSpread, p.y + w.size * 0.8)
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - legSpread, p.y + w.size * 0.8)
        ctx.stroke()

        ctx.globalAlpha = 1
      }

      // Hint
      if (frame < 180) {
        ctx.globalAlpha = Math.max(0, 1 - frame / 180) * 0.3
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText('tap to reverse', W / 2, H - 35)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Tap to reverse direction
    const handleTap = () => {
      dirRef.current *= -1
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap()
    }, { passive: false })
    canvas.addEventListener('click', handleTap)

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
        cursor: 'pointer',
        touchAction: 'none',
      }}
    />
  )
}
