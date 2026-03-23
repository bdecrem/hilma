'use client'

import { useEffect, useRef } from 'react'

// L8: WEB — tap to place nodes. nearby nodes connect. drag to reshape.
// First relationships between elements. A living network.

const BG = '#E8F5E9' // mint mist
const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const CONNECT_DIST = 120

interface Node {
  x: number; y: number
  vx: number; vy: number
  r: number
  color: string
  dragging: boolean
}

export default function L8() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const nodes: Node[] = []
    let dragNode: Node | null = null
    let colorIdx = 0

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const addNode = (x: number, y: number) => {
      nodes.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: 8 + Math.random() * 8,
        color: COLORS[colorIdx++ % COLORS.length],
        dragging: false,
      })
      if (nodes.length > 40) nodes.shift()
    }

    // Seed
    for (let i = 0; i < 6; i++) {
      addNode(w * 0.2 + Math.random() * w * 0.6, h * 0.2 + Math.random() * h * 0.6)
    }

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const findNode = (x: number, y: number): Node | null => {
      for (const n of nodes) {
        if (Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < n.r + 10) return n
      }
      return null
    }

    canvas.addEventListener('mousedown', (e) => {
      const p = getPos(e)
      const found = findNode(p.x, p.y)
      if (found) { dragNode = found; found.dragging = true }
      else addNode(p.x, p.y)
    })
    canvas.addEventListener('mousemove', (e) => {
      if (!dragNode) return
      const p = getPos(e)
      dragNode.x = p.x; dragNode.y = p.y
    })
    window.addEventListener('mouseup', () => { if (dragNode) dragNode.dragging = false; dragNode = null })

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const p = getPos(e.touches[0])
      const found = findNode(p.x, p.y)
      if (found) { dragNode = found; found.dragging = true }
      else addNode(p.x, p.y)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      if (!dragNode) return
      const p = getPos(e.touches[0])
      dragNode.x = p.x; dragNode.y = p.y
    }, { passive: false })
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      if (dragNode) dragNode.dragging = false; dragNode = null
    }, { passive: false })

    const tick = () => {
      t++
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      // Gentle drift
      for (const n of nodes) {
        if (n.dragging) continue
        n.vx += (Math.random() - 0.5) * 0.02
        n.vy += (Math.random() - 0.5) * 0.02
        n.vx *= 0.99; n.vy *= 0.99
        n.x += n.vx; n.y += n.vy
        // Bounce off edges
        if (n.x < n.r) { n.x = n.r; n.vx *= -0.5 }
        if (n.x > w - n.r) { n.x = w - n.r; n.vx *= -0.5 }
        if (n.y < n.r) { n.y = n.r; n.vy *= -0.5 }
        if (n.y > h - n.r) { n.y = h - n.r; n.vy *= -0.5 }
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECT_DIST) {
            const strength = 1 - dist / CONNECT_DIST
            const pulse = 0.5 + 0.5 * Math.sin(t * 0.03 + i + j)

            // Line
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(252, 145, 58, ${strength * 0.3 * pulse})`
            ctx.lineWidth = 1 + strength * 2
            ctx.stroke()

            // Midpoint glow
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
            const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 8 + strength * 10)
            glow.addColorStop(0, `rgba(249, 212, 35, ${strength * 0.15 * pulse})`)
            glow.addColorStop(1, 'transparent')
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(mx, my, 8 + strength * 10, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        // Shadow
        ctx.beginPath()
        ctx.ellipse(n.x + 2, n.y + 3, n.r, n.r * 0.6, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.04)'
        ctx.fill()

        // Body
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.fill()

        // Highlight
        ctx.beginPath()
        ctx.arc(n.x - n.r * 0.25, n.y - n.r * 0.25, n.r * 0.35, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fill()
      }

      // Legacy amber dot
      ctx.fillStyle = `rgba(212,165,116,${0.1 + Math.sin(t * 0.02) * 0.03})`
      ctx.beginPath()
      ctx.arc(20, 20, 3, 0, Math.PI * 2)
      ctx.fill()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
