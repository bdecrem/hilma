'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81'] as const

interface Params { a: number; b: number; c: number; d: number; name: string }

// Clifford attractor: x₁ = sin(a·y) + c·cos(a·x),  y₁ = sin(b·x) + d·cos(b·y)
const PRESETS: Params[] = [
  { a: -1.4,  b:  1.6,  c:  1.0,  d:  0.7,  name: 'crescent'   },
  { a:  1.7,  b:  1.7,  c:  0.6,  d:  1.2,  name: 'bloom'       },
  { a: -1.7,  b:  1.3,  c: -0.1,  d: -1.21, name: 'cascade'     },
  { a: -1.3,  b: -1.3,  c: -1.8,  d: -1.9,  name: 'lattice'     },
  { a: -1.9,  b: -1.6,  c: -0.2,  d: -1.5,  name: 'tendril'     },
  { a:  0.8,  b: -1.2,  c: -1.5,  d:  0.8,  name: 'vortex'      },
  { a:  1.2,  b: -1.0,  c:  0.4,  d:  0.9,  name: 'corona'      },
]

function computePoints(p: Params, count: number, W: number, H: number) {
  let x = 0.1, y = 0.1
  // Warm-up: let the orbit settle
  for (let i = 0; i < 500; i++) {
    const nx = Math.sin(p.a * y) + p.c * Math.cos(p.a * x)
    const ny = Math.sin(p.b * x) + p.d * Math.cos(p.b * y)
    x = nx; y = ny
  }
  // Collect and find bounds
  const xs = new Float32Array(count)
  const ys = new Float32Array(count)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < count; i++) {
    const nx = Math.sin(p.a * y) + p.c * Math.cos(p.a * x)
    const ny = Math.sin(p.b * x) + p.d * Math.cos(p.b * y)
    x = nx; y = ny
    xs[i] = x; ys[i] = y
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  // Map to screen with padding
  const pad = 0.09
  const rngX = maxX - minX || 0.001
  const rngY = maxY - minY || 0.001
  const s = Math.min(W * (1 - pad * 2) / rngX, H * (1 - pad * 2) / rngY)
  const oX = (W - rngX * s) / 2 - minX * s
  const oY = (H - rngY * s) / 2 - minY * s
  const sxs = new Float32Array(count)
  const sys = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    sxs[i] = xs[i] * s + oX
    sys[i] = ys[i] * s + oY
  }
  return { sxs, sys }
}

export default function L26() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    const setSize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    setSize()

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const [bg1, bg2] = pickGradientColors('L26')

    // Offscreen accumulation canvas
    const off = document.createElement('canvas')
    off.width = W * dpr; off.height = H * dpr
    const offCtx = off.getContext('2d')!
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const TOTAL = 320000
    const BATCH = 7000 // points drawn per frame during emergence

    let presetIdx = 0
    let pts: { sxs: Float32Array; sys: Float32Array } | null = null
    let drawn = 0
    let raf: number
    let hintAlpha = 1.0
    let hintFadeStart = 7 // seconds before hint fades
    let elapsed = 0
    let lastTs = 0
    let nameFade = 1.0

    const drawBg = (c: CanvasRenderingContext2D) => {
      const g = c.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, bg1)
      g.addColorStop(1, bg2)
      c.fillStyle = g
      c.fillRect(0, 0, W, H)
    }

    const startNew = () => {
      pts = computePoints(PRESETS[presetIdx], TOTAL, W, H)
      drawn = 0
      nameFade = 1.0
      offCtx.clearRect(0, 0, W * dpr, H * dpr)
      drawBg(offCtx)
    }

    startNew()

    const frame = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts
      elapsed += dt
      if (elapsed > hintFadeStart) hintAlpha = Math.max(0, hintAlpha - dt * 0.4)
      if (nameFade > 0) nameFade = Math.max(0, nameFade - dt * 0.25)

      if (pts && drawn < TOTAL) {
        const end = Math.min(drawn + BATCH, TOTAL)

        // Batch draw by color segment
        const segSize = Math.ceil(TOTAL / CITRUS.length)
        const byColor: number[][] = CITRUS.map(() => [])

        for (let i = drawn; i < end; i++) {
          const ci = Math.min(Math.floor(i / segSize), CITRUS.length - 1)
          byColor[ci].push(i)
        }

        offCtx.globalAlpha = 0.045
        for (let ci = 0; ci < CITRUS.length; ci++) {
          const idxs = byColor[ci]
          if (!idxs.length) continue
          offCtx.fillStyle = CITRUS[ci]
          offCtx.beginPath()
          for (const i of idxs) {
            offCtx.rect(pts.sxs[i] - 0.6, pts.sys[i] - 0.6, 1.4, 1.4)
          }
          offCtx.fill()
        }
        offCtx.globalAlpha = 1
        drawn = end
      }

      // Composite
      ctx.drawImage(off, 0, 0, W, H)

      // Progress bar while drawing
      if (pts && drawn < TOTAL) {
        const prog = drawn / TOTAL
        ctx.globalAlpha = 0.3
        ctx.fillStyle = CITRUS[presetIdx % CITRUS.length]
        ctx.fillRect(0, H - 3, W * prog, 2)
        ctx.globalAlpha = 1
      }

      // Attractor name — fades in, then lingers
      const nameLabel = PRESETS[presetIdx].name
      const showName = 1 - nameFade  // 0→hidden, 1→visible
      if (showName > 0.05) {
        ctx.globalAlpha = Math.min(showName, 0.28)
        ctx.textAlign = 'right'
        ctx.font = '12px monospace'
        ctx.fillStyle = '#2D5A27'
        ctx.fillText(nameLabel, W - 22, H - 22)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Hint
      if (hintAlpha > 0.01) {
        ctx.globalAlpha = hintAlpha * 0.38
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = '#2D5A27'
        ctx.fillText('tap to change the rule', W / 2, H - 28)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(frame)
    }

    const handleTap = () => {
      presetIdx = (presetIdx + 1) % PRESETS.length
      hintAlpha = 0 // hint already understood
      startNew()
    }

    canvas.addEventListener('click', handleTap)
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault(); handleTap()
    }, { passive: false })

    raf = requestAnimationFrame(frame)

    const handleResize = () => {
      setSize()
      off.width = W * dpr; off.height = H * dpr
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      startNew()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
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
