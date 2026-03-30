'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42', '#E8D44D']

export default function KaleidPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const [bg1, bg2] = pickGradientColors('kaleid')
    const SEGMENTS = 12
    const cx = W / 2
    const cy = H / 2

    // Trail of points
    interface Point { x: number; y: number; age: number; color: string; size: number }
    const points: Point[] = []
    let pointerX = cx
    let pointerY = cy
    let pointerDown = false
    let time = 0

    function onMove(e: PointerEvent) {
      pointerX = e.clientX
      pointerY = e.clientY
    }

    function onDown(e: PointerEvent) {
      pointerDown = true
      pointerX = e.clientX
      pointerY = e.clientY
      canvas!.setPointerCapture(e.pointerId)
    }

    function onUp() {
      pointerDown = false
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // Auto-draw mode when idle
    let idleTime = 0
    let autoAngle = 0

    let raf: number
    function animate() {
      time++

      // Auto-draw when not touching
      if (!pointerDown) {
        idleTime++
        if (idleTime > 60) {
          autoAngle += 0.02
          const r = Math.min(W, H) * 0.2 + Math.sin(time * 0.013) * Math.min(W, H) * 0.1
          pointerX = cx + Math.cos(autoAngle) * r + Math.sin(autoAngle * 3.7) * r * 0.3
          pointerY = cy + Math.sin(autoAngle) * r + Math.cos(autoAngle * 2.3) * r * 0.2
        }
      } else {
        idleTime = 0
      }

      // Add points
      if (pointerDown || idleTime > 60) {
        const colorIdx = Math.floor(time / 8) % CITRUS.length
        points.push({
          x: pointerX - cx,
          y: pointerY - cy,
          age: 0,
          color: CITRUS[colorIdx],
          size: 3 + Math.sin(time * 0.1) * 2 + (pointerDown ? 0 : 1),
        })
      }

      // Age and prune
      for (let i = points.length - 1; i >= 0; i--) {
        points[i].age++
        if (points[i].age > 300) {
          points.splice(i, 1)
        }
      }

      // Draw background
      const grad = ctx!.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, W, H)

      // Draw kaleidoscope
      ctx!.save()
      ctx!.translate(cx, cy)

      const segAngle = (Math.PI * 2) / SEGMENTS

      for (const p of points) {
        const alpha = Math.max(0, 1 - p.age / 300)
        ctx!.globalAlpha = alpha * 0.85

        // Convert to polar
        const dist = Math.sqrt(p.x * p.x + p.y * p.y)
        const angle = Math.atan2(p.y, p.x)

        // Normalize angle into first segment
        let normAngle = ((angle % segAngle) + segAngle) % segAngle

        for (let s = 0; s < SEGMENTS; s++) {
          const baseAngle = s * segAngle

          // Normal reflection
          const a1 = baseAngle + normAngle
          const px1 = Math.cos(a1) * dist
          const py1 = Math.sin(a1) * dist

          // Mirror reflection
          const a2 = baseAngle + segAngle - normAngle
          const px2 = Math.cos(a2) * dist
          const py2 = Math.sin(a2) * dist

          // Draw shape at both positions
          ctx!.fillStyle = p.color
          drawShape(ctx!, px1, py1, p.size, time + s)
          drawShape(ctx!, px2, py2, p.size, time + s)
        }
      }

      ctx!.restore()

      // Center jewel
      ctx!.save()
      ctx!.globalAlpha = 0.5
      const jewR = 8 + Math.sin(time * 0.05) * 3
      ctx!.beginPath()
      ctx!.arc(cx, cy, jewR, 0, Math.PI * 2)
      ctx!.fillStyle = '#FFF8E7'
      ctx!.fill()
      ctx!.restore()

      // Hint
      if (points.length < 20 && idleTime < 60) {
        ctx!.save()
        ctx!.globalAlpha = 0.3 + Math.sin(Date.now() / 700) * 0.1
        ctx!.fillStyle = '#2A2218'
        ctx!.font = `${Math.max(14, W * 0.018)}px system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.fillText('touch and drag', W / 2, H - 40)
        ctx!.restore()
      }

      raf = requestAnimationFrame(animate)
    }

    function drawShape(c: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
      const shape = Math.floor(t / 40) % 3
      c.beginPath()
      if (shape === 0) {
        // Circle
        c.arc(x, y, size, 0, Math.PI * 2)
      } else if (shape === 1) {
        // Diamond
        c.moveTo(x, y - size)
        c.lineTo(x + size, y)
        c.lineTo(x, y + size)
        c.lineTo(x - size, y)
      } else {
        // Triangle
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 - Math.PI / 2
          const px = x + Math.cos(a) * size
          const py = y + Math.sin(a) * size
          if (i === 0) c.moveTo(px, py)
          else c.lineTo(px, py)
        }
      }
      c.closePath()
      c.fill()
    }

    animate()

    function onResize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas!.removeEventListener('pointermove', onMove)
      canvas!.removeEventListener('pointerdown', onDown)
      canvas!.removeEventListener('pointerup', onUp)
      canvas!.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
    />
  )
}
