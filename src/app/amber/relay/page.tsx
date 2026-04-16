// The viewer will see: five cream relays on a NIGHT field — tap the first, watch a lime spark cascade through the chain as each armature swings and triggers the next.
// The viewer will hear: a sharp mechanical click (filtered noise burst, 30ms) as each relay closes, five clicks cascading left to right.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'
const DIM_CREAM = 'rgba(232, 232, 232, 0.3)'

const RELAY_COUNT = 5
const CASCADE_DELAY = 280

interface RelayState {
  energized: boolean
  armatureAngle: number
  targetAngle: number
  sparkAlpha: number
  coilGlow: number
  wireGlow: number
}

export default function Relay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const relaysRef = useRef<RelayState[]>([])
  const animRef = useRef<number>(0)
  const cascadeTimerRef = useRef<NodeJS.Timeout[]>([])

  const initRelays = useCallback(() => {
    relaysRef.current = Array.from({ length: RELAY_COUNT }, () => ({
      energized: false,
      armatureAngle: 0,
      targetAngle: 0,
      sparkAlpha: 0,
      coilGlow: 0,
      wireGlow: 0,
    }))
  }, [])

  const playClick = useCallback(() => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return

    const now = ctx.currentTime
    const bufferSize = ctx.sampleRate * 0.03
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize
      const env = Math.exp(-t * 40) * (1 - Math.exp(-t * 800))
      data[i] = (Math.random() * 2 - 1) * env
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 2200
    bandpass.Q.value = 3
    const gain = ctx.createGain()
    gain.gain.value = 0.06
    source.connect(bandpass)
    bandpass.connect(gain)
    gain.connect(ctx.destination)
    source.start(now)
  }, [])

  const triggerCascade = useCallback(() => {
    cascadeTimerRef.current.forEach(t => clearTimeout(t))
    cascadeTimerRef.current = []
    initRelays()

    for (let i = 0; i < RELAY_COUNT; i++) {
      const timer = setTimeout(() => {
        const relay = relaysRef.current[i]
        if (relay) {
          relay.energized = true
          relay.targetAngle = Math.PI * 0.25
          relay.sparkAlpha = 1
          relay.coilGlow = 1
          if (i < RELAY_COUNT - 1) {
            relay.wireGlow = 1
          }
          playClick()
        }
      }, i * CASCADE_DELAY)
      cascadeTimerRef.current.push(timer)
    }

    const resetTimer = setTimeout(() => {
      relaysRef.current.forEach(r => {
        r.energized = false
        r.targetAngle = 0
      })
    }, RELAY_COUNT * CASCADE_DELAY + 1200)
    cascadeTimerRef.current.push(resetTimer)
  }, [initRelays, playClick])

  const handlePointer = useCallback((e: PointerEvent) => {
    if (!audioRef.current) {
      audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    if (audioRef.current.state === 'suspended') {
      audioRef.current.resume()
    }
    triggerCascade()
    e.preventDefault()
  }, [triggerCascade])

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

    initRelays()

    const drawRelay = (x: number, y: number, state: RelayState, isLast: boolean) => {
      const w = 60
      const h = 80
      const cx = x
      const cy = y

      // Connecting wire to next relay
      if (!isLast) {
        const wireColor = state.wireGlow > 0.1
          ? `rgba(198, 255, 60, ${state.wireGlow * 0.6})`
          : DIM_CREAM
        ctx.strokeStyle = wireColor
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx + w * 0.8, cy - h * 0.15)
        ctx.lineTo(cx + w * 2.5, cy - h * 0.15)
        ctx.stroke()
      }

      // Coil body
      const coilGlowColor = state.coilGlow > 0.1
        ? `rgba(198, 255, 60, ${state.coilGlow * 0.4})`
        : 'transparent'
      if (state.coilGlow > 0.1) {
        ctx.shadowColor = LIME
        ctx.shadowBlur = 20 * state.coilGlow
      }
      ctx.strokeStyle = state.coilGlow > 0.1 ? LIME : CREAM
      ctx.lineWidth = 2
      ctx.strokeRect(cx - w * 0.35, cy - h * 0.05, w * 0.7, h * 0.5)
      // Coil windings
      const windingCount = 6
      for (let i = 0; i < windingCount; i++) {
        const wy = cy + h * 0.0 + (i / (windingCount - 1)) * h * 0.4
        ctx.beginPath()
        ctx.moveTo(cx - w * 0.35, wy)
        ctx.lineTo(cx + w * 0.35, wy)
        ctx.stroke()
      }
      if (coilGlowColor !== 'transparent') {
        ctx.fillStyle = coilGlowColor
        ctx.fillRect(cx - w * 0.35, cy - h * 0.05, w * 0.7, h * 0.5)
      }
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0

      // Contact points (two dots)
      const contactTopY = cy - h * 0.3
      const contactBotY = cy - h * 0.15
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.arc(cx + w * 0.25, contactTopY, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + w * 0.25, contactBotY, 3, 0, Math.PI * 2)
      ctx.fill()

      // Spark
      if (state.sparkAlpha > 0.05) {
        ctx.save()
        ctx.globalAlpha = state.sparkAlpha
        ctx.shadowColor = LIME
        ctx.shadowBlur = 12
        ctx.strokeStyle = LIME
        ctx.lineWidth = 2
        const sparkX = cx + w * 0.25
        const sparkMidY = (contactTopY + contactBotY) / 2
        ctx.beginPath()
        ctx.moveTo(sparkX - 3, contactTopY + 2)
        ctx.lineTo(sparkX + 2, sparkMidY)
        ctx.lineTo(sparkX - 2, sparkMidY)
        ctx.lineTo(sparkX + 3, contactBotY - 2)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.restore()
      }

      // Armature (pivoting bar)
      ctx.save()
      const pivotX = cx - w * 0.3
      const pivotY = cy - h * 0.22
      ctx.translate(pivotX, pivotY)
      ctx.rotate(-state.armatureAngle)
      ctx.strokeStyle = CREAM
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(w * 0.65, 0)
      ctx.stroke()
      // Pivot dot
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Base
      ctx.strokeStyle = DIM_CREAM
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - w * 0.5, cy + h * 0.55)
      ctx.lineTo(cx + w * 0.5, cy + h * 0.55)
      ctx.stroke()
    }

    const drawLabel = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const labelX = 24
      const labelY = vh - 60

      ctx.font = 'italic 300 18px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.7
      ctx.fillText('relay', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      ctx.fillText('a signal, passed along', labelX, labelY + 18)
      ctx.globalAlpha = 1
    }

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      // Update relay states
      relaysRef.current.forEach(r => {
        // Armature spring
        const diff = r.targetAngle - r.armatureAngle
        r.armatureAngle += diff * 0.15
        // Fade effects
        r.sparkAlpha *= 0.92
        r.coilGlow *= 0.97
        r.wireGlow *= 0.96
      })

      // Draw relays
      const totalWidth = RELAY_COUNT * 120
      const startX = (vw - totalWidth) / 2 + 60
      const centerY = vh * 0.45

      relaysRef.current.forEach((relay, i) => {
        const rx = startX + i * 120
        drawRelay(rx, centerY, relay, i === RELAY_COUNT - 1)
      })

      // Spec label bottom-right
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.2
      ctx.textAlign = 'right'
      ctx.fillText('SPEC 005', vw - 24, vh - 24)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      drawLabel()

      animRef.current = requestAnimationFrame(animate)
    }

    animate()
    canvas.addEventListener('pointerdown', handlePointer)

    return () => {
      cancelAnimationFrame(animRef.current)
      cascadeTimerRef.current.forEach(t => clearTimeout(t))
      canvas.removeEventListener('pointerdown', handlePointer)
      window.removeEventListener('resize', resize)
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
    }
  }, [initRelays, handlePointer])

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
