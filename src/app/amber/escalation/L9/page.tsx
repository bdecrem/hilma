'use client'

import { useEffect, useRef } from 'react'

// L9: CHARGE — nodes attract or repel. tap to flip polarity. first conflict.

const BG = '#FFE0DD' // coral wash
const WARM = ['#FF4E50', '#FC913A', '#F9D423', '#FF6B81']
const COOL = '#FFF8E7'
const REPEL_COLOR = '#2D5A27'

interface Node {
  x: number; y: number
  vx: number; vy: number
  r: number
  color: string
  positive: boolean // true = attract, false = repel
}

export default function L9() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const nodes: Node[] = []

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    // Seed
    for (let i = 0; i < 12; i++) {
      const positive = i < 8
      nodes.push({
        x: w * 0.2 + Math.random() * w * 0.6,
        y: h * 0.2 + Math.random() * h * 0.6,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: 10 + Math.random() * 6,
        color: positive ? WARM[i % WARM.length] : REPEL_COLOR,
        positive,
      })
    }

    // Tap to flip nearest or spawn
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left, py = e.clientY - rect.top
      let closest: Node | null = null, closestD = Infinity
      for (const n of nodes) {
        const d = Math.sqrt((n.x - px) ** 2 + (n.y - py) ** 2)
        if (d < closestD) { closestD = d; closest = n }
      }
      if (closest && closestD < closest.r + 20) {
        closest.positive = !closest.positive
        closest.color = closest.positive ? WARM[Math.floor(Math.random() * WARM.length)] : REPEL_COLOR
      } else {
        const positive = Math.random() > 0.3
        nodes.push({
          x: px, y: py, vx: 0, vy: 0,
          r: 10 + Math.random() * 6,
          color: positive ? WARM[Math.floor(Math.random() * WARM.length)] : REPEL_COLOR,
          positive,
        })
        if (nodes.length > 30) nodes.shift()
      }
    })
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const px = e.touches[0].clientX - rect.left, py = e.touches[0].clientY - rect.top
      let closest: Node | null = null, closestD = Infinity
      for (const n of nodes) {
        const d = Math.sqrt((n.x - px) ** 2 + (n.y - py) ** 2)
        if (d < closestD) { closestD = d; closest = n }
      }
      if (closest && closestD < closest.r + 20) {
        closest.positive = !closest.positive
        closest.color = closest.positive ? WARM[Math.floor(Math.random() * WARM.length)] : REPEL_COLOR
      }
    }, { passive: false })

    const tick = () => {
      t++
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      // Forces between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.max(30, Math.sqrt(dx * dx + dy * dy))
          const sameCharge = a.positive === b.positive
          const force = (sameCharge ? -0.15 : 0.3) / (dist * 0.1)
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }
      }

      // Update positions
      for (const n of nodes) {
        n.vx *= 0.97; n.vy *= 0.97
        n.x += n.vx; n.y += n.vy
        // Soft walls
        if (n.x < n.r + 20) n.vx += 0.2
        if (n.x > w - n.r - 20) n.vx -= 0.2
        if (n.y < n.r + 20) n.vy += 0.2
        if (n.y > h - n.r - 20) n.vy -= 0.2
      }

      // Draw connections (attract = warm line, repel = dashed green)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 150) continue

          const strength = 1 - dist / 150
          const attract = a.positive !== b.positive

          if (attract) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(252, 145, 58, ${strength * 0.25})`
            ctx.lineWidth = 1 + strength * 2
            ctx.stroke()
          } else {
            ctx.setLineDash([3, 5])
            ctx.beginPath()
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(45, 90, 39, ${strength * 0.15})`
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.fill()
        // Highlight
        ctx.beginPath()
        ctx.arc(n.x - n.r * 0.2, n.y - n.r * 0.2, n.r * 0.3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fill()
        // Charge indicator: + or −
        ctx.fillStyle = n.positive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.5)'
        ctx.font = `${n.r}px monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(n.positive ? '+' : '−', n.x, n.y)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
