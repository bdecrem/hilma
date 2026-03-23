'use client'

import { useEffect, useRef } from 'react'

// RIDGELINE — a landscape that's still being born
// Layered mountain ridges receding into depth. Touch raises terrain.

// Simple noise function
function noise(x: number, seed: number): number {
  const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function smoothNoise(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = x - i
  const t = f * f * (3 - 2 * f) // smoothstep
  return noise(i, seed) * (1 - t) + noise(i + 1, seed) * t
}

function fbm(x: number, seed: number, octaves: number): number {
  let val = 0, amp = 0.5, freq = 1
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, seed + i * 100) * amp
    amp *= 0.5
    freq *= 2.1
  }
  return val
}

interface Ridge {
  seed: number
  depth: number // 0 = front, 1 = back
  baseY: number
  amplitude: number
  color: { r: number; g: number; b: number }
  speed: number
  deformation: Float32Array
}

export default function Ridgeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const COLS = 300
    let ridges: Ridge[] = []
    let pressX = -1, pressY = -1, pressing = false

    const RIDGE_COLORS = [
      { r: 212, g: 165, b: 116 }, // amber front
      { r: 184, g: 134, b: 11 },  // gold
      { r: 160, g: 120, b: 80 },  // warm brown
      { r: 80, g: 130, b: 125 },  // teal shadow
      { r: 45, g: 80, b: 78 },    // deep teal
      { r: 50, g: 45, b: 38 },    // dark earth
      { r: 30, g: 28, b: 24 },    // near-black
    ]

    const buildRidges = () => {
      ridges = []
      const count = 12
      for (let i = 0; i < count; i++) {
        const depth = i / (count - 1) // 0 = front, 1 = back
        const colorIdx = Math.min(RIDGE_COLORS.length - 1, Math.floor(depth * (RIDGE_COLORS.length - 0.01)))
        const nextIdx = Math.min(RIDGE_COLORS.length - 1, colorIdx + 1)
        const blend = (depth * (RIDGE_COLORS.length - 1)) - colorIdx
        const c1 = RIDGE_COLORS[colorIdx], c2 = RIDGE_COLORS[nextIdx]
        ridges.push({
          seed: Math.random() * 1000,
          depth,
          baseY: h * 0.35 + depth * h * 0.45,
          amplitude: h * (0.15 - depth * 0.08),
          color: {
            r: c1.r + (c2.r - c1.r) * blend,
            g: c1.g + (c2.g - c1.g) * blend,
            b: c1.b + (c2.b - c1.b) * blend,
          },
          speed: 0.0001 + (1 - depth) * 0.0003,
          deformation: new Float32Array(COLS).fill(0),
        })
      }
      // Reverse so back draws first
      ridges.reverse()
    }

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      buildRidges()
    }
    resize()
    window.addEventListener('resize', resize)

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    canvas.addEventListener('mousedown', (e) => { const p = getPos(e); pressing = true; pressX = p.x; pressY = p.y })
    canvas.addEventListener('mousemove', (e) => { if (pressing) { const p = getPos(e); pressX = p.x; pressY = p.y } })
    window.addEventListener('mouseup', () => { pressing = false })
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const p = getPos(e.touches[0]); pressing = true; pressX = p.x; pressY = p.y }, { passive: false })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (pressing) { const p = getPos(e.touches[0]); pressX = p.x; pressY = p.y } }, { passive: false })
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); pressing = false }, { passive: false })

    const tick = () => {
      t++

      // Sky gradient — dark with warm horizon
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6)
      skyGrad.addColorStop(0, '#0A0908')
      skyGrad.addColorStop(0.6, '#1a1510')
      skyGrad.addColorStop(1, '#2a1f14')
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, h)

      // Faint stars in upper sky
      if (t === 1) {
        // Draw once to a pattern... just scatter them
      }
      for (let i = 0; i < 3; i++) {
        const sx = ((i * 7919 + t * 0.01) % 1) * w
        const sy = ((i * 6271) % 0.35) * h
        const twinkle = 0.15 + 0.1 * Math.sin(t * 0.02 + i * 3)
        ctx.fillStyle = `rgba(212, 165, 116, ${twinkle})`
        ctx.beginPath()
        ctx.arc(sx, sy, 1, 0, Math.PI * 2)
        ctx.fill()
      }

      // Apply touch deformation
      if (pressing) {
        const col = Math.floor((pressX / w) * COLS)
        for (const ridge of ridges) {
          const proximity = 1 - ridge.depth
          const radius = 20 + proximity * 15
          for (let i = 0; i < COLS; i++) {
            const dist = Math.abs(i - col)
            if (dist < radius) {
              const falloff = (1 - dist / radius)
              ridge.deformation[i] -= falloff * falloff * proximity * 0.8
            }
          }
        }
      }

      // Relax deformation slowly
      for (const ridge of ridges) {
        for (let i = 0; i < COLS; i++) {
          ridge.deformation[i] *= 0.997
        }
        // Smooth
        for (let i = 1; i < COLS - 1; i++) {
          ridge.deformation[i] += (ridge.deformation[i - 1] + ridge.deformation[i + 1] - 2 * ridge.deformation[i]) * 0.03
        }
      }

      // Draw ridges back to front
      const colWidth = w / COLS
      for (const ridge of ridges) {
        const { r, g, b } = ridge.color
        const fogAlpha = 0.5 + (1 - ridge.depth) * 0.5

        ctx.beginPath()

        for (let i = 0; i <= COLS; i++) {
          const ci = Math.min(i, COLS - 1)
          const x = i * colWidth
          const noiseVal = fbm((i / COLS) * 3 + t * ridge.speed, ridge.seed, 5)
          const y = ridge.baseY - noiseVal * ridge.amplitude + ridge.deformation[ci]
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        // Close to bottom
        ctx.lineTo(w, h)
        ctx.lineTo(0, h)
        ctx.closePath()

        // Fill with gradient
        const topY = ridge.baseY - ridge.amplitude
        const grad = ctx.createLinearGradient(0, topY, 0, ridge.baseY + ridge.amplitude * 0.5)
        grad.addColorStop(0, `rgba(${r + 15}, ${g + 10}, ${b + 8}, ${fogAlpha})`)
        grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${fogAlpha})`)
        grad.addColorStop(1, `rgba(${Math.max(0, r - 20)}, ${Math.max(0, g - 15)}, ${Math.max(0, b - 12)}, ${fogAlpha})`)
        ctx.fillStyle = grad
        ctx.fill()

        // Edge highlight on front ridges
        if (ridge.depth < 0.5) {
          ctx.beginPath()
          for (let i = 0; i <= COLS; i++) {
            const ci = Math.min(i, COLS - 1)
            const x = i * colWidth
            const noiseVal = fbm((i / COLS) * 3 + t * ridge.speed, ridge.seed, 5)
            const y = ridge.baseY - noiseVal * ridge.amplitude + ridge.deformation[ci]
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = `rgba(${Math.min(255, r + 50)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 30)}, ${(1 - ridge.depth * 2) * 0.2})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // Atmospheric haze at horizon
      const hazeGrad = ctx.createLinearGradient(0, h * 0.5, 0, h * 0.75)
      hazeGrad.addColorStop(0, 'rgba(42, 31, 20, 0)')
      hazeGrad.addColorStop(1, 'rgba(42, 31, 20, 0.3)')
      ctx.fillStyle = hazeGrad
      ctx.fillRect(0, h * 0.5, w, h * 0.25)

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('mouseup', () => {}) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ cursor: 'crosshair', background: '#0A0908' }} />
}
