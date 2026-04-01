'use client'

import { useEffect, useRef } from 'react'

// Full citrus spring palette — saturated, juicy, LOUD
const PALETTE = [
  '#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81',
  '#FF7043', '#FFCA28', '#8BC34A', '#FF8A80', '#FFD54F',
  '#E040FB', '#FF6E40', '#EEFF41', '#69F0AE', '#FF80AB',
]

type ShapeKind = 'circle' | 'rect' | 'triangle' | 'ring' | 'arc' | 'diamond'
const KINDS: ShapeKind[] = ['circle', 'rect', 'triangle', 'ring', 'arc', 'diamond']

interface Shape {
  x: number; y: number
  vx: number; vy: number
  size: number
  targetSize: number
  rotation: number
  rotSpeed: number
  color: string
  kind: ShapeKind
  opacity: number
  targetOpacity: number
  born: number
  phase: number
  phaseSpeed: number
  blend: GlobalCompositeOperation
}

function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function randomShape(W: number, H: number, x?: number, y?: number): Shape {
  const blends: GlobalCompositeOperation[] = ['screen', 'multiply', 'overlay', 'source-over', 'lighter']
  return {
    x: x ?? Math.random() * W,
    y: y ?? Math.random() * H,
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    size: 0,
    targetSize: 30 + Math.random() * 180,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.015,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    kind: KINDS[Math.floor(Math.random() * KINDS.length)],
    opacity: 0,
    targetOpacity: 0.15 + Math.random() * 0.45,
    born: Date.now(),
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 0.005 + Math.random() * 0.02,
    blend: blends[Math.floor(Math.random() * blends.length)],
  }
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rotation)
  ctx.globalCompositeOperation = s.blend
  ctx.globalAlpha = s.opacity

  const r = s.size / 2

  switch (s.kind) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = s.color
      ctx.fill()
      break

    case 'rect':
      ctx.fillStyle = s.color
      ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4)
      break

    case 'triangle':
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.lineTo(r * 0.87, r * 0.5)
      ctx.lineTo(-r * 0.87, r * 0.5)
      ctx.closePath()
      ctx.fillStyle = s.color
      ctx.fill()
      break

    case 'ring':
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.strokeStyle = s.color
      ctx.lineWidth = r * 0.2
      ctx.stroke()
      break

    case 'arc':
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 1.3)
      ctx.strokeStyle = s.color
      ctx.lineWidth = r * 0.25
      ctx.lineCap = 'round'
      ctx.stroke()
      break

    case 'diamond':
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.lineTo(r * 0.6, 0)
      ctx.lineTo(0, r)
      ctx.lineTo(-r * 0.6, 0)
      ctx.closePath()
      ctx.fillStyle = s.color
      ctx.fill()
      break
  }

  ctx.restore()
}

export default function Colorscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shapesRef = useRef<Shape[]>([])
  const bgHueRef = useRef(0)

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

    // Seed initial shapes
    for (let i = 0; i < 35; i++) {
      const s = randomShape(W, H)
      s.size = s.targetSize // start visible
      s.opacity = s.targetOpacity
      shapesRef.current.push(s)
    }

    let raf: number
    let spawnTimer = 0

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Slowly shifting warm background
      bgHueRef.current += 0.08
      const bgHue = bgHueRef.current % 360
      // Warm tones only: cycle through peach/cream/lemon/blush
      const bgR = 255
      const bgG = Math.floor(235 + Math.sin(bgHue * 0.01) * 15)
      const bgB = Math.floor(210 + Math.sin(bgHue * 0.015 + 1) * 25)
      ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`
      ctx.fillRect(0, 0, W, H)

      const now = Date.now()

      // Spawn new shapes periodically
      spawnTimer++
      if (spawnTimer > 40 && shapesRef.current.length < 55) {
        spawnTimer = 0
        shapesRef.current.push(randomShape(W, H))
      }

      const shapes = shapesRef.current

      // Update and draw
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i]
        const age = (now - s.born) / 1000

        // Grow in
        s.size += (s.targetSize - s.size) * 0.03
        s.opacity += (s.targetOpacity - s.opacity) * 0.02

        // Breathe
        s.phase += s.phaseSpeed
        const breathe = Math.sin(s.phase)
        const drawSize = s.size + breathe * s.size * 0.15

        // Move
        s.x += s.vx
        s.y += s.vy
        s.rotation += s.rotSpeed

        // Gentle pull toward center (prevents clustering at edges)
        s.vx += (W / 2 - s.x) * 0.00003
        s.vy += (H / 2 - s.y) * 0.00003

        // Damping
        s.vx *= 0.999
        s.vy *= 0.999

        // Wrap at edges with margin
        const margin = s.size
        if (s.x < -margin) s.x = W + margin
        if (s.x > W + margin) s.x = -margin
        if (s.y < -margin) s.y = H + margin
        if (s.y > H + margin) s.y = -margin

        // Slowly fade and replace old shapes
        if (age > 20) {
          s.targetOpacity -= 0.002
          if (s.opacity < 0.01) {
            shapes.splice(i, 1)
            continue
          }
        }

        // Occasional color shift
        if (Math.random() < 0.001) {
          s.color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
        }

        // Occasional size pulse
        if (Math.random() < 0.002) {
          s.targetSize = 30 + Math.random() * 180
        }

        const drawShape2 = { ...s, size: drawSize }
        drawShape(ctx, drawShape2)
      }

      raf = requestAnimationFrame(draw)
    }

    // Touch: burst of shapes
    const handleTap = (cx: number, cy: number) => {
      for (let i = 0; i < 8; i++) {
        const s = randomShape(W, H,
          cx + (Math.random() - 0.5) * 80,
          cy + (Math.random() - 0.5) * 80
        )
        s.targetSize = 40 + Math.random() * 120
        // Burst outward from tap point
        const angle = Math.random() * Math.PI * 2
        const force = 1 + Math.random() * 3
        s.vx = Math.cos(angle) * force
        s.vy = Math.sin(angle) * force
        s.blend = Math.random() < 0.5 ? 'screen' : 'lighter'
        s.targetOpacity = 0.3 + Math.random() * 0.4
        shapesRef.current.push(s)
      }
      // Cap
      while (shapesRef.current.length > 80) shapesRef.current.shift()
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

    // Drag spawns continuously
    const handleMove = (cx: number, cy: number) => {
      if (Math.random() < 0.3 && shapesRef.current.length < 80) {
        const s = randomShape(W, H, cx, cy)
        s.targetSize = 20 + Math.random() * 60
        s.blend = 'screen'
        shapesRef.current.push(s)
      }
    }
    let dragging = false
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
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
