'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const TRAIL_MAX = 800
const SPEED = 0.006

interface Arm {
  radius: number
  freq: number
  phase: number
  color: string
}

export default function L24() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    const [bg1, bg2] = pickGradientColors('L24')

    // Initial arms — first five odd harmonics (draws a square wave approximation)
    const arms: Arm[] = [
      { radius: 90,  freq: 1,  phase: -Math.PI / 2, color: '#FF4E50' },
      { radius: 30,  freq: 3,  phase: -Math.PI / 2, color: '#FC913A' },
      { radius: 18,  freq: 5,  phase: -Math.PI / 2, color: '#F9D423' },
      { radius: 13,  freq: 7,  phase: -Math.PI / 2, color: '#B4E33D' },
      { radius: 10,  freq: 9,  phase: -Math.PI / 2, color: '#FF6B81' },
    ]

    const trail: { x: number; y: number }[] = []
    let t = 0
    let raf: number
    let hintAlpha = 1

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2
      const cy = H / 2

      // Compute arm chain positions
      let px = cx, py = cy
      const positions: { x: number; y: number }[] = [{ x: cx, y: cy }]
      for (const arm of arms) {
        const angle = arm.freq * t * Math.PI * 2 + arm.phase
        px += arm.radius * Math.cos(angle)
        py += arm.radius * Math.sin(angle)
        positions.push({ x: px, y: py })
      }

      // Accumulate trail
      trail.push({ x: px, y: py })
      if (trail.length > TRAIL_MAX) trail.shift()

      // Draw trail — 5 alpha bands for performance
      if (trail.length > 2) {
        const bands = 5
        const step = Math.ceil(trail.length / bands)
        for (let b = 0; b < bands; b++) {
          const start = b * step
          const end = Math.min((b + 1) * step + 1, trail.length)
          const alpha = 0.15 + (b / bands) * 0.75
          ctx.beginPath()
          ctx.moveTo(trail[start].x, trail[start].y)
          for (let i = start + 1; i < end; i++) {
            ctx.lineTo(trail[i].x, trail[i].y)
          }
          ctx.strokeStyle = `rgba(252, 145, 58, ${alpha})`
          ctx.lineWidth = 1 + (b / bands) * 1.5
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.stroke()
        }
      }

      // Draw arm circles and lines
      for (let i = 0; i < arms.length; i++) {
        const from = positions[i]
        const to = positions[i + 1]
        const arm = arms[i]

        // Orbit ring
        ctx.beginPath()
        ctx.arc(from.x, from.y, arm.radius, 0, Math.PI * 2)
        ctx.strokeStyle = arm.color
        ctx.globalAlpha = 0.1
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = 1

        // Arm spoke
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.strokeStyle = arm.color
        ctx.globalAlpha = 0.65
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.globalAlpha = 1

        // Pivot
        ctx.beginPath()
        ctx.arc(from.x, from.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = arm.color
        ctx.globalAlpha = 0.45
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Tip glow
      const grd = ctx.createRadialGradient(px, py, 0, px, py, 22)
      grd.addColorStop(0, 'rgba(255,78,80,0.5)')
      grd.addColorStop(1, 'rgba(255,78,80,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(px, py, 22, 0, Math.PI * 2)
      ctx.fill()

      // Tip dot
      ctx.beginPath()
      ctx.arc(px, py, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#FF4E50'
      ctx.fill()

      // Hint
      if (hintAlpha > 0) {
        ctx.globalAlpha = hintAlpha
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,248,231,0.8)'
        ctx.fillText('tap to add a harmonic  ·  double-tap to clear', W / 2, H - 30)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
        if (t > 1) hintAlpha = Math.max(0, hintAlpha - 0.01)
      }

      t += SPEED
      raf = requestAnimationFrame(draw)
    }

    // Double-tap detection
    let lastTap = 0

    const onPointerDown = (x: number, y: number) => {
      const now = Date.now()
      if (now - lastTap < 350) {
        // Double-tap: clear trail
        trail.length = 0
        lastTap = 0
        return
      }
      lastTap = now

      // Add next odd harmonic
      const usedFreqs = new Set(arms.map(a => a.freq))
      let nextFreq = 1
      while (usedFreqs.has(nextFreq)) nextFreq += 2
      // After the series gets long, use random harmonics
      const freq = nextFreq <= 25 ? nextFreq : Math.floor(Math.random() * 20) + 2
      const radius = Math.max(4, 90 / (freq * 0.7))
      arms.push({
        radius,
        freq,
        phase: -Math.PI / 2,
        color: CITRUS[arms.length % CITRUS.length],
      })
      hintAlpha = 0
    }

    canvas.addEventListener('click', (e) => onPointerDown(e.clientX, e.clientY))
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      if (e.changedTouches.length > 0) {
        onPointerDown(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
      }
    }, { passive: false })

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
