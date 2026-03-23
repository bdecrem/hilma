'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Gray-Scott reaction-diffusion model
// ∂u/∂t = Du∇²u - uv² + f(1-u)
// ∂v/∂t = Dv∇²v + uv² - (f+k)v

interface Preset {
  name: string
  f: number
  k: number
  desc: string
}

const PRESETS: Preset[] = [
  { name: 'mitosis', f: 0.0367, k: 0.0649, desc: 'cells that divide' },
  { name: 'coral', f: 0.0545, k: 0.062, desc: 'branching growth' },
  { name: 'fingerprints', f: 0.035, k: 0.065, desc: 'labyrinthine stripes' },
  { name: 'spots', f: 0.03, k: 0.062, desc: 'stable solitons' },
  { name: 'worms', f: 0.078, k: 0.061, desc: 'moving vermiculations' },
  { name: 'waves', f: 0.014, k: 0.054, desc: 'pulsing wavefronts' },
  { name: 'negatons', f: 0.0209, k: 0.0577, desc: 'annihilating particles' },
  { name: 'bubbles', f: 0.012, k: 0.05, desc: 'expanding voids' },
]

const COLOR_MAPS: { name: string; fn: (u: number, v: number) => [number, number, number] }[] = [
  {
    name: 'thermal',
    fn: (u, v) => {
      const t = v * 3
      const r = Math.min(255, t * 255)
      const g = Math.min(255, Math.max(0, (t - 0.4) * 400))
      const b = Math.min(255, Math.max(0, (t - 0.7) * 600))
      return [r, g, b]
    },
  },
  {
    name: 'ocean',
    fn: (_u, v) => {
      const t = v * 2.5
      return [
        Math.min(255, 10 + t * 40),
        Math.min(255, 20 + t * 180),
        Math.min(255, 40 + t * 255),
      ]
    },
  },
  {
    name: 'acid',
    fn: (_u, v) => {
      const t = v * 3
      return [
        Math.min(255, Math.max(0, Math.sin(t * 2.5) * 200 + 50)),
        Math.min(255, 30 + t * 220),
        Math.min(255, Math.max(0, Math.cos(t * 1.8) * 150 + 80)),
      ]
    },
  },
  {
    name: 'bone',
    fn: (u, v) => {
      const t = 1 - v * 2.2
      const base = Math.max(0, Math.min(255, t * 240 + 15))
      return [base, base - 5 + v * 30, base - 10 + u * 15]
    },
  },
  {
    name: 'neon',
    fn: (_u, v) => {
      const t = v * 4
      return [
        Math.min(255, Math.max(0, Math.sin(t * 3.14) * 255)),
        Math.min(255, Math.max(0, Math.sin(t * 3.14 + 2.09) * 255)),
        Math.min(255, Math.max(0, Math.sin(t * 3.14 + 4.19) * 255)),
      ]
    },
  },
]

export default function Morphogenesis() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<{
    u: Float32Array
    v: Float32Array
    uNext: Float32Array
    vNext: Float32Array
    w: number
    h: number
  } | null>(null)
  const paramsRef = useRef({ f: 0.0367, k: 0.0649, Du: 0.21, Dv: 0.105 })
  const colorMapRef = useRef(0)
  const pausedRef = useRef(false)
  const [preset, setPreset] = useState(0)
  const [colorIdx, setColorIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [fps, setFps] = useState(0)
  const paintingRef = useRef(false)

  const GRID = 256
  const STEPS_PER_FRAME = 8

  const initGrid = useCallback(() => {
    const size = GRID * GRID
    const u = new Float32Array(size).fill(1)
    const v = new Float32Array(size).fill(0)
    const uNext = new Float32Array(size)
    const vNext = new Float32Array(size)

    // Seed: random squares of chemical V
    for (let s = 0; s < 12; s++) {
      const cx = Math.floor(Math.random() * (GRID - 30)) + 15
      const cy = Math.floor(Math.random() * (GRID - 30)) + 15
      const r = Math.floor(Math.random() * 6) + 3
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const i = ((cy + dy) % GRID) * GRID + ((cx + dx) % GRID)
          if (i >= 0 && i < size) {
            u[i] = 0.5 + Math.random() * 0.1
            v[i] = 0.25 + Math.random() * 0.1
          }
        }
      }
    }

    simRef.current = { u, v, uNext, vNext, w: GRID, h: GRID }
  }, [])

  const step = useCallback(() => {
    const sim = simRef.current
    if (!sim) return
    const { u, v, uNext, vNext, w, h } = sim
    const { f, k, Du, Dv } = paramsRef.current
    const dt = 1.0

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const up = ((y - 1 + h) % h) * w + x
        const dn = ((y + 1) % h) * w + x
        const lt = y * w + ((x - 1 + w) % w)
        const rt = y * w + ((x + 1) % w)

        const laplacianU = u[up] + u[dn] + u[lt] + u[rt] - 4 * u[i]
        const laplacianV = v[up] + v[dn] + v[lt] + v[rt] - 4 * v[i]
        const uvv = u[i] * v[i] * v[i]

        uNext[i] = u[i] + dt * (Du * laplacianU - uvv + f * (1 - u[i]))
        vNext[i] = v[i] + dt * (Dv * laplacianV + uvv - (f + k) * v[i])

        // Clamp
        if (uNext[i] < 0) uNext[i] = 0
        if (uNext[i] > 1) uNext[i] = 1
        if (vNext[i] < 0) vNext[i] = 0
        if (vNext[i] > 1) vNext[i] = 1
      }
    }

    // Swap
    sim.u.set(uNext)
    sim.v.set(vNext)
  }, [])

  const paint = useCallback((cx: number, cy: number) => {
    const sim = simRef.current
    if (!sim) return
    const r = 5
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const x = ((cx + dx) % GRID + GRID) % GRID
        const y = ((cy + dy) % GRID + GRID) % GRID
        const i = y * GRID + x
        sim.u[i] = 0.5
        sim.v[i] = 0.25
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = GRID
    canvas.height = GRID
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(GRID, GRID)
    const pixels = imageData.data

    initGrid()

    let frame: number
    let lastTime = performance.now()
    let frameCount = 0

    const tick = () => {
      const now = performance.now()
      frameCount++
      if (now - lastTime >= 1000) {
        setFps(frameCount)
        frameCount = 0
        lastTime = now
      }

      if (!pausedRef.current) {
        for (let s = 0; s < STEPS_PER_FRAME; s++) step()
      }

      // Render
      const sim = simRef.current
      if (sim) {
        const colorFn = COLOR_MAPS[colorMapRef.current].fn
        for (let i = 0; i < GRID * GRID; i++) {
          const [r, g, b] = colorFn(sim.u[i], sim.v[i])
          const p = i * 4
          pixels[p] = r
          pixels[p + 1] = g
          pixels[p + 2] = b
          pixels[p + 3] = 255
        }
        ctx.putImageData(imageData, 0, 0)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    // Pointer handlers
    const getGridPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID)
      return { x, y }
    }

    const onPointerDown = (e: MouseEvent) => {
      paintingRef.current = true
      const { x, y } = getGridPos(e)
      paint(x, y)
    }
    const onPointerMove = (e: MouseEvent) => {
      if (!paintingRef.current) return
      const { x, y } = getGridPos(e)
      paint(x, y)
    }
    const onPointerUp = () => { paintingRef.current = false }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      paintingRef.current = true
      const { x, y } = getGridPos(e.touches[0])
      paint(x, y)
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (!paintingRef.current) return
      const { x, y } = getGridPos(e.touches[0])
      paint(x, y)
    }
    const onTouchEnd = () => { paintingRef.current = false }

    canvas.addEventListener('mousedown', onPointerDown)
    canvas.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('mousedown', onPointerDown)
      canvas.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [initGrid, step, paint])

  const selectPreset = useCallback((idx: number) => {
    const p = PRESETS[idx]
    paramsRef.current.f = p.f
    paramsRef.current.k = p.k
    setPreset(idx)
    initGrid()
  }, [initGrid])

  const cycleColor = useCallback(() => {
    const next = (colorMapRef.current + 1) % COLOR_MAPS.length
    colorMapRef.current = next
    setColorIdx(next)
  }, [])

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current
    setPaused(p => !p)
  }, [])

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Canvas — fills viewport, maintains aspect */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain cursor-crosshair"
          style={{
            imageRendering: 'pixelated',
            maxWidth: '100vmin',
            maxHeight: '100vmin',
          }}
        />
      </div>

      {/* UI overlay */}
      {showUI && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-t border-white/10 text-white">
          {/* Title bar */}
          <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-wider uppercase opacity-80">
                morphogenesis
              </h1>
              <p className="text-[10px] opacity-40 mt-0.5">
                Gray-Scott reaction-diffusion &middot; Turing 1952 &middot; draw to seed &middot; {GRID}&times;{GRID} &middot; {fps} fps
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={togglePause}
                className="text-[10px] px-2 py-1 rounded border border-white/20 hover:bg-white/10 transition-colors uppercase tracking-wider"
              >
                {paused ? 'play' : 'pause'}
              </button>
              <button
                onClick={() => initGrid()}
                className="text-[10px] px-2 py-1 rounded border border-white/20 hover:bg-white/10 transition-colors uppercase tracking-wider"
              >
                reset
              </button>
              <button
                onClick={cycleColor}
                className="text-[10px] px-2 py-1 rounded border border-white/20 hover:bg-white/10 transition-colors uppercase tracking-wider"
              >
                {COLOR_MAPS[colorIdx].name}
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                onClick={() => selectPreset(i)}
                className={`shrink-0 text-left px-3 py-1.5 rounded-lg border transition-all text-[11px] ${
                  i === preset
                    ? 'border-white/40 bg-white/10'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <div className="font-medium tracking-wide">{p.name}</div>
                <div className="opacity-40 text-[9px] mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>

          {/* Equations */}
          <div className="px-4 pb-2 text-[9px] opacity-25 font-mono flex gap-6">
            <span>∂u/∂t = D<sub>u</sub>∇²u − uv² + f(1−u)</span>
            <span>∂v/∂t = D<sub>v</sub>∇²v + uv² − (f+k)v</span>
            <span>f={paramsRef.current.f.toFixed(4)} k={paramsRef.current.k.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Toggle UI */}
      <button
        onClick={() => setShowUI(s => !s)}
        className="absolute top-3 right-3 text-white/30 hover:text-white/60 text-xs transition-colors"
      >
        {showUI ? 'hide' : 'show'}
      </button>
    </div>
  )
}
