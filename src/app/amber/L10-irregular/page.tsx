'use client'

import { useEffect, useRef } from 'react'

// L10 IRREGULAR — clone with subtle asymmetry and irregularities.
// Circle breathes, line rotates, triangle follows cursor, shapes orbit,
// drops bounce, rings pulse, nodes connect, charges attract/repel.
// All on one canvas. The full vocabulary before Composition begins.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

export default function L10() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let mx = -1, my = -1

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); mx = e.touches[0].clientX; my = e.touches[0].clientY }, { passive: false })

    // Shapes from the series
    let triX = 0, triY = 0

    // Drops
    const drops: { x: number; y: number; vy: number; r: number; c: string; settled: boolean }[] = []
    const spawnDrop = () => {
      drops.push({
        x: w * 0.7 + (Math.random() - 0.5) * w * 0.2,
        y: h * 0.1,
        vy: 0, r: 4 + Math.random() * 6,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        settled: false,
      })
      if (drops.length > 30) drops.shift()
    }

    const tick = () => {
      t++
      // Bold mango background — L10 is a milestone
      ctx.fillStyle = '#F9D423'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2, cy = h / 2
      const breath = Math.sin(t * 0.02) * 0.2 + 0.8
      const unit = Math.min(w, h) * 0.03

      // ── L1: breathing circle — slightly off-center, slightly elliptical
      const c1x = w * 0.16, c1y = h * 0.23
      ctx.beginPath()
      ctx.ellipse(c1x, c1y, unit * breath, unit * breath * 0.92, 0.04, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[0]
      ctx.fill()

      // ── L2: rotating line — one arm slightly longer, slight bend
      const l2x = w * 0.84, l2y = h * 0.21
      const lineLen = unit * 2 * breath
      const lineAngle = t * 0.0095
      ctx.beginPath()
      ctx.moveTo(l2x - Math.cos(lineAngle) * lineLen * 1.1, l2y - Math.sin(lineAngle) * lineLen * 1.1)
      const cpx = l2x + Math.sin(t * 0.02) * 2
      const cpy = l2y + Math.cos(t * 0.015) * 2
      ctx.quadraticCurveTo(cpx, cpy, l2x + Math.cos(lineAngle) * lineLen * 0.9, l2y + Math.sin(lineAngle) * lineLen * 0.9)
      ctx.strokeStyle = COLORS[1]
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.stroke()

      // ── L3: triangle follows cursor (free-roaming)
      const targetX = mx > 0 ? mx : cx
      const targetY = my > 0 ? my : cy
      triX += (targetX - triX) * 0.03
      triY += (targetY - triY) * 0.03
      const triAngle = Math.atan2(targetY - triY, targetX - triX) + Math.PI / 2
      const triR = unit * 0.8
      ctx.save()
      ctx.translate(triX, triY)
      ctx.rotate(triAngle)
      ctx.beginPath()
      ctx.moveTo(1, -triR)
      ctx.lineTo(-triR * 0.55, triR * 0.52)
      ctx.lineTo(triR * 0.63, triR * 0.47)
      ctx.closePath()
      ctx.fillStyle = COLORS[2]
      ctx.fill()
      ctx.restore()

      // ── L4: orbiting trio (center)
      // ── L4: orbiting trio — slightly elliptical, uneven spacing
      const orbitR = unit * 4
      const orbitPhases = [0, 2.18, 4.05] // not perfectly thirds
      for (let i = 0; i < 3; i++) {
        const a = orbitPhases[i] + t * (0.0048 + i * 0.0003)
        const ox = cx + Math.cos(a) * orbitR * 1.05
        const oy = cy + Math.sin(a) * orbitR * 0.48
        ctx.beginPath()
        if (i === 0) ctx.arc(ox, oy, unit * 0.5, 0, Math.PI * 2)
        else if (i === 1) {
          ctx.moveTo(ox - unit * 0.6, oy)
          ctx.lineTo(ox + unit * 0.6, oy)
          ctx.strokeStyle = COLORS[3]
          ctx.lineWidth = 2
          ctx.stroke()
          continue
        } else {
          ctx.moveTo(ox, oy - unit * 0.5)
          ctx.lineTo(ox - unit * 0.4, oy + unit * 0.3)
          ctx.lineTo(ox + unit * 0.4, oy + unit * 0.3)
          ctx.closePath()
        }
        ctx.fillStyle = COLORS[i === 0 ? 4 : 0]
        ctx.fill()
      }

      // ── L6: concentric rings — center drifts slightly, uneven gaps
      const ringX = w * 0.21 + Math.sin(t * 0.004) * 3, ringY = h * 0.74
      const ringGaps = [1.5, 2.35, 3.15, 4.1] // irregular
      for (let i = 0; i < 4; i++) {
        const rr = unit * ringGaps[i] * (0.9 + Math.sin(t * 0.015 + i * 1.1) * 0.1)
        ctx.beginPath()
        ctx.arc(ringX, ringY, rr, t * 0.003 + i * 0.9, t * 0.003 + i * 0.9 + Math.PI * (1.4 + i * 0.05))
        ctx.strokeStyle = COLORS[i % COLORS.length]
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // ── L7: bouncing drops (right side)
      if (t % 30 === 0) spawnDrop()
      for (const d of drops) {
        if (d.settled) continue
        d.vy += 0.2
        d.y += d.vy
        if (d.y > h * 0.85) { d.y = h * 0.85; d.vy *= -0.4; if (Math.abs(d.vy) < 1) d.settled = true }
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = d.c
        ctx.fill()
        ctx.beginPath()
        ctx.arc(d.x - d.r * 0.2, d.y - d.r * 0.2, d.r * 0.3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fill()
      }

      // ── L8+L9: connected/charged nodes (bottom-center)
      // nodes drift slightly over time
      const nodePositions = [
        { x: cx - unit * 3.2 + Math.sin(t * 0.003) * 3, y: h * 0.64, pos: true },
        { x: cx + unit * 1.8 + Math.cos(t * 0.004) * 2, y: h * 0.71, pos: true },
        { x: cx + unit * 0.3, y: h * 0.59 + Math.sin(t * 0.005) * 2, pos: false },
        { x: cx + unit * 4.3, y: h * 0.66, pos: false },
      ]
      // Connections
      for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
          const a = nodePositions[i], b = nodePositions[j]
          const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
          if (dist < unit * 8) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = a.pos !== b.pos ? 'rgba(252,145,58,0.2)' : 'rgba(45,90,39,0.1)'
            ctx.setLineDash(a.pos === b.pos ? [3, 5] : [])
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
      }
      // Nodes
      for (const n of nodePositions) {
        const wobble = Math.sin(t * 0.02 + n.x * 0.01) * 2
        ctx.beginPath()
        ctx.arc(n.x + wobble, n.y, unit * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = n.pos ? COLORS[1] : '#2D5A27'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = `${unit * 0.5}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(n.pos ? '+' : '−', n.x + wobble, n.y)
      }

      // ── L10 label
      ctx.fillStyle = 'rgba(0,0,0,0.04)'
      ctx.font = `${Math.min(w * 0.015, 11)}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText('L10', 12, h - 12)

      frame = requestAnimationFrame(tick)
    }

    triX = w / 2; triY = h / 2
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#F9D423' }} />
}
