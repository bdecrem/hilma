'use client'

// ratchet — a 24-tooth cream wheel with a small triangular pawl resting on
// its edge. Drag horizontally to turn the wheel; it only rotates forward
// (backward drag has no effect — the pawl blocks it). Each time a tooth
// passes under the pawl a filtered-noise click fires and the pawl bounces
// briefly. Release and the wheel coasts, then settles against the next
// tooth. A quiet machine specimen about asymmetry of motion.
//
// v3 SIGNAL: NIGHT field, cream mechanism, LIME (#C6FF3C) only in the
// brief flash at the tooth crossing.

import { useEffect, useRef } from 'react'

const TEETH = 24
const STEP = (Math.PI * 2) / TEETH

export default function Ratchet() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0, H = 0, cx = 0, cy = 0, R = 0
    const resize = () => {
      W = Math.floor(window.innerWidth * dpr)
      H = Math.floor(window.innerHeight * dpr)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      cx = Math.floor(W / 2)
      cy = Math.floor(H / 2)
      R = Math.min(W, H) * 0.24
    }
    resize()
    window.addEventListener('resize', resize)

    // Wheel state.
    let angle = 0.12 // start slightly rotated so the pawl doesn't sit on a tooth tip
    let angularVel = 0 // radians per second
    let lastToothIdx = Math.floor(angle / STEP)
    let pawlBounceAge = Infinity // seconds since last bounce
    let flashAge = Infinity

    // Drag.
    let pointerDown = false
    let lastPx = 0

    // Audio.
    type AudioCtxCtor = typeof AudioContext
    let audioCtx: AudioContext | null = null
    let noiseBuffer: AudioBuffer | null = null
    const startAudio = () => {
      if (!audioCtx) {
        const Ctor = (window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioCtxCtor }).webkitAudioContext)
        audioCtx = new Ctor()
        // Short brown-noise buffer reused for every click.
        const sr = audioCtx.sampleRate
        noiseBuffer = audioCtx.createBuffer(1, Math.floor(sr * 0.08), sr)
        const d = noiseBuffer.getChannelData(0)
        let last = 0
        for (let i = 0; i < d.length; i++) {
          const v = (Math.random() * 2 - 1) * 0.4 + last * 0.96
          d[i] = v
          last = v
        }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume()
    }
    const clickSound = () => {
      if (!audioCtx || !noiseBuffer) return
      const now = audioCtx.currentTime
      const src = audioCtx.createBufferSource()
      src.buffer = noiseBuffer
      const filter = audioCtx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1800
      filter.Q.value = 4.5
      const gain = audioCtx.createGain()
      gain.gain.setValueAtTime(0.0, now)
      gain.gain.linearRampToValueAtTime(0.16, now + 0.002)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
      src.connect(filter).connect(gain).connect(audioCtx.destination)
      src.start(now)
      src.stop(now + 0.09)
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      startAudio()
      pointerDown = true
      lastPx = e.clientX
    }
    const onMove = (e: PointerEvent) => {
      if (!pointerDown) return
      const dx = e.clientX - lastPx
      lastPx = e.clientX
      // Only forward drags turn the wheel. Backward drags are blocked by the pawl.
      if (dx > 0) {
        // Convert pixel delta to angular velocity; scale tuned so a finger-
        // length drag across the canvas turns the wheel ~half a revolution.
        angularVel += dx * 0.016
        // Clamp so it doesn't spin out of control.
        if (angularVel > 8) angularVel = 8
      }
    }
    const onUp = () => { pointerDown = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    let raf = 0
    let lastT = performance.now()

    // The pawl sits at the top of the wheel, pointing down. Its angular
    // position (in wheel frame) is at -π/2. We measure the "tooth that
    // just passed" by seeing which STEP interval the pawl's position
    // corresponds to — specifically the ramp peak just passed under it.
    const pawlWorldAngle = -Math.PI / 2

    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      pawlBounceAge += dt
      flashAge += dt

      // Angular damping — the wheel coasts down to rest.
      const DAMP = Math.pow(0.985, dt * 60)
      angularVel *= DAMP

      // Pawl gate: the wheel cannot rotate backward (negative vel prevented
      // by the drag handler). But near a tooth peak, we also snap to the
      // next valley if vel is very low — so the pawl "settles."
      if (Math.abs(angularVel) < 0.05 && !pointerDown) {
        const fromStep = (angle - pawlWorldAngle) / STEP
        const nearestValley = Math.round(fromStep)
        const target = nearestValley * STEP + pawlWorldAngle
        const diff = target - angle
        // Soft pull into the valley
        angle += diff * Math.min(1, dt * 8)
        angularVel = 0
      } else {
        angle += angularVel * dt
      }

      // Detect tooth crossings — when the pawl position relative to the wheel
      // crosses an integer step, fire a click.
      const pawlInWheel = pawlWorldAngle - angle
      const currentToothIdx = Math.floor(pawlInWheel / STEP)
      if (currentToothIdx !== lastToothIdx && angularVel > 0.15) {
        clickSound()
        pawlBounceAge = 0
        flashAge = 0
      }
      lastToothIdx = currentToothIdx

      // Render
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, W, H)

      // --- Wheel ---
      // Path around the perimeter, asymmetric teeth: each step has a gentle
      // rising ramp (85% of the tooth) then a vertical drop.
      const RIN = R * 0.86
      const ROUT = R
      ctx.beginPath()
      for (let i = 0; i < TEETH; i++) {
        const a0 = i * STEP + angle
        const a1 = (i + 0.85) * STEP + angle
        const a2 = (i + 1) * STEP + angle
        // ramp rise: from valley at a0 (Rin) to peak at a1 (Rout)
        const p0x = cx + Math.cos(a0) * RIN
        const p0y = cy + Math.sin(a0) * RIN
        const p1x = cx + Math.cos(a1) * ROUT
        const p1y = cy + Math.sin(a1) * ROUT
        // vertical drop: from peak at a1 (Rout) straight down to next valley at a2 (Rin)
        const p2x = cx + Math.cos(a2) * RIN
        const p2y = cy + Math.sin(a2) * RIN
        if (i === 0) ctx.moveTo(p0x, p0y)
        else ctx.lineTo(p0x, p0y)
        ctx.lineTo(p1x, p1y)
        ctx.lineTo(p2x, p2y)
      }
      ctx.closePath()
      ctx.strokeStyle = 'rgba(232, 232, 232, 0.78)'
      ctx.lineWidth = 1.3 * dpr
      ctx.stroke()

      // Inner hub ring
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.28, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(232, 232, 232, 0.32)'
      ctx.lineWidth = 1 * dpr
      ctx.stroke()

      // Center dot
      ctx.fillStyle = 'rgba(232, 232, 232, 0.62)'
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.04, 0, Math.PI * 2)
      ctx.fill()

      // --- Pawl ---
      // Small triangle pointing down, pivoted above the wheel.
      const pawlPivotX = cx
      const pawlPivotY = cy - R * 1.28
      const bounce = Math.max(0, 1 - pawlBounceAge / 0.12)
      const pawlLift = bounce * R * 0.08
      const pawlTipX = cx
      const pawlTipY = cy - R * 1.0 - pawlLift
      const pawlWidth = R * 0.12
      ctx.fillStyle = 'rgba(232, 232, 232, 0.85)'
      ctx.beginPath()
      ctx.moveTo(pawlTipX, pawlTipY)
      ctx.lineTo(pawlPivotX - pawlWidth, pawlPivotY - pawlLift * 0.6)
      ctx.lineTo(pawlPivotX + pawlWidth, pawlPivotY - pawlLift * 0.6)
      ctx.closePath()
      ctx.fill()
      // tiny pivot circle
      ctx.fillStyle = 'rgba(232, 232, 232, 0.5)'
      ctx.beginPath()
      ctx.arc(pawlPivotX, pawlPivotY - pawlLift * 0.6, 2 * dpr, 0, Math.PI * 2)
      ctx.fill()

      // --- Click flash ---
      if (flashAge < 0.28) {
        const a = 1 - flashAge / 0.28
        ctx.strokeStyle = `rgba(198, 255, 60, ${a * 0.8})`
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.arc(pawlTipX, pawlTipY + 2 * dpr, R * 0.06 + flashAge * R * 0.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      // --- Chrome ---
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.42)'
      const toothStr = String(((-currentToothIdx) % TEETH + TEETH) % TEETH).padStart(2, '0')
      ctx.fillText(`RATCHET · TOOTH ${toothStr}   TINY · 014`, W - 22 * dpr, 22 * dpr)

      // --- Museum label ---
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `italic 300 ${Math.floor(24 * dpr)}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.9)'
      ctx.fillText('ratchet', 28 * dpr, H - 42 * dpr)
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.52)'
      ctx.fillText('one direction only', 28 * dpr, H - 22 * dpr)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
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
