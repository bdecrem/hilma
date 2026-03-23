'use client'

import { useEffect, useRef } from 'react'

// L5: COLOR + CLICK — shapes multiply, the palette wakes up.
// First citrus palette. First interaction. Tap to birth new shapes.

const CITRUS = ['#FF6B6B', '#FFA62B', '#A8E6CF', '#FFE66D']
const BG = '#2D1B69'
const FLASH = '#FFFFFF'
const LEGACY = '#D4A574' // appears once

interface Shape {
  type: 'circle' | 'line' | 'triangle'
  x: number; y: number
  orbitR: number
  orbitSpeed: number
  orbitPhase: number
  size: number
  color: string
  breath: number
  rotation: number
  rotSpeed: number
}

export default function L5() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const shapes: Shape[] = []
    let flashAlpha = 0
    let flashX = 0, flashY = 0

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const types: ('circle' | 'line' | 'triangle')[] = ['circle', 'line', 'triangle']

    const addShape = (x: number, y: number) => {
      const idx = shapes.length
      shapes.push({
        type: types[idx % 3],
        x, y,
        orbitR: 30 + Math.random() * Math.min(w, h) * 0.15,
        orbitSpeed: 0.003 + Math.random() * 0.005,
        orbitPhase: Math.random() * Math.PI * 2,
        size: Math.min(w, h) * (0.012 + Math.random() * 0.012),
        color: idx === 0 ? LEGACY : CITRUS[idx % CITRUS.length],
        breath: Math.random() * Math.PI * 2,
        rotation: 0,
        rotSpeed: 0.005 + Math.random() * 0.01,
      })
    }

    // Seed initial 3
    const cx = w / 2, cy = h / 2
    addShape(cx, cy)
    addShape(cx, cy)
    addShape(cx, cy)

    // Click to add + flash
    const onClick = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect()
      const px = ex - rect.left, py = ey - rect.top
      addShape(px, py)
      flashAlpha = 1
      flashX = px; flashY = py
      // Cap at 20
      if (shapes.length > 20) shapes.shift()
    }

    canvas.addEventListener('click', (e) => onClick(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onClick(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })

    const drawShape = (s: Shape, sx: number, sy: number) => {
      const breathScale = 0.85 + Math.sin(s.breath + t * 0.02) * 0.15
      const r = s.size * breathScale

      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(s.rotation + t * s.rotSpeed)

      if (s.type === 'circle') {
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.fill()
      } else if (s.type === 'line') {
        ctx.beginPath()
        ctx.moveTo(-r * 1.2, 0)
        ctx.lineTo(r * 1.2, 0)
        ctx.strokeStyle = s.color
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(0, -r)
        ctx.lineTo(-r * 0.7, r * 0.6)
        ctx.lineTo(r * 0.7, r * 0.6)
        ctx.closePath()
        ctx.fillStyle = s.color
        ctx.fill()
      }

      ctx.restore()
    }

    const tick = () => {
      t++

      // Slow fade for trails
      ctx.fillStyle = `rgba(45, 27, 105, 0.04)`
      ctx.fillRect(0, 0, w, h)

      // Flash decay
      if (flashAlpha > 0) {
        const glow = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, 60)
        glow.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha * 0.6})`)
        glow.addColorStop(1, `rgba(255, 255, 255, 0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(flashX, flashY, 60, 0, Math.PI * 2)
        ctx.fill()
        flashAlpha *= 0.92
        if (flashAlpha < 0.01) flashAlpha = 0
      }

      // Draw shapes orbiting their birth point
      for (const s of shapes) {
        const ox = s.x + Math.cos(t * s.orbitSpeed + s.orbitPhase) * s.orbitR
        const oy = s.y + Math.sin(t * s.orbitSpeed + s.orbitPhase) * s.orbitR * 0.6
        drawShape(s, ox, oy)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
