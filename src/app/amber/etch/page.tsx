'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface FocalPoint {
  x: number
  y: number
  strength: number
  color: string
  age: number
}

export default function EtchPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const [bg1, bg2] = pickGradientColors('etch')
    const focals: FocalPoint[] = []
    let time = 0

    // Seed a few initial focal points
    for (let i = 0; i < 3; i++) {
      focals.push({
        x: W * 0.2 + Math.random() * W * 0.6,
        y: H * 0.2 + Math.random() * H * 0.6,
        strength: 0.5 + Math.random() * 0.5,
        color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
        age: 0,
      })
    }

    canvas.addEventListener('pointerdown', (e) => {
      focals.push({
        x: e.clientX,
        y: e.clientY,
        strength: 0.8 + Math.random() * 0.4,
        color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
        age: 0,
      })
      // Cap focals
      if (focals.length > 12) focals.shift()
    })

    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons > 0) {
        focals.push({
          x: e.clientX,
          y: e.clientY,
          strength: 0.4 + Math.random() * 0.3,
          color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
          age: 0,
        })
        if (focals.length > 20) focals.shift()
      }
    })

    // Draw initial background
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, bg1)
    grad.addColorStop(1, bg2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Draw hint
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#FFF8E7'
    ctx.font = `${Math.max(14, W * 0.018)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('touch to focus the hatching', W / 2, H - 40)
    ctx.restore()

    let raf: number
    function animate() {
      time++

      // Draw a batch of hatch lines each frame
      const linesPerFrame = 8

      for (let i = 0; i < linesPerFrame; i++) {
        // Pick a random start point
        let sx = Math.random() * W
        let sy = Math.random() * H

        // Calculate influence from focal points
        let totalInfluence = 0
        let angleInfluence = 0
        let colorR = 0, colorG = 0, colorB = 0, colorW = 0

        for (const f of focals) {
          const dx = sx - f.x
          const dy = sy - f.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = Math.min(W, H) * 0.35 * f.strength
          const influence = Math.max(0, 1 - dist / radius)

          if (influence > 0) {
            totalInfluence += influence * f.strength
            angleInfluence += Math.atan2(dy, dx) * influence

            // Parse color
            const r = parseInt(f.color.slice(1, 3), 16)
            const g = parseInt(f.color.slice(3, 5), 16)
            const b = parseInt(f.color.slice(5, 7), 16)
            colorR += r * influence
            colorG += g * influence
            colorB += b * influence
            colorW += influence
          }
        }

        // Skip if too far from any focal
        if (totalInfluence < 0.05) continue

        // Determine hatch angle — cycles through angles over time for cross-hatching
        const hatchSet = Math.floor(time / 120) % 4
        const baseAngles = [
          Math.PI * 0.25,   // 45°
          Math.PI * -0.25,  // -45° (cross)
          0,                // horizontal
          Math.PI * 0.5,    // vertical
        ]
        const angle = baseAngles[hatchSet] + (angleInfluence / Math.max(1, totalInfluence)) * 0.3

        // Line length varies with influence
        const len = 15 + totalInfluence * 40 + Math.random() * 20

        const ex = sx + Math.cos(angle) * len
        const ey = sy + Math.sin(angle) * len

        // Color: blend focal colors, or use warm dark for uncolored areas
        let strokeColor: string
        if (colorW > 0.3) {
          const r = Math.min(255, Math.floor(colorR / colorW))
          const g = Math.min(255, Math.floor(colorG / colorW))
          const b = Math.min(255, Math.floor(colorB / colorW))
          strokeColor = `rgba(${r},${g},${b},${0.15 + totalInfluence * 0.25})`
        } else {
          strokeColor = `rgba(255,248,231,${0.05 + totalInfluence * 0.15})`
        }

        ctx!.strokeStyle = strokeColor
        ctx!.lineWidth = 0.5 + totalInfluence * 1.5
        ctx!.lineCap = 'round'

        ctx!.beginPath()
        ctx!.moveTo(sx, sy)

        // Add slight wobble for hand-drawn feel
        const mx = (sx + ex) / 2 + (Math.random() - 0.5) * 3
        const my = (sy + ey) / 2 + (Math.random() - 0.5) * 3
        ctx!.quadraticCurveTo(mx, my, ex, ey)
        ctx!.stroke()
      }

      // Slowly age focal points (reduce strength over time)
      for (const f of focals) {
        f.age++
      }

      raf = requestAnimationFrame(animate)
    }

    animate()

    function onResize() {
      // On resize, preserve the drawing by creating temp canvas
      const temp = document.createElement('canvas')
      temp.width = W
      temp.height = H
      temp.getContext('2d')!.drawImage(canvas!, 0, 0)

      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H

      // Redraw background
      const g = ctx!.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, bg1)
      g.addColorStop(1, bg2)
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, W, H)

      // Restore old drawing stretched
      ctx!.drawImage(temp, 0, 0, W, H)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
    />
  )
}
