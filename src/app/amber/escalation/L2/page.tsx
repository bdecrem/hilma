'use client'

import { useEffect, useRef } from 'react'

export default function L2() {
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
      ctx.fillStyle = '#0A0908'
      ctx.fillRect(0, 0, w, h)

      // A line, growing from center, rotating slowly
      const len = Math.min(w, h) * 0.3 * (Math.sin(t * 0.008) * 0.4 + 0.6)
      const angle = t * 0.003
      const cx = w / 2, cy = h / 2

      ctx.beginPath()
      ctx.moveTo(cx - Math.cos(angle) * len, cy - Math.sin(angle) * len)
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
      ctx.strokeStyle = `rgba(212, 165, 116, ${0.7 + Math.sin(t * 0.02) * 0.3})`
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.stroke()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" />
}
