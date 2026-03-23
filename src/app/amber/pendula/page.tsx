'use client'

import { useEffect, useRef } from 'react'

// PENDULA — coupled pendulums. tap to strike. watch energy travel.

const G = 0.4
const DAMPING = 0.9985
const COUPLING = 0.003
const COUNT = 25

interface Pendulum {
  length: number
  angle: number
  angVel: number
  x: number  // pivot x
  trail: { x: number; y: number; alpha: number }[]
}

export default function Pendula() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let pendulums: Pendulum[] = []

    const build = () => {
      const spacing = w / (COUNT + 1)
      const pivotY = h * 0.15
      pendulums = []
      for (let i = 0; i < COUNT; i++) {
        // Lengths increase linearly — creates the wave pattern
        const frac = i / (COUNT - 1)
        const length = h * 0.2 + frac * h * 0.45
        pendulums.push({
          length,
          angle: 0,
          angVel: 0,
          x: spacing * (i + 1),
          trail: [],
        })
      }
    }

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      build()
    }
    resize()
    window.addEventListener('resize', resize)

    // Tap to strike nearest pendulum
    const strike = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect()
      const cx = ex - rect.left
      let closest = 0, closestDist = Infinity
      for (let i = 0; i < pendulums.length; i++) {
        const d = Math.abs(pendulums[i].x - cx)
        if (d < closestDist) { closestDist = d; closest = i }
      }
      // Give it a push
      const dir = cx > pendulums[closest].x ? 1 : -1
      pendulums[closest].angVel += dir * 0.08
      // Nearby pendulums get smaller pushes
      for (let i = -3; i <= 3; i++) {
        const idx = closest + i
        if (idx >= 0 && idx < pendulums.length && idx !== closest) {
          const falloff = 1 - Math.abs(i) / 4
          pendulums[idx].angVel += dir * 0.03 * falloff
        }
      }
    }

    canvas.addEventListener('click', (e) => strike(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); strike(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })

    const pivotY = () => h * 0.15

    const tick = () => {
      t++

      ctx.fillStyle = '#0A0908'
      ctx.fillRect(0, 0, w, h)

      const py = pivotY()

      // Physics step (multiple substeps for stability)
      for (let sub = 0; sub < 3; sub++) {
        for (let i = 0; i < pendulums.length; i++) {
          const p = pendulums[i]

          // Gravity torque
          const gravAcc = -(G / p.length) * Math.sin(p.angle)
          p.angVel += gravAcc

          // Coupling to neighbors
          if (i > 0) {
            const diff = pendulums[i - 1].angle - p.angle
            p.angVel += diff * COUPLING
          }
          if (i < pendulums.length - 1) {
            const diff = pendulums[i + 1].angle - p.angle
            p.angVel += diff * COUPLING
          }

          // Damping
          p.angVel *= DAMPING

          // Integrate
          p.angle += p.angVel
        }
      }

      // Draw pivot bar
      ctx.strokeStyle = 'rgba(212, 165, 116, 0.15)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(w, py)
      ctx.stroke()

      // Draw coupling springs between adjacent bobs
      for (let i = 0; i < pendulums.length - 1; i++) {
        const p1 = pendulums[i], p2 = pendulums[i + 1]
        const bx1 = p1.x + Math.sin(p1.angle) * p1.length
        const by1 = py + Math.cos(p1.angle) * p1.length
        const bx2 = p2.x + Math.sin(p2.angle) * p2.length
        const by2 = py + Math.cos(p2.angle) * p2.length

        const tension = Math.abs(p1.angle - p2.angle)
        const alpha = 0.04 + tension * 0.5
        ctx.strokeStyle = `rgba(45, 149, 150, ${Math.min(0.3, alpha)})`
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(bx1, by1)
        ctx.lineTo(bx2, by2)
        ctx.stroke()
      }

      // Draw pendulums
      for (let i = 0; i < pendulums.length; i++) {
        const p = pendulums[i]
        const bobX = p.x + Math.sin(p.angle) * p.length
        const bobY = py + Math.cos(p.angle) * p.length

        // Trail
        p.trail.push({ x: bobX, y: bobY, alpha: 0.4 })
        if (p.trail.length > 30) p.trail.shift()
        for (const tp of p.trail) tp.alpha *= 0.92

        // Draw trail
        for (const tp of p.trail) {
          if (tp.alpha < 0.01) continue
          ctx.fillStyle = `rgba(184, 134, 11, ${tp.alpha * 0.15})`
          ctx.beginPath()
          ctx.arc(tp.x, tp.y, 2, 0, Math.PI * 2)
          ctx.fill()
        }

        // Rod
        const energy = Math.abs(p.angVel)
        const rodAlpha = 0.2 + energy * 3
        ctx.strokeStyle = `rgba(212, 165, 116, ${Math.min(0.5, rodAlpha)})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(p.x, py)
        ctx.lineTo(bobX, bobY)
        ctx.stroke()

        // Pivot point
        ctx.fillStyle = 'rgba(212, 165, 116, 0.3)'
        ctx.beginPath()
        ctx.arc(p.x, py, 2, 0, Math.PI * 2)
        ctx.fill()

        // Bob
        const bobR = 4 + energy * 20
        const glow = ctx.createRadialGradient(bobX, bobY, 0, bobX, bobY, bobR + 8)
        glow.addColorStop(0, `rgba(212, 165, 116, ${0.6 + energy * 2})`)
        glow.addColorStop(0.5, `rgba(184, 134, 11, ${0.2 + energy})`)
        glow.addColorStop(1, 'rgba(184, 134, 11, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(bobX, bobY, bobR + 8, 0, Math.PI * 2)
        ctx.fill()

        // Solid bob
        ctx.fillStyle = `rgba(212, 165, 116, ${0.7 + energy * 1.5})`
        ctx.beginPath()
        ctx.arc(bobX, bobY, Math.min(6, 3 + energy * 10), 0, Math.PI * 2)
        ctx.fill()
      }

      // Hint text
      if (t < 200) {
        ctx.fillStyle = `rgba(212, 165, 116, ${Math.max(0, 0.12 - t * 0.0006)})`
        ctx.font = '11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('tap to strike', w / 2, h - 30)
      }

      frame = requestAnimationFrame(tick)
    }

    // Give initial push to first pendulum
    setTimeout(() => {
      if (pendulums.length > 0) pendulums[0].angVel = 0.06
    }, 500)

    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair', background: '#0A0908' }} />
}
