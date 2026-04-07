'use client'

import { useEffect, useRef, useState } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FC913A']

const KNOTS = [
  { p: 2, q: 3, name: 'trefoil' },
  { p: 3, q: 4, name: 'torus 3,4' },
  { p: 2, q: 5, name: 'cinquefoil' },
  { p: 3, q: 5, name: 'torus 3,5' },
  { p: 4, q: 5, name: 'torus 4,5' },
  { p: 2, q: 7, name: 'heptafoil' },
]

function torusKnotPoint(t: number, p: number, q: number): [number, number, number] {
  const r = Math.cos(q * t) + 2
  return [r * Math.cos(p * t), r * Math.sin(p * t), -Math.sin(q * t)]
}

function rotateXY(
  v: [number, number, number],
  rx: number,
  ry: number
): [number, number, number] {
  let [x, y, z] = v
  const y2 = y * Math.cos(rx) - z * Math.sin(rx)
  const z2 = y * Math.sin(rx) + z * Math.cos(rx)
  y = y2
  z = z2
  const x2 = x * Math.cos(ry) + z * Math.sin(ry)
  const z3 = -x * Math.sin(ry) + z * Math.cos(ry)
  return [x2, y, z3]
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerpColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}

export default function KnotPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rotRef = useRef({ x: 0.4, y: 0 })
  const autoRotRef = useRef(0)
  const knotIdxRef = useRef(0)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 })
  const animRef = useRef(0)
  const [knotName, setKnotName] = useState('trefoil')
  const [bgColors] = useState<[string, string]>(() => pickGradientColors('knot'))

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const N = 520

    function draw() {
      const W = window.innerWidth
      const H = window.innerHeight
      const knot = KNOTS[knotIdxRef.current]
      autoRotRef.current += 0.004

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bgColors[0])
      grad.addColorStop(1, bgColors[1])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const fov = Math.min(W, H) * 0.40
      const cx = W / 2
      const cy = H / 2
      const rx = rotRef.current.x
      const ry = rotRef.current.y + autoRotRef.current

      // Project all points
      const pts: Array<{ sx: number; sy: number; depth: number }> = []
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * 2 * Math.PI
        const p3 = torusKnotPoint(t, knot.p, knot.q)
        const [x, y, z] = rotateXY(p3, rx, ry)
        // z range of torus knot is approx -1..+1; offset to keep positive
        const depth = z + 6
        const scale = fov / depth
        pts.push({ sx: cx + x * scale, sy: cy - y * scale, depth })
      }

      // Build segments, sort back-to-front (painter's algorithm)
      const segs = Array.from({ length: N }, (_, i) => ({
        i,
        depth: (pts[i].depth + pts[i + 1].depth) / 2,
      }))
      segs.sort((a, b) => b.depth - a.depth)

      for (const { i, depth } of segs) {
        const { sx: x0, sy: y0 } = pts[i]
        const { sx: x1, sy: y1 } = pts[i + 1]

        // Color cycling along the tube — 2 full color cycles per knot
        const colorPos = ((i / N) * CITRUS.length * 2) % CITRUS.length
        const ci = Math.floor(colorPos) % CITRUS.length
        const cn = (ci + 1) % CITRUS.length
        const color = lerpColor(CITRUS[ci], CITRUS[cn], colorPos - ci)

        // Depth range approx 4..8; nearness 1=close, 0=far
        const nearness = Math.max(0, Math.min(1, 1 - (depth - 4) / 4))

        const lineW = 3 + 7 * nearness
        const alpha = 0.35 + 0.65 * nearness

        ctx.strokeStyle = color
        ctx.globalAlpha = alpha
        ctx.lineWidth = lineW
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()

        // Specular highlight on near segments
        if (nearness > 0.3) {
          ctx.strokeStyle = '#FFFFFF'
          ctx.globalAlpha = 0.22 * nearness
          ctx.lineWidth = lineW * 0.28
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
          ctx.stroke()
        }
      }

      ctx.globalAlpha = 1

      // Amber watermark
      ctx.fillStyle = '#D4A574'
      ctx.globalAlpha = 0.4
      ctx.font = '11px monospace'
      ctx.fillText('amber', 16, H - 16)
      ctx.globalAlpha = 1

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.lastX
      const dy = e.clientY - dragRef.current.lastY
      rotRef.current.y += dx * 0.007
      rotRef.current.x += dy * 0.007
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!dragRef.current.active) return
      const totalDx = Math.abs(e.clientX - dragRef.current.startX)
      const totalDy = Math.abs(e.clientY - dragRef.current.startY)
      if (totalDx < 10 && totalDy < 10) {
        knotIdxRef.current = (knotIdxRef.current + 1) % KNOTS.length
        setKnotName(KNOTS[knotIdxRef.current].name)
      }
      dragRef.current.active = false
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
    }
  }, [bgColors])

  return (
    <div style={{ position: 'relative', width: '100dvw', height: '100dvh', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div
        style={{
          position: 'absolute',
          bottom: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'monospace',
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          letterSpacing: '0.05em',
        }}
      >
        {knotName} · drag to rotate · tap to change
      </div>
    </div>
  )
}
