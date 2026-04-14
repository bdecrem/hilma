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

const N = 44
const C = 0.38
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

    let h = Array.from({ length: N }, () => new Float32Array(N))
    let hp = Array.from({ length: N }, () => new Float32Array(N))

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

    // Seed with visible initial waves
    drop(Math.floor(N * 0.3), Math.floor(N * 0.3), 8)
    drop(Math.floor(N * 0.7), Math.floor(N * 0.5), 7)
    drop(Math.floor(N * 0.5), Math.floor(N * 0.7), 6)

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

    // Compute view scale so grid fills ~75% of shortest screen dimension
    const viewScale = Math.min(W, H) * 0.0038

    function proj(x: number, y: number, z: number): [number, number] {
      const ct = Math.cos(thetaRef.current), st = Math.sin(thetaRef.current)
      const cp = Math.cos(phiRef.current), sp = Math.sin(phiRef.current)
      const x1 = x * ct - z * st
      const z1 = x * st + z * ct
      const y2 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      const fov = 300
      const d = fov + z2 + 160
      const s = (fov / Math.max(d, 1)) * viewScale
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

      if (frameCount % 90 === 0) {
        drop(5 + Math.floor(Math.random() * (N - 10)), 5 + Math.floor(Math.random() * (N - 10)), 3 + Math.random() * 4)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1); grad.addColorStop(1, bg2)
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

      const gs = 4.5
      const off = (N - 1) * gs / 2
      const pts: [number, number][][] = []
      for (let i = 0; i < N; i++) {
        pts[i] = []
        for (let j = 0; j < N; j++) {
          pts[i][j] = proj(i * gs - off, h[i][j] * 4, j * gs - off)
        }
      }

      // Draw grid — per-segment coloring for visible wave patterns
      ctx.lineWidth = 1.2

      // Horizontal strands
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N - 1; j++) {
          const avgH = (h[i][j] + h[i][j + 1]) / 2
          ctx.strokeStyle = hColor(avgH)
          ctx.globalAlpha = 0.7
          ctx.beginPath()
          ctx.moveTo(pts[i][j][0], pts[i][j][1])
          ctx.lineTo(pts[i][j + 1][0], pts[i][j + 1][1])
          ctx.stroke()
        }
      }

      // Vertical strands
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N - 1; i++) {
          const avgH = (h[i][j] + h[i + 1][j]) / 2
          ctx.strokeStyle = hColor(avgH)
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          ctx.moveTo(pts[i][j][0], pts[i][j][1])
          ctx.lineTo(pts[i + 1][j][0], pts[i + 1][j][1])
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // Labels
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.textAlign = 'left'
      ctx.fillText('tap to drop a stone', 14, H - 28)
      ctx.fillText('drag to orbit', 14, H - 12)

      if (actx && osc) {
        let e = 0
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) e += h[i][j] * h[i][j]
        e = Math.sqrt(e / (N * N))
        osc.frequency.setTargetAtTime(100 + e * 40, actx.currentTime, 0.3)
      }

      raf = requestAnimationFrame(draw)
    }

    // Pointer interaction — threshold 15px so taps work on touch screens
    let pStart: { x: number; y: number; theta: number; phi: number } | null = null
    let didDrag = false
    const DRAG_THRESHOLD = 15

    canvas.addEventListener('pointerdown', e => {
      pStart = { x: e.clientX, y: e.clientY, theta: thetaRef.current, phi: phiRef.current }
      didDrag = false
    })
    window.addEventListener('pointermove', e => {
      if (!pStart) return
      const dx = e.clientX - pStart.x, dy = e.clientY - pStart.y
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) didDrag = true
      if (didDrag) {
        thetaRef.current = pStart.theta + dx * 0.005
        phiRef.current = Math.max(0.1, Math.min(1.4, pStart.phi + dy * 0.005))
      }
    })
    window.addEventListener('pointerup', e => {
      if (pStart && !didDrag) {
        initAudio()
        if (actx?.state === 'suspended') actx.resume()
        const gs = 4.5, off = (N - 1) * gs / 2
        let best = Infinity, bi = 0, bj = 0
        for (let i = 0; i < N; i += 2) {
          for (let j = 0; j < N; j += 2) {
            const [sx, sy] = proj(i * gs - off, h[i][j] * 4, j * gs - off)
            const d = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2
            if (d < best) { best = d; bi = i; bj = j }
          }
        }
        drop(bi, bj, 6 + Math.random() * 5)
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
