'use client'

import { useEffect, useRef } from 'react'

// L4: MEMORY — three shapes orbit, trailing afterimages. the canvas remembers.

export default function L4() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const tick = () => {
      t++

      // Slow fade — trails persist
      ctx.fillStyle = 'rgba(10, 9, 8, 0.03)'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2, cy = h / 2
      const orbitR = Math.min(w, h) * 0.2
      const breath = Math.sin(t * 0.015) * 0.2 + 0.8

      // L1's circle — orbits slowly, breathes
      const c1x = cx + Math.cos(t * 0.008) * orbitR
      const c1y = cy + Math.sin(t * 0.008) * orbitR * 0.6
      const cr = Math.min(w, h) * 0.02 * breath
      ctx.beginPath()
      ctx.arc(c1x, c1y, cr, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(212, 165, 116, 0.7)`
      ctx.fill()

      // L2's line — orbits opposite, rotates
      const l2x = cx + Math.cos(t * 0.008 + Math.PI * 0.67) * orbitR
      const l2y = cy + Math.sin(t * 0.008 + Math.PI * 0.67) * orbitR * 0.6
      const lineLen = Math.min(w, h) * 0.04 * breath
      const lineAngle = t * 0.012
      ctx.beginPath()
      ctx.moveTo(l2x - Math.cos(lineAngle) * lineLen, l2y - Math.sin(lineAngle) * lineLen)
      ctx.lineTo(l2x + Math.cos(lineAngle) * lineLen, l2y + Math.sin(lineAngle) * lineLen)
      ctx.strokeStyle = `rgba(212, 165, 116, 0.6)`
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.stroke()

      // L3's triangle — orbits third position, points outward
      const t3x = cx + Math.cos(t * 0.008 + Math.PI * 1.33) * orbitR
      const t3y = cy + Math.sin(t * 0.008 + Math.PI * 1.33) * orbitR * 0.6
      const triR = Math.min(w, h) * 0.018 * breath
      const triAngle = Math.atan2(t3y - cy, t3x - cx) + Math.PI / 2
      ctx.save()
      ctx.translate(t3x, t3y)
      ctx.rotate(triAngle)
      ctx.beginPath()
      ctx.moveTo(0, -triR)
      ctx.lineTo(-triR * 0.6, triR * 0.5)
      ctx.lineTo(triR * 0.6, triR * 0.5)
      ctx.closePath()
      ctx.fillStyle = `rgba(212, 165, 116, 0.65)`
      ctx.fill()
      ctx.restore()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#0A0908' }} />
}
