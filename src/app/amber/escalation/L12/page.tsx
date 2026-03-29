'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// L12: FIELD — tap to send a wave. multiple waves interfere.
// The field lives between pulses. A grid, breathing.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const SPACING = 28
const BASE_R = 4
const MAX_WAVES = 10

interface Wave {
  x: number
  y: number
  born: number
  color: string
  strength: number
}

export default function L12() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let w = (c.width = innerWidth)
    let h = (c.height = innerHeight)
    const [bg1, bg2] = pickGradientColors('L12-field')

    const waves: Wave[] = []
    let colorIdx = 0
    let frame = 0

    const addWave = (x: number, y: number, strength = 1) => {
      waves.push({
        x,
        y,
        born: frame,
        color: COLORS[colorIdx % COLORS.length],
        strength,
      })
      colorIdx++
      if (waves.length > MAX_WAVES) waves.shift()
    }

    // Seed two ambient waves to start
    addWave(w * 0.3, h * 0.45, 0.7)
    addWave(w * 0.68, h * 0.55, 0.7)

    c.addEventListener('pointerdown', (e) => addWave(e.clientX, e.clientY))
    addEventListener('resize', () => {
      w = c.width = innerWidth
      h = c.height = innerHeight
    })

    // Precompute grid offsets — stagger odd rows
    const draw = () => {
      frame++

      // Background
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, bg1)
      g.addColorStop(1, bg2)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      const cols = Math.ceil(w / SPACING) + 2
      const rows = Math.ceil(h / SPACING) + 2

      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          const ox = r % 2 === 0 ? 0 : SPACING * 0.5
          const px = col * SPACING + ox - SPACING
          const py = r * SPACING - SPACING

          let disp = 0
          let dominantColor = '#FC913A'
          let maxContrib = 0

          for (const wave of waves) {
            const age = frame - wave.born
            const dist = Math.hypot(px - wave.x, py - wave.y)
            const waveFront = age * 3.8
            const decay = Math.exp(-age * 0.006) * wave.strength
            const envelope = Math.exp(-((dist - waveFront) ** 2) / (2 * 75 * 75)) * decay
            const contrib = Math.sin(dist * 0.09 - age * 0.22) * envelope * 13

            disp += contrib
            if (Math.abs(contrib) > maxContrib) {
              maxContrib = Math.abs(contrib)
              dominantColor = wave.color
            }
          }

          // Ambient slow breathe
          const ambient = Math.sin(frame * 0.012 + (px + py) * 0.015) * 1.5
          disp += ambient

          const radius = Math.max(0.8, BASE_R + disp)
          const intensity = Math.min(Math.abs(disp) / 13, 1)
          const alpha = 0.25 + intensity * 0.65

          ctx.beginPath()
          ctx.arc(px, py, radius, 0, Math.PI * 2)
          ctx.fillStyle = intensity > 0.12 ? dominantColor : '#D4A574'
          ctx.globalAlpha = alpha
          ctx.fill()
        }
      }

      ctx.globalAlpha = 1
      requestAnimationFrame(draw)
    }

    draw()
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
    />
  )
}
