'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS_RGB: [number, number, number][] = [
  [45, 90, 39],    // deep leaf green (trough)
  [180, 227, 61],  // lime
  [255, 248, 231], // cream (rest)
  [249, 212, 35],  // mango
  [252, 145, 58],  // tangerine
  [255, 78, 80],   // blood orange (peak)
]

const N = 44 // grid resolution
const C = 0.38 // wave speed
const DAMP = 0.993

export default function L41() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const thetaRef = useRef(0.7)
  const phiRef = useRef(0.5)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L41')

    // Wave: two height buffers
    let h = Array.from({ length: N }, () => new Float32Array(N))
    let hp = Array.from({ length: N }, () => new Float32Array(N))

    // Audio
    let actx: AudioContext | null = null
    let osc: OscillatorNode | null = null

    function initAudio() {
      if (actx) return
      actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      osc = actx.createOscillator()
      osc.type = 'sine'; osc.frequency.value = 110
      const g = actx.createGain(); g.gain.value = 0.03
      osc.connect(g); g.connect(actx.destination); osc.start()
    }

    function drop(gi: number, gj: number, amp: number = 7) {
      const r = 3
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          const ni = gi + di, nj = gj + dj
          if (ni > 0 && ni < N - 1 && nj > 0 && nj < N - 1) {
            const d = Math.sqrt(di * di + dj * dj)
            if (d <= r) h[ni][nj] += amp * Math.cos((d / r) * Math.PI * 0.5)
          }
        }
      }
    }

    // Seed
    drop(Math.floor(N * 0.3), Math.floor(N * 0.3), 6)
    drop(Math.floor(N * 0.7), Math.floor(N * 0.5), 5)
    drop(Math.floor(N * 0.5), Math.floor(N * 0.7), 4)

    function stepWave() {
      const hn = Array.from({ length: N }, () => new Float32Array(N))
      for (let i = 1; i < N - 1; i++) {
        for (let j = 1; j < N - 1; j++) {
          const lap = h[i + 1][j] + h[i - 1][j] + h[i][j + 1] + h[i][j - 1] - 4 * h[i][j]
          hn[i][j] = (2 * h[i][j] - hp[i][j] + C * C * lap) * DAMP
        }
      }
      hp = h; h = hn
    }

    // Project 3D → 2D screen
    function proj(x: number, y: number, z: number): [number, number] {
      const ct = Math.cos(thetaRef.current), st = Math.sin(thetaRef.current)
      const cp = Math.cos(phiRef.current), sp = Math.sin(phiRef.current)
      const x1 = x * ct - z * st
      const z1 = x * st + z * ct
      const y2 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      const fov = 350
      const d = fov + z2 + 180
      const s = fov / Math.max(d, 1)
      return [W / 2 + x1 * s, H / 2 - y2 * s]
    }

    function hColor(val: number): string {
      const t = Math.max(0, Math.min(1, (val + 6) / 12))
      const idx = t * (CITRUS_RGB.length - 1)
      const i = Math.floor(idx), f = idx - i
      const a = CITRUS_RGB[i], b = CITRUS_RGB[Math.min(i + 1, CITRUS_RGB.length - 1)]
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`
    }

    let raf: number
    let frameCount = 0

    function draw() {
      stepWave(); stepWave()
      frameCount++

      // Ambient drops every ~120 frames
      if (frameCount % 120 === 0) {
        drop(5 + Math.floor(Math.random() * (N - 10)), 5 + Math.floor(Math.random() * (N - 10)), 2 + Math.random() * 3)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1); grad.addColorStop(1, bg2)
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

      // Project grid
      const gs = 4.5 // grid spacing in world
      const off = (N - 1) * gs / 2
      const pts: [number, number][][] = []
      for (let i = 0; i < N; i++) {
        pts[i] = []
        for (let j = 0; j < N; j++) {
          pts[i][j] = proj(i * gs - off, h[i][j] * 3.5, j * gs - off)
        }
      }

      ctx.lineWidth = 1

      // Draw grid lines — along j (horizontal strands)
      for (let i = 0; i < N; i++) {
        ctx.beginPath()
        ctx.moveTo(pts[i][0][0], pts[i][0][1])
        for (let j = 1; j < N; j++) {
          ctx.lineTo(pts[i][j][0], pts[i][j][1])
        }
        const avgH = h[i][Math.floor(N / 2)]
        ctx.strokeStyle = hColor(avgH)
        ctx.globalAlpha = 0.6
        ctx.stroke()
      }

      // Along i (vertical strands)
      for (let j = 0; j < N; j++) {
        ctx.beginPath()
        ctx.moveTo(pts[0][j][0], pts[0][j][1])
        for (let i = 1; i < N; i++) {
          ctx.lineTo(pts[i][j][0], pts[i][j][1])
        }
        const avgH = h[Math.floor(N / 2)][j]
        ctx.strokeStyle = hColor(avgH)
        ctx.globalAlpha = 0.4
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Labels
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(255,248,231,0.2)'
      ctx.textAlign = 'left'
      ctx.fillText('tap to drop a stone', 14, H - 28)
      ctx.fillText('drag to orbit', 14, H - 12)

      // Audio
      if (actx && osc) {
        let e = 0
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) e += h[i][j] * h[i][j]
        e = Math.sqrt(e / (N * N))
        osc.frequency.setTargetAtTime(100 + e * 40, actx.currentTime, 0.3)
      }

      raf = requestAnimationFrame(draw)
    }

    // Interaction: pointer events for unified mouse/touch
    let pStart: { x: number; y: number; theta: number; phi: number } | null = null
    let didDrag = false

    canvas.addEventListener('pointerdown', e => {
      pStart = { x: e.clientX, y: e.clientY, theta: thetaRef.current, phi: phiRef.current }
      didDrag = false
    })
    window.addEventListener('pointermove', e => {
      if (!pStart) return
      const dx = e.clientX - pStart.x, dy = e.clientY - pStart.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) didDrag = true
      if (didDrag) {
        thetaRef.current = pStart.theta + dx * 0.005
        phiRef.current = Math.max(0.1, Math.min(1.4, pStart.phi + dy * 0.005))
      }
    })
    window.addEventListener('pointerup', e => {
      if (pStart && !didDrag) {
        initAudio()
        if (actx?.state === 'suspended') actx.resume()
        // Find closest grid point to tap
        const gs = 4.5, off = (N - 1) * gs / 2
        let best = Infinity, bi = 0, bj = 0
        for (let i = 0; i < N; i += 2) {
          for (let j = 0; j < N; j += 2) {
            const [sx, sy] = proj(i * gs - off, h[i][j] * 3.5, j * gs - off)
            const d = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2
            if (d < best) { best = d; bi = i; bj = j }
          }
        }
        drop(bi, bj, 5 + Math.random() * 5)
      }
      pStart = null
    })

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (osc) osc.stop()
    }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100dvh',
      cursor: 'pointer', touchAction: 'none',
    }} />
  )
}
