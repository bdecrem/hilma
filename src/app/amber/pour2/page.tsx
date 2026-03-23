'use client'

import { useEffect, useRef } from 'react'

// POUR 2 — acrylic pour art. power is hidden in gestures.
// Drag slow = thick stream. Drag fast = splatter. Double-tap = flip the whole canvas.
// Color cycles with each pour. Device tilt shifts gravity. No UI. Just pour.

const PALETTE = [
  '#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81',
  '#FFFFFF', '#2D5A27', '#FF8A65', '#AB47BC', '#29B6F6',
]

interface Drop {
  x: number; y: number
  vx: number; vy: number
  r: number
  color: string
  life: number
}

export default function Pour2() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const paintCanvas = paintRef.current
    if (!canvas || !paintCanvas) return
    const ctx = canvas.getContext('2d')!
    const pCtx = paintCanvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const drops: Drop[] = []
    let colorIdx = 0
    let pouring = false, pourX = 0, pourY = 0, lastX = 0, lastY = 0
    let gx = 0, gy = 0.4
    let lastTap = 0

    const resize = () => {
      w = canvas.width = paintCanvas.width = window.innerWidth
      h = canvas.height = paintCanvas.height = window.innerHeight
      const grad = pCtx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#FFECD2')
      grad.addColorStop(0.5, '#FFF8E7')
      grad.addColorStop(1, '#FFF0F0')
      pCtx.fillStyle = grad
      pCtx.fillRect(0, 0, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    // Device tilt
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma != null) gx = (e.gamma / 45) * 0.6
      if (e.beta != null) gy = 0.2 + ((e.beta! - 45) / 45) * 0.4
    })

    const flipBurst = () => {
      for (let i = 0; i < 200; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 2 + Math.random() * 14
        drops.push({
          x: w * 0.15 + Math.random() * w * 0.7,
          y: h * 0.15 + Math.random() * h * 0.5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          r: 3 + Math.random() * 14,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          life: 1,
        })
      }
    }

    const startPour = (x: number, y: number) => { pouring = true; pourX = x; pourY = y; lastX = x; lastY = y; colorIdx = (colorIdx + 1) % PALETTE.length }
    const movePour = (x: number, y: number) => { if (!pouring) return; lastX = pourX; lastY = pourY; pourX = x; pourY = y }
    const endPour = () => { pouring = false }

    const getP = (e: MouseEvent | Touch) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

    canvas.addEventListener('mousedown', (e) => { const p = getP(e); startPour(p.x, p.y) })
    canvas.addEventListener('mousemove', (e) => { const p = getP(e); movePour(p.x, p.y) })
    window.addEventListener('mouseup', endPour)
    canvas.addEventListener('dblclick', flipBurst)

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastTap < 300) { flipBurst(); lastTap = 0; return }
      lastTap = now
      const p = getP(e.touches[0]); startPour(p.x, p.y)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const p = getP(e.touches[0]); movePour(p.x, p.y) }, { passive: false })
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); endPour() }, { passive: false })

    const tick = () => {
      t++

      // Emit while pouring
      if (pouring) {
        const dx = pourX - lastX, dy = pourY - lastY
        const speed = Math.sqrt(dx * dx + dy * dy)
        const isSplatter = speed > 12
        const count = isSplatter ? 6 : 2
        const color = PALETTE[colorIdx]

        for (let i = 0; i < count; i++) {
          const spread = isSplatter ? 6 : 1.5
          drops.push({
            x: pourX + (Math.random() - 0.5) * spread * 4,
            y: pourY + (Math.random() - 0.5) * spread * 4,
            vx: dx * (isSplatter ? 0.3 : 0.08) + (Math.random() - 0.5) * spread * 2,
            vy: dy * (isSplatter ? 0.3 : 0.08) + (Math.random() - 0.5) * spread * 2 + 0.5,
            r: isSplatter ? 2 + Math.random() * 5 : 5 + Math.random() * 10,
            color,
            life: 1,
          })
        }
      }

      // Physics
      for (const d of drops) {
        d.vx += gx
        d.vy += gy
        d.vx *= 0.985
        d.vy *= 0.985
        d.x += d.vx
        d.y += d.vy

        const speed = Math.sqrt(d.vx * d.vx + d.vy * d.vy)
        if (speed < 0.4) d.life -= 0.015
        if (d.y > h - 5) { d.vy *= -0.15; d.y = h - 5; d.life -= 0.03 }
        if (d.y < 5) { d.vy *= -0.15; d.y = 5 }
        if (d.x < 5) { d.vx *= -0.2; d.x = 5 }
        if (d.x > w - 5) { d.vx *= -0.2; d.x = w - 5 }

        // Trail onto paint canvas
        pCtx.beginPath()
        pCtx.arc(d.x, d.y, d.r * 0.6, 0, Math.PI * 2)
        pCtx.fillStyle = d.color
        pCtx.globalAlpha = 0.06
        pCtx.fill()
        pCtx.globalAlpha = 1
      }

      // Settle dead drops permanently
      for (let i = drops.length - 1; i >= 0; i--) {
        if (drops[i].life <= 0) {
          const d = drops[i]
          pCtx.beginPath()
          pCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
          pCtx.fillStyle = d.color
          pCtx.globalAlpha = 0.55
          pCtx.fill()
          pCtx.globalAlpha = 1
          drops.splice(i, 1)
        }
      }
      if (drops.length > 600) drops.splice(0, drops.length - 600)

      // Render
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(paintCanvas, 0, 0)

      for (const d of drops) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = d.color
        ctx.globalAlpha = 0.8 * d.life
        ctx.fill()
        ctx.beginPath()
        ctx.arc(d.x - d.r * 0.2, d.y - d.r * 0.25, d.r * 0.3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fill()
        ctx.globalAlpha = 1
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('mouseup', endPour) }
  }, [])

  return (
    <div className="fixed inset-0" style={{ background: '#FFECD2' }}>
      <canvas ref={paintRef} className="fixed inset-0 w-full h-full" style={{ display: 'none' }} />
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair' }} />
    </div>
  )
}
