// The viewer will see: two cream dots bobbing at slightly different rates on a NIGHT field, with a thick trace below that swells into a lime peak and collapses to near-black, over and over, scrolling right to left.
// The viewer will hear: two sine tones (220 + 223 Hz) — a slow three-per-second wobble where their peaks and valleys pass through each other.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const FREQ_A = 220
const FREQ_B_MIN = 221
const FREQ_B_MAX = 235
const FREQ_B_DEFAULT = 223

const DISPLAY_SCALE = 40 // audio Hz → display Hz (220Hz → 5.5Hz visible)
const HISTORY_LEN = 600

export default function Beat() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const oscARef = useRef<OscillatorNode | null>(null)
  const oscBRef = useRef<OscillatorNode | null>(null)
  const freqBRef = useRef(FREQ_B_DEFAULT)
  const audioStartedRef = useRef(false)
  const animRef = useRef(0)
  const historyRef = useRef<number[]>([])
  const startTimeRef = useRef<number>(performance.now())
  const draggingRef = useRef(false)

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
      const oscA = ctx.createOscillator()
      oscA.type = 'sine'
      oscA.frequency.value = FREQ_A
      const oscB = ctx.createOscillator()
      oscB.type = 'sine'
      oscB.frequency.value = freqBRef.current
      const gainA = ctx.createGain()
      gainA.gain.value = 0.035
      const gainB = ctx.createGain()
      gainB.gain.value = 0.035
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

  const updateFreqB = useCallback((xFrac: number) => {
    const clamped = Math.max(0, Math.min(1, xFrac))
    const newFreq = FREQ_B_MIN + clamped * (FREQ_B_MAX - FREQ_B_MIN)
    freqBRef.current = newFreq
    const ctx = audioRef.current
    if (ctx && oscBRef.current) {
      oscBRef.current.frequency.setTargetAtTime(newFreq, ctx.currentTime, 0.02)
    }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    draggingRef.current = true
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      updateFreqB((e.clientX - rect.left) / rect.width)
      canvas.setPointerCapture(e.pointerId)
    }
  }, [ensureAudio, updateFreqB])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      updateFreqB((e.clientX - rect.left) / rect.width)
    }
    // Resume if browser suspended (iOS sometimes re-suspends)
    const ctx = audioRef.current
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }, [updateFreqB])

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

      const elapsed = (performance.now() - startTimeRef.current) / 1000
      const fADisp = FREQ_A / DISPLAY_SCALE
      const fBDisp = freqBRef.current / DISPLAY_SCALE

      const phaseA = 2 * Math.PI * fADisp * elapsed
      const phaseB = 2 * Math.PI * fBDisp * elapsed

      // Three horizontal zones
      const zoneAY = vh * 0.18
      const zoneBY = vh * 0.32
      const sumY = vh * 0.62
      const sumAmp = Math.min(vh * 0.18, 100)

      // Labels (courier prime bold) — top-left
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.55
      ctx.fillText(`A · ${FREQ_A.toFixed(0)} HZ`, 28, zoneAY - 18)
      ctx.fillText(`B · ${freqBRef.current.toFixed(1)} HZ`, 28, zoneBY - 18)
      ctx.fillText(`A + B`, 28, sumY - sumAmp - 10)
      ctx.globalAlpha = 1

      // Zone A — hairline + bobbing dot
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.12
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(28, zoneAY)
      ctx.lineTo(vw - 28, zoneAY)
      ctx.stroke()
      ctx.globalAlpha = 1
      const dotAYOffset = Math.sin(phaseA) * 18
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.arc(vw - 80, zoneAY + dotAYOffset, 4, 0, Math.PI * 2)
      ctx.fill()

      // Zone B — hairline + bobbing dot
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.12
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(28, zoneBY)
      ctx.lineTo(vw - 28, zoneBY)
      ctx.stroke()
      ctx.globalAlpha = 1
      const dotBYOffset = Math.sin(phaseB) * 18
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.arc(vw - 80, zoneBY + dotBYOffset, 4, 0, Math.PI * 2)
      ctx.fill()

      // Zone SUM — compute sum waveform across screen
      // history stores recent sum samples so we get a nice scrolling trace
      const sample = Math.sin(phaseA) + Math.sin(phaseB)
      historyRef.current.push(sample)
      if (historyRef.current.length > HISTORY_LEN) {
        historyRef.current.shift()
      }

      // Draw sum trace
      const history = historyRef.current
      const n = history.length
      const xStart = 28
      const xEnd = vw - 28
      const xSpan = xEnd - xStart

      // Envelope brightness mapping — at each point, how close |sum| is to 2 (max)
      for (let i = 0; i < n - 1; i++) {
        const t0 = i / HISTORY_LEN
        const t1 = (i + 1) / HISTORY_LEN
        const x0 = xStart + t0 * xSpan
        const x1 = xStart + t1 * xSpan
        const s0 = history[i]
        const s1 = history[i + 1]
        const y0 = sumY - (s0 / 2) * sumAmp
        const y1 = sumY - (s1 / 2) * sumAmp

        const env = Math.max(Math.abs(s0), Math.abs(s1)) / 2 // 0..1
        // Lime when envelope near max, cream when moderate, dark when collapsed
        if (env > 0.75) {
          ctx.shadowColor = LIME
          ctx.shadowBlur = 10 * (env - 0.75) * 4
          ctx.strokeStyle = `rgba(198, 255, 60, ${0.6 + env * 0.4})`
          ctx.lineWidth = 2.5
        } else if (env > 0.35) {
          ctx.shadowBlur = 0
          ctx.strokeStyle = `rgba(232, 232, 232, ${0.3 + env * 0.6})`
          ctx.lineWidth = 1.8
        } else {
          ctx.shadowBlur = 0
          ctx.strokeStyle = `rgba(232, 232, 232, ${0.08 + env * 0.3})`
          ctx.lineWidth = 1.3
        }
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      ctx.shadowBlur = 0

      // Museum label lower-left
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.textAlign = 'left'
      ctx.fillText('beat', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      ctx.fillText('two frequencies, close enough to argue', labelX, labelY + 18)

      // Spec label bottom-right
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.2
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillText('SPEC 006', vw - 28, vh - 24)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      // Audio-not-yet-started hint — only if user hasn't touched
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TOUCH TO HEAR', vw / 2, vh * 0.92)
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
    }
  }, [handlePointerDown, handlePointerMove, handlePointerUp])

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
