'use client'

import { useEffect, useRef } from 'react'

// AMBER v3 — SIGNAL palette
const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

interface Sig {
  y: number
  age: number        // in frames
  side: -1 | 1        // direction of sweep
}

export default function Antenna() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signalsRef = useRef<Sig[]>([])
  const flashRef = useRef(0)
  const speckFlashRef = useRef<{ idx: number; t: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!

    // Scattered specimens — stable positions across the field
    const specks: [number, number, number][] = [
      [0.78, 0.19, 1.5],
      [0.14, 0.44, 1.0],
      [0.71, 0.74, 1.2],
      [0.48, 0.08, 0.8],
      [0.89, 0.58, 1.8],
      [0.23, 0.81, 1.0],
      [0.58, 0.31, 0.9],
      [0.08, 0.17, 0.7],
      [0.62, 0.52, 0.7],
    ]

    let nextSignalAt = performance.now() + 3500 + Math.random() * 4000
    let nextSpeckFlashAt = performance.now() + 10000 + Math.random() * 12000
    let raf = 0

    function draw() {
      const now = performance.now()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // NIGHT field
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, W, H)

      // Temporal grain — always on, subtle
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.018
      for (let i = 0; i < 140; i++) {
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
      }
      ctx.globalAlpha = 1

      // Antenna geometry — off-center-left
      const antX = Math.floor(W * 0.34)
      const antTopY = Math.floor(H * 0.22)
      const antBotY = Math.floor(H * 0.68)

      // Antenna shaft
      ctx.fillStyle = CREAM
      ctx.fillRect(antX, antTopY, 1, antBotY - antTopY)
      // Base mark
      ctx.fillRect(antX - 7, antBotY, 15, 1)
      // Tick at 1/3 up
      ctx.fillRect(antX - 4, antTopY + Math.floor((antBotY - antTopY) * 0.7), 9, 1)

      // Antenna tip — breathes slowly, flashes when catching
      const breathPhase = (now / 2800) % 1
      const breath = 0.5 + 0.5 * Math.sin(breathPhase * Math.PI * 2)
      const tipSize = 5 + Math.round(breath * 2)
      const tipFlash = Math.max(flashRef.current, 0)
      const tipColor = tipFlash > 0.1 ? LIME : CREAM
      ctx.fillStyle = tipColor
      ctx.fillRect(antX - Math.floor(tipSize / 2), antTopY - Math.floor(tipSize / 2), tipSize, tipSize)
      if (tipFlash > 0.05) {
        // Glow halo
        const halo = Math.floor(tipSize * 4)
        ctx.fillStyle = `rgba(198, 255, 60, ${tipFlash * 0.2})`
        ctx.fillRect(antX - halo, antTopY - halo, halo * 2, halo * 2)
        flashRef.current *= 0.88
      }

      // Specks
      specks.forEach(([fx, fy, sz], i) => {
        const px = fx * W
        const py = fy * H
        const isFlashing = speckFlashRef.current?.idx === i
        if (isFlashing) {
          const t = speckFlashRef.current!.t
          ctx.fillStyle = LIME
          const extra = Math.max(0, 4 - t * 12)
          ctx.fillRect(px - extra, py - extra, sz + extra * 2, sz + extra * 2)
          speckFlashRef.current!.t += 0.02
          if (speckFlashRef.current!.t > 1) speckFlashRef.current = null
        } else {
          ctx.fillStyle = CREAM
          ctx.globalAlpha = 0.45
          ctx.fillRect(px, py, sz, sz)
          ctx.globalAlpha = 1
        }
      })

      // Auto signal event
      if (now > nextSignalAt) {
        signalsRef.current.push({ y: antTopY, age: 0, side: Math.random() < 0.6 ? 1 : -1 })
        flashRef.current = Math.max(flashRef.current, 0.8)
        nextSignalAt = now + 4000 + Math.random() * 5000
      }

      // Auto speck flash
      if (now > nextSpeckFlashAt && speckFlashRef.current === null) {
        speckFlashRef.current = { idx: Math.floor(Math.random() * specks.length), t: 0 }
        nextSpeckFlashAt = now + 14000 + Math.random() * 16000
      }

      // Render signals — thin lime line sweeping from tip, fading with age
      const maxAge = 100
      const reachMax = W * 0.32
      for (const s of signalsRef.current) {
        const progress = Math.min(1, s.age / 25)
        const reach = reachMax * progress
        const opacity = Math.max(0, 1 - s.age / maxAge)
        ctx.strokeStyle = LIME
        ctx.lineWidth = 1
        ctx.globalAlpha = opacity * 0.85
        ctx.beginPath()
        const startX = antX + s.side * 4
        const endX = startX + s.side * reach
        ctx.moveTo(startX, s.y)
        ctx.lineTo(endX, s.y)
        ctx.stroke()
        // Leading dot at the signal front
        if (progress < 1) {
          ctx.fillStyle = LIME
          ctx.globalAlpha = opacity
          ctx.fillRect(endX - 1, s.y - 1, 3, 3)
        }
        ctx.globalAlpha = 1
        s.age++
      }
      signalsRef.current = signalsRef.current.filter(s => s.age < maxAge)

      // Museum label — lower left
      const labelX = Math.max(20, Math.floor(W * 0.055))
      const labelY = Math.floor(H * 0.82)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = CREAM
      const titleSize = Math.min(48, W * 0.07)
      ctx.font = `300 italic ${titleSize}px "Fraunces", Georgia, serif`
      ctx.fillText('antenna', labelX, labelY)
      ctx.fillStyle = 'rgba(232, 232, 232, 0.55)'
      const subSize = Math.min(12, W * 0.026)
      ctx.font = `700 ${subSize}px "Courier Prime", "Courier New", monospace`
      ctx.fillText('listening for a specific signal', labelX, labelY + titleSize * 0.55)

      // Bottom-right spec
      ctx.fillStyle = 'rgba(232, 232, 232, 0.35)'
      ctx.font = `700 10px "Courier Prime", "Courier New", monospace`
      ctx.textAlign = 'right'
      ctx.fillText('signal · spec 001 · 04.15.26', W - labelX, H - 22)

      // Hint — barely there
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(232, 232, 232, 0.2)'
      ctx.font = `700 10px "Courier Prime", "Courier New", monospace`
      ctx.fillText('tap to catch one', W / 2, H - 22)

      raf = requestAnimationFrame(draw)
    }

    function handleTap() {
      signalsRef.current.push({ y: Math.floor(H * 0.22), age: 0, side: Math.random() < 0.5 ? 1 : -1 })
      flashRef.current = 1
    }

    canvas.addEventListener('click', handleTap)
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap() }, { passive: false })

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <>
      {/* Load v3 typography — Courier Prime Bold + Fraunces Italic Light */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100dvh',
        cursor: 'pointer', touchAction: 'none',
      }} />
    </>
  )
}
