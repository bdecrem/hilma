// The viewer will see: hundreds of thin cream hairlines swaying slowly across an INK field like grass in wind — tap to scatter them, rare lime flashes on individual lines like a signal caught.
// The viewer will hear: a low ambient drone (Jambot JT10, looped) that sits behind the piece like weather. Not music. Atmosphere.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const INK = '#0C1424'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const LINE_COUNT = 280
const LINE_LEN_MIN = 30
const LINE_LEN_MAX = 80

interface Blade {
  x: number
  y: number
  len: number
  phase: number
  speed: number
  limeTimer: number
  disturbX: number
  disturbY: number
}

export default function Field() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef(0)
  const bladesRef = useRef<Blade[]>([])
  const timeRef = useRef(0)
  const windAngleRef = useRef(0)
  const unlockedRef = useRef(false)

  const initBlades = useCallback((vw: number, vh: number) => {
    const blades: Blade[] = []
    for (let i = 0; i < LINE_COUNT; i++) {
      blades.push({
        x: Math.random() * vw,
        y: vh * 0.18 + Math.random() * vh * 0.72,
        len: LINE_LEN_MIN + Math.random() * (LINE_LEN_MAX - LINE_LEN_MIN),
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        limeTimer: 0,
        disturbX: 0,
        disturbY: 0,
      })
    }
    bladesRef.current = blades
  }, [])

  const handlePointer = useCallback(async (e: PointerEvent) => {
    e.preventDefault()

    // Start audio on first touch
    const audio = audioRef.current
    if (audio && audio.paused) {
      try { await audio.play() } catch {}
      unlockedRef.current = true
    }

    // Scatter blades near tap
    const px = e.clientX
    const py = e.clientY
    const blades = bladesRef.current
    for (const b of blades) {
      const dx = b.x - px
      const dy = b.y - py
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 180) {
        const force = (1 - dist / 180) * 60
        const angle = Math.atan2(dy, dx)
        b.disturbX += Math.cos(angle) * force
        b.disturbY += Math.sin(angle) * force
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (bladesRef.current.length === 0) {
        initBlades(window.innerWidth, window.innerHeight)
      }
    }
    resize()
    window.addEventListener('resize', resize)

    let lastTime = performance.now()

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Semi-transparent clear for slight trail
      ctx.fillStyle = INK
      ctx.globalAlpha = 0.25
      ctx.fillRect(0, 0, vw, vh)
      ctx.globalAlpha = 1

      const now = performance.now()
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now
      timeRef.current += dt

      const t = timeRef.current
      // Slow wind direction drift
      windAngleRef.current = Math.sin(t * 0.08) * 0.6 + Math.cos(t * 0.035) * 0.3

      const windAngle = windAngleRef.current
      const windX = Math.cos(windAngle)
      const windY = Math.sin(windAngle) * 0.3

      const blades = bladesRef.current

      // Rare lime signal — ~1 blade every 5 seconds
      if (Math.random() < dt * 0.2) {
        const idx = Math.floor(Math.random() * blades.length)
        blades[idx].limeTimer = 1.2
      }

      for (const b of blades) {
        // Wind sway
        const noise = Math.sin(b.phase + t * b.speed) * 0.35
          + Math.sin(b.phase * 1.7 + t * b.speed * 0.6) * 0.15
        const swayAngle = windAngle + noise

        // Disturbance decay
        b.disturbX *= 0.92
        b.disturbY *= 0.92
        b.limeTimer = Math.max(0, b.limeTimer - dt)

        // Draw blade
        const baseX = b.x + b.disturbX
        const baseY = b.y + b.disturbY
        const tipX = baseX + Math.sin(swayAngle) * b.len * 0.5
        const tipY = baseY - b.len + Math.cos(swayAngle) * b.len * 0.15

        const isLime = b.limeTimer > 0
        const alpha = isLime
          ? 0.5 + b.limeTimer * 0.4
          : 0.12 + Math.abs(noise) * 0.18

        if (isLime) {
          ctx.save()
          ctx.shadowColor = LIME
          ctx.shadowBlur = 8
          ctx.strokeStyle = LIME
          ctx.globalAlpha = alpha
        } else {
          ctx.strokeStyle = CREAM
          ctx.globalAlpha = alpha
        }

        ctx.lineWidth = isLime ? 1.8 : 1
        ctx.beginPath()
        ctx.moveTo(baseX, baseY)
        ctx.quadraticCurveTo(
          baseX + Math.sin(swayAngle) * b.len * 0.25,
          baseY - b.len * 0.5,
          tipX,
          tipY
        )
        ctx.stroke()

        if (isLime) ctx.restore()
      }

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.7
      ctx.fillText('field', 28, vh - 56)
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.35
      ctx.fillText('something moves through here', 28, vh - 38)
      ctx.globalAlpha = 1

      // Touch hint
      if (!unlockedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TAP TO ENTER', vw / 2, vh * 0.1)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()

    canvas.addEventListener('pointerdown', handlePointer)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointer)
    }
  }, [initBlades, handlePointer])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <audio
        ref={audioRef}
        src="/amber/tracks/drone-01.m4a"
        preload="auto"
        playsInline
        loop
      />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          touchAction: 'none',
          background: INK,
        }}
      />
    </>
  )
}
