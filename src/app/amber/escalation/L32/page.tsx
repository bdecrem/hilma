'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Three citrus magnets: blood orange, mango, lime
const MAG_RGB: [number, number, number][] = [
  [255, 78, 80],
  [249, 212, 35],
  [180, 227, 61],
]
const FREQS = [220, 277.2, 330] // A major triad (A3, C#4, E4)
const FRAC_N = 240              // fractal grid resolution
const MAX_STEPS = 500           // pendulum sim steps per pixel
const FRAC_RANGE = 2.0          // sim space covers [-2, 2] × [-2, 2]
const ROWS_BATCH = 2            // rows computed per animation frame

function makeMagnets(r = 0.85, angleOffset = Math.PI / 2): [number, number][] {
  return [0, 1, 2].map(i => {
    const a = angleOffset + (i * 2 * Math.PI) / 3
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

// Simulate pendulum from (sx, sy), return [magnetIndex, convergenceStep]
function simPixel(sx: number, sy: number, mag: [number, number][]): [number, number] {
  let x = sx, y = sy, vx = 0, vy = 0
  const k = 0.5, b = 0.18, C = 1.2, h2 = 0.04, dt = 0.03
  let finalStep = MAX_STEPS

  for (let s = 0; s < MAX_STEPS; s++) {
    let fx = -k * x, fy = -k * y
    for (const [mx, my] of mag) {
      const dx = mx - x, dy = my - y
      const d3 = Math.pow(dx * dx + dy * dy + h2, 1.5)
      fx += C / d3 * dx
      fy += C / d3 * dy
    }
    fx -= b * vx
    fy -= b * vy
    vx += fx * dt
    vy += fy * dt
    x += vx * dt
    y += vy * dt
    if (vx * vx + vy * vy < 0.00005) { finalStep = s; break }
  }

  let mi = 0, md = Infinity
  for (let i = 0; i < mag.length; i++) {
    const d = Math.hypot(mag[i][0] - x, mag[i][1] - y)
    if (d < md) { md = d; mi = i }
  }
  return [mi, finalStep]
}

export default function L32() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L32-magnetic')

    // Offscreen fractal buffer
    const offCanvas = document.createElement('canvas')
    offCanvas.width = FRAC_N
    offCanvas.height = FRAC_N
    const offCtx = offCanvas.getContext('2d')!
    const fracData = new Uint8ClampedArray(FRAC_N * FRAC_N * 4)

    // Fractal state
    let magnets = makeMagnets()
    let fracRow = 0
    let fracDone = false

    // Live pendulum
    let px = 0.3, py = 0.2, pvx = 0, pvy = 0
    const trail: [number, number][] = []

    // Web Audio
    let audioCtx: AudioContext | null = null
    const gains: GainNode[] = []

    const initAudio = () => {
      if (audioCtx) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      audioCtx = new AC()
      const master = audioCtx.createGain()
      master.gain.value = 0.07
      master.connect(audioCtx.destination)
      for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator()
        osc.frequency.value = FREQS[i]
        osc.type = 'sine'
        const g = audioCtx.createGain()
        g.gain.value = 0
        osc.connect(g)
        g.connect(master)
        osc.start()
        gains.push(g)
      }
    }

    const resetFractal = (newMagnets?: [number, number][]) => {
      if (newMagnets) magnets = newMagnets
      fracRow = 0
      fracDone = false
      fracData.fill(0)
      trail.length = 0
      px = (Math.random() * 2 - 1) * 1.5
      py = (Math.random() * 2 - 1) * 1.5
      pvx = 0
      pvy = 0
    }

    // Sim coord → canvas coord
    const sToC = (s: number, span: number, offset: number) =>
      offset + (s + FRAC_RANGE) / (FRAC_RANGE * 2) * span

    let raf: number

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, bg1)
      bgGrad.addColorStop(1, bg2)
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // Fractal display area (responsive, square)
      const fps = Math.min(W * 0.88, H * 0.76)
      const fx0 = (W - fps) / 2
      const fy0 = (H - fps) / 2

      // Compute fractal rows
      if (!fracDone) {
        for (let dr = 0; dr < ROWS_BATCH && fracRow < FRAC_N; dr++, fracRow++) {
          for (let c = 0; c < FRAC_N; c++) {
            const sx = (c / FRAC_N) * (FRAC_RANGE * 2) - FRAC_RANGE
            const sy = (fracRow / FRAC_N) * (FRAC_RANGE * 2) - FRAC_RANGE
            const [mi, steps] = simPixel(sx, sy, magnets)
            const bright = 1 - (steps / MAX_STEPS) * 0.72
            const [r, g, b] = MAG_RGB[mi]
            const idx = (fracRow * FRAC_N + c) * 4
            fracData[idx] = r * bright
            fracData[idx + 1] = g * bright
            fracData[idx + 2] = b * bright
            fracData[idx + 3] = 255
          }
        }
        offCtx.putImageData(new ImageData(fracData, FRAC_N, FRAC_N), 0, 0)
        if (fracRow >= FRAC_N) fracDone = true
      }

      // Draw fractal (clipped to rounded rect)
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(fx0, fy0, fps, fps, 10)
      ctx.clip()
      ctx.drawImage(offCanvas, fx0, fy0, fps, fps)
      ctx.restore()

      // Subtle frame
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(fx0, fy0, fps, fps, 10)
      ctx.stroke()

      // Progress bar while computing
      if (!fracDone) {
        const p = fracRow / FRAC_N
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillRect(fx0, fy0 + fps + 10, fps * p, 2)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(fx0 + fps * p, fy0 + fps + 10, fps * (1 - p), 2)
      }

      // Live pendulum (after fractal is ready)
      if (fracDone) {
        // Physics step
        let ffx = -0.5 * px, ffy = -0.5 * py
        for (const [mx, my] of magnets) {
          const dx = mx - px, dy = my - py
          const d3 = Math.pow(dx * dx + dy * dy + 0.04, 1.5)
          ffx += 1.2 / d3 * dx
          ffy += 1.2 / d3 * dy
        }
        ffx -= 0.18 * pvx
        ffy -= 0.18 * pvy
        pvx += ffx * 0.03
        pvy += ffy * 0.03
        px += pvx * 0.03
        py += pvy * 0.03

        const pcx = sToC(px, fps, fx0)
        const pcy = sToC(py, fps, fy0)
        trail.push([pcx, pcy])
        if (trail.length > 450) trail.shift()

        // Draw trail
        if (trail.length > 2) {
          for (let i = 2; i < trail.length; i++) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(255,255,255,${(i / trail.length) * 0.6})`
            ctx.lineWidth = 1.2
            ctx.moveTo(trail[i - 1][0], trail[i - 1][1])
            ctx.lineTo(trail[i][0], trail[i][1])
            ctx.stroke()
          }
        }

        // Magnets
        for (let i = 0; i < magnets.length; i++) {
          const mcx = sToC(magnets[i][0], fps, fx0)
          const mcy = sToC(magnets[i][1], fps, fy0)
          const dist = Math.hypot(magnets[i][0] - px, magnets[i][1] - py)
          const pull = Math.max(0, 1 - dist / 0.65)

          // Audio modulation
          if (audioCtx && gains[i]) {
            gains[i].gain.setTargetAtTime(pull * 0.85, audioCtx.currentTime, 0.08)
          }

          const [r, g, b] = MAG_RGB[i]

          // Glow ring when active
          if (pull > 0.05) {
            const grd = ctx.createRadialGradient(mcx, mcy, 2, mcx, mcy, 22 + pull * 18)
            grd.addColorStop(0, `rgba(${r},${g},${b},${pull * 0.45})`)
            grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
            ctx.fillStyle = grd
            ctx.beginPath()
            ctx.arc(mcx, mcy, 40, 0, Math.PI * 2)
            ctx.fill()
          }

          // Magnet dot
          ctx.beginPath()
          ctx.arc(mcx, mcy, 7 + pull * 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},0.92)`
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,248,231,0.8)'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        // Pendulum bob
        const grd2 = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, 14)
        grd2.addColorStop(0, 'rgba(255,255,255,0.35)')
        grd2.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = grd2
        ctx.beginPath()
        ctx.arc(pcx, pcy, 14, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(pcx, pcy, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = '#FFFFFF'
        ctx.fill()

        // Restart when stopped
        if (pvx * pvx + pvy * pvy < 0.000006 && trail.length > 40) {
          px = (Math.random() * 2 - 1) * 1.6
          py = (Math.random() * 2 - 1) * 1.6
          pvx = 0
          pvy = 0
          trail.length = 0
        }
      }

      // Hint text
      ctx.globalAlpha = 0.2
      ctx.font = '11px monospace'
      ctx.fillStyle = '#FFF8E7'
      ctx.fillText(fracDone ? 'tap to change the magnets' : 'mapping the chaos…', 16, H - 14)
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    const onTap = () => {
      initAudio()
      const newR = 0.75 + Math.random() * 0.2
      const shift = Math.random() * Math.PI * 2
      const newMags = makeMagnets(newR, shift)
      resetFractal(newMags)
    }

    canvas.addEventListener('click', onTap)
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      onTap()
    }, { passive: false })

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', onTap)
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
        cursor: 'pointer',
        touchAction: 'none',
      }}
    />
  )
}
