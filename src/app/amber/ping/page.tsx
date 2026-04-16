'use client'

import { useEffect, useRef } from 'react'

// v3 SIGNAL palette — PETROL: uneasy, watching
const PETROL = '#0A1C1A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

// The viewer will see: a thin cream sweep arm rotating on a dark PETROL field,
//   lime echoes blooming at detected positions as the arm passes over them.
// The viewer will hear: a faint descending sine ping (720→360 Hz, gain 0.05)
//   each time the sweep discovers an echo.

interface Echo {
  nx: number   // normalized screen x [0,1]
  ny: number   // normalized screen y [0,1]
  glow: number // 0..1 — bloom intensity, 1 when freshly swept
}

export default function Ping() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)

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

    // Sweep angle — starts at top (–π/2), rotates clockwise
    let angle = -Math.PI / 2
    const SWEEP_RATE = (Math.PI * 2) / 8  // 1 revolution per 8 seconds

    // 5 pre-placed echoes — quiet at rest, bloom when swept
    const echoes: Echo[] = [
      { nx: 0.61, ny: 0.32, glow: 0 },
      { nx: 0.29, ny: 0.63, glow: 0 },
      { nx: 0.72, ny: 0.71, glow: 0 },
      { nx: 0.44, ny: 0.22, glow: 0 },
      { nx: 0.18, ny: 0.40, glow: 0 },
    ]

    let lastTs = 0
    let raf = 0

    function playPing() {
      const actx = audioRef.current
      if (!actx || actx.state !== 'running') return
      const t = actx.currentTime
      const osc = actx.createOscillator()
      const gain = actx.createGain()
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(720, t)
      osc.frequency.exponentialRampToValueAtTime(360, t + 0.12)
      gain.gain.setValueAtTime(0.05, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.55)
    }

    const normalizeA = (a: number) =>
      ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

    function draw(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts

      const prevAngle = angle
      angle += SWEEP_RATE * dt

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // PETROL field
      ctx.fillStyle = PETROL
      ctx.fillRect(0, 0, W, H)

      const cx = W * 0.5
      const cy = H * 0.5
      const maxR = Math.min(W, H) * 0.43

      // Range rings — 3 concentric, very faint
      ctx.lineWidth = 1
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy, maxR * i / 3, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(232,232,232,0.065)'
        ctx.stroke()
      }

      // Hairline crosshair
      ctx.strokeStyle = 'rgba(232,232,232,0.045)'
      ctx.beginPath()
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke()

      // Sweep trail — 20 thin arc slices fading behind the arm
      const TRAIL = Math.PI * 0.30   // ~54° trailing glow
      const SLICES = 20
      for (let i = 0; i < SLICES; i++) {
        const t = i / SLICES
        const a0 = angle - TRAIL + TRAIL * t
        const a1 = angle - TRAIL + TRAIL * (t + 1 / SLICES)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, maxR * 0.97, a0, a1)
        ctx.closePath()
        ctx.fillStyle = `rgba(198,255,60,${(0.06 * t * t).toFixed(4)})`
        ctx.fill()
      }

      // Sweep arm
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(
        cx + Math.cos(angle) * maxR,
        cy + Math.sin(angle) * maxR
      )
      ctx.strokeStyle = 'rgba(198,255,60,0.60)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Echo detection + render
      const prevA = normalizeA(prevAngle)
      const currA = normalizeA(angle)

      for (const echo of echoes) {
        const ex = echo.nx * W
        const ey = echo.ny * H
        const dx = ex - cx
        const dy = ey - cy
        const d = Math.hypot(dx, dy)

        // Detect sweep crossing
        if (d > 0 && d < maxR) {
          const ea = normalizeA(Math.atan2(dy, dx))
          const crossed =
            currA >= prevA
              ? ea >= prevA && ea < currA
              : ea >= prevA || ea < currA
          if (crossed) {
            echo.glow = 1
            playPing()
          }
        }

        // Render echo
        if (echo.glow > 0.015) {
          // Lime bloom — glow halo
          const gr = 16 + echo.glow * 14
          const grd = ctx.createRadialGradient(ex, ey, 0, ex, ey, gr)
          grd.addColorStop(0, `rgba(198,255,60,${(echo.glow * 0.42).toFixed(3)})`)
          grd.addColorStop(1, 'rgba(198,255,60,0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(ex, ey, gr, 0, Math.PI * 2)
          ctx.fill()

          // Lime dot
          ctx.globalAlpha = Math.min(1, echo.glow * 1.4)
          ctx.fillStyle = LIME
          ctx.beginPath()
          ctx.arc(ex, ey, 3.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1

          echo.glow = Math.max(0, echo.glow - 0.0035)  // fades over ~4s
        } else {
          // At rest — tiny faint cream dot
          echo.glow = 0
          ctx.globalAlpha = 0.22
          ctx.fillStyle = CREAM
          ctx.beginPath()
          ctx.arc(ex, ey, 1.8, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      // Origin dot
      ctx.globalAlpha = 0.55
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      // Museum label — lower left
      const lx = Math.max(20, W * 0.055)
      const ly = H - Math.max(14, H * 0.025)
      const tsz = Math.min(52, W * 0.08)
      const ssz = Math.min(11, W * 0.022)

      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      ctx.font = `300 italic ${tsz}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232,232,232,0.9)'
      ctx.fillText('ping', lx, ly - tsz * 0.36)

      ctx.font = `700 ${ssz}px "Courier Prime", "Courier New", monospace`
      ctx.fillStyle = 'rgba(232,232,232,0.44)'
      ctx.fillText('something is out there', lx, ly + 6)

      ctx.textAlign = 'right'
      ctx.font = '700 10px "Courier Prime", "Courier New", monospace'
      ctx.fillStyle = 'rgba(232,232,232,0.28)'
      ctx.fillText('signal · spec 004 · 04.16.26', W - lx, H - 14)

      raf = requestAnimationFrame(draw)
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()

      // iOS: AudioContext MUST be created inside a user gesture
      if (!audioRef.current) {
        audioRef.current = new AudioContext()
      }
      if (audioRef.current.state === 'suspended') {
        audioRef.current.resume()
      }

      // Place new echo at tap position (max 12 total)
      if (echoes.length < 12) {
        const nx = e.clientX / W
        const ny = e.clientY / H
        const dx = e.clientX - W * 0.5
        const dy = e.clientY - H * 0.5
        const d = Math.hypot(dx, dy)
        const maxR = Math.min(W, H) * 0.43
        if (d > 10 && d < maxR) {
          echoes.push({ nx, ny, glow: 0 })
        }
      }
    }

    const onResize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)

    lastTs = performance.now()
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
      audioRef.current?.close()
    }
  }, [])

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100dvh',
          cursor: 'crosshair',
          touchAction: 'none',
          background: PETROL,
        }}
      />
    </>
  )
}
