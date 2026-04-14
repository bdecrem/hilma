'use client'

import { useEffect, useRef } from 'react'

// ─── Lenia parameters ────────────────────────────────────────────────────────
// Single-channel Lenia (1-state, 1-kernel). Classic "orbium" parameters.
// Creatures form from disk seeds: overcrowded centers die, edges thrive → rings.
const GRID = 100     // simulation grid (square, toroidal)
const R = 13         // kernel outer radius
const MU = 0.15      // growth function peak (potential value where cells thrive)
const SIGMA = 0.015  // growth function width
const DT = 0.1       // time step

// ─── Color LUT: state [0,1] → RGB ────────────────────────────────────────────
// Dark espresso → deep leaf green → lime → mango → blood orange
const LUT_N = 256
const LUT_R = new Uint8Array(LUT_N)
const LUT_G = new Uint8Array(LUT_N)
const LUT_B = new Uint8Array(LUT_N)
for (let i = 0; i < LUT_N; i++) {
  const v = i / (LUT_N - 1)
  let r: number, g: number, b: number
  if (v < 0.12) {
    const t = v / 0.12
    r = Math.round(18 + 14 * t); g = Math.round(10 + 10 * t); b = Math.round(6 + 8 * t)
  } else if (v < 0.35) {
    const t = (v - 0.12) / 0.23
    r = Math.round(32 + 13 * t); g = Math.round(20 + 70 * t); b = Math.round(14 + 6 * t)
  } else if (v < 0.6) {
    const t = (v - 0.35) / 0.25
    r = Math.round(45 + (180 - 45) * t); g = Math.round(90 + (227 - 90) * t); b = Math.round(20 + (61 - 20) * t)
  } else if (v < 0.82) {
    const t = (v - 0.6) / 0.22
    r = Math.round(180 + (249 - 180) * t); g = Math.round(227 + (212 - 227) * t); b = Math.round(61 + (35 - 61) * t)
  } else {
    const t = (v - 0.82) / 0.18
    r = Math.round(249 + (255 - 249) * t); g = Math.round(212 + (78 - 212) * t); b = Math.round(35 + (80 - 35) * t)
  }
  LUT_R[i] = Math.min(255, Math.max(0, r))
  LUT_G[i] = Math.min(255, Math.max(0, g))
  LUT_B[i] = Math.min(255, Math.max(0, b))
}

// ─── Growth LUT: potential [0,1] → Δstate ─────────────────────────────────
// G(u) = 2·exp(-(u-MU)²/(2·SIGMA²)) − 1
// peak +1 at u=MU, falls to -1 away from MU
const G_N = 2048
const G_LUT = new Float32Array(G_N)
const _s2 = 2 * SIGMA * SIGMA
for (let i = 0; i < G_N; i++) {
  const u = i / (G_N - 1)
  G_LUT[i] = 2 * Math.exp(-((u - MU) ** 2) / _s2) - 1
}

export default function L42() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let CW = window.innerWidth
    let CH = window.innerHeight
    canvas.width = CW * dpr
    canvas.height = CH * dpr
    canvas.style.width = CW + 'px'
    canvas.style.height = CH + 'px'
    const ctx = canvas.getContext('2d')!

    // Offscreen sim canvas — rendered at GRID×GRID, upscaled with pixelation
    const simCvs = document.createElement('canvas')
    simCvs.width = GRID; simCvs.height = GRID
    const sctx = simCvs.getContext('2d')!
    const img = sctx.createImageData(GRID, GRID)
    const px = img.data

    // State arrays (flat, row-major, toroidal)
    let A = new Float32Array(GRID * GRID)
    let B = new Float32Array(GRID * GRID)

    // ── Pre-compute kernel as typed arrays ──────────────────────────────────
    // Ring kernel: k(r/R) = exp(-((r/R - 0.5)²)/(2·0.15²)), normalized
    const _ks = 0.15, _ks2 = 2 * _ks * _ks
    const tmpK: Array<[number, number, number]> = []
    let ksum = 0
    for (let di = -R; di <= R; di++) {
      for (let dj = -R; dj <= R; dj++) {
        const r = Math.sqrt(di * di + dj * dj)
        if (r > R + 0.5) continue
        const rn = r / R
        const k = Math.exp(-((rn - 0.5) ** 2) / _ks2)
        if (k > 1e-4) { tmpK.push([di, dj, k]); ksum += k }
      }
    }
    const KL = tmpK.length
    const KDI = new Int32Array(KL)
    const KDJ = new Int32Array(KL)
    const KW  = new Float32Array(KL)
    for (let k = 0; k < KL; k++) {
      KDI[k] = tmpK[k][0]; KDJ[k] = tmpK[k][1]; KW[k] = tmpK[k][2] / ksum
    }

    // ── Seed: plant a disk of alive cells at (cx, cy) ──────────────────────
    function seedDisk(cx: number, cy: number, radius = 8) {
      const r2 = radius * radius
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= r2) {
            const y = ((Math.round(cy + dy) % GRID) + GRID) % GRID
            const x = ((Math.round(cx + dx) % GRID) + GRID) % GRID
            A[y * GRID + x] = Math.max(A[y * GRID + x], 0.35 + Math.random() * 0.55)
          }
        }
      }
    }

    // ── Seed three creatures ────────────────────────────────────────────────
    seedDisk(GRID * 0.28, GRID * 0.38)
    seedDisk(GRID * 0.72, GRID * 0.55)
    seedDisk(GRID * 0.5, GRID * 0.75)

    // ── Simulation step ─────────────────────────────────────────────────────
    function step() {
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          let u = 0
          for (let k = 0; k < KL; k++) {
            const ny = (y + KDI[k] + GRID) % GRID
            const nx = (x + KDJ[k] + GRID) % GRID
            u += A[ny * GRID + nx] * KW[k]
          }
          const gi = Math.min(G_N - 1, Math.max(0, Math.round(u * (G_N - 1))))
          B[y * GRID + x] = Math.min(1, Math.max(0, A[y * GRID + x] + DT * G_LUT[gi]))
        }
      }
      const tmp = A; A = B; B = tmp
    }

    // ── Render sim → ImageData → upscale ───────────────────────────────────
    function render(): number {
      let total = 0
      for (let i = 0; i < GRID * GRID; i++) {
        const v = A[i]; total += v
        const li = Math.round(v * 255)
        const p = i << 2
        px[p]     = LUT_R[li]
        px[p + 1] = LUT_G[li]
        px[p + 2] = LUT_B[li]
        px[p + 3] = 255
      }
      sctx.putImageData(img, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(simCvs, 0, 0, CW, CH)
      return total
    }

    // ── Labels ──────────────────────────────────────────────────────────────
    function drawLabels() {
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,248,231,0.22)'
      ctx.textAlign = 'left'
      ctx.fillText('tap to seed', 14, CH - 28)
      ctx.fillText('drag to paint', 14, CH - 12)
    }

    // ── Audio ───────────────────────────────────────────────────────────────
    let actx: AudioContext | null = null
    let osc: OscillatorNode | null = null

    function initAudio() {
      if (actx) return
      actx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      osc = actx.createOscillator()
      osc.type = 'sine'; osc.frequency.value = 36
      const g = actx.createGain(); g.gain.value = 0.028
      osc.connect(g); g.connect(actx.destination); osc.start()
    }

    // ── Animation (≈20fps cap) ──────────────────────────────────────────────
    let raf: number
    let lastT = 0

    function loop(t: number) {
      raf = requestAnimationFrame(loop)
      if (t - lastT < 50) return  // skip above ~20fps
      lastT = t
      step()
      const total = render()
      drawLabels()

      // Auto-reseed if life goes quiet
      if (total < GRID * GRID * 0.01 && Math.random() < 0.15) {
        seedDisk(5 + Math.random() * (GRID - 10), 5 + Math.random() * (GRID - 10))
      }

      if (actx && osc) {
        const density = total / (GRID * GRID)
        osc.frequency.setTargetAtTime(30 + density * 90, actx.currentTime, 0.6)
      }
    }

    // ── Pointer: tap = seed disk, drag = paint trail ─────────────────────────
    let pointerDown = false
    let lastPX = 0, lastPY = 0

    function toGrid(ex: number, ey: number): [number, number] {
      return [Math.floor((ex / CW) * GRID), Math.floor((ey / CH) * GRID)]
    }

    canvas.addEventListener('pointerdown', e => {
      initAudio()
      if (actx?.state === 'suspended') actx.resume()
      pointerDown = true
      lastPX = e.clientX; lastPY = e.clientY
      const [gx, gy] = toGrid(e.clientX, e.clientY)
      seedDisk(gx, gy, 6 + Math.floor(Math.random() * 4))
    })

    const onMove = (e: PointerEvent) => {
      if (!pointerDown) return
      const dx = e.clientX - lastPX, dy = e.clientY - lastPY
      if (dx * dx + dy * dy > 64) {
        const [gx, gy] = toGrid(e.clientX, e.clientY)
        seedDisk(gx, gy, 3)
        lastPX = e.clientX; lastPY = e.clientY
      }
    }
    const onUp = () => { pointerDown = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    const onResize = () => {
      CW = window.innerWidth; CH = window.innerHeight
      canvas.width = CW * dpr; canvas.height = CH * dpr
      canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', onResize)
      if (osc) osc.stop()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100dvh',
        cursor: 'crosshair', touchAction: 'none',
      }}
    />
  )
}
