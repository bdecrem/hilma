// The viewer will see: a grid of 240 cream dots breathing out of phase — then, tap by tap, the dots pull into alignment until the whole lattice pulses as one unified wave.
// The viewer will hear: a near-silent 60Hz drone that swells as the lattice synchronizes, punctuated by brief filtered ticks on each tap.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const CELL_TARGET = 48
const BASE_R = 1.4
const AMP_R = 1.8

interface Dot {
  x: number
  y: number
  phase: number
  rate: number
  limeAlpha: number
}

export default function Lattice() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const droneRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null)
  const audioStartedRef = useRef(false)
  const dotsRef = useRef<Dot[]>([])
  const animRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const coherenceRef = useRef(0)

  const buildDots = useCallback((vw: number, vh: number) => {
    const cols = Math.max(8, Math.floor(vw / CELL_TARGET))
    const rows = Math.max(6, Math.floor(vh * 0.58 / CELL_TARGET))
    const cellW = vw / (cols + 1)
    const cellH = (vh * 0.6) / (rows + 1)
    const startY = vh * 0.22

    const dots: Dot[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          x: cellW * (c + 1),
          y: startY + cellH * (r + 0.5),
          phase: Math.random() * Math.PI * 2,
          rate: 1 + (Math.random() - 0.5) * 0.35, // natural freq heterogeneity
          limeAlpha: 0,
        })
      }
    }
    dotsRef.current = dots
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
    if (!audioStartedRef.current) {
      // Start the drone
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 60
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 180
      filter.Q.value = 0.5
      const gain = ctx.createGain()
      gain.gain.value = 0.003
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      droneRef.current = { osc, gain }
      audioStartedRef.current = true
    }
  }, [])

  const playTick = useCallback(() => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 820
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.045, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.14)
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    const ctx = audioRef.current
    if (ctx?.state === 'suspended') ctx.resume()

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    // Find nearest dot
    const dots = dotsRef.current
    let nearest = -1
    let minDist = Infinity
    for (let i = 0; i < dots.length; i++) {
      const dx = dots[i].x - px
      const dy = dots[i].y - py
      const d = dx * dx + dy * dy
      if (d < minDist) {
        minDist = d
        nearest = i
      }
    }

    if (nearest === -1) return
    const target = dots[nearest]
    target.limeAlpha = 1

    // Pull all phases toward the tapped dot's phase by a small factor (circular)
    const pullStrength = 0.08
    const targetPhase = target.phase
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]
      let delta = targetPhase - d.phase
      // Wrap to [-π, π] for shortest path
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      d.phase += delta * pullStrength
    }

    playTick()
  }, [ensureAudio, playTick])

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
      buildDots(window.innerWidth, window.innerHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      const now = performance.now()
      const dtSec = Math.min(0.05, (now - lastTimeRef.current) / 1000)
      lastTimeRef.current = now

      const dots = dotsRef.current
      const n = dots.length

      // Advance phases
      const speed = 2.0 // radians per second base rate
      let cxSum = 0
      let cySum = 0
      for (let i = 0; i < n; i++) {
        const d = dots[i]
        d.phase += dtSec * speed * d.rate
        if (d.phase > Math.PI * 2) d.phase -= Math.PI * 2
        cxSum += Math.cos(d.phase)
        cySum += Math.sin(d.phase)
        d.limeAlpha *= 0.93
      }
      const coherence = Math.sqrt(cxSum * cxSum + cySum * cySum) / n
      coherenceRef.current += (coherence - coherenceRef.current) * 0.06

      // Update drone gain based on smoothed coherence (0.003 → 0.028)
      if (droneRef.current && audioRef.current) {
        const target = 0.003 + Math.pow(coherenceRef.current, 2) * 0.025
        droneRef.current.gain.gain.setTargetAtTime(target, audioRef.current.currentTime, 0.08)
      }

      // Draw dots
      for (let i = 0; i < n; i++) {
        const d = dots[i]
        const pulse = Math.sin(d.phase)
        const r = BASE_R + (pulse * 0.5 + 0.5) * AMP_R
        const bright = 0.25 + (pulse * 0.5 + 0.5) * 0.6
        ctx.fillStyle = `rgba(232, 232, 232, ${bright})`
        ctx.beginPath()
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.fill()
        if (d.limeAlpha > 0.05) {
          ctx.save()
          ctx.globalAlpha = d.limeAlpha
          ctx.shadowColor = LIME
          ctx.shadowBlur = 14
          ctx.fillStyle = LIME
          ctx.beginPath()
          ctx.arc(d.x, d.y, r + 1.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }
      ctx.shadowBlur = 0

      // Coherence readout (upper-right, tiny)
      ctx.textAlign = 'right'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.35
      const cohPct = (coherenceRef.current * 100).toFixed(0).padStart(2, '0')
      ctx.fillText(`COHERENCE · ${cohPct}`, vw - 28, 36)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('lattice', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('tap until they agree', labelX, labelY + 18)

      // Spec label bottom-right
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.2
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillText('SPEC 007', vw - 28, vh - 24)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      // Touch hint if audio not yet unlocked
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TOUCH TO BEGIN', vw / 2, vh * 0.12)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()

    canvas.addEventListener('pointerdown', handlePointerDown)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      try { droneRef.current?.osc.stop() } catch {}
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      droneRef.current = null
      audioStartedRef.current = false
    }
  }, [buildDots, handlePointerDown])

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
