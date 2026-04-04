'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const COLS = 28
const ROWS = 20
const REST_LEN = 14
const GRAVITY = 0.15
const DAMPING = 0.98
const TEAR_DIST = REST_LEN * 3.5

interface Point {
  x: number; y: number
  ox: number; oy: number // old position (verlet)
  pinned: boolean
  color: string
}

interface Link {
  a: number; b: number
  broken: boolean
}

export default function L23() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<Point[]>([])
  const linksRef = useRef<Link[]>([])
  const dragRef = useRef<{ idx: number; active: boolean }>({ idx: -1, active: false })

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
    const [bg1, bg2] = pickGradientColors('L23')

    // Init grid
    const points: Point[] = []
    const links: Link[] = []
    const startX = (W - (COLS - 1) * REST_LEN) / 2
    const startY = 40

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = startX + c * REST_LEN
        const y = startY + r * REST_LEN
        points.push({
          x, y, ox: x, oy: y,
          pinned: r === 0 && (c % 4 === 0 || c === COLS - 1),
          color: CITRUS[(r + c) % CITRUS.length],
        })
      }
    }

    // Horizontal links
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        links.push({ a: r * COLS + c, b: r * COLS + c + 1, broken: false })
      }
    }
    // Vertical links
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        links.push({ a: r * COLS + c, b: (r + 1) * COLS + c, broken: false })
      }
    }

    pointsRef.current = points
    linksRef.current = links

    let raf: number

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Physics: Verlet integration
      for (const p of points) {
        if (p.pinned) continue
        const vx = (p.x - p.ox) * DAMPING
        const vy = (p.y - p.oy) * DAMPING
        p.ox = p.x
        p.oy = p.y
        p.x += vx
        p.y += vy + GRAVITY
      }

      // Constraints (multiple iterations for stability)
      for (let iter = 0; iter < 3; iter++) {
        for (const link of links) {
          if (link.broken) continue
          const a = points[link.a]
          const b = points[link.b]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          // Tear check
          if (dist > TEAR_DIST) {
            link.broken = true
            continue
          }

          const diff = (REST_LEN - dist) / dist * 0.5
          const ox = dx * diff
          const oy = dy * diff

          if (!a.pinned) { a.x -= ox; a.y -= oy }
          if (!b.pinned) { b.x += ox; b.y += oy }
        }
      }

      // Keep dragged point at cursor
      if (dragRef.current.active && dragRef.current.idx >= 0) {
        const p = points[dragRef.current.idx]
        // Position is set in the event handler
      }

      // Draw links
      ctx.lineCap = 'round'
      for (const link of links) {
        if (link.broken) continue
        const a = points[link.a]
        const b = points[link.b]

        // Color based on stretch
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const stretch = dist / REST_LEN
        const tension = Math.min(1, (stretch - 1) * 2)

        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.lineWidth = 2 - tension * 0.5
        // Blend from citrus color to red as tension increases
        if (tension > 0.5) {
          ctx.strokeStyle = '#FF4E50'
          ctx.globalAlpha = 0.3 + tension * 0.5
        } else {
          ctx.strokeStyle = a.color
          ctx.globalAlpha = 0.5
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Draw pin points
      for (const p of points) {
        if (p.pinned) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#FF4E50'
          ctx.fill()
        }
      }

      // Hint
      if (!dragRef.current.active) {
        ctx.globalAlpha = 0.25
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText('drag the cloth. pull to tear.', W / 2, H - 30)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Find nearest point to cursor
    function nearest(cx: number, cy: number): number {
      let best = -1, bestD = Infinity
      for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - cx
        const dy = points[i].y - cy
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; best = i }
      }
      return bestD < 900 ? best : -1 // 30px radius
    }

    const onStart = (cx: number, cy: number) => {
      const idx = nearest(cx, cy)
      if (idx >= 0) {
        dragRef.current = { idx, active: true }
        points[idx].pinned = true
      }
    }

    const onMove = (cx: number, cy: number) => {
      if (!dragRef.current.active || dragRef.current.idx < 0) return
      const p = points[dragRef.current.idx]
      p.x = cx
      p.y = cy
      p.ox = cx
      p.oy = cy
    }

    const onEnd = () => {
      if (dragRef.current.idx >= 0) {
        // Unpin unless it was originally pinned (top row)
        const idx = dragRef.current.idx
        const r = Math.floor(idx / COLS)
        const c = idx % COLS
        if (!(r === 0 && (c % 4 === 0 || c === COLS - 1))) {
          points[idx].pinned = false
        }
      }
      dragRef.current = { idx: -1, active: false }
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      onStart(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      onMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchend', () => onEnd())

    canvas.addEventListener('mousedown', (e: MouseEvent) => onStart(e.clientX, e.clientY))
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (dragRef.current.active) onMove(e.clientX, e.clientY)
    })
    canvas.addEventListener('mouseup', () => onEnd())

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
        cursor: 'grab',
        touchAction: 'none',
      }}
    />
  )
}
