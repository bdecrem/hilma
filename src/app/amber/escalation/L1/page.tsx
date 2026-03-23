'use client'

import { useEffect, useRef } from 'react'

export default function L1() {
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

      // One circle. Breathing.
      const breath = Math.sin(t * 0.02) * 0.3 + 0.7
      const r = Math.min(w, h) * 0.04 * breath
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(212, 165, 116, ${0.6 + breath * 0.4})`
      ctx.fill()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" />
}
