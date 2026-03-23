'use client'

import { useEffect, useRef } from 'react'

interface Thread {
  x1: number; y1: number
  x2: number; y2: number
  freq: number
  phase: number
  hue: number
  width: number
  age: number
}

interface Pin {
  x: number; y: number
  hue: number
}

export default function Loom() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const threads: Thread[] = []
    const pins: Pin[] = []
    let dragStart: { x: number; y: number } | null = null

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    // Seed initial threads
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI
      const cx = w / 2, cy = h / 2
      const len = Math.min(w, h) * 0.4
      threads.push({
        x1: cx - Math.cos(angle) * len, y1: cy - Math.sin(angle) * len,
        x2: cx + Math.cos(angle) * len, y2: cy + Math.sin(angle) * len,
        freq: 0.005 + Math.random() * 0.01,
        phase: Math.random() * Math.PI * 2,
        hue: 25 + i * 8, // amber range
        width: 1 + Math.random() * 1.5,
        age: 0,
      })
    }

    const addThread = (x1: number, y1: number, x2: number, y2: number) => {
      threads.push({
        x1, y1, x2, y2,
        freq: 0.004 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
        hue: 15 + Math.random() * 30,
        width: 1 + Math.random() * 2,
        age: 0,
      })
      // Keep manageable
      if (threads.length > 60) threads.shift()
    }

    // Pointer events
    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    canvas.addEventListener('mousedown', (e) => { dragStart = getPos(e) })
    canvas.addEventListener('mouseup', (e) => {
      if (!dragStart) return
      const end = getPos(e)
      const dist = Math.sqrt((end.x - dragStart.x) ** 2 + (end.y - dragStart.y) ** 2)
      if (dist > 30) {
        addThread(dragStart.x, dragStart.y, end.x, end.y)
      } else {
        pins.push({ x: end.x, y: end.y, hue: 25 + Math.random() * 20 })
        if (pins.length > 30) pins.shift()
      }
      dragStart = null
    })
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); dragStart = getPos(e.touches[0]) }, { passive: false })
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      if (!dragStart) return
      const touch = e.changedTouches[0]
      const end = getPos(touch)
      const dist = Math.sqrt((end.x - dragStart.x) ** 2 + (end.y - dragStart.y) ** 2)
      if (dist > 30) {
        addThread(dragStart.x, dragStart.y, end.x, end.y)
      } else {
        pins.push({ x: end.x, y: end.y, hue: 25 + Math.random() * 20 })
      }
      dragStart = null
    }, { passive: false })

    const tick = () => {
      t++

      // Fade instead of clear — trails persist
      ctx.fillStyle = 'rgba(10, 9, 8, 0.06)'
      ctx.fillRect(0, 0, w, h)

      // Draw threads as vibrating strings
      for (const thread of threads) {
        thread.age++
        const dx = thread.x2 - thread.x1
        const dy = thread.y2 - thread.y1
        const len = Math.sqrt(dx * dx + dy * dy)
        const nx = -dy / len // normal
        const ny = dx / len
        const segments = Math.max(20, Math.floor(len / 8))

        ctx.beginPath()
        for (let i = 0; i <= segments; i++) {
          const frac = i / segments
          const baseX = thread.x1 + dx * frac
          const baseY = thread.y1 + dy * frac

          // String vibration: sine wave along the normal
          const envelope = Math.sin(frac * Math.PI) // zero at endpoints
          const vibration = Math.sin(frac * Math.PI * 3 + t * thread.freq * 60 + thread.phase) * envelope * 12

          // Influence from pins
          let pinPull = 0
          for (const pin of pins) {
            const pdx = pin.x - baseX, pdy = pin.y - baseY
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy)
            if (pdist < 80) {
              pinPull += (1 - pdist / 80) * 15 * Math.sin(t * 0.03 + pdist * 0.1)
            }
          }

          const px = baseX + nx * (vibration + pinPull)
          const py = baseY + ny * (vibration + pinPull)

          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }

        const alpha = Math.min(1, thread.age * 0.02) * (0.3 + Math.sin(t * thread.freq + thread.phase) * 0.15)
        ctx.strokeStyle = `hsla(${thread.hue}, 60%, 55%, ${alpha})`
        ctx.lineWidth = thread.width
        ctx.stroke()
      }

      // Draw intersection glows where threads cross
      for (let i = 0; i < threads.length; i++) {
        for (let j = i + 1; j < threads.length; j++) {
          const a = threads[i], b = threads[j]
          // Simple midpoint approximation for intersections
          const ix = (a.x1 + a.x2 + b.x1 + b.x2) / 4
          const iy = (a.y1 + a.y2 + b.y1 + b.y2) / 4
          const adx = a.x2 - a.x1, ady = a.y2 - a.y1
          const bdx = b.x2 - b.x1, bdy = b.y2 - b.y1
          const cross = Math.abs(adx * bdy - ady * bdx)
          const normCross = cross / (Math.sqrt(adx * adx + ady * ady) * Math.sqrt(bdx * bdx + bdy * bdy) + 1)

          if (normCross > 0.3) {
            const pulse = 0.5 + 0.5 * Math.sin(t * (a.freq + b.freq) * 30 + a.phase + b.phase)
            const glow = ctx.createRadialGradient(ix, iy, 0, ix, iy, 15 + pulse * 10)
            glow.addColorStop(0, `hsla(${(a.hue + b.hue) / 2}, 50%, 60%, ${0.06 * pulse * normCross})`)
            glow.addColorStop(1, 'transparent')
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(ix, iy, 15 + pulse * 10, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // Draw pins
      for (const pin of pins) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.04 + pin.x * 0.01)
        ctx.fillStyle = `hsla(${pin.hue}, 50%, 55%, ${0.4 + pulse * 0.3})`
        ctx.beginPath()
        ctx.arc(pin.x, pin.y, 2.5 + pulse, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw drag preview
      if (dragStart) {
        ctx.strokeStyle = 'rgba(212, 165, 116, 0.15)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(dragStart.x, dragStart.y)
        ctx.lineTo(dragStart.x + 1, dragStart.y + 1)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Subtle hint text
      if (t < 300) {
        ctx.fillStyle = `rgba(212, 165, 116, ${Math.max(0, 0.15 - t * 0.0005)})`
        ctx.font = '11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('drag to weave — tap to pin', w / 2, h - 30)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair', background: '#0A0908' }} />
}
