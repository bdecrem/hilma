'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const COUNT = 15
// Each pendulum completes N+51 oscillations in 60 seconds
// So they all re-sync after 60s
const BASE_FREQ = 51
const CYCLE_TIME = 60 // seconds for full resync

export default function L25() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef(0)
  const trailRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const trail = document.createElement('canvas')
    trailRef.current = trail
    const tctx = trail.getContext('2d')!

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      trail.width = W * dpr
      trail.height = H * dpr
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L25')
    let raf: number
    startRef.current = Date.now()

    const draw = () => {
      const elapsed = (Date.now() - startRef.current) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Fade trail layer
      tctx.globalAlpha = 0.008
      tctx.fillStyle = bg1
      tctx.fillRect(0, 0, W, H)
      tctx.globalAlpha = 1

      // Draw trail layer
      ctx.drawImage(trail, 0, 0, W, H)

      // Layout
      const pivotY = H * 0.1
      const spacing = W / (COUNT + 1)
      const maxLen = H * 0.55

      // Draw pivot bar
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(spacing * 0.5, pivotY)
      ctx.lineTo(W - spacing * 0.5, pivotY)
      ctx.stroke()

      for (let i = 0; i < COUNT; i++) {
        const freq = BASE_FREQ + i // oscillations per cycle
        const period = CYCLE_TIME / freq
        const angle = Math.sin(2 * Math.PI * elapsed / period) * 0.8 // max angle ~45 deg

        const px = spacing * (i + 1)
        // Length increases with index
        const len = maxLen * (0.6 + (i / COUNT) * 0.4)

        const bobX = px + Math.sin(angle) * len
        const bobY = pivotY + Math.cos(angle) * len

        const color = CITRUS[i % CITRUS.length]

        // String
        ctx.beginPath()
        ctx.moveTo(px, pivotY)
        ctx.lineTo(bobX, bobY)
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.globalAlpha = 1

        // Bob
        const bobR = 6 + (i / COUNT) * 4
        ctx.beginPath()
        ctx.arc(bobX, bobY, bobR, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.85
        ctx.fill()

        // Glow
        ctx.beginPath()
        ctx.arc(bobX, bobY, bobR * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.08
        ctx.fill()
        ctx.globalAlpha = 1

        // Pivot point
        ctx.beginPath()
        ctx.arc(px, pivotY, 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fill()

        // Trail dot
        tctx.beginPath()
        tctx.arc(bobX, bobY, 2, 0, Math.PI * 2)
        tctx.fillStyle = color
        tctx.globalAlpha = 0.15
        tctx.fill()
        tctx.globalAlpha = 1
      }

      // Time indicator
      const cycleProgress = (elapsed % CYCLE_TIME) / CYCLE_TIME
      ctx.globalAlpha = 0.2
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(20, H - 8, (W - 40) * cycleProgress, 2)
      ctx.globalAlpha = 1

      // Hint
      if (elapsed < 8) {
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 8) * 0.3
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText('tap to restart. watch them drift and re-sync.', W / 2, H - 25)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Tap to restart from sync
    const handleTap = () => {
      startRef.current = Date.now()
      // Clear trail
      tctx.clearRect(0, 0, W * dpr, H * dpr)
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
