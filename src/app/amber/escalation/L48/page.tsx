// The viewer will see: ~110 dim cream dots scattered on a dark plate. Each fires (briefly bright,
// with a lime halo) when its internal phase reaches 1, then resets. Every fire bumps every other
// dot's phase forward by a small amount — Mirollo-Strogatz pulse coupling. Random at first. After
// ~30 seconds the whole field flashes in unison. Tap anywhere to scramble all phases — the field
// re-synchronizes from chaos.
// The viewer will hear: a faint 60Hz drone whose volume tracks order. A short filtered tick on each
// fire; many ticks at once read as a swell. Silence at full coherence except for the unison pulse.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N_DOTS = 110
const PHASE_RATE = 0.55     // per-second base; +/- small jitter per dot
const COUPLING_EPS = 0.025  // how much each dot bumps every other on fire
const FLASH_DECAY = 0.88    // per-frame
const REFRACTORY_MS = 90    // can't fire again immediately after firing

interface Dot {
  x: number
  y: number
  phase: number
  rate: number
  flash: number
  lastFire: number
}

export default function L48() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const droneRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null)
  const audioStartedRef = useRef(false)
  const animRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const lastTickAudioRef = useRef(0)

  const dotsRef = useRef<Dot[]>([])
  const orderRef = useRef(0)
  const fireCountRef = useRef(0)

  const buildDots = useCallback((vw: number, vh: number) => {
    const padX = 50
    const padTop = 80
    const padBot = 110
    const dots: Dot[] = []
    // Poisson-disk-ish: simple random with rejection for spacing
    const minDist = Math.min(vw, vh) * 0.05
    let attempts = 0
    while (dots.length < N_DOTS && attempts < N_DOTS * 40) {
      attempts++
      const x = padX + Math.random() * (vw - padX * 2)
      const y = padTop + Math.random() * (vh - padTop - padBot)
      let ok = true
      for (const d of dots) {
        if (Math.hypot(d.x - x, d.y - y) < minDist) {
          ok = false
          break
        }
      }
      if (!ok) continue
      dots.push({
        x,
        y,
        phase: Math.random(),
        rate: PHASE_RATE * (1 + (Math.random() - 0.5) * 0.04),
        flash: 0,
        lastFire: -1000,
      })
    }
    dotsRef.current = dots
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    if (!audioStartedRef.current) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 60
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 160
      filter.Q.value = 0.5
      const gain = ctx.createGain()
      gain.gain.value = 0.002
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      droneRef.current = { osc, gain }
      audioStartedRef.current = true
    }
  }, [])

  const playFireTick = useCallback((freq: number) => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime
    if (now - lastTickAudioRef.current < 0.012) return
    lastTickAudioRef.current = now
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = 4
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.008, now + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.09)
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    // Scramble all phases — re-seed the field
    const dots = dotsRef.current
    for (const d of dots) {
      d.phase = Math.random()
      d.flash = Math.max(d.flash, 0.15)
    }
  }, [ensureAudio])

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
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000)
      lastTimeRef.current = now

      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      const dots = dotsRef.current
      const n = dots.length

      // Pass 1: advance phases
      for (let i = 0; i < n; i++) {
        const d = dots[i]
        d.phase += dt * d.rate
        d.flash *= FLASH_DECAY
      }

      // Pass 2: detect fires, apply pulse coupling
      // Collect fires this frame, then apply coupling once (avoids cascade-in-frame issues)
      let fires = 0
      for (let i = 0; i < n; i++) {
        const d = dots[i]
        if (d.phase >= 1 && now - d.lastFire > REFRACTORY_MS) {
          d.phase = 0
          d.lastFire = now
          d.flash = 1
          fires++
          fireCountRef.current++
        }
      }
      if (fires > 0) {
        const bump = COUPLING_EPS * fires
        for (let i = 0; i < n; i++) {
          const d = dots[i]
          if (d.flash >= 0.99) continue // just fired this frame
          d.phase = Math.min(0.999, d.phase + bump)
        }
        // Audio tick(s) — pitch rises with cluster size
        const freq = 720 + Math.min(360, fires * 30)
        playFireTick(freq)
      }

      // Compute order parameter (Kuramoto r) on phases mapped to angles
      let cxSum = 0
      let cySum = 0
      for (let i = 0; i < n; i++) {
        const ang = dots[i].phase * Math.PI * 2
        cxSum += Math.cos(ang)
        cySum += Math.sin(ang)
      }
      const order = Math.sqrt(cxSum * cxSum + cySum * cySum) / n
      orderRef.current += (order - orderRef.current) * 0.05

      // Update drone with order
      if (droneRef.current && audioRef.current) {
        const target = 0.002 + Math.pow(orderRef.current, 1.5) * 0.018
        droneRef.current.gain.gain.setTargetAtTime(target, audioRef.current.currentTime, 0.1)
      }

      // Draw dots
      for (let i = 0; i < n; i++) {
        const d = dots[i]
        // Base dim cream dot (proportional to phase — quietly brighter as it nears firing)
        const baseAlpha = 0.18 + d.phase * 0.18
        ctx.fillStyle = CREAM
        ctx.globalAlpha = baseAlpha
        ctx.beginPath()
        ctx.arc(d.x, d.y, 2.4, 0, Math.PI * 2)
        ctx.fill()

        if (d.flash > 0.04) {
          // Bright cream core
          ctx.globalAlpha = d.flash
          ctx.beginPath()
          ctx.arc(d.x, d.y, 4 + d.flash * 2.5, 0, Math.PI * 2)
          ctx.fill()

          // Lime halo
          ctx.save()
          ctx.shadowColor = LIME
          ctx.shadowBlur = 16
          ctx.fillStyle = LIME
          ctx.globalAlpha = d.flash * 0.7
          ctx.beginPath()
          ctx.arc(d.x, d.y, 6 + d.flash * 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1

      // Chrome — order readout upper-left
      ctx.textAlign = 'left'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      const orderPct = (orderRef.current * 100).toFixed(0).padStart(2, '0')
      ctx.fillText(`ORDER · ${orderPct}`, 28, 36)

      // Upper-right — fires count + spec
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.4
      ctx.fillText(`FIRES · ${fireCountRef.current.toString().padStart(4, '0')}`, vw - 28, 36)
      ctx.globalAlpha = 0.2
      ctx.fillText('SPEC · L48', vw - 28, 54)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('L48 · fireflies', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('they learn each other', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Touch hint until interaction
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TAP TO SCRAMBLE', vw / 2, vh - 30)
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
  }, [buildDots, handlePointerDown, playFireTick])

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
