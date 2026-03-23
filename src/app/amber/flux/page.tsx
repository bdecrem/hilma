'use client'

import { useEffect, useRef } from 'react'

// Stable fluid simulation — Jos Stam "Real-Time Fluid Dynamics for Games" (2003)
// Full Navier-Stokes: advection, diffusion, pressure projection
// Multi-colored dye injection via mouse/touch

const N = 192        // grid resolution
const SIZE = (N + 2) * (N + 2)
const DT = 0.15
const DIFF = 0.00001 // viscosity
const VISC = 0.00001
const FADE = 0.995

function IX(x: number, y: number) { return x + (N + 2) * y }

function setBnd(b: number, x: Float32Array) {
  const n = N
  for (let i = 1; i <= n; i++) {
    x[IX(0, i)]     = b === 1 ? -x[IX(1, i)] : x[IX(1, i)]
    x[IX(n + 1, i)] = b === 1 ? -x[IX(n, i)] : x[IX(n, i)]
    x[IX(i, 0)]     = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)]
    x[IX(i, n + 1)] = b === 2 ? -x[IX(i, n)] : x[IX(i, n)]
  }
  x[IX(0, 0)]         = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)])
  x[IX(0, n + 1)]     = 0.5 * (x[IX(1, n + 1)] + x[IX(0, n)])
  x[IX(n + 1, 0)]     = 0.5 * (x[IX(n, 0)] + x[IX(n + 1, 1)])
  x[IX(n + 1, n + 1)] = 0.5 * (x[IX(n, n + 1)] + x[IX(n + 1, n)])
}

function linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
  const cRecip = 1.0 / c
  for (let iter = 0; iter < 4; iter++) {
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        x[IX(i, j)] = (x0[IX(i, j)] + a * (
          x[IX(i + 1, j)] + x[IX(i - 1, j)] +
          x[IX(i, j + 1)] + x[IX(i, j - 1)]
        )) * cRecip
      }
    }
    setBnd(b, x)
  }
}

function diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number) {
  const a = DT * diff * N * N
  linSolve(b, x, x0, a, 1 + 4 * a)
}

function advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array) {
  const dt0 = DT * N
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      let x = i - dt0 * u[IX(i, j)]
      let y = j - dt0 * v[IX(i, j)]
      if (x < 0.5) x = 0.5
      if (x > N + 0.5) x = N + 0.5
      const i0 = Math.floor(x), i1 = i0 + 1
      if (y < 0.5) y = 0.5
      if (y > N + 0.5) y = N + 0.5
      const j0 = Math.floor(y), j1 = j0 + 1
      const s1 = x - i0, s0 = 1 - s1
      const t1 = y - j0, t0 = 1 - t1
      d[IX(i, j)] =
        s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
        s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)])
    }
  }
  setBnd(b, d)
}

function project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      div[IX(i, j)] = -0.5 * (
        u[IX(i + 1, j)] - u[IX(i - 1, j)] +
        v[IX(i, j + 1)] - v[IX(i, j - 1)]
      ) / N
      p[IX(i, j)] = 0
    }
  }
  setBnd(0, div)
  setBnd(0, p)
  linSolve(0, p, div, 1, 4)

  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      u[IX(i, j)] -= 0.5 * N * (p[IX(i + 1, j)] - p[IX(i - 1, j)])
      v[IX(i, j)] -= 0.5 * N * (p[IX(i, j + 1)] - p[IX(i, j - 1)])
    }
  }
  setBnd(1, u)
  setBnd(2, v)
}

function velStep(u: Float32Array, v: Float32Array, u0: Float32Array, v0: Float32Array, p: Float32Array, div: Float32Array) {
  // Add source
  for (let i = 0; i < SIZE; i++) { u[i] += DT * u0[i]; v[i] += DT * v0[i] }
  // Diffuse
  const tmp1 = new Float32Array(SIZE)
  const tmp2 = new Float32Array(SIZE)
  tmp1.set(u); diffuse(1, u, tmp1, VISC)
  tmp2.set(v); diffuse(2, v, tmp2, VISC)
  project(u, v, p, div)
  // Advect
  tmp1.set(u); tmp2.set(v)
  advect(1, u, tmp1, tmp1, tmp2)
  advect(2, v, tmp2, tmp1, tmp2)
  project(u, v, p, div)
  // Clear sources
  u0.fill(0); v0.fill(0)
}

function densStep(x: Float32Array, x0: Float32Array, u: Float32Array, v: Float32Array) {
  for (let i = 0; i < SIZE; i++) x[i] += DT * x0[i]
  const tmp = new Float32Array(SIZE)
  tmp.set(x); diffuse(0, x, tmp, DIFF)
  tmp.set(x)
  advect(0, x, tmp, u, v)
  x0.fill(0)
}

// HSL → RGB
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export default function Flux() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    canvas.width = N
    canvas.height = N

    // Fluid state
    const u = new Float32Array(SIZE)
    const v = new Float32Array(SIZE)
    const u0 = new Float32Array(SIZE)
    const v0 = new Float32Array(SIZE)
    const p = new Float32Array(SIZE)
    const div = new Float32Array(SIZE)

    // RGB dye channels
    const dr = new Float32Array(SIZE)
    const dg = new Float32Array(SIZE)
    const db = new Float32Array(SIZE)
    const dr0 = new Float32Array(SIZE)
    const dg0 = new Float32Array(SIZE)
    const db0 = new Float32Array(SIZE)

    const imageData = ctx.createImageData(N, N)
    const pixels = imageData.data

    let prevX = -1, prevY = -1
    let isDown = false
    let hueAngle = 0
    let frame: number
    let t = 0

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * N) + 1
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * N) + 1
      return { x: Math.max(1, Math.min(N, x)), y: Math.max(1, Math.min(N, y)) }
    }

    const inject = (x: number, y: number, dx: number, dy: number) => {
      const force = 8
      const radius = 4
      // Evolving hue based on position + time
      hueAngle = (Math.atan2(y - N / 2, x - N / 2) * 180 / Math.PI + 180 + t * 0.5) % 360
      const [cr, cg, cb] = hsl2rgb(hueAngle, 1, 0.55)

      for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
          const dist = Math.sqrt(di * di + dj * dj)
          if (dist > radius) continue
          const falloff = 1 - dist / radius
          const ix = x + di, iy = y + dj
          if (ix < 1 || ix > N || iy < 1 || iy > N) continue
          const idx = IX(ix, iy)
          u0[idx] += dx * force * falloff
          v0[idx] += dy * force * falloff
          dr0[idx] += cr * falloff * 2
          dg0[idx] += cg * falloff * 2
          db0[idx] += cb * falloff * 2
        }
      }
    }

    // Ambient swirl generators
    const addAmbient = () => {
      // Gentle vortex pairs
      const cx1 = N * 0.3 + Math.sin(t * 0.007) * N * 0.15
      const cy1 = N * 0.5 + Math.cos(t * 0.005) * N * 0.2
      const cx2 = N * 0.7 + Math.cos(t * 0.006) * N * 0.15
      const cy2 = N * 0.5 + Math.sin(t * 0.008) * N * 0.2
      const str = 0.15

      for (let r = -3; r <= 3; r++) {
        for (let c = -3; c <= 3; c++) {
          const x1 = Math.round(cx1) + c, y1 = Math.round(cy1) + r
          const x2 = Math.round(cx2) + c, y2 = Math.round(cy2) + r
          if (x1 >= 1 && x1 <= N && y1 >= 1 && y1 <= N) {
            const i1 = IX(x1, y1)
            u0[i1] += Math.sin(t * 0.01 + r * 0.5) * str
            v0[i1] += Math.cos(t * 0.012 + c * 0.5) * str
            const [ar, ag, ab] = hsl2rgb((t * 0.3 + 0) % 360, 0.8, 0.5)
            dr0[i1] += ar * 0.15
            dg0[i1] += ag * 0.15
            db0[i1] += ab * 0.15
          }
          if (x2 >= 1 && x2 <= N && y2 >= 1 && y2 <= N) {
            const i2 = IX(x2, y2)
            u0[i2] -= Math.cos(t * 0.009 + r * 0.5) * str
            v0[i2] -= Math.sin(t * 0.011 + c * 0.5) * str
            const [ar, ag, ab] = hsl2rgb((t * 0.3 + 180) % 360, 0.8, 0.5)
            dr0[i2] += ar * 0.15
            dg0[i2] += ag * 0.15
            db0[i2] += ab * 0.15
          }
        }
      }
    }

    // Pointer events
    const onDown = (x: number, y: number) => { isDown = true; prevX = x; prevY = y }
    const onMove = (x: number, y: number) => {
      if (!isDown) return
      if (prevX > 0) inject(x, y, (x - prevX) * 2, (y - prevY) * 2)
      prevX = x; prevY = y
    }
    const onUp = () => { isDown = false; prevX = -1; prevY = -1 }

    canvas.addEventListener('mousedown', (e) => { const p = getPos(e); onDown(p.x, p.y) })
    canvas.addEventListener('mousemove', (e) => { const p = getPos(e); onMove(p.x, p.y) })
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const p = getPos(e.touches[0]); onDown(p.x, p.y) }, { passive: false })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const p = getPos(e.touches[0]); onMove(p.x, p.y) }, { passive: false })
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onUp() }, { passive: false })

    const tick = () => {
      t++

      // Ambient motion
      addAmbient()

      // Solve
      velStep(u, v, u0, v0, p, div)
      densStep(dr, dr0, u, v)
      densStep(dg, dg0, u, v)
      densStep(db, db0, u, v)

      // Fade + render
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const idx = IX(i, j)
          dr[idx] *= FADE
          dg[idx] *= FADE
          db[idx] *= FADE

          const pi = ((j - 1) * N + (i - 1)) * 4
          // Additive blend on dark background
          const r = Math.min(255, dr[idx])
          const g = Math.min(255, dg[idx])
          const b = Math.min(255, db[idx])

          // Bloom: brighten high-intensity areas
          const lum = (r + g + b) / 3
          const bloom = lum > 120 ? (lum - 120) / 135 : 0

          pixels[pi]     = Math.min(255, r + bloom * 60)
          pixels[pi + 1] = Math.min(255, g + bloom * 60)
          pixels[pi + 2] = Math.min(255, b + bloom * 60)
          pixels[pi + 3] = 255
        }
      }

      ctx.putImageData(imageData, 0, 0)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-none"
        style={{
          imageRendering: 'auto',
          maxWidth: '100vmin',
          maxHeight: '100vmin',
          objectFit: 'contain',
        }}
      />
      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
        <p className="text-white/20 text-[10px] tracking-[0.3em] uppercase">drag to paint with fluid</p>
      </div>
    </div>
  )
}
