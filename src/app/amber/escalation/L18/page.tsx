'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

// Pentatonic scale — C4 to C6, 12 notes
const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66]
const N = SCALE.length

interface Trail { x: number; y: number }

interface Voice {
  id: number
  x: number
  y: number
  osc: OscillatorNode
  gain: GainNode
  color: string
  trail: Trail[]
  dying: boolean
}

function xToFreq(x: number, W: number): number {
  const t = Math.max(0, Math.min(1, x / W))
  const fi = t * (N - 1)
  const lo = Math.floor(fi)
  const hi = Math.min(lo + 1, N - 1)
  return SCALE[lo] + (SCALE[hi] - SCALE[lo]) * (fi - lo)
}

function yToGain(y: number, H: number): number {
  return 0.04 + Math.max(0, Math.min(1, 1 - y / H)) * 0.18
}

export default function L18() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const voicesRef = useRef<Map<number, Voice>>(new Map())
  const frameRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L18')
    let raf: number

    const drawBg = () => {
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
    }

    const draw = () => {
      frameRef.current++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawBg()

      const voices = voicesRef.current

      // Pitch guide lines — faint vertical dashes at each scale degree
      ctx.setLineDash([3, 8])
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W
        ctx.strokeStyle = 'rgba(80,40,20,0.07)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Draw each voice
      for (const voice of voices.values()) {
        const { trail, color, x, y, dying } = voice

        // Trail — segments fade from transparent at tail to opaque at head
        if (trail.length > 1) {
          for (let i = 1; i < trail.length; i++) {
            const t = i / trail.length
            ctx.globalAlpha = t * 0.55
            ctx.strokeStyle = color
            ctx.lineWidth = 2 + t * 16
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
            ctx.lineTo(trail[i].x, trail[i].y)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
        }

        if (!dying) {
          // Glow orb — size reflects volume (Y position)
          const gain = yToGain(y, H)
          const orbR = 10 + gain * 90

          // Outer glow halo
          const glow = ctx.createRadialGradient(x, y, 0, x, y, orbR * 2.5)
          glow.addColorStop(0, color + 'BB')
          glow.addColorStop(0.35, color + '55')
          glow.addColorStop(1, color + '00')
          ctx.globalAlpha = 0.75
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(x, y, orbR * 2.5, 0, Math.PI * 2)
          ctx.fill()

          // Core
          ctx.globalAlpha = 1
          ctx.beginPath()
          ctx.arc(x, y, orbR * 0.5, 0, Math.PI * 2)
          ctx.fillStyle = '#FFFFFF'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(x, y, orbR * 0.32, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }

      // Hint when silent
      if (voices.size === 0) {
        const pulse = 0.28 + Math.sin(frameRef.current * 0.04) * 0.1
        ctx.globalAlpha = pulse
        ctx.font = '14px monospace'
        ctx.fillStyle = 'rgba(80,40,20,0.85)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('touch and drag to play', W / 2, H / 2 - 12)
        ctx.fillText('left = lower · right = higher · up = louder', W / 2, H / 2 + 12)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    const getAudio = (): AudioContext => {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()
      return audioRef.current
    }

    let colorIdx = 0

    const startVoice = (id: number, x: number, y: number) => {
      if (voicesRef.current.has(id) || voicesRef.current.size >= 4) return
      const actx = getAudio()
      const osc = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(xToFreq(x, W), actx.currentTime)
      gain.gain.setValueAtTime(0, actx.currentTime)
      gain.gain.linearRampToValueAtTime(yToGain(y, H), actx.currentTime + 0.06)
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.start()
      const color = CITRUS[colorIdx % CITRUS.length]
      colorIdx++
      voicesRef.current.set(id, { id, x, y, osc, gain, color, trail: [{ x, y }], dying: false })
    }

    const updateVoice = (id: number, x: number, y: number) => {
      const voice = voicesRef.current.get(id)
      if (!voice || voice.dying) return
      const actx = audioRef.current!
      voice.osc.frequency.setTargetAtTime(xToFreq(x, W), actx.currentTime, 0.02)
      voice.gain.gain.setTargetAtTime(yToGain(y, H), actx.currentTime, 0.02)
      voice.x = x
      voice.y = y
      voice.trail.push({ x, y })
      if (voice.trail.length > 55) voice.trail.shift()
    }

    const stopVoice = (id: number) => {
      const voice = voicesRef.current.get(id)
      if (!voice) return
      voice.dying = true
      const actx = audioRef.current!
      voice.gain.gain.setTargetAtTime(0, actx.currentTime, 0.08)
      setTimeout(() => {
        try { voice.osc.stop() } catch { /* already stopped */ }
        voicesRef.current.delete(id)
      }, 400)
    }

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        startVoice(t.identifier, t.clientX, t.clientY)
      }
    }
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        updateVoice(t.identifier, t.clientX, t.clientY)
      }
    }
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        stopVoice(e.changedTouches[i].identifier)
      }
    }

    const MOUSE_ID = 9999
    let mouseDown = false
    const handleMouseDown = (e: MouseEvent) => {
      mouseDown = true
      startVoice(MOUSE_ID, e.clientX, e.clientY)
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (mouseDown) updateVoice(MOUSE_ID, e.clientX, e.clientY)
    }
    const handleMouseUp = () => {
      if (mouseDown) {
        mouseDown = false
        stopVoice(MOUSE_ID)
      }
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
