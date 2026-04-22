'use client'

// moth — a single tiny cream moth drifts on a NIGHT plate with gentle
// brownian motion, trailing a fading cream path. It's weakly attracted to
// wherever the cursor sits — follows you slowly. Tap and the moth darts to
// the tap point, flashing lime on arrival. A soft filtered-noise rustle,
// volume scaled by moth speed. One agent, one mark.
//
// v3 SIGNAL: NIGHT field (#0A0A0A), cream moth + trail (#E8E8E8),
// LIME (#C6FF3C) only at the moment of arrival.

import { useEffect, useRef } from 'react'

export default function Moth() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    const resize = () => {
      W = Math.floor(window.innerWidth * dpr)
      H = Math.floor(window.innerHeight * dpr)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    // Moth state — position, velocity, last-flash timestamp.
    let mx = window.innerWidth * dpr * 0.5
    let my = window.innerHeight * dpr * 0.5
    let mvx = 0
    let mvy = 0
    let lastFlashAt = -Infinity

    // Trail — ring buffer of recent positions.
    const TRAIL_LEN = 80
    const trailX = new Float32Array(TRAIL_LEN)
    const trailY = new Float32Array(TRAIL_LEN)
    const trailAge = new Float32Array(TRAIL_LEN)
    let trailHead = 0
    let trailCount = 0
    const pushTrail = (x: number, y: number) => {
      trailX[trailHead] = x
      trailY[trailHead] = y
      trailAge[trailHead] = 0
      trailHead = (trailHead + 1) % TRAIL_LEN
      if (trailCount < TRAIL_LEN) trailCount++
    }

    // Cursor target (the "light") — starts at center, updates on pointer move.
    let targetX = mx
    let targetY = my
    let hasTarget = false

    // Audio — soft filtered noise whose gain follows moth speed.
    type AudioCtxCtor = typeof AudioContext
    let audioCtx: AudioContext | null = null
    let noiseGain: GainNode | null = null
    let noiseSource: AudioBufferSourceNode | null = null
    const startAudio = () => {
      if (!audioCtx) {
        const Ctor = (window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioCtxCtor }).webkitAudioContext)
        audioCtx = new Ctor()
        // One buffer of brown-ish noise, looped. Brown > white for a softer feel.
        const sr = audioCtx.sampleRate
        const buf = audioCtx.createBuffer(1, sr * 2, sr)
        const d = buf.getChannelData(0)
        let last = 0
        for (let i = 0; i < d.length; i++) {
          const v = (Math.random() * 2 - 1) * 0.05 + last * 0.965
          d[i] = v
          last = v
        }
        noiseSource = audioCtx.createBufferSource()
        noiseSource.buffer = buf
        noiseSource.loop = true
        const filter = audioCtx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 520
        noiseGain = audioCtx.createGain()
        noiseGain.gain.value = 0
        noiseSource.connect(filter).connect(noiseGain).connect(audioCtx.destination)
        noiseSource.start()
      }
      if (audioCtx.state === 'suspended') audioCtx.resume()
    }
    const arrivalTick = () => {
      if (!audioCtx) return
      const t = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 840
      gain.gain.setValueAtTime(0.04, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t)
      osc.stop(t + 0.3)
    }

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX * dpr
      targetY = e.clientY * dpr
      hasTarget = true
    }
    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      startAudio()
      // Dart toward the tap point: strong velocity kick, and mark arrival
      // time so the flash fires when the moth crosses it.
      targetX = e.clientX * dpr
      targetY = e.clientY * dpr
      hasTarget = true
      const dx = targetX - mx
      const dy = targetY - my
      const d = Math.max(1, Math.hypot(dx, dy))
      const DART = 22 // initial velocity boost
      mvx += (dx / d) * DART
      mvy += (dy / d) * DART
    }
    const onLeave = () => { hasTarget = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)

    let raf = 0
    let lastT = performance.now()
    let ambientPhase = Math.random() * 1000

    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      ambientPhase += dt

      // Ambient drift — slow figure-eight noise so the moth never stays still.
      const noiseX = Math.sin(ambientPhase * 0.7) * 0.4 + Math.sin(ambientPhase * 1.9) * 0.2
      const noiseY = Math.cos(ambientPhase * 0.5) * 0.4 + Math.cos(ambientPhase * 2.3) * 0.2

      // Steering — gentle attraction toward target, soft damping, small noise.
      const ATTRACT = hasTarget ? 0.45 : 0.08
      const DAMP = Math.pow(0.985, dt * 60)
      if (hasTarget) {
        const dx = targetX - mx
        const dy = targetY - my
        mvx += dx * ATTRACT * dt
        mvy += dy * ATTRACT * dt
      }
      mvx += noiseX * (dpr * 0.8)
      mvy += noiseY * (dpr * 0.8)
      // Cap speed
      const SPEED_CAP = 18 * dpr
      const sp = Math.hypot(mvx, mvy)
      if (sp > SPEED_CAP) {
        mvx = (mvx / sp) * SPEED_CAP
        mvy = (mvy / sp) * SPEED_CAP
      }
      mvx *= DAMP
      mvy *= DAMP
      mx += mvx
      my += mvy

      // Bounce softly off edges
      const PAD = 12 * dpr
      if (mx < PAD) { mx = PAD; mvx = Math.abs(mvx) * 0.5 }
      if (mx > W - PAD) { mx = W - PAD; mvx = -Math.abs(mvx) * 0.5 }
      if (my < PAD) { my = PAD; mvy = Math.abs(mvy) * 0.5 }
      if (my > H - PAD) { my = H - PAD; mvy = -Math.abs(mvy) * 0.5 }

      // Push trail — but only every few frames so the trail has some spacing.
      pushTrail(mx, my)
      for (let i = 0; i < TRAIL_LEN; i++) trailAge[i] += dt

      // Arrival flash — if moth is near target and moving fast-ish, fire once.
      if (hasTarget) {
        const dx = targetX - mx
        const dy = targetY - my
        const d = Math.hypot(dx, dy)
        if (d < 16 * dpr && Math.hypot(mvx, mvy) > 6 * dpr && now - lastFlashAt > 600) {
          lastFlashAt = now
          arrivalTick()
        }
      }

      // Audio gain — follows moth speed, floor of 0 at rest.
      if (noiseGain && audioCtx) {
        const speed = Math.hypot(mvx, mvy)
        const target = Math.min(0.055, speed / (SPEED_CAP * 0.9) * 0.055)
        noiseGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.1)
      }

      // Render
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, W, H)

      // Trail — draw oldest first, fading.
      for (let k = 0; k < trailCount; k++) {
        const idx = (trailHead - 1 - k + TRAIL_LEN) % TRAIL_LEN
        const age = trailAge[idx]
        if (age > 1.8) continue
        const alpha = Math.max(0, 1 - age / 1.8) * 0.38
        const radius = Math.max(0.5, 1.2 * dpr * (1 - age / 1.8))
        ctx.fillStyle = `rgba(232, 232, 232, ${alpha})`
        ctx.beginPath()
        ctx.arc(trailX[idx], trailY[idx], radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Moth body — tiny cream cross, slightly larger than trail dots.
      const flashAge = (now - lastFlashAt) / 1000
      const flashing = flashAge < 0.5
      const bodyColor = flashing
        ? `rgba(198, 255, 60, ${1 - flashAge / 0.5})`
        : 'rgba(232, 232, 232, 0.92)'
      ctx.fillStyle = bodyColor
      const bs = 2 * dpr
      // Horizontal bar
      ctx.fillRect(Math.floor(mx - bs * 2), Math.floor(my - bs / 2), bs * 4, bs)
      // Vertical bar — shorter so it reads as wing axis, not a plus
      ctx.fillRect(Math.floor(mx - bs / 2), Math.floor(my - bs), bs, bs * 2)
      // Center dot for weight
      ctx.beginPath()
      ctx.arc(mx, my, bs, 0, Math.PI * 2)
      ctx.fill()

      // Flash halo
      if (flashing) {
        ctx.strokeStyle = `rgba(198, 255, 60, ${(1 - flashAge / 0.5) * 0.6})`
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        ctx.arc(mx, my, 18 * dpr * flashAge * 3, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Chrome upper-right
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.42)'
      ctx.fillText('MOTH · SPEC · 013', W - 22 * dpr, 22 * dpr)

      // Museum label lower-left
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `italic 300 ${Math.floor(24 * dpr)}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.9)'
      ctx.fillText('moth', 28 * dpr, H - 42 * dpr)
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.52)'
      ctx.fillText('drawn to the light', 28 * dpr, H - 22 * dpr)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', resize)
      if (audioCtx) audioCtx.close()
    }
  }, [])

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0A0A0A',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0 }} />
    </main>
  )
}
