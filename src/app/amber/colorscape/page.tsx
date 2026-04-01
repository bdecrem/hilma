'use client'

import { useEffect, useRef } from 'react'

const PALETTE = [
  '#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81',
  '#FF7043', '#FFCA28', '#8BC34A', '#FF8A80', '#FFD54F',
  '#E040FB', '#FF6E40', '#EEFF41', '#69F0AE', '#FF80AB',
]

interface Splash {
  x: number; y: number
  vx: number; vy: number
  size: number
  maxSize: number
  color: string
  opacity: number
  // Irregular blob shape — offsets from circle
  bumps: number[]
  rotation: number
  rotSpeed: number
  drips: Drip[]
  age: number
  growing: boolean
}

interface Drip {
  x: number; y: number
  vy: number
  vx: number
  size: number
  color: string
  opacity: number
}

function randomSplash(x: number, y: number, burst?: boolean): Splash {
  const angle = Math.random() * Math.PI * 2
  const force = burst ? 2 + Math.random() * 5 : 0.2 + Math.random() * 0.5
  // 8-16 bumps for irregular blob edge
  const bumpCount = 8 + Math.floor(Math.random() * 8)
  const bumps: number[] = []
  for (let i = 0; i < bumpCount; i++) {
    bumps.push(0.6 + Math.random() * 0.8) // radius multiplier per vertex
  }

  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
  const maxSize = 30 + Math.random() * 140

  // Spawn drips
  const drips: Drip[] = []
  const dripCount = 2 + Math.floor(Math.random() * 5)
  for (let i = 0; i < dripCount; i++) {
    const da = Math.random() * Math.PI * 2
    const df = 1 + Math.random() * 3
    drips.push({
      x, y,
      vx: Math.cos(da) * df + (Math.random() - 0.5),
      vy: Math.sin(da) * df + Math.random() * 2,
      size: 3 + Math.random() * 8,
      color,
      opacity: 0.4 + Math.random() * 0.4,
    })
  }

  return {
    x, y,
    vx: Math.cos(angle) * force,
    vy: Math.sin(angle) * force,
    size: 0,
    maxSize,
    color,
    opacity: 0.3 + Math.random() * 0.5,
    bumps,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.003,
    drips,
    age: 0,
    growing: true,
  }
}

function drawBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bumps: number[], rot: number) {
  const n = bumps.length
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const idx = i % n
    const nextIdx = (i + 1) % n
    const angle = (idx / n) * Math.PI * 2 + rot
    const nextAngle = (nextIdx / n) * Math.PI * 2 + rot
    const r1 = r * bumps[idx]
    const r2 = r * bumps[nextIdx]
    const px = x + Math.cos(angle) * r1
    const py = y + Math.sin(angle) * r1

    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      // Smooth curve between points
      const midAngle = (angle + nextAngle) / 2
      const midR = (r1 + r2) / 2
      const cpx = x + Math.cos(midAngle) * midR * 1.1
      const cpy = y + Math.sin(midAngle) * midR * 1.1
      ctx.quadraticCurveTo(cpx, cpy, px, py)
    }
  }
  ctx.closePath()
}

export default function Colorscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const splashesRef = useRef<Splash[]>([])
  const persistRef = useRef<HTMLCanvasElement | null>(null)
  const bgPhaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    // Persistent paint layer
    const persist = document.createElement('canvas')
    persistRef.current = persist
    const pctx = persist.getContext('2d')!

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      persist.width = W * dpr
      persist.height = H * dpr
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    let raf: number
    let autoTimer = 0

    // Seed some initial splashes
    for (let i = 0; i < 12; i++) {
      const s = randomSplash(
        W * 0.15 + Math.random() * W * 0.7,
        H * 0.15 + Math.random() * H * 0.7
      )
      s.size = s.maxSize
      s.growing = false
      splashesRef.current.push(s)
      // Paint initial splashes to persist layer
      pctx.globalCompositeOperation = Math.random() < 0.5 ? 'source-over' : 'multiply'
      pctx.globalAlpha = s.opacity * 0.8
      pctx.fillStyle = s.color
      drawBlob(pctx, s.x, s.y, s.maxSize / 2, s.bumps, s.rotation)
      pctx.fill()
      pctx.globalAlpha = 1
      pctx.globalCompositeOperation = 'source-over'
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Warm shifting background
      bgPhaseRef.current += 0.003
      const p = bgPhaseRef.current
      const r = 255
      const g = Math.floor(240 + Math.sin(p) * 12)
      const b = Math.floor(215 + Math.sin(p * 0.7 + 1) * 20)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(0, 0, W, H)

      // Draw persist layer
      ctx.drawImage(persist, 0, 0, W, H)

      // Auto-spawn splashes
      autoTimer++
      if (autoTimer > 80) {
        autoTimer = 0
        const s = randomSplash(
          W * 0.1 + Math.random() * W * 0.8,
          H * 0.1 + Math.random() * H * 0.8
        )
        splashesRef.current.push(s)
      }

      // Update splashes
      const splashes = splashesRef.current
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]
        s.age++

        // Grow
        if (s.growing) {
          s.size += (s.maxSize - s.size) * 0.08
          if (s.size > s.maxSize * 0.95) {
            s.growing = false
            // Stamp onto persist layer
            pctx.globalCompositeOperation = Math.random() < 0.4 ? 'multiply' : 'source-over'
            pctx.globalAlpha = s.opacity * 0.6
            pctx.fillStyle = s.color
            drawBlob(pctx, s.x, s.y, s.size / 2, s.bumps, s.rotation)
            pctx.fill()
            pctx.globalAlpha = 1
            pctx.globalCompositeOperation = 'source-over'
          }
        }

        // Move (slight)
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.98
        s.vy *= 0.98
        s.rotation += s.rotSpeed

        // Draw active splash (while growing)
        if (s.growing) {
          ctx.globalCompositeOperation = 'multiply'
          ctx.globalAlpha = s.opacity
          ctx.fillStyle = s.color
          drawBlob(ctx, s.x, s.y, s.size / 2, s.bumps, s.rotation)
          ctx.fill()
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
        }

        // Drips
        for (const d of s.drips) {
          d.x += d.vx
          d.y += d.vy
          d.vy += 0.05 // gravity
          d.vx *= 0.99
          d.opacity -= 0.003
          d.size *= 0.998

          if (d.opacity > 0.01) {
            ctx.beginPath()
            ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
            ctx.fillStyle = d.color
            ctx.globalAlpha = d.opacity
            ctx.fill()
            ctx.globalAlpha = 1

            // Drips leave marks on persist layer
            if (s.age % 3 === 0) {
              pctx.beginPath()
              pctx.arc(d.x, d.y, d.size * 0.6, 0, Math.PI * 2)
              pctx.fillStyle = d.color
              pctx.globalAlpha = 0.08
              pctx.fill()
              pctx.globalAlpha = 1
            }
          }
        }

        // Remove old splashes
        if (s.age > 300 && !s.growing) {
          splashes.splice(i, 1)
        }
      }

      // Very slow fade of persist layer (so it doesn't get muddy)
      if (autoTimer === 0) {
        pctx.globalAlpha = 0.003
        pctx.fillStyle = `rgb(${r},${g},${b})`
        pctx.fillRect(0, 0, W, H)
        pctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Touch: big splat
    const handleTap = (cx: number, cy: number) => {
      for (let i = 0; i < 5; i++) {
        const s = randomSplash(
          cx + (Math.random() - 0.5) * 60,
          cy + (Math.random() - 0.5) * 60,
          true
        )
        splashesRef.current.push(s)
      }
      while (splashesRef.current.length > 100) splashesRef.current.shift()
    }

    // Drag: paint trail
    const handleMove = (cx: number, cy: number) => {
      if (splashesRef.current.length < 100) {
        const s = randomSplash(cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 20)
        s.maxSize = 15 + Math.random() * 50
        s.opacity = 0.2 + Math.random() * 0.3
        splashesRef.current.push(s)
      }
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    let dragging = false
    canvas.addEventListener('mousedown', () => { dragging = true })
    canvas.addEventListener('mouseup', () => { dragging = false })
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (dragging) handleMove(e.clientX, e.clientY)
    })

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
