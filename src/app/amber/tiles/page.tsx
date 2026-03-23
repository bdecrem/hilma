'use client'

import { useEffect, useRef } from 'react'

// TILES — living hex mosaic. touch to ripple. every frame is a screenshot.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8A65']
const BG = '#B4E33D' // bold lime field

interface Hex {
  cx: number; cy: number
  col: number; row: number
  colorIdx: number
  phase: number
  scale: number
  targetScale: number
  rotation: number
  ripple: number // 0-1, decays
}

export default function Tiles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let hexes: Hex[] = []
    const HEX_R = 28

    const buildGrid = () => {
      hexes = []
      const r = HEX_R
      const hexW = r * 2
      const hexH = Math.sqrt(3) * r
      const cols = Math.ceil(w / (hexW * 0.75)) + 2
      const rows = Math.ceil(h / hexH) + 2

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const cx = col * hexW * 0.75
          const cy = row * hexH + (col % 2 === 0 ? 0 : hexH * 0.5)
          hexes.push({
            cx, cy, col, row,
            colorIdx: (col + row * 3 + Math.floor(Math.random() * 2)) % COLORS.length,
            phase: col * 0.3 + row * 0.5 + Math.random() * 0.5,
            scale: 0.85,
            targetScale: 0.85,
            rotation: 0,
            ripple: 0,
          })
        }
      }
    }

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; buildGrid() }
    resize()
    window.addEventListener('resize', resize)

    // Touch ripple
    const sendRipple = (x: number, y: number) => {
      for (const hex of hexes) {
        const dx = hex.cx - x, dy = hex.cy - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 300) {
          const delay = dist * 0.01
          setTimeout(() => {
            hex.ripple = 1
            hex.colorIdx = (hex.colorIdx + 1) % COLORS.length
            hex.targetScale = 1.05
          }, delay * 1000)
        }
      }
    }

    canvas.addEventListener('click', (e) => { const r = canvas.getBoundingClientRect(); sendRipple(e.clientX - r.left, e.clientY - r.top) })
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); sendRipple(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top) }, { passive: false })

    const drawHex = (cx: number, cy: number, r: number, rotation: number) => {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + rotation
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
    }

    const tick = () => {
      t++

      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      for (const hex of hexes) {
        // Breathing
        const breath = Math.sin(t * 0.015 + hex.phase) * 0.08
        hex.targetScale = 0.85 + breath + (hex.ripple > 0.5 ? 0.15 : 0)
        hex.scale += (hex.targetScale - hex.scale) * 0.1
        hex.rotation += 0.001 + hex.ripple * 0.02
        hex.ripple *= 0.95

        const r = HEX_R * hex.scale
        const color = COLORS[hex.colorIdx]

        // Shadow
        ctx.save()
        ctx.globalAlpha = 0.06
        drawHex(hex.cx + 2, hex.cy + 3, r, hex.rotation)
        ctx.fillStyle = '#000'
        ctx.fill()
        ctx.restore()

        // Fill
        drawHex(hex.cx, hex.cy, r, hex.rotation)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.75 + hex.ripple * 0.25
        ctx.fill()
        ctx.globalAlpha = 1

        // Outline
        drawHex(hex.cx, hex.cy, r, hex.rotation)
        ctx.strokeStyle = BG
        ctx.lineWidth = 2
        ctx.stroke()

        // Inner highlight
        drawHex(hex.cx - r * 0.08, hex.cy - r * 0.08, r * 0.6, hex.rotation)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fill()

        // Inner darker hex for depth
        drawHex(hex.cx, hex.cy, r * 0.4, hex.rotation + Math.PI / 6)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.3
        ctx.fill()
        ctx.globalAlpha = 1
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
