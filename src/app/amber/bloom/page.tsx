'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'
const [BG1, BG2] = pickGradientColors('bloom')

// Each DLA cell = 4px square
const CELL = 4

function colorForDist(dist: number): string {
  // Cycle through citrus palette as crystal grows outward
  const t = (dist / 60) % 1
  const idx = Math.floor(t * CITRUS.length) % CITRUS.length
  return CITRUS[idx]
}

export default function BloomPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = 0, H = 0
    let raf = 0

    let gW = 0, gH = 0
    let grid: Uint8Array        // 0 = empty, 1 = stuck
    let distGrid: Float32Array  // distance from nearest seed

    const MAX_PARTICLES = 400
    interface Particle { gx: number; gy: number }
    let particles: Particle[] = []

    function init() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H

      gW = Math.ceil(W / CELL)
      gH = Math.ceil(H / CELL)
      grid = new Uint8Array(gW * gH)
      distGrid = new Float32Array(gW * gH).fill(99999)
      particles = []

      // Draw background once
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, BG1)
      grad.addColorStop(1, BG2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Amber watermark
      ctx.save()
      ctx.font = '11px monospace'
      ctx.fillStyle = AMBER
      ctx.globalAlpha = 0.35
      ctx.fillText('amber', W - 58, H - 14)
      ctx.restore()

      // Seed crystal at center
      plantSeed(Math.floor(gW / 2), Math.floor(gH / 2))
    }

    function plantSeed(gx: number, gy: number) {
      // 3x3 nucleus so crystals branch outward naturally
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          stickCell(gx + dx, gy + dy, 0)
        }
      }
    }

    function stickCell(gx: number, gy: number, dist: number) {
      if (gx < 0 || gx >= gW || gy < 0 || gy >= gH) return
      const idx = gy * gW + gx
      if (grid[idx]) return
      grid[idx] = 1
      distGrid[idx] = dist

      const color = colorForDist(dist)
      const px = gx * CELL
      const py = gy * CELL

      // Colored glow
      ctx.save()
      ctx.shadowBlur = 8
      ctx.shadowColor = color
      ctx.fillStyle = color
      ctx.globalAlpha = 0.88
      ctx.fillRect(px, py, CELL, CELL)
      ctx.restore()

      // Bright pixel at top-left of cell — gives crystal sparkle
      ctx.fillStyle = '#FFFFFF'
      ctx.globalAlpha = 0.55
      ctx.fillRect(px, py, 1, 1)
      ctx.globalAlpha = 1
    }

    function adjacentDist(gx: number, gy: number): number {
      // Return min(dist+1) of all stuck 8-neighbors, or -1 if none
      let best = -1
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = gx + dx, ny = gy + dy
          if (nx < 0 || nx >= gW || ny < 0 || ny >= gH) continue
          const idx = ny * gW + nx
          if (grid[idx]) {
            const d = distGrid[idx] + 1
            if (best < 0 || d < best) best = d
          }
        }
      }
      return best
    }

    function newParticle(): Particle {
      // Spawn from a random edge
      const side = Math.floor(Math.random() * 4)
      let gx = 0, gy = 0
      if (side === 0)      { gx = Math.floor(Math.random() * gW); gy = 0 }
      else if (side === 1) { gx = gW - 1; gy = Math.floor(Math.random() * gH) }
      else if (side === 2) { gx = Math.floor(Math.random() * gW); gy = gH - 1 }
      else                 { gx = 0; gy = Math.floor(Math.random() * gH) }
      return { gx, gy }
    }

    function animate() {
      // Replenish particles
      while (particles.length < MAX_PARTICLES) {
        particles.push(newParticle())
      }

      // Many steps per frame — DLA looks best with fast growth
      const STEPS = 20
      for (let s = 0; s < STEPS; s++) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i]

          // Random walk (4-directional)
          const dir = Math.random() * 4 | 0
          if (dir === 0)      p.gx++
          else if (dir === 1) p.gx--
          else if (dir === 2) p.gy++
          else                p.gy--

          // Off edge → respawn
          if (p.gx < 0 || p.gx >= gW || p.gy < 0 || p.gy >= gH) {
            particles[i] = newParticle()
            continue
          }

          // Already occupied → respawn
          if (grid[p.gy * gW + p.gx]) {
            particles[i] = newParticle()
            continue
          }

          // Adjacent to stuck cell → stick
          const dist = adjacentDist(p.gx, p.gy)
          if (dist >= 0) {
            stickCell(p.gx, p.gy, dist)
            particles.splice(i, 1)
          }
        }
      }

      raf = requestAnimationFrame(animate)
    }

    const onPointerDown = (e: PointerEvent) => {
      const gx = Math.floor(e.clientX / CELL)
      const gy = Math.floor(e.clientY / CELL)
      // White flash at tap point
      ctx.save()
      ctx.fillStyle = '#FFFFFF'
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(e.clientX, e.clientY, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // Plant new seed
      plantSeed(gx, gy)
    }

    const onResize = () => {
      cancelAnimationFrame(raf)
      init()
      raf = requestAnimationFrame(animate)
    }

    init()
    raf = requestAnimationFrame(animate)
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointerDown)
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
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
