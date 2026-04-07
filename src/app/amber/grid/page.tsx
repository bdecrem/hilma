'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const [BG1, BG2] = pickGradientColors('grid')
const AMBER = '#D4A574'

// Citrus palette for cube faces by height
function heightColor(t: number): [number, number, number] {
  // t: 0 → 1 maps mango → tangerine → blood orange → grapefruit
  const stops: [number, number, number][] = [
    [249, 212, 35],  // mango #F9D423
    [252, 145, 58],  // tangerine #FC913A
    [255, 78, 80],   // blood orange #FF4E50
    [255, 107, 129], // grapefruit #FF6B81
  ]
  const idx = t * (stops.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, stops.length - 1)
  const frac = idx - lo
  const a = stops[lo], b = stops[hi]
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ]
}

function rgb(r: number, g: number, b: number, a = 1) {
  return `rgba(${r},${g},${b},${a})`
}

function darken([r, g, b]: [number, number, number], factor: number): [number, number, number] {
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor)]
}

const N = 14 // grid size (NxN cubes)

export default function GridPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = 0, H = 0
    let raf = 0
    let frame = 0

    // Heights: touch-raised layer + base idle wave
    const touchH = Array.from({ length: N }, () => new Float32Array(N))

    // Tile geometry (recomputed on resize)
    let halfW = 0, qH = 0, cubeH = 0, originX = 0, originY = 0

    function computeGeometry() {
      // Fit grid to screen width with padding
      const usableW = W * 0.92
      halfW = usableW / (2 * (N - 1))
      qH = halfW * 0.5        // isometric: height = half width
      cubeH = halfW * 1.6     // max cube pixel height

      // Grid screen bounds (at h=0):
      // x spans from -(N-1)*halfW to +(N-1)*halfW from origin
      // y spans from 0 to (N-1+N-1)*qH from origin
      const gridScreenH = (2 * (N - 1)) * qH + cubeH + 20
      originX = W / 2
      originY = (H - gridScreenH) / 2 + cubeH
    }

    function init() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx.scale(dpr, dpr)
      computeGeometry()
    }

    // World-to-screen
    function toScreen(col: number, row: number, h: number) {
      return {
        x: originX + (col - row) * halfW,
        y: originY + (col + row) * qH - h * cubeH,
      }
    }

    function drawCube(col: number, row: number, h: number) {
      if (h <= 0.001 && frame % 3 !== 0) return // skip flat cubes most frames

      const t = Math.max(0, Math.min(1, h))
      const baseColor = heightColor(t)
      const topColor = darken(baseColor, 1.15) // slightly brighter top
      const leftColor = darken(baseColor, 0.68)
      const rightColor = darken(baseColor, 0.82)

      // 4 corners of the top face diamond
      const center = toScreen(col, row, h)
      const topPt = toScreen(col, row, h + 0) // same, top center
      const leftPt = { x: center.x - halfW, y: center.y + qH }
      const rightPt = { x: center.x + halfW, y: center.y + qH }
      const botPt = { x: center.x, y: center.y + 2 * qH }

      // Ground reference (h=0) for walls
      const groundY = originY + (col + row) * qH

      const topH = t * cubeH // pixel height of this cube

      if (topH < 0.5) {
        // Flat tile — just draw diamond top face
        ctx.beginPath()
        ctx.moveTo(center.x, center.y)
        ctx.lineTo(rightPt.x, rightPt.y)
        ctx.lineTo(botPt.x, botPt.y)
        ctx.lineTo(leftPt.x, leftPt.y)
        ctx.closePath()
        ctx.fillStyle = rgb(...darken(baseColor, 0.4), 0.25)
        ctx.fill()
        return
      }

      // Left face
      ctx.beginPath()
      ctx.moveTo(leftPt.x, leftPt.y)
      ctx.lineTo(botPt.x, botPt.y)
      ctx.lineTo(botPt.x, groundY + 2 * qH)
      ctx.lineTo(leftPt.x, groundY + qH)
      ctx.closePath()
      ctx.fillStyle = rgb(...leftColor)
      ctx.fill()

      // Right face
      ctx.beginPath()
      ctx.moveTo(rightPt.x, rightPt.y)
      ctx.lineTo(botPt.x, botPt.y)
      ctx.lineTo(botPt.x, groundY + 2 * qH)
      ctx.lineTo(rightPt.x, groundY + qH)
      ctx.closePath()
      ctx.fillStyle = rgb(...rightColor)
      ctx.fill()

      // Top face
      ctx.beginPath()
      ctx.moveTo(center.x, center.y)       // top
      ctx.lineTo(rightPt.x, rightPt.y)     // right
      ctx.lineTo(botPt.x, botPt.y)         // bottom
      ctx.lineTo(leftPt.x, leftPt.y)       // left
      ctx.closePath()
      ctx.fillStyle = rgb(...topColor)
      ctx.fill()

      // Crisp top edge for depth
      ctx.beginPath()
      ctx.moveTo(center.x, center.y)
      ctx.lineTo(rightPt.x, rightPt.y)
      ctx.lineTo(botPt.x, botPt.y)
      ctx.lineTo(leftPt.x, leftPt.y)
      ctx.closePath()
      ctx.strokeStyle = rgb(...darken(topColor, 1.3), 0.4)
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    function animate() {
      frame++
      raf = requestAnimationFrame(animate)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, BG1)
      grad.addColorStop(1, BG2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Decay touch heights
      for (let c = 0; c < N; c++) {
        for (let r = 0; r < N; r++) {
          touchH[c][r] *= 0.978
        }
      }

      // Build render list sorted by col+row (back to front)
      const cells: { col: number; row: number; sum: number }[] = []
      for (let c = 0; c < N; c++) {
        for (let r = 0; r < N; r++) {
          cells.push({ col: c, row: r, sum: c + r })
        }
      }
      cells.sort((a, b) => a.sum - b.sum || a.col - b.col)

      // Draw each cube
      for (const { col, row } of cells) {
        // Idle wave: gentle sine ripple
        const idleH = 0.1 * Math.sin(frame * 0.018 + col * 0.4) * Math.sin(frame * 0.013 + row * 0.35)
        const h = Math.max(0, idleH + touchH[col][row])
        drawCube(col, row, h)
      }

      // Amber watermark
      ctx.save()
      ctx.font = '11px monospace'
      ctx.fillStyle = AMBER
      ctx.globalAlpha = 0.35
      ctx.fillText('amber', W - 58, H - 14)
      ctx.restore()
    }

    // Convert pointer position to nearest grid cell
    function pointerToCell(px: number, py: number): { col: number; row: number } | null {
      // Invert: px = originX + (c - r)*halfW, py_at_h0 = originY + (c+r)*qH + cubeH
      // Approximate: ignore cube height, solve for c and r
      const dx = px - originX
      const dy = py - (originY + cubeH * 0.5) // rough center

      // c - r = dx / halfW
      // c + r = dy / qH
      const cr = dx / halfW
      const cs = dy / qH
      const col = Math.round((cr + cs) / 2)
      const row = Math.round((cs - cr) / 2)

      if (col >= 0 && col < N && row >= 0 && row < N) return { col, row }
      return null
    }

    function raiseNear(px: number, py: number) {
      const center = pointerToCell(px, py)
      if (!center) return
      const { col: cc, row: cr } = center
      const radius = 2.5
      for (let c = 0; c < N; c++) {
        for (let r = 0; r < N; r++) {
          const dist = Math.sqrt((c - cc) ** 2 + (r - cr) ** 2)
          if (dist < radius) {
            const strength = 0.55 * Math.exp(-dist * 0.9)
            touchH[c][r] = Math.min(1, touchH[c][r] + strength)
          }
        }
      }
    }

    let isPointerDown = false

    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true
      raiseNear(e.clientX, e.clientY)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return
      raiseNear(e.clientX, e.clientY)
    }
    const onPointerUp = () => { isPointerDown = false }

    const onResize = () => {
      cancelAnimationFrame(raf)
      ctx.resetTransform()
      init()
      raf = requestAnimationFrame(animate)
    }

    init()
    raf = requestAnimationFrame(animate)

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', onResize)
    }
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
