'use client'

import { useEffect, useRef } from 'react'

// ─── Stable Fluids (Jos Stam, 1999) ─────────────────────────────────────────
// Real-time Navier-Stokes fluid simulation.
// Velocity field (u, v) + three RGB dye channels on an N×N grid.
// Unconditionally stable: semi-Lagrangian advection + implicit diffusion.
// Drag to inject citrus dye + velocity. The fluid swirls, mixes, remembers.

const N    = 96                    // grid cells per axis
const SZ   = (N + 2) * (N + 2)    // includes 1-cell border on each side
const DT   = 0.14                  // time step
const VISC = 0.000001              // velocity viscosity
const DIFF = 0.000025              // dye diffusion coefficient
const ITER = 16                    // Gauss-Seidel pressure iterations

// Background: warm cream
const BG_R = 255, BG_G = 248, BG_B = 231

// Citrus dye palette (normalized RGB 0-1)
const DYES: [number, number, number][] = [
  [1.00, 0.306, 0.314],   // blood orange  #FF4E50
  [0.988, 0.569, 0.227],  // tangerine     #FC913A
  [0.976, 0.831, 0.137],  // mango         #F9D423
  [0.706, 0.890, 0.239],  // lime zest     #B4E33D
  [1.00,  0.420, 0.506],  // grapefruit    #FF6B81
]

// ─── Core fluid helpers ──────────────────────────────────────────────────────

function IX(x: number, y: number): number { return x + (N + 2) * y }

function addSource(x: Float32Array, s: Float32Array) {
  for (let i = 0; i < SZ; i++) x[i] += DT * s[i]
}

function setBnd(b: number, x: Float32Array) {
  for (let i = 1; i <= N; i++) {
    x[IX(0,   i)] = b === 1 ? -x[IX(1, i)] : x[IX(1, i)]
    x[IX(N+1, i)] = b === 1 ? -x[IX(N, i)] : x[IX(N, i)]
    x[IX(i,   0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)]
    x[IX(i, N+1)] = b === 2 ? -x[IX(i, N)] : x[IX(i, N)]
  }
  x[IX(0,   0  )] = 0.5 * (x[IX(1, 0  )] + x[IX(0,   1)])
  x[IX(0,   N+1)] = 0.5 * (x[IX(1, N+1)] + x[IX(0,   N)])
  x[IX(N+1, 0  )] = 0.5 * (x[IX(N, 0  )] + x[IX(N+1, 1)])
  x[IX(N+1, N+1)] = 0.5 * (x[IX(N, N+1)] + x[IX(N+1, N)])
}

function linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
  const ic = 1 / c
  for (let k = 0; k < ITER; k++) {
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        x[IX(i,j)] = (x0[IX(i,j)] + a*(x[IX(i-1,j)] + x[IX(i+1,j)] + x[IX(i,j-1)] + x[IX(i,j+1)])) * ic
      }
    }
    setBnd(b, x)
  }
}

function diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number) {
  const a = DT * diff * N * N
  linSolve(b, x, x0, a, 1 + 4 * a)
}

function project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
  const h = 1 / N
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      div[IX(i,j)] = -0.5 * h * (u[IX(i+1,j)] - u[IX(i-1,j)] + v[IX(i,j+1)] - v[IX(i,j-1)])
      p[IX(i,j)] = 0
    }
  }
  setBnd(0, div); setBnd(0, p)
  linSolve(0, p, div, 1, 4)
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      u[IX(i,j)] -= 0.5 * (p[IX(i+1,j)] - p[IX(i-1,j)]) / h
      v[IX(i,j)] -= 0.5 * (p[IX(i,j+1)] - p[IX(i,j-1)]) / h
    }
  }
  setBnd(1, u); setBnd(2, v)
}

function advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array) {
  const dt0 = DT * N
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      let x = i - dt0 * u[IX(i,j)]
      let y = j - dt0 * v[IX(i,j)]
      x = Math.max(0.5, Math.min(N + 0.5, x))
      y = Math.max(0.5, Math.min(N + 0.5, y))
      const i0 = x | 0,  i1 = i0 + 1
      const j0 = y | 0,  j1 = j0 + 1
      const s1 = x - i0, s0 = 1 - s1
      const t1 = y - j0, t0 = 1 - t1
      d[IX(i,j)] = s0*(t0*d0[IX(i0,j0)] + t1*d0[IX(i0,j1)]) +
                   s1*(t0*d0[IX(i1,j0)] + t1*d0[IX(i1,j1)])
    }
  }
  setBnd(b, d)
}

// ─── React Component ─────────────────────────────────────────────────────────

export default function L38() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const el = canvas

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    function resize() {
      W = window.innerWidth; H = window.innerHeight
      el.width  = W * dpr;  el.height = H * dpr
      el.style.width  = W + 'px'; el.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = el.getContext('2d')!

    // ── Fluid state ──────────────────────────────────────────────────────────
    let u   = new Float32Array(SZ), v   = new Float32Array(SZ)
    let u0  = new Float32Array(SZ), v0  = new Float32Array(SZ)
    // Three dye channels store RGB components separately so colors mix properly
    let dr  = new Float32Array(SZ), dg  = new Float32Array(SZ), db  = new Float32Array(SZ)
    let dr0 = new Float32Array(SZ), dg0 = new Float32Array(SZ), db0 = new Float32Array(SZ)
    const p   = new Float32Array(SZ), div = new Float32Array(SZ)
    // Per-frame source buffers (cleared each step)
    const su  = new Float32Array(SZ), sv  = new Float32Array(SZ)
    const sdr = new Float32Array(SZ), sdg = new Float32Array(SZ), sdb = new Float32Array(SZ)

    // ── Offscreen canvas for per-pixel rendering (N×N) ───────────────────────
    const off     = document.createElement('canvas')
    off.width = N + 2; off.height = N + 2
    const octx    = off.getContext('2d')!
    const imgData = octx.createImageData(N + 2, N + 2)
    const px      = imgData.data
    for (let i = 0; i < (N+2)*(N+2); i++) px[i*4+3] = 255  // alpha always 255

    // ── Fluid simulation step ────────────────────────────────────────────────
    function velStep() {
      addSource(u, su); addSource(v, sv)
      // diffuse velocity
      ;[u, u0] = [u0, u]; diffuse(1, u, u0, VISC)
      ;[v, v0] = [v0, v]; diffuse(2, v, v0, VISC)
      project(u, v, p, div)
      // advect velocity
      ;[u, u0] = [u0, u]; [v, v0] = [v0, v]
      advect(1, u, u0, u0, v0)
      advect(2, v, v0, u0, v0)
      project(u, v, p, div)
      // clear sources
      su.fill(0); sv.fill(0)
    }

    function densStep() {
      // Red channel
      addSource(dr, sdr)
      ;[dr, dr0] = [dr0, dr]; diffuse(0, dr, dr0, DIFF)
      ;[dr, dr0] = [dr0, dr]; advect(0, dr, dr0, u, v)
      // Green channel
      addSource(dg, sdg)
      ;[dg, dg0] = [dg0, dg]; diffuse(0, dg, dg0, DIFF)
      ;[dg, dg0] = [dg0, dg]; advect(0, dg, dg0, u, v)
      // Blue channel
      addSource(db, sdb)
      ;[db, db0] = [db0, db]; diffuse(0, db, db0, DIFF)
      ;[db, db0] = [db0, db]; advect(0, db, db0, u, v)
      // Normalize per-cell to preserve hue when colors mix and clamp brightness
      for (let i = 0; i < SZ; i++) {
        const m = Math.max(dr[i], dg[i], db[i])
        if (m > 1) { const inv = 1/m; dr[i] *= inv; dg[i] *= inv; db[i] *= inv }
      }
      // Clear sources
      sdr.fill(0); sdg.fill(0); sdb.fill(0)
    }

    // ── Render ───────────────────────────────────────────────────────────────
    let totalKE = 0

    function renderFrame() {
      let ke = 0
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const idx = IX(i, j)
          const r = dr[idx], g = dg[idx], b = db[idx]
          // Blend dye over warm cream: more dye = more saturated color
          const mag = Math.min(1, (r + g + b) * 0.85)
          const R = (BG_R + (r * 255 - BG_R) * mag) | 0
          const G = (BG_G + (g * 255 - BG_G) * mag) | 0
          const B = (BG_B + (b * 255 - BG_B) * mag) | 0
          const p4 = idx * 4
          px[p4] = R; px[p4+1] = G; px[p4+2] = B
          // Sum KE for drone modulation
          ke += u[idx]*u[idx] + v[idx]*v[idx]
        }
      }
      totalKE = ke
      octx.putImageData(imgData, 0, 0)

      // Scale N×N grid to fill screen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 1, 1, N, N, 0, 0, W, H)

      // Hint
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(42,34,24,0.20)'
      ctx.textAlign = 'center'
      ctx.fillText('drag to stir · tap to burst', W/2, H - 20)
      ctx.textAlign = 'start'
    }

    // ── Audio ────────────────────────────────────────────────────────────────
    let actx: AudioContext | null = null
    let droneOsc: OscillatorNode | null = null
    let droneGain: GainNode | null = null

    function initAudio() {
      if (actx) return
      const AC = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      actx = new AC()
      const osc  = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 90
      gain.gain.value = 0.025
      osc.connect(gain); gain.connect(actx.destination)
      osc.start()
      droneOsc = osc; droneGain = gain
    }

    function pluck(freq: number) {
      if (!actx) return
      if (actx.state === 'suspended') void actx.resume()
      const osc  = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.10, actx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 1.2)
      osc.connect(gain); gain.connect(actx.destination)
      osc.start(); osc.stop(actx.currentTime + 1.2)
    }

    // ── Grid helpers ─────────────────────────────────────────────────────────
    function toGrid(px: number, py: number): [number, number] {
      return [
        Math.max(1, Math.min(N, (px / W * N) | 0 + 1)),
        Math.max(1, Math.min(N, (py / H * N) | 0 + 1)),
      ]
    }

    // ── Interaction ───────────────────────────────────────────────────────────
    let isDown   = false
    let prevGX   = 0, prevGY = 0
    let dyeIdx   = 0
    let lastT    = 0

    function onDown(px: number, py: number) {
      initAudio()
      if (actx?.state === 'suspended') void actx.resume()
      isDown = true
      const [gx, gy] = toGrid(px, py)
      prevGX = gx; prevGY = gy
      dyeIdx = (dyeIdx + 1) % DYES.length
      pluck(220 + (gx / N) * 330)
      lastT = performance.now()
    }

    function onMove(px: number, py: number) {
      if (!isDown) return
      const now = performance.now()
      if (now - lastT < 16) return
      lastT = now
      const [gx, gy] = toGrid(px, py)
      const dx = gx - prevGX, dy = gy - prevGY
      const speed = Math.sqrt(dx*dx + dy*dy)
      if (speed < 0.01) return

      const force = Math.min(speed * 80, 400)
      const fdx = dx / speed, fdy = dy / speed

      // Inject velocity in a small brush
      const R = 3
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          if (di*di + dj*dj > R*R) continue
          const ni = gx+di, nj = gy+dj
          if (ni < 1 || ni > N || nj < 1 || nj > N) continue
          const w = 1 - Math.sqrt(di*di + dj*dj) / R
          su[IX(ni, nj)] += fdx * force * w
          sv[IX(ni, nj)] += fdy * force * w
          sdr[IX(ni, nj)] += DYES[dyeIdx][0] * 8 * w
          sdg[IX(ni, nj)] += DYES[dyeIdx][1] * 8 * w
          sdb[IX(ni, nj)] += DYES[dyeIdx][2] * 8 * w
        }
      }
      prevGX = gx; prevGY = gy
    }

    function onUp() { isDown = false }

    // Tap burst: radial velocity outward from tap point (no dye)
    function onTap(px: number, py: number) {
      const [gx, gy] = toGrid(px, py)
      const R = 6
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const d2 = di*di + dj*dj
          if (d2 > R*R || d2 === 0) continue
          const ni = gx+di, nj = gy+dj
          if (ni < 1 || ni > N || nj < 1 || nj > N) continue
          const d = Math.sqrt(d2)
          const w = (R - d) / R
          su[IX(ni, nj)] += (di/d) * 600 * w
          sv[IX(ni, nj)] += (dj/d) * 600 * w
        }
      }
      pluck(330 + (gx / N) * 440)
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    let tapDist = 0, tapStartX = 0, tapStartY = 0

    el.addEventListener('mousedown', e => {
      tapStartX = e.clientX; tapStartY = e.clientY; tapDist = 0
      onDown(e.clientX, e.clientY)
    })
    el.addEventListener('mousemove', e => {
      const dx = e.clientX - tapStartX, dy = e.clientY - tapStartY
      tapDist += Math.sqrt(dx*dx + dy*dy)
      onMove(e.clientX, e.clientY)
    })
    el.addEventListener('mouseup', e => {
      onUp()
      if (tapDist < 8) onTap(e.clientX, e.clientY)
    })

    el.addEventListener('touchstart', e => {
      e.preventDefault()
      const t = e.changedTouches[0]
      tapStartX = t.clientX; tapStartY = t.clientY; tapDist = 0
      onDown(t.clientX, t.clientY)
    }, { passive: false })
    el.addEventListener('touchmove', e => {
      e.preventDefault()
      const t = e.changedTouches[0]
      const dx = t.clientX - tapStartX, dy = t.clientY - tapStartY
      tapDist += Math.sqrt(dx*dx + dy*dy)
      onMove(t.clientX, t.clientY)
    }, { passive: false })
    el.addEventListener('touchend', e => {
      e.preventDefault(); onUp()
      const t = e.changedTouches[0]
      if (tapDist < 12) onTap(t.clientX, t.clientY)
    }, { passive: false })

    // ── Idle perturbation — keeps the fluid alive when untouched ─────────────
    let idleT = 0
    function addIdleForce() {
      idleT += 0.008
      // Gentle counter-rotating vortices that drift slowly
      const cx1 = (0.35 + 0.10*Math.sin(idleT * 0.7)) * N | 0
      const cy1 = (0.50 + 0.12*Math.cos(idleT * 0.5)) * N | 0
      const cx2 = (0.65 + 0.10*Math.cos(idleT * 0.6)) * N | 0
      const cy2 = (0.50 + 0.12*Math.sin(idleT * 0.4)) * N | 0
      const f = 6
      if (cx1 >= 1 && cx1 <= N && cy1 >= 1 && cy1 <= N) {
        su[IX(cx1, cy1)] += Math.cos(idleT * 1.1) * f
        sv[IX(cx1, cy1)] += Math.sin(idleT * 0.9) * f
      }
      if (cx2 >= 1 && cx2 <= N && cy2 >= 1 && cy2 <= N) {
        su[IX(cx2, cy2)] -= Math.cos(idleT * 0.8) * f
        sv[IX(cx2, cy2)] -= Math.sin(idleT * 1.2) * f
      }
    }

    // ── Animation loop ────────────────────────────────────────────────────────
    let raf: number

    function frame() {
      addIdleForce()
      velStep()
      densStep()
      renderFrame()

      // Modulate drone with kinetic energy
      if (droneOsc && actx) {
        const norm = Math.min(1, totalKE / (N * N * 0.05))
        droneOsc.frequency.setTargetAtTime(80 + norm * 200, actx.currentTime, 0.6)
        if (droneGain) droneGain.gain.setTargetAtTime(0.02 + norm * 0.03, actx.currentTime, 0.6)
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (droneOsc) droneOsc.stop()
      if (actx) void actx.close()
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
