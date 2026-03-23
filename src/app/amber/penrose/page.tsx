'use client'

import { useEffect, useRef } from 'react'

// PENROSE — impossible triangle. drag to rotate. the illusion holds.

export default function Penrose() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let angle = 0, targetAngle = 0
    let dragging = false, dragStartX = 0, dragStartAngle = 0

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    canvas.addEventListener('mousedown', (e) => { dragging = true; dragStartX = e.clientX; dragStartAngle = targetAngle })
    canvas.addEventListener('mousemove', (e) => { if (dragging) targetAngle = dragStartAngle + (e.clientX - dragStartX) * 0.005 })
    window.addEventListener('mouseup', () => { dragging = false })
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); dragging = true; dragStartX = e.touches[0].clientX; dragStartAngle = targetAngle }, { passive: false })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (dragging) targetAngle = dragStartAngle + (e.touches[0].clientX - dragStartX) * 0.005 }, { passive: false })
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); dragging = false }, { passive: false })

    // Penrose triangle vertices (unit triangle, will be scaled)
    // The trick: draw 3 bars that each overlap the "wrong" one
    const drawPenrose = (cx: number, cy: number, size: number, rot: number) => {
      const barWidth = size * 0.18
      const cos30 = Math.cos(Math.PI / 6)
      const sin30 = Math.sin(Math.PI / 6)

      // Three corners of the outer triangle
      const corners = [
        { x: 0, y: -size }, // top
        { x: -size * cos30, y: size * sin30 }, // bottom-left
        { x: size * cos30, y: size * sin30 }, // bottom-right
      ]

      // Inner triangle (smaller)
      const innerScale = 0.5
      const inner = corners.map(c => ({ x: c.x * innerScale, y: c.y * innerScale }))

      // Apply rotation
      const rotate = (px: number, py: number) => {
        const c = Math.cos(rot), s = Math.sin(rot)
        return { x: cx + px * c - py * s, y: cy + px * s + py * c }
      }

      const rc = corners.map(c => rotate(c.x, c.y))
      const ri = inner.map(c => rotate(c.x, c.y))

      // Colors for each bar face
      const faceColors = [
        { light: '#FF4E50', mid: '#E04040', dark: '#C03030' }, // blood orange
        { light: '#F9D423', mid: '#E0C010', dark: '#C0A000' }, // mango
        { light: '#B4E33D', mid: '#90C020', dark: '#70A010' }, // lime
      ]

      // Draw shadow first
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.08)'
      ctx.shadowBlur = 30
      ctx.shadowOffsetX = 8
      ctx.shadowOffsetY = 12

      // Draw each bar as a parallelogram with impossible overlap
      // Bar 0: top → bottom-left (outer top to outer bottom-left, inner versions)
      // Bar 1: bottom-left → bottom-right
      // Bar 2: bottom-right → top

      // The impossible trick: bar 2 goes OVER bar 0 at the top,
      // but bar 0 goes OVER bar 1, and bar 1 goes OVER bar 2

      // Bar 1: bottom-left to bottom-right (draw first, goes behind bar 0)
      ctx.beginPath()
      ctx.moveTo(rc[1].x, rc[1].y)
      ctx.lineTo(rc[2].x, rc[2].y)
      ctx.lineTo(ri[2].x, ri[2].y)
      ctx.lineTo(ri[1].x, ri[1].y)
      ctx.closePath()
      ctx.fillStyle = faceColors[1].light
      ctx.fill()
      ctx.strokeStyle = '#2A2218'
      ctx.lineWidth = 2
      ctx.stroke()
      // Top face of bar 1
      ctx.beginPath()
      ctx.moveTo(rc[1].x, rc[1].y)
      ctx.lineTo(rc[2].x, rc[2].y)
      const off1x = (ri[0].x - rc[0].x) * 0.35, off1y = (ri[0].y - rc[0].y) * 0.35
      ctx.lineTo(rc[2].x + off1x, rc[2].y + off1y)
      ctx.lineTo(rc[1].x + off1x, rc[1].y + off1y)
      ctx.closePath()
      ctx.fillStyle = faceColors[1].mid
      ctx.fill()
      ctx.stroke()

      // Bar 2: bottom-right to top (draw second)
      ctx.beginPath()
      ctx.moveTo(rc[2].x, rc[2].y)
      ctx.lineTo(rc[0].x, rc[0].y)
      ctx.lineTo(ri[0].x, ri[0].y)
      ctx.lineTo(ri[2].x, ri[2].y)
      ctx.closePath()
      ctx.fillStyle = faceColors[2].light
      ctx.fill()
      ctx.stroke()
      // Side face
      ctx.beginPath()
      ctx.moveTo(rc[2].x, rc[2].y)
      ctx.lineTo(rc[0].x, rc[0].y)
      const off2x = (ri[1].x - rc[1].x) * 0.35, off2y = (ri[1].y - rc[1].y) * 0.35
      ctx.lineTo(rc[0].x + off2x, rc[0].y + off2y)
      ctx.lineTo(rc[2].x + off2x, rc[2].y + off2y)
      ctx.closePath()
      ctx.fillStyle = faceColors[2].mid
      ctx.fill()
      ctx.stroke()

      // Bar 0: top to bottom-left (draw last — goes OVER bar 1, creating the impossibility)
      ctx.beginPath()
      ctx.moveTo(rc[0].x, rc[0].y)
      ctx.lineTo(rc[1].x, rc[1].y)
      ctx.lineTo(ri[1].x, ri[1].y)
      ctx.lineTo(ri[0].x, ri[0].y)
      ctx.closePath()
      ctx.fillStyle = faceColors[0].light
      ctx.fill()
      ctx.stroke()
      // Side face
      ctx.beginPath()
      ctx.moveTo(rc[0].x, rc[0].y)
      ctx.lineTo(rc[1].x, rc[1].y)
      const off0x = (ri[2].x - rc[2].x) * 0.35, off0y = (ri[2].y - rc[2].y) * 0.35
      ctx.lineTo(rc[1].x + off0x, rc[1].y + off0y)
      ctx.lineTo(rc[0].x + off0x, rc[0].y + off0y)
      ctx.closePath()
      ctx.fillStyle = faceColors[0].mid
      ctx.fill()
      ctx.stroke()

      ctx.restore()

      // Now: the IMPOSSIBLE part — redraw the corner where bar 2 passes OVER bar 0
      // This is the trick: at the top corner, bar 2 appears to go in front of bar 0
      // even though bar 0 was drawn last
      ctx.beginPath()
      const overlapSize = barWidth * 1.2
      // Small section of bar 2 near the top corner, drawn ON TOP of bar 0
      const topNear0 = { x: rc[0].x + (rc[2].x - rc[0].x) * 0.05, y: rc[0].y + (rc[2].y - rc[0].y) * 0.05 }
      const topNear0i = { x: ri[0].x + (ri[2].x - ri[0].x) * 0.05, y: ri[0].y + (ri[2].y - ri[0].y) * 0.05 }
      ctx.moveTo(rc[0].x, rc[0].y)
      ctx.lineTo(topNear0.x, topNear0.y)
      ctx.lineTo(topNear0i.x, topNear0i.y)
      ctx.lineTo(ri[0].x, ri[0].y)
      ctx.closePath()
      ctx.fillStyle = faceColors[2].light
      ctx.fill()
      ctx.strokeStyle = '#2A2218'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const tick = () => {
      t++

      // Auto-rotate when not dragging
      if (!dragging) targetAngle += 0.003
      angle += (targetAngle - angle) * 0.08

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#FFECD2')
      grad.addColorStop(0.5, '#FFFDE7')
      grad.addColorStop(1, '#FFF0F0')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      const size = Math.min(w, h) * 0.25
      drawPenrose(w / 2, h / 2, size, angle)

      // Subtle breathing scale
      const breath = 1 + Math.sin(t * 0.01) * 0.01

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('mouseup', () => {}) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'grab', background: '#FAFAFA' }} />
}
