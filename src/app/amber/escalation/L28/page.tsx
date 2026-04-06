'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Diffusion-Limited Aggregation
// Particles wander randomly until they touch the growing crystal, then freeze.
// Chaos, one step at a time, becomes coral.

const CELL = 3         // px per grid cell
const WALKERS = 280    // simultaneous random walkers

function distColor(dist: number): string {
  // center: deep leaf green → lime → cream → white at tips
  const t = Math.min(dist / 160, 1)
  const stops: [number, number, number][] = [
    [45,  90,  39],  // #2D5A27 deep leaf green
    [180, 227, 61],  // #B4E33D lime zest
    [255, 248, 231], // #FFF8E7 warm cream
    [255, 255, 255], // #FFFFFF white
  ]
  const seg = t * (stops.length - 1)
  const i = Math.min(Math.floor(seg), stops.length - 2)
  const f = seg - i
  const [r1, g1, b1] = stops[i]
  const [r2, g2, b2] = stops[i + 1]
  return `rgb(${Math.round(r1 + (r2 - r1) * f)},${Math.round(g1 + (g2 - g1) * f)},${Math.round(b1 + (b2 - b1) * f)})`
}

type Walker = { gx: number; gy: number }

export default function L28() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0, GW = 0, GH = 0

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      GW = Math.ceil(W / CELL) + 2
      GH = Math.ceil(H / CELL) + 2
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L28')

    // Audio — soft chime on each freeze
    let audioCtx: AudioContext | null = null
    let chimeCount = 0
    const chime = (dist: number) => {
      chimeCount++
      if (chimeCount % 8 !== 0) return // throttle
      try {
        if (!audioCtx) audioCtx = new AudioContext()
        const ac = audioCtx
        if (ac.state === 'suspended') ac.resume()
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.connect(gain)
        gain.connect(ac.destination)
        const t = Math.min(dist / 160, 1)
        osc.frequency.value = 200 + t * 1200  // deeper near center, higher at tips
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.04, ac.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5)
        osc.start()
        osc.stop(ac.currentTime + 0.5)
      } catch {}
    }

    // State
    let grid: Uint16Array      // 0=empty, 1=crystal
    let distGrid: Uint16Array  // dist-from-seed for each crystal cell
    let crystalCanvas: HTMLCanvasElement
    let crystalCtx: CanvasRenderingContext2D
    let walkers: Walker[] = []

    const init = () => {
      grid = new Uint16Array(GW * GH)
      distGrid = new Uint16Array(GW * GH)

      crystalCanvas = document.createElement('canvas')
      crystalCanvas.width = GW * CELL
      crystalCanvas.height = GH * CELL
      crystalCtx = crystalCanvas.getContext('2d')!
      crystalCtx.clearRect(0, 0, GW * CELL, GH * CELL)

      walkers = []
      chimeCount = 0
    }

    const freezeCell = (gx: number, gy: number, dist: number) => {
      const idx = gy * GW + gx
      if (grid[idx]) return
      grid[idx] = 1
      distGrid[idx] = dist

      const color = distColor(dist)
      // Core cell
      crystalCtx.fillStyle = color
      crystalCtx.fillRect(gx * CELL, gy * CELL, CELL, CELL)
      // Glow halo
      crystalCtx.globalAlpha = 0.18
      crystalCtx.fillRect(gx * CELL - 1, gy * CELL - 1, CELL + 2, CELL + 2)
      crystalCtx.globalAlpha = 1
    }

    const addSeed = (px: number, py: number) => {
      const gx = Math.max(1, Math.min(GW - 2, Math.floor(px / CELL)))
      const gy = Math.max(1, Math.min(GH - 2, Math.floor(py / CELL)))
      freezeCell(gx, gy, 0)
    }

    const spawnWalker = (): Walker => {
      // Spawn on rectangle boundary
      const edge = Math.floor(Math.random() * 4)
      if (edge === 0) return { gx: Math.floor(Math.random() * GW), gy: 1 }
      if (edge === 1) return { gx: Math.floor(Math.random() * GW), gy: GH - 2 }
      if (edge === 2) return { gx: 1, gy: Math.floor(Math.random() * GH) }
      return { gx: GW - 2, gy: Math.floor(Math.random() * GH) }
    }

    const getNeighborDist = (gx: number, gy: number): number => {
      let min = 65535
      const check = (nx: number, ny: number) => {
        if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) return
        const idx = ny * GW + nx
        if (grid[idx] && distGrid[idx] < min) min = distGrid[idx]
      }
      check(gx - 1, gy)
      check(gx + 1, gy)
      check(gx, gy - 1)
      check(gx, gy + 1)
      return min === 65535 ? 0 : min + 1
    }

    const isAdjacentToCrystal = (gx: number, gy: number): boolean => {
      if (gx > 0       && grid[gy * GW + gx - 1]) return true
      if (gx < GW - 1  && grid[gy * GW + gx + 1]) return true
      if (gy > 0       && grid[(gy - 1) * GW + gx]) return true
      if (gy < GH - 1  && grid[(gy + 1) * GW + gx]) return true
      return false
    }

    init()
    // Seed at center
    addSeed(W / 2, H / 2)
    // Seed walkers
    for (let i = 0; i < WALKERS; i++) walkers.push(spawnWalker())

    // Diagonal steps for richer branching
    const DX = [-1, 1, 0, 0, -1, 1, -1, 1]
    const DY = [0, 0, -1, 1, -1, -1, 1, 1]

    let raf: number
    let totalFrozen = 0

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Crystal layer
      ctx.drawImage(crystalCanvas, 0, 0, GW * CELL, GH * CELL, 0, 0, GW * CELL, GH * CELL)

      // Move walkers — do multiple steps per frame for faster growth
      for (let step = 0; step < 3; step++) {
        for (let i = walkers.length - 1; i >= 0; i--) {
          const w = walkers[i]

          // Random step
          const dir = Math.floor(Math.random() * 8)
          const nx = w.gx + DX[dir]
          const ny = w.gy + DY[dir]

          // Out of bounds → respawn
          if (nx < 1 || nx >= GW - 1 || ny < 1 || ny >= GH - 1) {
            walkers[i] = spawnWalker()
            continue
          }

          // Occupied → skip
          if (grid[ny * GW + nx]) continue

          w.gx = nx
          w.gy = ny

          // Freeze if adjacent to crystal
          if (isAdjacentToCrystal(w.gx, w.gy)) {
            const dist = getNeighborDist(w.gx, w.gy)
            freezeCell(w.gx, w.gy, dist)
            chime(dist)
            totalFrozen++
            walkers[i] = spawnWalker()
          }
        }
      }

      // Draw walkers (faint tangerine dots — the wandering particles)
      ctx.globalAlpha = 0.25
      ctx.fillStyle = '#FC913A'
      for (const w of walkers) {
        ctx.fillRect(w.gx * CELL + 1, w.gy * CELL + 1, 1, 1)
      }
      ctx.globalAlpha = 1

      // Label
      ctx.font = '11px monospace'
      ctx.fillStyle = '#2D5A27'
      ctx.globalAlpha = 0.4
      ctx.fillText('diffusion-limited aggregation · tap to seed', 12, H - 12)
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    const handleTap = (px: number, py: number) => {
      addSeed(px, py)
      // Flood the area with fresh walkers
      for (let i = 0; i < 30; i++) walkers.push(spawnWalker())
    }

    canvas.addEventListener('click', (e) => handleTap(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) handleTap(t.clientX, t.clientY)
    }, { passive: false })

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      audioCtx?.close()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
