'use client'

import { useEffect, useRef } from 'react'

export default function L3() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let mx = -1, my = -1
    let tx = 0, ty = 0, angle = 0

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; tx = w / 2; ty = h / 2 }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    const onTouch = (e: TouchEvent) => { e.preventDefault(); mx = e.touches[0].clientX; my = e.touches[0].clientY }
    window.addEventListener('mousemove', onMove)
    canvas.addEventListener('touchmove', onTouch, { passive: false })
    canvas.addEventListener('touchstart', onTouch, { passive: false })

    const tick = () => {
      t++
      ctx.fillStyle = '#0A0908'
      ctx.fillRect(0, 0, w, h)

      // Ease toward cursor (or center if no input yet)
      const targetX = mx > 0 ? mx : w / 2
      const targetY = my > 0 ? my : h / 2
      tx += (targetX - tx) * 0.04
      ty += (targetY - ty) * 0.04

      // Point toward target
      const targetAngle = Math.atan2(targetY - ty, targetX - tx) + Math.PI / 2
      let da = targetAngle - angle
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      angle += da * 0.06

      // Triangle size breathes slightly
      const r = Math.min(w, h) * 0.03 * (0.85 + Math.sin(t * 0.03) * 0.15)

      ctx.save()
      ctx.translate(tx, ty)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.lineTo(-r * 0.6, r * 0.5)
      ctx.lineTo(r * 0.6, r * 0.5)
      ctx.closePath()
      ctx.fillStyle = `rgba(212, 165, 116, ${0.6 + Math.sin(t * 0.02) * 0.2})`
      ctx.fill()
      ctx.restore()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#0A0908' }} />
}
