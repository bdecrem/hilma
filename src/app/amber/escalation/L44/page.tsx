'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// ─── Ising model ──────────────────────────────────────────────────────────────
// 2D ferromagnet on a square lattice. Each spin is +1 or −1.
// Metropolis-Hastings: at low T, spins align into domains (ordered phase).
// At high T, thermal noise destroys order (disordered phase).
// Critical temperature Tc = 2/ln(1+√2) ≈ 2.2692 — the phase transition.
// Near Tc: fractal domain boundaries, diverging correlation length.

const N = 256               // lattice: N×N spins
const SWEEPS_PER_FRAME = 5  // Metropolis sweeps per animation frame

// Spin colors: up (+1) → blood orange, down (−1) → lime zest
const R_UP = 255, G_UP = 78, B_UP = 80    // #FF4E50
const R_DN = 180, G_DN = 227, B_DN = 61   // #B4E33D

const TC = 2.2692  // exact critical temperature for 2D square Ising model

export default function L44() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L44')

    // ─── Spin lattice ─────────────────────────────────────────────────────
    // Uint8Array: 0 = spin down (−1), 1 = spin up (+1)
    const spins = new Uint8Array(N * N)

    function initSpins() {
      for (let i = 0; i < N * N; i++) {
        spins[i] = Math.random() < 0.5 ? 1 : 0
      }
    }
    initSpins()

    // ─── Temperature state ────────────────────────────────────────────────
    let T = 3.8       // start hot (disordered)
    let autoDir = -1  // −1 = cooling toward Tc, +1 = heating
    let dragging = false
    let lastPY = 0
    let didDrag = false

    // ─── Metropolis-Hastings sweep ────────────────────────────────────────
    // Pick N² random sites. For each, compute ΔE = 2·s·Σneighbors.
    // Accept flip if ΔE ≤ 0 or with probability exp(−ΔE / T).
    function sweep() {
      const beta = 1.0 / T
      for (let k = 0; k < N * N; k++) {
        const i = (Math.random() * N * N) | 0
        const row = (i / N) | 0
        const col = i % N
        const sVal = spins[i] === 1 ? 1 : -1

        // Periodic boundary conditions — branchless index arithmetic
        const rU = row === 0 ? N - 1 : row - 1
        const rD = row === N - 1 ? 0 : row + 1
        const cL = col === 0 ? N - 1 : col - 1
        const cR = col === N - 1 ? 0 : col + 1

        const ns = (spins[rU * N + col] === 1 ? 1 : -1)
                 + (spins[rD * N + col] === 1 ? 1 : -1)
                 + (spins[row * N + cL] === 1 ? 1 : -1)
                 + (spins[row * N + cR] === 1 ? 1 : -1)

        const dE = 2 * sVal * ns
        if (dE <= 0 || Math.random() < Math.exp(-beta * dE)) {
          spins[i] ^= 1
        }
      }
    }

    function magnetization(): number {
      let sum = 0
      for (let i = 0; i < N * N; i++) sum += spins[i]
      return (2 * sum / (N * N)) - 1  // maps [0, N²] → [−1, +1]
    }

    // ─── Web Audio ────────────────────────────────────────────────────────
    // Tone frequency tracks |magnetization|: ordered → lower warm hum,
    // disordered → higher hiss-like tone. Critical point: flicker.
    let audioCtx: AudioContext | null = null
    let osc: OscillatorNode | null = null
    let gainNode: GainNode | null = null

    function startAudio() {
      if (audioCtx) return
      audioCtx = new AudioContext()
      gainNode = audioCtx.createGain()
      gainNode.gain.value = 0.04
      osc = audioCtx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = 80
      osc.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      osc.start()
    }

    // ─── ImageData renderer ───────────────────────────────────────────────
    const imgData = new ImageData(N, N)
    const buf = imgData.data
    const offCanvas = document.createElement('canvas')
    offCanvas.width = N
    offCanvas.height = N
    const offCtx = offCanvas.getContext('2d')!

    function renderSpins() {
      for (let i = 0; i < N * N; i++) {
        const b = i * 4
        if (spins[i] === 1) {
          buf[b] = R_UP; buf[b + 1] = G_UP; buf[b + 2] = B_UP
        } else {
          buf[b] = R_DN; buf[b + 1] = G_DN; buf[b + 2] = B_DN
        }
        buf[b + 3] = 255
      }
      offCtx.putImageData(imgData, 0, 0)
    }

    // ─── Animation loop ───────────────────────────────────────────────────
    let raf: number

    function frame() {
      // Auto-cycle temperature: cool to 1.2, heat to 4.0, repeat
      if (!dragging) {
        T += autoDir * 0.007
        if (T <= 1.2) { autoDir = 1; T = 1.2 }
        if (T >= 4.0) { autoDir = -1; T = 4.0 }
      }

      // Physics: multiple Metropolis sweeps
      for (let s = 0; s < SWEEPS_PER_FRAME; s++) sweep()

      // Audio: pitch tracks |M|
      if (audioCtx && osc) {
        const M = Math.abs(magnetization())
        osc.frequency.setTargetAtTime(50 + M * 130, audioCtx.currentTime, 0.4)
      }

      // ── Draw ──────────────────────────────────────────────────────────
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, bg1)
      bgGrad.addColorStop(1, bg2)
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // Grid: square, centered, fills ~82% of the shorter dimension
      const gridSize = Math.min(W, H) * 0.82
      const gx = (W - gridSize) / 2
      const gy = (H - gridSize) / 2 - H * 0.04

      renderSpins()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(offCanvas, gx, gy, gridSize, gridSize)

      // ── HUD ───────────────────────────────────────────────────────────
      const bottomY = gy + gridSize
      const tSize = Math.max(14, Math.round(W * 0.046))
      const smSize = Math.max(10, Math.round(W * 0.022))

      // Temperature readout
      ctx.font = `bold ${tSize}px monospace`
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(42, 34, 24, 0.75)'
      ctx.fillText(`T = ${T.toFixed(2)}`, gx, bottomY + tSize + 6)

      // Phase label
      ctx.font = `${smSize}px monospace`
      ctx.fillStyle = 'rgba(42, 34, 24, 0.45)'
      let phase: string
      if (T < TC - 0.15) {
        phase = `ordered  ·  T < Tc`
      } else if (T > TC + 0.15) {
        phase = `disordered  ·  T > Tc`
      } else {
        phase = `critical point  ←  Tc ≈ ${TC.toFixed(4)}`
      }
      ctx.fillText(phase, gx, bottomY + tSize + smSize + 10)

      // Magnetization bar
      const M = Math.abs(magnetization())
      const barW = gridSize * 0.25
      const barH = smSize * 0.6
      const barX = gx + gridSize - barW
      const barY = bottomY + tSize + 2
      ctx.fillStyle = 'rgba(42, 34, 24, 0.12)'
      ctx.fillRect(barX, barY, barW, barH)
      ctx.fillStyle = '#FF4E50'
      ctx.fillRect(barX, barY, barW * M, barH)
      ctx.fillStyle = 'rgba(42, 34, 24, 0.35)'
      ctx.font = `${smSize * 0.85}px monospace`
      ctx.textAlign = 'right'
      ctx.fillText(`|M| = ${M.toFixed(3)}`, barX + barW, barY + barH + smSize)

      // Hint
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(42, 34, 24, 0.28)'
      ctx.font = `${smSize}px monospace`
      ctx.fillText('drag up/down to cool or heat  ·  tap to reset', W / 2, gy - smSize * 0.6)

      raf = requestAnimationFrame(frame)
    }

    // ─── Pointer events ───────────────────────────────────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      startAudio()
      dragging = true
      didDrag = false
      lastPY = e.clientY
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const dy = e.clientY - lastPY
      lastPY = e.clientY
      if (Math.abs(dy) > 2) didDrag = true
      // Drag up = cool (negative dy), drag down = heat (positive dy)
      T = Math.max(0.5, Math.min(6.5, T - dy * 0.025))
    })

    canvas.addEventListener('pointerup', () => { dragging = false })
    canvas.addEventListener('pointercancel', () => { dragging = false })

    canvas.addEventListener('click', () => {
      if (didDrag) return
      initSpins()
    })

    const onResize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      osc?.stop()
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
