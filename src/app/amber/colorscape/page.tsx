'use client'

import { useEffect, useRef } from 'react'

// Hot, saturated — Wyckaert meets citrus spring
const PALETTE = [
  '#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81',
  '#E53935', '#FF8F00', '#FDD835', '#7CB342', '#F06292',
  '#D50000', '#FF6D00', '#FFD600', '#64DD17', '#C51162',
  '#1B5E20', '#0D47A1', '#F5F5DC', '#FFFDE7',
]

interface Stroke {
  points: { x: number; y: number }[]
  color: string
  width: number
  opacity: number
  blend: GlobalCompositeOperation
}

function randomColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}

export default function Colorscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const persistRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

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

    // Paint a broad gestural stroke onto the persist layer
    function paintStroke(stroke: Stroke) {
      if (stroke.points.length < 2) return
      pctx.save()
      pctx.globalCompositeOperation = stroke.blend
      pctx.globalAlpha = stroke.opacity
      pctx.strokeStyle = stroke.color
      pctx.lineWidth = stroke.width
      pctx.lineCap = 'round'
      pctx.lineJoin = 'round'

      pctx.beginPath()
      pctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]
        const curr = stroke.points[i]
        const mx = (prev.x + curr.x) / 2
        const my = (prev.y + curr.y) / 2
        pctx.quadraticCurveTo(prev.x, prev.y, mx, my)
      }
      pctx.stroke()

      // Second pass — thinner, brighter, offset slightly (paint thickness)
      pctx.globalAlpha = stroke.opacity * 0.4
      pctx.lineWidth = stroke.width * 0.3
      pctx.strokeStyle = '#FFFDE7'
      pctx.beginPath()
      pctx.moveTo(stroke.points[0].x - 2, stroke.points[0].y - 2)
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]
        const curr = stroke.points[i]
        pctx.quadraticCurveTo(prev.x - 2, prev.y - 2, (prev.x + curr.x) / 2 - 2, (prev.y + curr.y) / 2 - 2)
      }
      pctx.stroke()

      pctx.restore()
    }

    // Generate a sweeping gestural auto-stroke
    function autoStroke() {
      const points: { x: number; y: number }[] = []
      let x = Math.random() * W
      let y = Math.random() * H
      const angle = Math.random() * Math.PI * 2
      const speed = 8 + Math.random() * 20
      const curve = (Math.random() - 0.5) * 0.15
      const steps = 15 + Math.floor(Math.random() * 40)

      let a = angle
      for (let i = 0; i < steps; i++) {
        points.push({ x, y })
        a += curve + (Math.random() - 0.5) * 0.1
        x += Math.cos(a) * speed
        y += Math.sin(a) * speed
      }

      const blends: GlobalCompositeOperation[] = ['source-over', 'multiply', 'source-over', 'source-over']
      paintStroke({
        points,
        color: randomColor(),
        width: 20 + Math.random() * 80,
        opacity: 0.25 + Math.random() * 0.55,
        blend: blends[Math.floor(Math.random() * blends.length)],
      })
    }

    // Seed — lay down the initial canvas like Wyckaert's base
    // Big color fields first
    for (let i = 0; i < 6; i++) {
      const color = randomColor()
      pctx.globalAlpha = 0.3 + Math.random() * 0.4
      pctx.fillStyle = color
      // Large irregular region
      pctx.beginPath()
      const cx = Math.random() * W
      const cy = Math.random() * H
      const r = 100 + Math.random() * 300
      const verts = 6 + Math.floor(Math.random() * 6)
      for (let v = 0; v < verts; v++) {
        const a = (v / verts) * Math.PI * 2
        const rr = r * (0.5 + Math.random() * 0.8)
        const px = cx + Math.cos(a) * rr
        const py = cy + Math.sin(a) * rr
        if (v === 0) pctx.moveTo(px, py)
        else pctx.lineTo(px, py)
      }
      pctx.closePath()
      pctx.fill()
      pctx.globalAlpha = 1
    }

    // Then gestural strokes over them
    for (let i = 0; i < 20; i++) {
      autoStroke()
    }

    let raf: number
    let autoTimer = 0

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Warm cream base
      ctx.fillStyle = '#FFF8E7'
      ctx.fillRect(0, 0, W, H)

      // Draw persistent paint layer
      ctx.drawImage(persist, 0, 0, W, H)

      // Auto-paint new strokes slowly
      autoTimer++
      if (autoTimer > 120) {
        autoTimer = 0
        autoStroke()
      }

      raf = requestAnimationFrame(draw)
    }

    // Touch/mouse: paint with your finger like a fat brush
    let currentStroke: Stroke | null = null

    const startStroke = (cx: number, cy: number) => {
      const blends: GlobalCompositeOperation[] = ['source-over', 'multiply', 'source-over']
      currentStroke = {
        points: [{ x: cx, y: cy }],
        color: randomColor(),
        width: 25 + Math.random() * 60,
        opacity: 0.35 + Math.random() * 0.45,
        blend: blends[Math.floor(Math.random() * blends.length)],
      }
    }

    const moveStroke = (cx: number, cy: number) => {
      if (!currentStroke) return
      currentStroke.points.push({ x: cx, y: cy })

      // Live preview on main canvas
      if (currentStroke.points.length > 1) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.globalCompositeOperation = currentStroke.blend
        ctx.globalAlpha = currentStroke.opacity
        ctx.strokeStyle = currentStroke.color
        ctx.lineWidth = currentStroke.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const pts = currentStroke.points
        const p = pts[pts.length - 2]
        const c = pts[pts.length - 1]
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(c.x, c.y)
        ctx.stroke()
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }

    const endStroke = () => {
      if (currentStroke && currentStroke.points.length > 1) {
        paintStroke(currentStroke)
      }
      currentStroke = null
    }

    // Tap = splat (a burst of short strokes radiating outward)
    const splat = (cx: number, cy: number) => {
      const count = 5 + Math.floor(Math.random() * 6)
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
        const len = 30 + Math.random() * 100
        const steps = 5 + Math.floor(Math.random() * 10)
        const points: { x: number; y: number }[] = []
        for (let s = 0; s < steps; s++) {
          const t = s / steps
          points.push({
            x: cx + Math.cos(angle) * len * t + (Math.random() - 0.5) * 10,
            y: cy + Math.sin(angle) * len * t + (Math.random() - 0.5) * 10,
          })
        }
        const blends: GlobalCompositeOperation[] = ['source-over', 'multiply']
        paintStroke({
          points,
          color: randomColor(),
          width: 8 + Math.random() * 35,
          opacity: 0.3 + Math.random() * 0.5,
          blend: blends[Math.floor(Math.random() * blends.length)],
        })
      }
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      startStroke(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      moveStroke(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchend', () => endStroke())

    canvas.addEventListener('mousedown', (e: MouseEvent) => startStroke(e.clientX, e.clientY))
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (currentStroke) moveStroke(e.clientX, e.clientY)
    })
    canvas.addEventListener('mouseup', () => endStroke())

    // Single tap = splat
    canvas.addEventListener('click', (e: MouseEvent) => {
      if (!currentStroke || (currentStroke && currentStroke.points.length < 3)) {
        splat(e.clientX, e.clientY)
      }
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
