'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'
const [BG1, BG2] = pickGradientColors('signal')

// Interesting Lissajous ratios — each gives a distinct knot shape
const RATIOS: [number, number][] = [
  [3, 2], [5, 4], [4, 3], [5, 3], [2, 1],
  [5, 2], [4, 1], [3, 1], [7, 5], [6, 5],
]

function hex2(n: number): string {
  return Math.round(Math.max(0, Math.min(1, n)) * 255)
    .toString(16)
    .padStart(2, '0')
}

export default function SignalPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight
    let cx = W / 2
    let cy = H / 2
    let radius = Math.min(W, H) * 0.41

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width = '100vw'
      canvas!.style.height = '100dvh'
      ctx!.scale(dpr, dpr)
      cx = W / 2
      cy = H / 2
      radius = Math.min(W, H) * 0.41
    }
    resize()

    let fA = 3, fB = 2
    let tA = 3, tB = 2
    let delta = 0
    let morphT = 0
    let colorOff = 0
    let rIdx = 0
    let dragSpeed = 0

    function drawBg() {
      const g = ctx!.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, BG1)
      g.addColorStop(1, BG2)
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, W, H)
    }

    // Draw one complete Lissajous figure as a single path
    function figure(d: number, color: string, alpha: number, lw: number) {
      // 4π covers 2 full periods — enough to show the complete knot
      const T = Math.PI * 4
      const N = 1000
      ctx!.beginPath()
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * T
        const x = cx + radius * Math.sin(fA * t + d)
        const y = cy + radius * Math.sin(fB * t)
        i === 0 ? ctx!.moveTo(x, y) : ctx!.lineTo(x, y)
      }
      ctx!.strokeStyle = color + hex2(alpha)
      ctx!.lineWidth = lw
      ctx!.lineCap = 'round'
      ctx!.lineJoin = 'round'
      ctx!.stroke()
    }

    let raf: number

    function tick() {
      // Smooth lerp toward target ratio
      fA += (tA - fA) * 0.005
      fB += (tB - fB) * 0.005

      // Phase advances — drag speed adjusts it
      delta += 0.020 + dragSpeed * 0.06
      dragSpeed *= 0.92

      // Cycle to next ratio every ~6 seconds
      morphT++
      if (morphT > 360) {
        morphT = 0
        colorOff++
        rIdx = (rIdx + 1) % RATIOS.length
        tA = RATIOS[rIdx][0]
        tB = RATIOS[rIdx][1]
      }

      drawBg()

      // 3 overlapping curves at different phase offsets — creates moiré depth
      const layers = [
        { off: 0,                  alpha: 0.78, lw: 2.4 },
        { off: Math.PI / 6,        alpha: 0.50, lw: 1.7 },
        { off: Math.PI / 3,        alpha: 0.30, lw: 1.1 },
      ]

      // Glow pass
      ctx!.shadowBlur = 10
      for (let i = 0; i < layers.length; i++) {
        const c = CITRUS[(colorOff + i) % CITRUS.length]
        ctx!.shadowColor = c
        figure(delta + layers[i].off, c, layers[i].alpha * 0.6, layers[i].lw + 1.2)
      }
      ctx!.shadowBlur = 0

      // Sharp pass
      for (let i = 0; i < layers.length; i++) {
        const c = CITRUS[(colorOff + i) % CITRUS.length]
        figure(delta + layers[i].off, c, layers[i].alpha, layers[i].lw)
      }

      // Ratio label — subtle amber watermark
      const rA = Math.round(fA * 10) / 10
      const rB = Math.round(fB * 10) / 10
      ctx!.font = '12px monospace'
      ctx!.fillStyle = AMBER + '77'
      ctx!.fillText(`${rA}:${rB}`, 18, H - 16)

      raf = requestAnimationFrame(tick)
    }

    tick()

    // Drag shifts phase speed — changes the figure's rotation feel
    let lastX = 0
    function onMove(x: number) {
      dragSpeed = (x - lastX) / W * 3
      lastX = x
    }

    // Tap forces next ratio immediately
    function onTap() {
      morphT = 400
    }

    canvas.addEventListener('pointerdown', (e) => { lastX = e.clientX })
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) onMove(e.clientX)
    })
    canvas.addEventListener('click', onTap)

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      lastX = e.touches[0].clientX
    }, { passive: false })
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      onMove(e.touches[0].clientX)
    }, { passive: false })

    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf)
      resize()
      raf = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(raf)
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
