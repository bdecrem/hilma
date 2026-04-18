// The viewer will see: a single thin cream line dropping from the top of the dark plate, a small
// cream weight at the bottom, a tiny lime dot at the weight's tip. Drag the weight aside; release;
// it swings and slowly settles. A faint trail records its recent path.
// The viewer will hear: a soft tick on each zero crossing — quieter as the swing damps. Silence at rest.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const G = 1800           // px/s² — visible gravity
const DAMPING = 0.18     // per-second velocity damping
const BOB_R = 12
const TRAIL_MAX = 80
const ZERO_TICK_THRESHOLD = 0.04 // radians of theta — must cross this on its way through center

interface TrailPoint {
  x: number
  y: number
  t: number
}

export default function Plumb() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const audioStartedRef = useRef(false)
  const animRef = useRef(0)

  const anchorRef = useRef({ x: 0, y: 0 })
  const lengthRef = useRef(0)
  const thetaRef = useRef(0)
  const omegaRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const draggingRef = useRef(false)
  const lastSignRef = useRef(0)
  const trailRef = useRef<TrailPoint[]>([])
  const lastTickRef = useRef(0)

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    audioStartedRef.current = true
  }, [])

  const playTick = useCallback((amp: number) => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime
    if (now - lastTickRef.current < 0.04) return
    lastTickRef.current = now
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 880
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 600
    const gain = ctx.createGain()
    const peak = Math.min(0.04, 0.005 + amp * 0.035)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.2)
  }, [])

  const layout = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    anchorRef.current = { x: vw / 2, y: vh * 0.14 }
    lengthRef.current = Math.min(vw * 0.5, vh * 0.55)
  }, [])

  const bobPos = useCallback(() => {
    const a = anchorRef.current
    const L = lengthRef.current
    const t = thetaRef.current
    return { x: a.x + Math.sin(t) * L, y: a.y + Math.cos(t) * L }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const bob = bobPos()
    const dx = px - bob.x
    const dy = py - bob.y
    if (dx * dx + dy * dy <= (BOB_R * 4) ** 2) {
      draggingRef.current = true
      omegaRef.current = 0
      trailRef.current = []
    }
  }, [bobPos, ensureAudio])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const a = anchorRef.current
    const dx = px - a.x
    const dy = py - a.y
    // theta = angle from vertical; clamp to ~75°
    const t = Math.atan2(dx, dy)
    const clamp = Math.PI * 0.42
    thetaRef.current = Math.max(-clamp, Math.min(clamp, t))
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    omegaRef.current = 0
    lastSignRef.current = Math.sign(thetaRef.current)
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
      layout()
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const now = performance.now()
      const dt = Math.min(0.033, (now - lastTimeRef.current) / 1000)
      lastTimeRef.current = now

      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      // Physics — simple damped pendulum
      const L = lengthRef.current
      if (!draggingRef.current) {
        const accel = -(G / L) * Math.sin(thetaRef.current) - DAMPING * omegaRef.current
        omegaRef.current += accel * dt
        thetaRef.current += omegaRef.current * dt
        // Tick on zero crossing — moving through vertical
        const sign = Math.sign(thetaRef.current)
        if (
          sign !== 0 &&
          lastSignRef.current !== 0 &&
          sign !== lastSignRef.current &&
          Math.abs(omegaRef.current) > 0.05
        ) {
          const speed = Math.min(1, Math.abs(omegaRef.current) / 4)
          if (Math.abs(thetaRef.current) > ZERO_TICK_THRESHOLD * 0.1) {
            playTick(speed)
          }
        }
        if (sign !== 0) lastSignRef.current = sign
      }

      const a = anchorRef.current
      const bob = bobPos()

      // Trail (cream, fading)
      const trail = trailRef.current
      trail.push({ x: bob.x, y: bob.y, t: now })
      if (trail.length > TRAIL_MAX) trail.shift()

      // Draw trail as a faint fading polyline
      ctx.lineWidth = 1
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1]
        const p1 = trail[i]
        const age = (now - p1.t) / 2200
        const a0 = Math.max(0, 0.4 * (1 - age))
        if (a0 <= 0.01) continue
        ctx.strokeStyle = CREAM
        ctx.globalAlpha = a0
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Anchor — a tiny cream tick at the top
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x - 14, a.y)
      ctx.lineTo(a.x + 14, a.y)
      ctx.stroke()
      ctx.globalAlpha = 1

      // String
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.65
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(bob.x, bob.y)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Vertical reference hairline (rest position) — extremely faint
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.08
      ctx.beginPath()
      ctx.setLineDash([3, 5])
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(a.x, a.y + L)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // Bob — solid cream circle
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.arc(bob.x, bob.y, BOB_R, 0, Math.PI * 2)
      ctx.fill()

      // Lime tip — small dot at the bottom of the bob (the plumb point)
      const tipX = bob.x + Math.sin(thetaRef.current) * BOB_R
      const tipY = bob.y + Math.cos(thetaRef.current) * BOB_R
      ctx.save()
      ctx.shadowColor = LIME
      ctx.shadowBlur = 10
      ctx.fillStyle = LIME
      ctx.beginPath()
      ctx.arc(tipX, tipY, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Chrome — angle readout upper-right
      const deg = (thetaRef.current * 180) / Math.PI
      ctx.textAlign = 'right'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      const sign = deg >= 0 ? '+' : '−'
      const absDeg = Math.abs(deg).toFixed(1).padStart(4, '0')
      ctx.fillText(`θ · ${sign}${absDeg}°`, vw - 28, 36)
      ctx.globalAlpha = 0.2
      ctx.fillText('TINY · 009', vw - 28, 54)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('plumb', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('things settle', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Touch hint until first interaction
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('DRAG THE WEIGHT', vw / 2, vh - 30)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      audioStartedRef.current = false
    }
  }, [bobPos, handlePointerDown, handlePointerMove, handlePointerUp, layout, playTick])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
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
          background: NIGHT,
        }}
      />
    </>
  )
}
