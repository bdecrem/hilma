'use client'

import { useEffect, useRef } from 'react'

// L6: CITRUS — concentric rings that breathe. tap to split them open.

const BLOOD = '#FF4E50'
const TANGERINE = '#FC913A'
const MANGO = '#F9D423'
const LIME = '#B4E33D'
const GRAPEFRUIT = '#FF6B81'
const ESPRESSO = '#1A120B'
const CREAM = '#FFF8E7'

interface Ring {
  radius: number
  baseRadius: number
  color: string
  width: number
  speed: number
  phase: number
  split: number // 0 = whole, >0 = splitting apart
  splitAngle: number
}

export default function L6() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let flashAlpha = 0

    const colors = [BLOOD, TANGERINE, MANGO, GRAPEFRUIT, LIME, TANGERINE, BLOOD, MANGO]
    const rings: Ring[] = []

    const build = () => {
      rings.length = 0
      const maxR = Math.min(w, h) * 0.35
      for (let i = 0; i < 8; i++) {
        const r = maxR * 0.2 + (i / 7) * maxR * 0.8
        rings.push({
          radius: r,
          baseRadius: r,
          color: colors[i],
          width: 4 + (7 - i) * 1.5,
          speed: 0.002 + i * 0.001,
          phase: i * 0.8,
          split: 0,
          splitAngle: 0,
        })
      }
    }

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; build() }
    resize()
    window.addEventListener('resize', resize)

    const onClick = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect()
      const px = ex - rect.left, py = ey - rect.top
      const cx = w / 2, cy = h / 2
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)

      // Find the ring closest to click distance
      let closest = -1, closestDist = Infinity
      for (let i = 0; i < rings.length; i++) {
        const d = Math.abs(rings[i].radius - dist)
        if (d < closestDist && rings[i].split === 0) { closestDist = d; closest = i }
      }
      if (closest >= 0 && closestDist < 40) {
        rings[closest].split = 0.01
        rings[closest].splitAngle = Math.atan2(py - cy, px - cx)
      }

      flashAlpha = 0.8
    }

    canvas.addEventListener('click', (e) => onClick(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onClick(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })

    const tick = () => {
      t++

      // Warm fade
      ctx.fillStyle = 'rgba(26, 18, 11, 0.08)'
      ctx.fillRect(0, 0, w, h)

      // Redraw background periodically to prevent full washout
      if (t % 300 === 0) {
        ctx.fillStyle = ESPRESSO
        ctx.fillRect(0, 0, w, h)
      }

      const cx = w / 2, cy = h / 2

      // Flash
      if (flashAlpha > 0) {
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.3)
        glow.addColorStop(0, `rgba(255, 248, 231, ${flashAlpha * 0.15})`)
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, Math.min(w, h) * 0.3, 0, Math.PI * 2)
        ctx.fill()
        flashAlpha *= 0.95
      }

      // Draw rings
      for (const ring of rings) {
        const breath = Math.sin(t * 0.01 + ring.phase) * 8
        ring.radius = ring.baseRadius + breath

        ctx.lineWidth = ring.width
        ctx.lineCap = 'round'

        if (ring.split === 0) {
          // Whole ring, rotating
          const rotAngle = t * ring.speed + ring.phase
          ctx.beginPath()
          ctx.arc(cx, cy, ring.radius, rotAngle, rotAngle + Math.PI * 1.85)
          ctx.strokeStyle = ring.color
          ctx.stroke()
        } else {
          // Splitting — two halves drifting apart
          ring.split = Math.min(ring.split + 0.008, 1)
          const drift = ring.split * 25
          const a = ring.splitAngle
          const rotAngle = t * ring.speed + ring.phase

          // Half 1
          ctx.save()
          ctx.translate(Math.cos(a) * drift, Math.sin(a) * drift)
          ctx.beginPath()
          ctx.arc(cx, cy, ring.radius, rotAngle, rotAngle + Math.PI * 0.9)
          ctx.strokeStyle = ring.color
          ctx.stroke()
          // Inner lime reveal
          if (ring.split > 0.3) {
            ctx.beginPath()
            ctx.arc(cx, cy, ring.radius - ring.width, rotAngle + 0.1, rotAngle + Math.PI * 0.8)
            ctx.strokeStyle = LIME
            ctx.lineWidth = ring.width * 0.4
            ctx.stroke()
          }
          ctx.restore()

          // Half 2
          ctx.save()
          ctx.translate(-Math.cos(a) * drift, -Math.sin(a) * drift)
          ctx.beginPath()
          ctx.arc(cx, cy, ring.radius, rotAngle + Math.PI, rotAngle + Math.PI * 1.9)
          ctx.strokeStyle = ring.color
          ctx.lineWidth = ring.width
          ctx.stroke()
          if (ring.split > 0.3) {
            ctx.beginPath()
            ctx.arc(cx, cy, ring.radius - ring.width, rotAngle + Math.PI + 0.1, rotAngle + Math.PI * 1.8)
            ctx.strokeStyle = LIME
            ctx.lineWidth = ring.width * 0.4
            ctx.stroke()
          }
          ctx.restore()
        }
      }

      // Overlap glow at center
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rings[0].radius * 0.8)
      centerGlow.addColorStop(0, `rgba(255, 78, 80, ${0.03 + Math.sin(t * 0.008) * 0.02})`)
      centerGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = centerGlow
      ctx.beginPath()
      ctx.arc(cx, cy, rings[0].radius * 0.8, 0, Math.PI * 2)
      ctx.fill()

      // Legacy amber dot at center
      ctx.fillStyle = `rgba(212, 165, 116, ${0.15 + Math.sin(t * 0.015) * 0.05})`
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()

      frame = requestAnimationFrame(tick)
    }

    // Initial clear
    ctx.fillStyle = ESPRESSO
    ctx.fillRect(0, 0, w, h)

    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: ESPRESSO }} />
}
