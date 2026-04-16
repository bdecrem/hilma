// The viewer will see: two cream circles with rotating markers drifting at different rates — as the K slider moves past the critical mark, the markers snap into lockstep and hold a fixed offset, while the dial line turns lime.
// The viewer will hear: two sine tones beating at ~3 Hz below K_c — as K crosses the critical threshold, the two tones slide toward each other and resolve into a single clean unison.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

// Display phase dynamics (radians/sec at the chosen visible speed)
const OMEGA_1 = 1.25
const OMEGA_2 = 1.75
const DELTA_OMEGA = OMEGA_2 - OMEGA_1 // 0.5
const K_CRIT = DELTA_OMEGA / 2 // 0.25
const K_MAX = 0.8

// Audio frequencies
const F_A_BASE = 220
const F_B_BASE = 223
const AUDIO_FREQ_SCALE = 6 // how strongly display-rate deviations map to audio freq shift

export default function L46() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const oscARef = useRef<OscillatorNode | null>(null)
  const oscBRef = useRef<OscillatorNode | null>(null)
  const audioStartedRef = useRef(false)
  const animRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  const theta1Ref = useRef(0)
  const theta2Ref = useRef(Math.PI / 3) // start with some phase diff
  const kRef = useRef(0)
  const lockedRef = useRef(false)
  const lockFlashRef = useRef(0)
  const diffHistoryRef = useRef<number[]>([])
  const draggingRef = useRef(false)

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    if (!audioStartedRef.current) {
      const oscA = ctx.createOscillator()
      oscA.type = 'sine'
      oscA.frequency.value = F_A_BASE
      const oscB = ctx.createOscillator()
      oscB.type = 'sine'
      oscB.frequency.value = F_B_BASE
      const gainA = ctx.createGain()
      gainA.gain.value = 0.03
      const gainB = ctx.createGain()
      gainB.gain.value = 0.03
      oscA.connect(gainA)
      oscB.connect(gainB)
      gainA.connect(ctx.destination)
      gainB.connect(ctx.destination)
      oscA.start()
      oscB.start()
      oscARef.current = oscA
      oscBRef.current = oscB
      audioStartedRef.current = true
    }
  }, [])

  const playLockChime = useCallback(() => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime
    // Quiet two-tone bell, major third (audibly "resolved")
    const freqs = [440, 554]
    for (const freq of freqs) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.01, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 1.7)
    }
  }, [])

  const updateKFromX = useCallback((xFrac: number) => {
    const clamped = Math.max(0, Math.min(1, xFrac))
    kRef.current = clamped * K_MAX
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    const ctx = audioRef.current
    if (ctx?.state === 'suspended') ctx.resume()
    const canvas = canvasRef.current
    if (!canvas) return
    draggingRef.current = true
    canvas.setPointerCapture(e.pointerId)
    const rect = canvas.getBoundingClientRect()
    const sliderPad = 40
    const x = e.clientX - rect.left
    updateKFromX((x - sliderPad) / (rect.width - sliderPad * 2))
  }, [ensureAudio, updateKFromX])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sliderPad = 40
    const x = e.clientX - rect.left
    updateKFromX((x - sliderPad) / (rect.width - sliderPad * 2))
    const ctx = audioRef.current
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }, [updateKFromX])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
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
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      const now = performance.now()
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000)
      lastTimeRef.current = now

      // Kuramoto pair dynamics
      const K = kRef.current
      let psi = theta1Ref.current - theta2Ref.current
      // Normalize to [-π, π] for sin
      while (psi > Math.PI) psi -= Math.PI * 2
      while (psi < -Math.PI) psi += Math.PI * 2
      const dtheta1 = OMEGA_1 - K * Math.sin(psi)
      const dtheta2 = OMEGA_2 + K * Math.sin(psi)
      theta1Ref.current += dtheta1 * dt
      theta2Ref.current += dtheta2 * dt

      // Track |dψ/dt| average for lock detection
      const dPsi = dtheta1 - dtheta2
      diffHistoryRef.current.push(Math.abs(dPsi))
      if (diffHistoryRef.current.length > 30) diffHistoryRef.current.shift()
      const avgDiff = diffHistoryRef.current.reduce((a, b) => a + b, 0) / Math.max(1, diffHistoryRef.current.length)

      const nowLocked = K > K_CRIT * 0.95 && avgDiff < 0.06
      const nowUnlocked = avgDiff > 0.25
      if (!lockedRef.current && nowLocked) {
        lockedRef.current = true
        lockFlashRef.current = 1
        playLockChime()
      } else if (lockedRef.current && nowUnlocked) {
        lockedRef.current = false
      }
      lockFlashRef.current *= 0.96

      // Update audio frequencies: audio deviation = (current display rate - natural) * scale
      if (audioRef.current && audioStartedRef.current) {
        const t = audioRef.current.currentTime
        const freqA = F_A_BASE + (dtheta1 - OMEGA_1) * AUDIO_FREQ_SCALE
        const freqB = F_B_BASE + (dtheta2 - OMEGA_2) * AUDIO_FREQ_SCALE
        oscARef.current?.frequency.setTargetAtTime(freqA, t, 0.015)
        oscBRef.current?.frequency.setTargetAtTime(freqB, t, 0.015)
      }

      // === Draw circles ===
      const circleY = vh * 0.36
      const circleR = Math.min(vw * 0.17, 92)
      const cx1 = vw * 0.33
      const cx2 = vw * 0.67
      const color = lockedRef.current ? LIME : CREAM

      const drawCircle = (x: number, y: number, theta: number) => {
        // Outer ring
        ctx.strokeStyle = color
        ctx.globalAlpha = lockedRef.current ? 0.8 : 0.55
        ctx.lineWidth = 1.5
        if (lockedRef.current || lockFlashRef.current > 0.2) {
          ctx.shadowColor = LIME
          ctx.shadowBlur = 14 * Math.max(lockFlashRef.current, lockedRef.current ? 1 : 0)
        }
        ctx.beginPath()
        ctx.arc(x, y, circleR, 0, Math.PI * 2)
        ctx.stroke()

        // Marker line
        ctx.globalAlpha = 1
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(theta) * circleR, y + Math.sin(theta) * circleR)
        ctx.stroke()

        // Center dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()

        // Tip dot (bigger, glows when locked)
        ctx.beginPath()
        ctx.arc(
          x + Math.cos(theta) * circleR,
          y + Math.sin(theta) * circleR,
          lockedRef.current ? 5 : 3.5,
          0,
          Math.PI * 2
        )
        ctx.fill()
        ctx.shadowBlur = 0
      }

      drawCircle(cx1, circleY, theta1Ref.current)
      drawCircle(cx2, circleY, theta2Ref.current)

      // Labels above circles
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.5
      ctx.textAlign = 'center'
      ctx.fillText(`θ₁ · 220 HZ`, cx1, circleY - circleR - 14)
      ctx.fillText(`θ₂ · 223 HZ`, cx2, circleY - circleR - 14)
      ctx.globalAlpha = 1

      // === Slider / dial ===
      const sliderY = vh * 0.72
      const sliderPad = 40
      const sliderStart = sliderPad
      const sliderEnd = vw - sliderPad
      const sliderSpan = sliderEnd - sliderStart
      const handleX = sliderStart + (K / K_MAX) * sliderSpan

      // Slider track (cream hairline)
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sliderStart, sliderY)
      ctx.lineTo(sliderEnd, sliderY)
      ctx.stroke()
      ctx.globalAlpha = 1

      // K_c critical marker (hairline vertical, lime)
      const kCritX = sliderStart + (K_CRIT / K_MAX) * sliderSpan
      ctx.strokeStyle = LIME
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(kCritX, sliderY - 12)
      ctx.lineTo(kCritX, sliderY + 12)
      ctx.stroke()
      ctx.globalAlpha = 1

      // K_c label
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillStyle = LIME
      ctx.globalAlpha = 0.6
      ctx.textAlign = 'center'
      ctx.fillText('K_c', kCritX, sliderY + 26)
      ctx.globalAlpha = 1

      // Handle
      ctx.fillStyle = lockedRef.current ? LIME : CREAM
      if (lockedRef.current) {
        ctx.shadowColor = LIME
        ctx.shadowBlur = 12
      }
      ctx.beginPath()
      ctx.arc(handleX, sliderY, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // K readout + state label
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.55
      ctx.textAlign = 'left'
      ctx.fillText(`K · ${K.toFixed(2)}`, sliderStart, sliderY - 18)
      ctx.textAlign = 'right'
      ctx.fillStyle = lockedRef.current ? LIME : CREAM
      ctx.globalAlpha = lockedRef.current ? 0.9 : 0.4
      ctx.fillText(lockedRef.current ? 'LOCKED' : 'DRIFTING', sliderEnd, sliderY - 18)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('lock', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('two frequencies, bound', labelX, labelY + 18)

      // Level label bottom-right
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.25
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillText('L46 · ESCALATION', vw - 28, vh - 24)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      // Touch hint
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.4
        ctx.textAlign = 'center'
        ctx.fillText('DRAG THE SLIDER', vw / 2, sliderY + 48)
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
      try { oscARef.current?.stop() } catch {}
      try { oscBRef.current?.stop() } catch {}
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      audioStartedRef.current = false
      lockedRef.current = false
    }
  }, [handlePointerDown, handlePointerMove, handlePointerUp, playLockChime])

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
