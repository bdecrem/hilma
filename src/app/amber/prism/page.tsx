'use client'

import { useEffect, useRef, useCallback } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = [
  '#FF4E50', // blood orange
  '#FC913A', // tangerine
  '#F9D423', // mango
  '#B4E33D', // lime zest
  '#FF6B81', // grapefruit pink
  '#D4A574', // amber (watermark)
]

// Snell's law: n1 * sin(theta1) = n2 * sin(theta2)
const N_AIR = 1.0
const N_GLASS = 1.52

function refract(dirX: number, dirY: number, nx: number, ny: number, n1: number, n2: number): { x: number; y: number } | null {
  const cosI = -(dirX * nx + dirY * ny)
  const sinT2 = (n1 / n2) ** 2 * (1 - cosI * cosI)
  if (sinT2 > 1) return null // total internal reflection
  const cosT = Math.sqrt(1 - sinT2)
  const ratio = n1 / n2
  return {
    x: ratio * dirX + (ratio * cosI - cosT) * nx,
    y: ratio * dirY + (ratio * cosI - cosT) * ny,
  }
}

function lineSegmentIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number
): { x: number; y: number; t: number } | null {
  const dx1 = p2x - p1x, dy1 = p2y - p1y
  const dx2 = p4x - p3x, dy2 = p4y - p3y
  const denom = dx1 * dy2 - dy1 * dx2
  if (Math.abs(denom) < 1e-10) return null
  const t = ((p3x - p1x) * dy2 - (p3y - p1y) * dx2) / denom
  const u = ((p3x - p1x) * dy1 - (p3y - p1y) * dx1) / denom
  if (t > 0.0001 && u >= 0 && u <= 1) {
    return { x: p1x + t * dx1, y: p1y + t * dy1, t }
  }
  return null
}

// Trace a ray through equilateral triangle prism
function traceRay(
  ox: number, oy: number, // ray origin
  dx: number, dy: number, // ray direction (normalized)
  px: number, py: number, // prism center
  size: number,           // prism half-size
  angle: number           // prism rotation
): { segments: { x1: number; y1: number; x2: number; y2: number }[]; finalDir: { x: number; y: number } | null } {
  // Triangle vertices (equilateral, pointing up)
  const verts = [0, 1, 2].map(i => {
    const a = angle + (i * 2 * Math.PI) / 3 - Math.PI / 2
    return { x: px + Math.cos(a) * size, y: py + Math.sin(a) * size }
  })

  const edges = [
    [verts[0], verts[1]],
    [verts[1], verts[2]],
    [verts[2], verts[0]],
  ]

  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  let cx = ox, cy = oy, cdx = dx, cdy = dy
  let insidePrism = false
  let finalDir: { x: number; y: number } | null = null

  for (let bounce = 0; bounce < 3; bounce++) {
    let bestT = Infinity
    let bestHit: { x: number; y: number } | null = null
    let bestEdge = 0

    for (let e = 0; e < 3; e++) {
      const [v1, v2] = edges[e]
      const hit = lineSegmentIntersect(cx, cy, cx + cdx * 10000, cy + cdy * 10000, v1.x, v1.y, v2.x, v2.y)
      if (hit && hit.t < bestT) {
        bestT = hit.t
        bestHit = hit
        bestEdge = e
      }
    }

    if (!bestHit) break

    segments.push({ x1: cx, y1: cy, x2: bestHit.x, y2: bestHit.y })

    // Edge normal (pointing outward)
    const [v1, v2] = edges[bestEdge]
    const ex = v2.x - v1.x, ey = v2.y - v1.y
    const len = Math.sqrt(ex * ex + ey * ey)
    let nx = -ey / len, ny = ex / len
    // ensure normal points away from center
    const toCx = bestHit.x - px, toCy = bestHit.y - py
    if (nx * toCx + ny * toCy < 0) { nx = -nx; ny = -ny }

    cx = bestHit.x
    cy = bestHit.y

    if (!insidePrism) {
      // entering glass
      const r = refract(cdx, cdy, nx, ny, N_AIR, N_GLASS)
      if (!r) break
      cdx = r.x; cdy = r.y
      insidePrism = true
    } else {
      // exiting glass
      const r = refract(cdx, cdy, -nx, -ny, N_GLASS, N_AIR)
      if (!r) break
      cdx = r.x; cdy = r.y
      insidePrism = false
      finalDir = { x: cdx, y: cdy }
      break
    }
  }

  return { segments, finalDir }
}

export default function PrismPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    prismX: 0,
    prismY: 0,
    prismAngle: Math.PI / 6,
    prismSize: 0,
    dragging: false,
    dragOffX: 0,
    dragOffY: 0,
    width: 0,
    height: 0,
    pulseT: 0,
    animFrame: 0,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = stateRef.current
    const { width: w, height: h } = s

    // Background gradient
    const [bg1, bg2] = pickGradientColors('prism')
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, bg1)
    grad.addColorStop(1, bg2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    s.pulseT += 0.012

    const prismCx = s.prismX
    const prismCy = s.prismY
    const size = s.prismSize

    // Per-channel dispersion offsets (spread the rays like a real prism)
    const dispersions = [-0.18, -0.11, -0.04, 0.04, 0.12, 0.20]

    // Incoming rays — fan from left edge, angled toward prism
    const rayCount = 8
    const spread = size * 1.2
    const baseAngle = 0.08 // slight downward tilt

    ctx.globalAlpha = 0.85

    for (let r = 0; r < rayCount; r++) {
      const t = (r / (rayCount - 1)) - 0.5
      const startX = 0
      const startY = prismCy + t * spread
      const dx = Math.cos(baseAngle)
      const dy = Math.sin(baseAngle)

      // Draw incoming ray
      ctx.beginPath()
      ctx.strokeStyle = '#FFFFF0'
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.4
      ctx.moveTo(startX, startY)

      // Trace to prism surface first
      const { segments, finalDir } = traceRay(startX, startY, dx, dy, prismCx, prismCy, size, s.prismAngle)

      if (segments.length > 0) {
        ctx.lineTo(segments[0].x1 === startX && segments[0].y1 === startY ? segments[0].x2 : segments[0].x1, startY)
        ctx.stroke()
      }

      // Dispersed exit rays per color channel
      if (finalDir && segments.length >= 2) {
        const exitX = segments[segments.length - 1].x2
        const exitY = segments[segments.length - 1].y2

        // Draw through-prism portion (white/cream)
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = '#FFFFF0'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let i = 0; i < segments.length; i++) {
          if (i === 0) ctx.moveTo(segments[i].x1, segments[i].y1)
          ctx.lineTo(segments[i].x2, segments[i].y2)
        }
        ctx.stroke()

        // Dispersed colored exit rays
        for (let c = 0; c < CITRUS.length; c++) {
          const dispAngle = dispersions[c]
          const exitAngle = Math.atan2(finalDir.y, finalDir.x) + dispAngle
          const edx = Math.cos(exitAngle)
          const edy = Math.sin(exitAngle)

          // Pulse alpha
          const pulse = 0.6 + 0.25 * Math.sin(s.pulseT + c * 0.8 + r * 0.3)

          ctx.globalAlpha = pulse
          ctx.strokeStyle = CITRUS[c]
          ctx.lineWidth = 2.5

          // Glow pass
          ctx.shadowColor = CITRUS[c]
          ctx.shadowBlur = 12

          const endX = exitX + edx * w * 1.5
          const endY = exitY + edy * h * 1.5

          ctx.beginPath()
          ctx.moveTo(exitX, exitY)
          ctx.lineTo(endX, endY)
          ctx.stroke()

          ctx.shadowBlur = 0
        }
      } else if (segments.length === 0) {
        // Ray missed prism — draw as white line across canvas
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = '#FFFFF0'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(w, startY + dy * w)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1

    // Draw prism
    const verts = [0, 1, 2].map(i => {
      const a = s.prismAngle + (i * 2 * Math.PI) / 3 - Math.PI / 2
      return { x: prismCx + Math.cos(a) * size, y: prismCy + Math.sin(a) * size }
    })

    // Prism fill — translucent glass look
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(verts[0].x, verts[0].y)
    verts.forEach(v => ctx.lineTo(v.x, v.y))
    ctx.closePath()

    const glassFill = ctx.createLinearGradient(
      verts[0].x, verts[0].y,
      verts[2].x, verts[2].y
    )
    glassFill.addColorStop(0, 'rgba(255,255,255,0.12)')
    glassFill.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    glassFill.addColorStop(1, 'rgba(255,255,255,0.08)')
    ctx.fillStyle = glassFill
    ctx.fill()

    // Prism edge — slightly rainbow shimmer
    ctx.lineWidth = 2.5
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.shadowColor = '#F9D423'
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.restore()

    // Prism highlight facet
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(verts[0].x, verts[0].y)
    ctx.lineTo(verts[1].x, verts[1].y)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()

    // Hint text
    ctx.globalAlpha = 0.45
    ctx.fillStyle = '#2D5A27'
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('drag the prism · tap to scatter light', w / 2, h - 24)
    ctx.globalAlpha = 1

    stateRef.current.animFrame = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      s.width = canvas.width
      s.height = canvas.height
      s.prismX = canvas.width * 0.45
      s.prismY = canvas.height * 0.5
      s.prismSize = Math.min(canvas.width, canvas.height) * 0.18
    }
    resize()
    window.addEventListener('resize', resize)

    // Pointer events
    const getXY = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onDown = (e: PointerEvent) => {
      const { x, y } = getXY(e)
      const dx = x - s.prismX, dy = y - s.prismY
      if (Math.sqrt(dx * dx + dy * dy) < s.prismSize * 1.2) {
        s.dragging = true
        s.dragOffX = dx
        s.dragOffY = dy
      } else {
        // Tap outside: rotate prism slightly
        s.prismAngle += 0.25
      }
      canvas.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      if (!s.dragging) return
      const { x, y } = getXY(e)
      s.prismX = x - s.dragOffX
      s.prismY = y - s.dragOffY
    }

    const onUp = () => { s.dragging = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)

    s.animFrame = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      cancelAnimationFrame(s.animFrame)
    }
  }, [draw])

  return (
    <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', background: '#FFF8E7' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
    </div>
  )
}
