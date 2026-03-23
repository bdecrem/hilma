'use client'

import { useEffect, useRef } from 'react'

// PULSE — concentric citrus rings, phase-shifted, moiré interference
// Touch to move the center. About resonance.

const BG = '#FFECD2'
const COLORS = [
  { r: 255, g: 78, b: 80 },   // blood orange
  { r: 252, g: 145, b: 58 },  // tangerine
  { r: 249, g: 212, b: 35 },  // mango
  { r: 180, g: 227, b: 61 },  // lime
  { r: 255, g: 107, b: 129 }, // grapefruit
  { r: 252, g: 145, b: 58 },  // tangerine again
  { r: 249, g: 212, b: 35 },  // mango again
]

const RING_COUNT = 7
const WAVES_PER_RING = 12

export default function Pulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let cx: number, cy: number
    let targetX: number, targetY: number

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      cx = w / 2; cy = h / 2
      targetX = cx; targetY = cy
    }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (x: number, y: number) => { targetX = x; targetY = y }
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect()
      onMove(e.clientX - rect.left, e.clientY - rect.top)
    })
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      onMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top)
    }, { passive: false })
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      onMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top)
    }, { passive: false })

    const tick = () => {
      t++

      // Ease center toward touch
      cx += (targetX - cx) * 0.03
      cy += (targetY - cy) * 0.03

      // Clear
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      const maxR = Math.sqrt(w * w + h * h) * 0.6

      // Draw rings using ImageData for per-pixel control
      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data

      for (let py = 0; py < h; py += 2) {
        for (let px = 0; px < w; px += 2) {
          const dx = px - cx, dy = py - cy
          const dist = Math.sqrt(dx * dx + dy * dy)

          let rTotal = 0, gTotal = 0, bTotal = 0

          for (let ring = 0; ring < RING_COUNT; ring++) {
            const freq = 0.02 + ring * 0.008
            const phase = ring * 0.9 + t * (0.008 + ring * 0.002)
            const wave = Math.sin(dist * freq - phase)

            // Only draw the peaks
            if (wave > 0.3) {
              const intensity = (wave - 0.3) / 0.7
              const c = COLORS[ring]
              rTotal += c.r * intensity * 0.15
              gTotal += c.g * intensity * 0.15
              bTotal += c.b * intensity * 0.15
            }
          }

          if (rTotal > 0 || gTotal > 0 || bTotal > 0) {
            // Apply to 2x2 block
            for (let dy2 = 0; dy2 < 2 && py + dy2 < h; dy2++) {
              for (let dx2 = 0; dx2 < 2 && px + dx2 < w; dx2++) {
                const i = ((py + dy2) * w + (px + dx2)) * 4
                // Blend with background (peach: 255, 236, 210)
                data[i] = Math.min(255, 255 - rTotal * 0.3 + rTotal)
                data[i + 1] = Math.min(255, 236 - gTotal * 0.5 + gTotal)
                data[i + 2] = Math.min(255, 210 - bTotal * 0.6 + bTotal)
              }
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)

      // Draw soft citrus arcs on top for extra depth
      ctx.globalCompositeOperation = 'multiply'
      for (let ring = 0; ring < 5; ring++) {
        const r = (t * (0.5 + ring * 0.3) + ring * 60) % maxR
        const c = COLORS[ring]
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.08)`
        ctx.lineWidth = 8 + Math.sin(t * 0.01 + ring) * 4
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'

      // Center dot — legacy amber
      ctx.fillStyle = `rgba(212, 165, 116, ${0.2 + Math.sin(t * 0.02) * 0.1})`
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fill()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
