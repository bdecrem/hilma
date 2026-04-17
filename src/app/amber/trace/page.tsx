// The viewer sees: a dark plate. A single cream hairline crosses it at a shallow angle. One lime dot
// sits on the line — the one place something was actually detected. Touch the plate to leave a cream
// cross-mark with a tiny coordinate readout; marks fade over ~45 seconds. Evidence accumulating, then
// forgotten.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

interface Mark {
  x: number
  y: number
  t: number // ms born
  coords: string
}

const FADE_MS = 45000
const MAX_MARKS = 60

export default function Trace() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const marksRef = useRef<Mark[]>([])
  const lineRef = useRef<{ x1: number; y1: number; x2: number; y2: number; sx: number; sy: number } | null>(null)
  const startRef = useRef(performance.now())

  const buildLine = useCallback((vw: number, vh: number) => {
    // Shallow angle across the plate. Enter on the left at ~38% down, exit on the right at ~46%.
    const y1 = vh * 0.38
    const y2 = vh * 0.46
    const x1 = vw * 0.04
    const x2 = vw * 0.96
    // The signal dot: ~62% along the line
    const t = 0.62
    const sx = x1 + (x2 - x1) * t
    const sy = y1 + (y2 - y1) * t
    lineRef.current = { x1, y1, x2, y2, sx, sy }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const coords = `${Math.round(px).toString().padStart(4, '0')} · ${Math.round(py).toString().padStart(4, '0')}`
    const marks = marksRef.current
    marks.push({ x: px, y: py, t: performance.now(), coords })
    if (marks.length > MAX_MARKS) marks.shift()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildLine(window.innerWidth, window.innerHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const now = performance.now()

      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      // Draw the main trace line — a single hairline across the plate
      const line = lineRef.current
      if (line) {
        ctx.strokeStyle = CREAM
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(line.x1, line.y1)
        ctx.lineTo(line.x2, line.y2)
        ctx.stroke()
        ctx.globalAlpha = 1

        // Signal dot — the one place something passed through
        // A very faint breathing pulse on the dot (not the line)
        const pulse = 0.72 + 0.18 * Math.sin((now - startRef.current) / 1200)
        ctx.save()
        ctx.shadowColor = LIME
        ctx.shadowBlur = 10
        ctx.fillStyle = LIME
        ctx.globalAlpha = pulse
        ctx.beginPath()
        ctx.arc(line.sx, line.sy, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Tiny tick marks on the line, regular interval
        ctx.strokeStyle = CREAM
        ctx.globalAlpha = 0.22
        ctx.lineWidth = 1
        const ticks = 24
        for (let i = 1; i < ticks; i++) {
          const t = i / ticks
          const tx = line.x1 + (line.x2 - line.x1) * t
          const ty = line.y1 + (line.y2 - line.y1) * t
          const len = i % 4 === 0 ? 6 : 3
          ctx.beginPath()
          ctx.moveTo(tx, ty - len)
          ctx.lineTo(tx, ty + len)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Draw accumulated marks (cream crosses), fading over FADE_MS
      const marks = marksRef.current
      ctx.font = '700 9px "Courier Prime", monospace'
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i]
        const age = now - m.t
        if (age > FADE_MS) continue
        const a = 1 - age / FADE_MS
        ctx.globalAlpha = a * 0.9
        ctx.strokeStyle = CREAM
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(m.x - 5, m.y)
        ctx.lineTo(m.x + 5, m.y)
        ctx.moveTo(m.x, m.y - 5)
        ctx.lineTo(m.x, m.y + 5)
        ctx.stroke()
        // Coordinate readout, very faint, to the right of the mark
        ctx.globalAlpha = a * 0.45
        ctx.fillStyle = CREAM
        ctx.textAlign = 'left'
        ctx.fillText(m.coords, m.x + 10, m.y + 3)
      }
      ctx.globalAlpha = 1

      // Upper-right: spec + count
      ctx.textAlign = 'right'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.35
      const count = marks.filter((m) => now - m.t < FADE_MS).length
      ctx.fillText(`MARKS · ${count.toString().padStart(2, '0')}`, vw - 28, 36)
      ctx.globalAlpha = 0.2
      ctx.fillText('SPEC · 008', vw - 28, 54)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('trace', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('something passed through here', labelX, labelY + 18)
      ctx.globalAlpha = 1

      animRef.current = requestAnimationFrame(animate)
    }

    animate()
    canvas.addEventListener('pointerdown', handlePointerDown)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [buildLine, handlePointerDown])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          touchAction: 'none',
          background: NIGHT,
        }}
      />
    </>
  )
}
