'use client'

import { useEffect, useRef } from 'react'

// STRATA — geological time as a living painting
// Layers deposit, compress, fold. Touch creates tectonic pressure.

const PALETTE = [
  [212, 165, 116], // amber
  [184, 134, 11],  // gold
  [45, 149, 150],  // teal
  [180, 120, 60],  // burnt sienna
  [140, 100, 70],  // clay
  [60, 50, 40],    // dark earth
  [220, 180, 130], // sand
  [100, 80, 60],   // deep brown
  [80, 140, 130],  // dark teal
  [200, 150, 80],  // ochre
]

interface Layer {
  points: number[] // y-offset at each column
  color: number[]
  thickness: number
  baseY: number
  age: number
}

export default function Strata() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const layers: Layer[] = []
    const COLS = 200
    let pressX = -1, pressY = -1, pressing = false
    let pressStrength = 0

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Seed initial layers
    const addLayer = () => {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      const thickness = 3 + Math.random() * 8
      const baseY = h - layers.reduce((s, l) => s + l.thickness, 0)
      const points = new Array(COLS)
      for (let i = 0; i < COLS; i++) {
        // Slight natural undulation
        points[i] = Math.sin(i * 0.03 + layers.length * 0.7) * 2 + Math.sin(i * 0.08 + layers.length * 1.3) * 1
      }
      layers.push({ points, color, thickness, baseY, age: 0 })
    }

    for (let i = 0; i < 40; i++) addLayer()

    // Touch
    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onDown = (x: number, y: number) => { pressing = true; pressX = x; pressY = y; pressStrength = 0 }
    const onMove = (x: number, y: number) => { if (pressing) { pressX = x; pressY = y } }
    const onUp = () => { pressing = false; pressStrength = 0 }

    canvas.addEventListener('mousedown', (e) => { const p = getPos(e); onDown(p.x, p.y) })
    canvas.addEventListener('mousemove', (e) => { const p = getPos(e); onMove(p.x, p.y) })
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const p = getPos(e.touches[0]); onDown(p.x, p.y) }, { passive: false })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const p = getPos(e.touches[0]); onMove(p.x, p.y) }, { passive: false })
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onUp() }, { passive: false })

    const tick = () => {
      t++
      ctx.fillStyle = '#0A0908'
      ctx.fillRect(0, 0, w, h)

      // Grow pressure
      if (pressing) pressStrength = Math.min(pressStrength + 0.5, 40)

      // Add new layers slowly
      if (t % 120 === 0 && layers.length < 80) addLayer()

      // Apply tectonic pressure from touch
      if (pressing && pressStrength > 1) {
        const col = Math.floor((pressX / w) * COLS)
        const radius = 25
        for (const layer of layers) {
          for (let i = 0; i < COLS; i++) {
            const dist = Math.abs(i - col)
            if (dist < radius) {
              const falloff = 1 - dist / radius
              const pushDir = layer.baseY > pressY ? 1 : -1
              layer.points[i] += pushDir * falloff * falloff * pressStrength * 0.15
            }
          }
        }
      }

      // Gentle relaxation — layers slowly smooth back (but never fully)
      for (const layer of layers) {
        layer.age++
        for (let i = 1; i < COLS - 1; i++) {
          layer.points[i] += (layer.points[i - 1] + layer.points[i + 1] - 2 * layer.points[i]) * 0.02
        }
        // Very slow ambient undulation
        for (let i = 0; i < COLS; i++) {
          layer.points[i] += Math.sin(t * 0.001 + i * 0.02 + layer.age * 0.01) * 0.03
        }
      }

      // Draw layers bottom-up
      const colWidth = w / COLS
      let cumulativeY = h

      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li]
        const [r, g, b] = layer.color
        const fadeIn = Math.min(1, layer.age / 60)

        ctx.beginPath()
        ctx.moveTo(0, h)

        // Top edge of this layer
        for (let i = 0; i <= COLS; i++) {
          const ci = Math.min(i, COLS - 1)
          const x = i * colWidth
          const y = cumulativeY - layer.thickness + layer.points[ci]
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        // Close back down
        ctx.lineTo(w, cumulativeY)
        ctx.lineTo(0, cumulativeY)
        ctx.closePath()

        // Gradient within layer
        const topY = cumulativeY - layer.thickness
        const grad = ctx.createLinearGradient(0, topY, 0, cumulativeY)
        grad.addColorStop(0, `rgba(${r + 20}, ${g + 15}, ${b + 10}, ${fadeIn * 0.9})`)
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${fadeIn * 0.95})`)
        grad.addColorStop(1, `rgba(${Math.max(0, r - 15)}, ${Math.max(0, g - 10)}, ${Math.max(0, b - 8)}, ${fadeIn})`)
        ctx.fillStyle = grad
        ctx.fill()

        // Subtle edge line
        ctx.beginPath()
        for (let i = 0; i <= COLS; i++) {
          const ci = Math.min(i, COLS - 1)
          const x = i * colWidth
          const y = cumulativeY - layer.thickness + layer.points[ci]
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 20)}, ${fadeIn * 0.15})`
        ctx.lineWidth = 0.5
        ctx.stroke()

        cumulativeY -= layer.thickness
      }

      // Press indicator
      if (pressing && pressStrength > 2) {
        const glow = ctx.createRadialGradient(pressX, pressY, 0, pressX, pressY, 30 + pressStrength)
        glow.addColorStop(0, `rgba(212, 165, 116, ${0.1 + pressStrength * 0.005})`)
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(pressX, pressY, 30 + pressStrength, 0, Math.PI * 2)
        ctx.fill()
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('mouseup', onUp) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair', background: '#0A0908' }} />
}
