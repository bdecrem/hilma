'use client'

import { useEffect, useRef } from 'react'

// Aurora — five sinusoidal curtains of citrus light dancing against the night sky
// Blood orange, tangerine, mango, lime, grapefruit — each band a different wave
// Tap anywhere to send a ripple through the curtains

type Band = {
  color: [number, number, number]
  freq: number
  speed: number
  phase: number
  amp: number
  y: number
  bh: number
}

const BANDS: Band[] = [
  { color: [255,  78,  80], freq: 1.8, speed: 0.22, phase: 0.00, amp: 0.055, y: 0.18, bh: 0.080 },
  { color: [252, 145,  58], freq: 2.4, speed: 0.31, phase: 1.30, amp: 0.042, y: 0.32, bh: 0.070 },
  { color: [249, 212,  35], freq: 1.5, speed: 0.18, phase: 2.70, amp: 0.060, y: 0.46, bh: 0.075 },
  { color: [180, 227,  61], freq: 2.7, speed: 0.27, phase: 0.90, amp: 0.045, y: 0.61, bh: 0.068 },
  { color: [255, 107, 129], freq: 2.0, speed: 0.35, phase: 4.10, amp: 0.050, y: 0.75, bh: 0.080 },
]

type Star  = { x: number; y: number; r: number; tw: number }
type Pulse = { xf: number; yf: number; born: number }

export default function AuroraPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef  = useRef<Star[]>([])
  const pulsesRef = useRef<Pulse[]>([])
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      canvas.width  = window.innerWidth  * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width  = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    // Generate stars once
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 280; i++) {
        starsRef.current.push({
          x:  Math.random(),
          y:  Math.random() * 0.52,
          r:  0.25 + Math.random() * 0.9,
          tw: Math.random() * Math.PI * 2,
        })
      }
    }

    const N_SEGS = 220

    // Compute the y-position of a band at a given x fraction and time
    const getY = (b: Band, xf: number, t: number): number => {
      let y = b.y
      // Primary wave
      y += b.amp * Math.sin(xf * b.freq * Math.PI * 2 + t * b.speed + b.phase)
      // Secondary harmonic for organic undulation
      y += b.amp * 0.32 * Math.sin(xf * b.freq * 2.9 * Math.PI + t * b.speed * 1.7 + b.phase * 0.8)
      // Fine micro-ripple
      y += b.amp * 0.15 * Math.sin(xf * 9 * Math.PI + t * 0.1 + b.phase * 1.1)

      // Pulse disturbances (tap ripples)
      for (const p of pulsesRef.current) {
        const age = t - p.born
        if (age <= 0 || age > 3.5) continue
        const dx = xf - p.xf
        const dy = b.y - p.yf
        const d  = Math.sqrt(dx * dx + dy * dy)
        const radius = age * 0.35
        const dr = Math.abs(d - radius)
        if (dr < 0.14) {
          const fade = (1 - age / 3.5) * Math.exp(-dr * dr * 70)
          y += 0.028 * Math.sin(age * 7) * fade
        }
      }
      return y
    }

    const render = () => {
      const t = performance.now() / 1000
      const W = canvas.width
      const H = canvas.height

      // Warm near-black sky background
      ctx.globalCompositeOperation = 'source-over'
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0,   '#060402')
      bg.addColorStop(0.6, '#0b0605')
      bg.addColorStop(1,   '#140a06')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Twinkling stars
      for (const s of starsRef.current) {
        const a = 0.15 + 0.15 * Math.sin(t * 0.5 + s.tw)
        ctx.beginPath()
        ctx.arc(s.x * W, s.y * H, s.r * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,245,220,${a})`
        ctx.fill()
      }

      // Aurora bands — additive blending creates natural glow
      ctx.globalCompositeOperation = 'lighter'

      for (const b of BANDS) {
        const [r, g, bl] = b.color
        const bH = b.bh * H

        // Four passes: wide dim corona → tight bright core
        const passes = [
          { lw: bH * 3.0, a: 0.055 },
          { lw: bH * 1.7, a: 0.12  },
          { lw: bH * 0.85, a: 0.27 },
          { lw: bH * 0.32, a: 0.58 },
        ]

        for (const pass of passes) {
          ctx.beginPath()
          for (let i = 0; i <= N_SEGS; i++) {
            const xf = i / N_SEGS
            const x  = xf * W
            const y  = getY(b, xf, t) * H
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          }
          ctx.strokeStyle = `rgba(${r},${g},${bl},${pass.a})`
          ctx.lineWidth   = pass.lw
          ctx.lineCap     = 'butt'
          ctx.lineJoin    = 'round'
          ctx.stroke()
        }
      }

      // Amber legacy mark
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath()
      ctx.arc(W - 15 * dpr, H - 15 * dpr, 2.5 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(212,165,116,0.5)'
      ctx.fill()

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const handlePointer = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    pulsesRef.current.push({
      xf:   e.clientX / canvas.clientWidth,
      yf:   e.clientY / canvas.clientHeight,
      born: performance.now() / 1000,
    })
    if (pulsesRef.current.length > 6) pulsesRef.current.shift()
  }

  return (
    <div
      style={{
        width:    '100%',
        height:   '100dvh',
        overflow: 'hidden',
        background: '#060402',
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointer}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
      />
    </div>
  )
}
