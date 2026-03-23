'use client'

import { useEffect, useRef } from 'react'

// ONE-LINE STORY: "every app on your phone is a tiny mouth asking to be fed."
// Phone with app icons that are literal mouths, chomping and yawning.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8A65', '#AB47BC', '#29B6F6', '#2D9A7E', '#FF4E50', '#FC913A', '#F9D423']

export default function Mouths() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    // App grid: 3 columns x 4 rows of mouths
    const apps = COLORS.map((color, i) => ({
      color,
      chompSpeed: 0.03 + Math.random() * 0.04,
      chompPhase: Math.random() * Math.PI * 2,
      isYawning: Math.random() < 0.15,
      yawnTimer: Math.random() * 300,
      hasBadge: Math.random() < 0.4,
    }))

    const tick = () => {
      t++

      // Gradient bg
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#FFECD2')
      grad.addColorStop(1, '#FFFDE7')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // Sentence at top
      ctx.fillStyle = '#2A2218'
      ctx.font = `${Math.min(w * 0.035, 22)}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('every app on your phone is a tiny mouth asking to be fed.', w / 2, h * 0.08)

      // Phone body — centered
      const phoneW = Math.min(w * 0.35, 220)
      const phoneH = phoneW * 1.9
      const phoneX = (w - phoneW) / 2
      const phoneY = h * 0.14

      // Phone vibrate
      const vib = Math.sin(t * 0.3) * (t % 120 < 10 ? 1.5 : 0)

      ctx.save()
      ctx.translate(vib, 0)

      // Phone shadow
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.beginPath()
      ctx.roundRect(phoneX + 4, phoneY + 6, phoneW, phoneH, 20)
      ctx.fill()

      // Phone body
      ctx.fillStyle = '#FAFAFA'
      ctx.beginPath()
      ctx.roundRect(phoneX, phoneY, phoneW, phoneH, 20)
      ctx.fill()
      ctx.strokeStyle = '#DDD'
      ctx.lineWidth = 2
      ctx.stroke()

      // Screen area
      const screenX = phoneX + 12
      const screenY = phoneY + 40
      const screenW = phoneW - 24
      const screenH = phoneH - 80

      ctx.fillStyle = '#FFF8E7'
      ctx.beginPath()
      ctx.roundRect(screenX, screenY, screenW, screenH, 8)
      ctx.fill()

      // Camera notch
      ctx.fillStyle = '#E0D8CC'
      ctx.beginPath()
      ctx.arc(phoneX + phoneW / 2, phoneY + 20, 4, 0, Math.PI * 2)
      ctx.fill()

      // App grid
      const gridCols = 3
      const gridRows = 4
      const cellW = screenW / gridCols
      const cellH = screenH / gridRows
      const appR = Math.min(cellW, cellH) * 0.3

      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const idx = row * gridCols + col
          if (idx >= apps.length) continue
          const app = apps[idx]

          const cx = screenX + col * cellW + cellW / 2
          const cy = screenY + row * cellH + cellH / 2

          // Mouth animation
          let openAmount: number
          if (app.isYawning) {
            app.yawnTimer--
            if (app.yawnTimer <= 0) { app.isYawning = false; app.yawnTimer = 200 + Math.random() * 400 }
            openAmount = 0.7 + Math.sin(t * 0.01) * 0.2
          } else {
            app.yawnTimer--
            if (app.yawnTimer <= 0 && Math.random() < 0.005) { app.isYawning = true; app.yawnTimer = 60 + Math.random() * 60 }
            openAmount = Math.max(0, Math.sin(t * app.chompSpeed + app.chompPhase))
          }

          const mouthAngle = openAmount * 0.5

          // App icon background (round rect)
          ctx.fillStyle = app.color
          ctx.beginPath()
          ctx.roundRect(cx - appR, cy - appR, appR * 2, appR * 2, appR * 0.3)
          ctx.fill()

          // Mouth — upper lip arc and lower lip arc
          ctx.save()
          ctx.translate(cx, cy)

          // Upper lip
          ctx.beginPath()
          ctx.arc(0, 0, appR * 0.55, Math.PI + mouthAngle, 2 * Math.PI - mouthAngle)
          ctx.fillStyle = '#1A120B'
          ctx.fill()

          // Lower lip
          ctx.beginPath()
          ctx.arc(0, 0, appR * 0.55, mouthAngle, Math.PI - mouthAngle)
          ctx.fill()

          // Inside of mouth (when open)
          if (openAmount > 0.2) {
            ctx.beginPath()
            ctx.ellipse(0, 0, appR * 0.4, appR * 0.4 * openAmount, 0, 0, Math.PI * 2)
            ctx.fillStyle = '#CC3030'
            ctx.fill()
            // Tongue
            if (openAmount > 0.4) {
              ctx.beginPath()
              ctx.ellipse(0, appR * 0.15, appR * 0.2, appR * 0.15 * openAmount, 0, 0, Math.PI)
              ctx.fillStyle = '#FF6B6B'
              ctx.fill()
            }
          }

          // Eyes (above mouth)
          const eyeY = -appR * 0.25
          const blinkPhase = Math.sin(t * 0.02 + idx * 2)
          const eyeOpen = blinkPhase > -0.9 ? 1 : 0.1
          // Left eye
          ctx.beginPath()
          ctx.ellipse(-appR * 0.2, eyeY, appR * 0.1, appR * 0.1 * eyeOpen, 0, 0, Math.PI * 2)
          ctx.fillStyle = '#FFF'
          ctx.fill()
          if (eyeOpen > 0.5) {
            ctx.beginPath()
            ctx.arc(-appR * 0.2, eyeY, appR * 0.05, 0, Math.PI * 2)
            ctx.fillStyle = '#1A120B'
            ctx.fill()
          }
          // Right eye
          ctx.beginPath()
          ctx.ellipse(appR * 0.2, eyeY, appR * 0.1, appR * 0.1 * eyeOpen, 0, 0, Math.PI * 2)
          ctx.fillStyle = '#FFF'
          ctx.fill()
          if (eyeOpen > 0.5) {
            ctx.beginPath()
            ctx.arc(appR * 0.2, eyeY, appR * 0.05, 0, Math.PI * 2)
            ctx.fillStyle = '#1A120B'
            ctx.fill()
          }

          ctx.restore()

          // Notification badge (food crumb)
          if (app.hasBadge) {
            const badgeX = cx + appR * 0.65
            const badgeY = cy - appR * 0.65
            ctx.fillStyle = '#FF0054'
            ctx.beginPath()
            ctx.arc(badgeX, badgeY, appR * 0.2, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#FFF'
            ctx.font = `${appR * 0.22}px monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(`${Math.floor(Math.random() * 9 + 1)}`, badgeX, badgeY)
          }
        }
      }

      // Home bar
      ctx.fillStyle = '#DDD'
      ctx.beginPath()
      ctx.roundRect(phoneX + phoneW * 0.3, phoneY + phoneH - 25, phoneW * 0.4, 4, 2)
      ctx.fill()

      ctx.restore()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#FFECD2' }} />
}
