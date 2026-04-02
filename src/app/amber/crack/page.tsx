'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'
const [BG1, BG2] = pickGradientColors('crack')

interface Walker {
  x: number
  y: number
  angle: number
  speed: number
  life: number
  maxLife: number
  color: string
  width: number
  alpha: number
}

export default function CrackPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = 0, H = 0
    const walkers: Walker[] = []
    let raf = 0
    let frameCount = 0

    function drawBg() {
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, BG1)
      grad.addColorStop(1, BG2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      // Amber watermark (drawn once, persists)
      ctx.save()
      ctx.font = '12px monospace'
      ctx.fillStyle = AMBER
      ctx.globalAlpha = 0.4
      ctx.fillText('amber', W - 60, H - 16)
      ctx.restore()
    }

    function spawn(x: number, y: number, angle: number, width = 1.5, maxLife = 80 + Math.random() * 140, alpha = 1.0) {
      walkers.push({
        x, y,
        angle: angle + (Math.random() - 0.5) * 0.3,
        speed: 1.8 + Math.random() * 1.8,
        life: 0,
        maxLife,
        color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
        width,
        alpha,
      })
    }

    function spawnFromEdge() {
      const side = Math.floor(Math.random() * 4)
      if (side === 0) spawn(Math.random() * W, 0, Math.PI / 2 + (Math.random() - 0.5) * 0.9)
      else if (side === 1) spawn(W, Math.random() * H, Math.PI + (Math.random() - 0.5) * 0.9)
      else if (side === 2) spawn(Math.random() * W, H, -Math.PI / 2 + (Math.random() - 0.5) * 0.9)
      else spawn(0, Math.random() * H, (Math.random() - 0.5) * 0.9)
    }

    function init() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
      walkers.length = 0
      drawBg()
      // Seed 6 initial cracks from random edges
      for (let i = 0; i < 6; i++) spawnFromEdge()
    }

    function animate() {
      frameCount++

      // Spawn new edge crack periodically
      if (frameCount % 80 === 0 && walkers.length < 80) spawnFromEdge()

      const toAdd: Walker[] = []

      ctx.save()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i]
        const steps = 4

        for (let s = 0; s < steps; s++) {
          if (w.life >= w.maxLife) break
          const px = w.x
          const py = w.y

          // Slight angle wobble
          w.angle += (Math.random() - 0.5) * 0.18
          w.x += Math.cos(w.angle) * w.speed
          w.y += Math.sin(w.angle) * w.speed
          w.life++

          const progress = w.life / w.maxLife
          const fade = 1 - progress * 0.4

          // Glowing crack: colored glow + white core
          ctx.shadowBlur = 6
          ctx.shadowColor = w.color

          // Colored glow line
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(w.x, w.y)
          ctx.strokeStyle = w.color
          ctx.lineWidth = w.width + 1.5
          ctx.globalAlpha = w.alpha * 0.35 * fade
          ctx.stroke()

          // White hot core
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(w.x, w.y)
          ctx.strokeStyle = '#FFFEF5'
          ctx.lineWidth = w.width * 0.5
          ctx.globalAlpha = w.alpha * 0.9 * fade
          ctx.stroke()

          ctx.shadowBlur = 0

          // Fork chance: higher probability in first 30% of life, lower later
          const forkChance = progress < 0.3 ? 0.006 : 0.002
          if (walkers.length + toAdd.length < 100 && Math.random() < forkChance) {
            const dir = Math.random() > 0.5 ? 1 : -1
            const forkAngle = w.angle + dir * (0.4 + Math.random() * 0.6)
            toAdd.push({
              x: w.x,
              y: w.y,
              angle: forkAngle,
              speed: w.speed * 0.75,
              life: 0,
              maxLife: w.maxLife * (0.4 + Math.random() * 0.4),
              color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
              width: w.width * 0.55,
              alpha: w.alpha * 0.8,
            })
          }
        }

        // Remove dead or off-screen walkers
        if (w.life >= w.maxLife || w.x < -60 || w.x > W + 60 || w.y < -60 || w.y > H + 60) {
          walkers.splice(i, 1)
        }
      }

      ctx.restore()

      for (const w of toAdd) walkers.push(w)

      raf = requestAnimationFrame(animate)
    }

    const onTap = (e: PointerEvent) => {
      // Burst of cracks from tap point
      const count = 5 + Math.floor(Math.random() * 4)
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
        spawn(e.clientX, e.clientY, angle, 1.8, 60 + Math.random() * 100, 1.0)
      }
    }

    const onResize = () => {
      cancelAnimationFrame(raf)
      init()
      raf = requestAnimationFrame(animate)
    }

    init()
    raf = requestAnimationFrame(animate)
    canvas.addEventListener('pointerdown', onTap)
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onTap)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
