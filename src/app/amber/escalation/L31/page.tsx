'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const GRID = 32
const SCALE = 12

// Simple hash-based noise
function noise2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 73.3) * 43758.5453
  return n - Math.floor(n)
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = noise2D(ix, iy, seed)
  const b = noise2D(ix + 1, iy, seed)
  const c = noise2D(ix, iy + 1, seed)
  const d = noise2D(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm(x: number, y: number, seed: number): number {
  let v = 0, amp = 1, freq = 1
  for (let i = 0; i < 4; i++) {
    v += smoothNoise(x * freq, y * freq, seed) * amp
    amp *= 0.5
    freq *= 2
  }
  return v
}

export default function L31() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const angleRef = useRef({ x: 0.6, y: 0 })
  const timeRef = useRef(0)

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
    const [bg1, bg2] = pickGradientColors('L31')
    let raf: number

    // 3D projection
    function project(x: number, y: number, z: number): [number, number, number] {
      const ax = angleRef.current.x
      const ay = angleRef.current.y

      // Rotate around Y
      let rx = x * Math.cos(ay) - z * Math.sin(ay)
      let rz = x * Math.sin(ay) + z * Math.cos(ay)
      let ry = y

      // Rotate around X
      const ry2 = ry * Math.cos(ax) - rz * Math.sin(ax)
      const rz2 = ry * Math.sin(ax) + rz * Math.cos(ax)

      // Perspective
      const fov = 500
      const dist = fov + rz2
      const px = W / 2 + (rx * fov) / dist
      const py = H / 2 + (ry2 * fov) / dist

      return [px, py, rz2]
    }

    const draw = () => {
      timeRef.current += 0.003
      const t = timeRef.current

      // Auto-rotate slowly
      angleRef.current.y += 0.002

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Generate height map
      const heights: number[][] = []
      for (let r = 0; r <= GRID; r++) {
        heights[r] = []
        for (let c = 0; c <= GRID; c++) {
          const nx = c * 0.15
          const ny = r * 0.15
          heights[r][c] = fbm(nx + t * 2, ny + t, 42) * 60 - 30
        }
      }

      // Collect lines for depth sorting
      const lines: { x1: number; y1: number; x2: number; y2: number; z: number; color: string; alpha: number }[] = []

      const half = GRID / 2

      for (let r = 0; r <= GRID; r++) {
        for (let c = 0; c <= GRID; c++) {
          const wx = (c - half) * SCALE
          const wz = (r - half) * SCALE
          const wy = -heights[r][c]

          const [px, py, pz] = project(wx, wy, wz)
          const colorIdx = Math.floor(((heights[r][c] + 30) / 60) * CITRUS.length)
          const color = CITRUS[Math.max(0, Math.min(CITRUS.length - 1, colorIdx))]

          // Horizontal line to right
          if (c < GRID) {
            const wx2 = (c + 1 - half) * SCALE
            const wy2 = -heights[r][c + 1]
            const [px2, py2, pz2] = project(wx2, wy2, wz)
            lines.push({ x1: px, y1: py, x2: px2, y2: py2, z: (pz + pz2) / 2, color, alpha: 0.6 })
          }

          // Vertical line downward
          if (r < GRID) {
            const wz2 = (r + 1 - half) * SCALE
            const wy2 = -heights[r + 1][c]
            const [px2, py2, pz2] = project(wx, wy2, wz2)
            lines.push({ x1: px, y1: py, x2: px2, y2: py2, z: (pz + pz2) / 2, color, alpha: 0.6 })
          }
        }
      }

      // Sort back to front
      lines.sort((a, b) => b.z - a.z)

      // Draw
      for (const line of lines) {
        // Depth fade
        const depthFade = Math.max(0.1, Math.min(1, 1 - line.z / 600))
        ctx.beginPath()
        ctx.moveTo(line.x1, line.y1)
        ctx.lineTo(line.x2, line.y2)
        ctx.strokeStyle = line.color
        ctx.lineWidth = 1
        ctx.globalAlpha = line.alpha * depthFade
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Hint
      ctx.globalAlpha = 0.2
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText('drag to rotate', 12, H - 12)
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    // Drag to rotate
    let dragging = false
    let lastX = 0, lastY = 0

    const onStart = (cx: number, cy: number) => {
      dragging = true
      lastX = cx; lastY = cy
    }
    const onMove = (cx: number, cy: number) => {
      if (!dragging) return
      angleRef.current.y += (cx - lastX) * 0.005
      angleRef.current.x += (cy - lastY) * 0.005
      angleRef.current.x = Math.max(-1.2, Math.min(1.2, angleRef.current.x))
      lastX = cx; lastY = cy
    }
    const onEnd = () => { dragging = false }

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
    canvas.addEventListener('mousemove', (e: MouseEvent) => onMove(e.clientX, e.clientY))
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
