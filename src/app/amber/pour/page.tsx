'use client'

import { useEffect, useRef } from 'react'

// POUR — tilt to pour color. a painting made by pouring.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Drop {
  x: number; y: number
  vx: number; vy: number
  r: number
  color: string
  settled: boolean
}

export default function Pour() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const bgCanvas = bgRef.current
    if (!canvas || !bgCanvas) return
    const ctx = canvas.getContext('2d')!
    const bgCtx = bgCanvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let tilt = 0 // -1 to 1
    let targetTilt = 0
    let colorIdx = 0
    let pouring = false
    const drops: Drop[] = []

    // Vessel state
    let fillLevel = 1 // 0-1
    const VESSEL_W = 60, VESSEL_H = 80

    const resize = () => {
      w = canvas.width = bgCanvas.width = window.innerWidth
      h = canvas.height = bgCanvas.height = window.innerHeight
      // Paint gradient bg on bg canvas
      const grad = bgCtx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#FFECD2')
      grad.addColorStop(0.5, '#FFFDE7')
      grad.addColorStop(1, '#FFF0F0')
      bgCtx.fillStyle = grad
      bgCtx.fillRect(0, 0, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    // Drag to tilt
    let dragging = false, dragStartX = 0
    canvas.addEventListener('mousedown', (e) => { dragging = true; dragStartX = e.clientX })
    canvas.addEventListener('mousemove', (e) => { if (dragging) targetTilt = Math.max(-1, Math.min(1, (e.clientX - w / 2) / (w * 0.3))) })
    window.addEventListener('mouseup', () => { dragging = false; targetTilt = 0 })
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); dragging = true }, { passive: false })
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      if (dragging) targetTilt = Math.max(-1, Math.min(1, (e.touches[0].clientX - w / 2) / (w * 0.3)))
    }, { passive: false })
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); dragging = false; targetTilt = 0 }, { passive: false })

    const tick = () => {
      t++
      tilt += (targetTilt - tilt) * 0.08

      // Refill slowly when not pouring
      const pourThreshold = 0.25
      pouring = Math.abs(tilt) > pourThreshold && fillLevel > 0.02

      if (!pouring) fillLevel = Math.min(1, fillLevel + 0.003)

      // Draw
      ctx.clearRect(0, 0, w, h)
      // Copy bg
      ctx.drawImage(bgCanvas, 0, 0)

      // Vessel position
      const vx = w / 2, vy = h * 0.25
      const angle = tilt * 0.8

      ctx.save()
      ctx.translate(vx, vy)
      ctx.rotate(angle)

      // Vessel body — rounded trapezoid
      const vw = VESSEL_W, vh = VESSEL_H
      ctx.beginPath()
      ctx.moveTo(-vw / 2, -vh / 2)
      ctx.lineTo(-vw / 2 - 8, vh / 2)
      ctx.lineTo(vw / 2 + 8, vh / 2)
      ctx.lineTo(vw / 2, -vh / 2)
      ctx.closePath()
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.strokeStyle = '#2A2218'
      ctx.lineWidth = 3
      ctx.stroke()

      // Liquid inside — level based on fillLevel
      const liquidH = vh * fillLevel * 0.8
      const liquidTop = vh / 2 - liquidH
      ctx.beginPath()
      const lw1 = (vw / 2 + 8) * (1 - (liquidTop / vh + 0.5) * 0.15)
      const lw2 = vw / 2 + 8
      ctx.moveTo(-lw1, liquidTop)
      ctx.lineTo(-lw2, vh / 2)
      ctx.lineTo(lw2, vh / 2)
      ctx.lineTo(lw1, liquidTop)
      ctx.closePath()
      ctx.fillStyle = COLORS[colorIdx % COLORS.length]
      ctx.globalAlpha = 0.7
      ctx.fill()
      ctx.globalAlpha = 1

      // Spout highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(-vw / 2 + 4, -vh / 2 + 4, 6, vh - 8)

      ctx.restore()

      // Pour drops
      if (pouring) {
        fillLevel -= 0.004

        // Emit drops from vessel lip
        const lipX = vx + Math.sin(angle) * (VESSEL_H / 2) + Math.cos(angle) * (tilt > 0 ? VESSEL_W / 2 + 8 : -VESSEL_W / 2 - 8)
        const lipY = vy + Math.cos(angle) * (VESSEL_H / 2) - Math.sin(angle) * (tilt > 0 ? VESSEL_W / 2 : -VESSEL_W / 2)

        for (let i = 0; i < 2; i++) {
          drops.push({
            x: lipX + (Math.random() - 0.5) * 6,
            y: lipY,
            vx: tilt * 2 + (Math.random() - 0.5) * 0.5,
            vy: 1 + Math.random(),
            r: 3 + Math.random() * 4,
            color: COLORS[colorIdx % COLORS.length],
            settled: false,
          })
        }

        // Change color when vessel empties past thresholds
        if (fillLevel < 0.02) {
          colorIdx++
          fillLevel = 0
        }
      }

      // Physics for drops
      for (const d of drops) {
        if (d.settled) {
          // Paint onto bg canvas permanently
          bgCtx.fillStyle = d.color
          bgCtx.globalAlpha = 0.5
          bgCtx.beginPath()
          bgCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
          bgCtx.fill()
          bgCtx.globalAlpha = 1
          d.settled = false // only paint once, then mark for removal
          d.r = -1 // mark dead
          continue
        }
        if (d.r < 0) continue

        d.vy += 0.25
        d.x += d.vx
        d.y += d.vy
        d.vx *= 0.99

        // Settle at bottom region
        if (d.y > h * 0.85) {
          d.settled = true
          continue
        }

        // Draw falling drop
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = d.color
        ctx.globalAlpha = 0.8
        ctx.fill()
        ctx.globalAlpha = 1

        // Highlight
        ctx.beginPath()
        ctx.arc(d.x - d.r * 0.2, d.y - d.r * 0.2, d.r * 0.3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fill()
      }

      // Clean up dead drops
      for (let i = drops.length - 1; i >= 0; i--) {
        if (drops[i].r < 0) drops.splice(i, 1)
      }
      if (drops.length > 200) drops.splice(0, drops.length - 200)

      // Hint
      if (t < 150) {
        ctx.fillStyle = `rgba(42, 34, 24, ${Math.max(0, 0.15 - t * 0.001)})`
        ctx.font = '13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('drag left or right to pour', w / 2, h * 0.55)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="fixed inset-0" style={{ background: '#FFECD2' }}>
      <canvas ref={bgRef} className="fixed inset-0 w-full h-full" />
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'grab' }} />
    </div>
  )
}
