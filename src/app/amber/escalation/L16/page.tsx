'use client'

import { useEffect, useRef, useCallback } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const DRUM_NAMES = ['kick', 'snare', 'hat', 'clap']
const STEPS = 8
const BPM = 120

// Synthesize drum sounds with Web Audio
function makeKick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(160, time)
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.12)
  gain.gain.setValueAtTime(0.8, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(time)
  osc.stop(time + 0.3)
}

function makeSnare(ctx: AudioContext, time: number) {
  // Noise burst
  const bufSize = ctx.sampleRate * 0.1
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.value = 1000
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.5, time)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12)
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(time)
  noise.stop(time + 0.12)
  // Body
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(200, time)
  osc.frequency.exponentialRampToValueAtTime(80, time + 0.05)
  gain.gain.setValueAtTime(0.4, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(time)
  osc.stop(time + 0.08)
}

function makeHat(ctx: AudioContext, time: number) {
  const bufSize = ctx.sampleRate * 0.05
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 5000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.3, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  src.start(time)
  src.stop(time + 0.06)
}

function makeClap(ctx: AudioContext, time: number) {
  // Multiple short noise bursts
  for (let i = 0; i < 3; i++) {
    const offset = time + i * 0.01
    const bufSize = ctx.sampleRate * 0.02
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let j = 0; j < bufSize; j++) data[j] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2000
    filter.Q.value = 1
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.35, offset)
    gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.08)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start(offset)
    src.stop(offset + 0.08)
  }
}

const DRUM_FNS = [makeKick, makeSnare, makeHat, makeClap]

export default function L16() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const gridRef = useRef<boolean[][]>(
    Array.from({ length: 4 }, () => Array(STEPS).fill(false))
  )
  const playingRef = useRef(false)
  const stepRef = useRef(0)
  const lastStepTimeRef = useRef(0)
  const flashRef = useRef<{ row: number; col: number; t: number }[]>([])
  const frameRef = useRef(0)

  // Layout calculations
  const getLayout = useCallback(() => {
    const W = window.innerWidth
    const H = window.innerHeight
    const padSize = Math.min((W - 60) / STEPS, (H - 160) / 4, 80)
    const gap = 6
    const gridW = STEPS * (padSize + gap) - gap
    const gridH = 4 * (padSize + gap) - gap
    const offsetX = (W - gridW) / 2
    const offsetY = (H - gridH) / 2 - 10
    return { W, H, padSize, gap, gridW, gridH, offsetX, offsetY }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L16')
    let raf: number

    const stepInterval = 60 / BPM / 2 * 1000 // 8th notes

    const draw = () => {
      const { W, H, padSize, gap, offsetX, offsetY } = getLayout()
      frameRef.current++

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const now = Date.now()
      const grid = gridRef.current

      // Advance sequencer
      if (playingRef.current && now - lastStepTimeRef.current > stepInterval) {
        lastStepTimeRef.current = now
        stepRef.current = (stepRef.current + 1) % STEPS
        const step = stepRef.current
        const actx = audioRef.current
        if (actx) {
          for (let row = 0; row < 4; row++) {
            if (grid[row][step]) {
              DRUM_FNS[row](actx, actx.currentTime)
              flashRef.current.push({ row, col: step, t: now })
            }
          }
        }
      }

      // Draw pads
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < STEPS; col++) {
          const x = offsetX + col * (padSize + gap)
          const y = offsetY + row * (padSize + gap)
          const active = grid[row][col]
          const isCurrentStep = playingRef.current && col === stepRef.current

          // Check flash
          const flash = flashRef.current.find(f => f.row === row && f.col === col)
          const flashAge = flash ? (now - flash.t) / 300 : 1

          // Pad color
          const color = CITRUS[row % CITRUS.length]
          const radius = 8

          ctx.beginPath()
          ctx.roundRect(x, y, padSize, padSize, radius)

          if (active) {
            ctx.fillStyle = color
            ctx.globalAlpha = flashAge < 1 ? 1 : 0.7
          } else {
            ctx.fillStyle = isCurrentStep ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'
            ctx.globalAlpha = 1
          }
          ctx.fill()

          // Playhead highlight
          if (isCurrentStep) {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'
            ctx.lineWidth = 2
            ctx.stroke()
          }

          // Flash glow
          if (flash && flashAge < 1) {
            ctx.beginPath()
            ctx.roundRect(x - 4, y - 4, padSize + 8, padSize + 8, radius + 2)
            ctx.strokeStyle = color
            ctx.lineWidth = 3
            ctx.globalAlpha = (1 - flashAge) * 0.6
            ctx.stroke()
          }

          ctx.globalAlpha = 1
        }

        // Row label
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.font = '11px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(DRUM_NAMES[row], offsetX - 10, offsetY + row * (padSize + gap) + padSize / 2 + 4)
      }
      ctx.textAlign = 'start'

      // Play/stop button
      const btnX = W / 2 - 30
      const btnY = offsetY + 4 * (padSize + gap) + 20
      ctx.beginPath()
      ctx.roundRect(btnX, btnY, 60, 30, 6)
      ctx.fillStyle = playingRef.current ? 'rgba(255,78,80,0.5)' : 'rgba(255,255,255,0.1)'
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(playingRef.current ? 'stop' : 'play', W / 2, btnY + 19)
      ctx.textAlign = 'start'

      // Clean old flashes
      flashRef.current = flashRef.current.filter(f => now - f.t < 300)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [getLayout])

  const handleTap = useCallback((clientX: number, clientY: number) => {
    // Init audio
    if (!audioRef.current) {
      audioRef.current = new AudioContext()
    }
    if (audioRef.current.state === 'suspended') audioRef.current.resume()

    const { padSize, gap, offsetX, offsetY } = getLayout()

    // Check play button
    const W = window.innerWidth
    const btnX = W / 2 - 30
    const btnY = offsetY + 4 * (padSize + gap) + 20
    if (clientX >= btnX && clientX <= btnX + 60 && clientY >= btnY && clientY <= btnY + 30) {
      playingRef.current = !playingRef.current
      if (playingRef.current) {
        stepRef.current = -1
        lastStepTimeRef.current = Date.now()
      }
      return
    }

    // Check grid pads
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < STEPS; col++) {
        const x = offsetX + col * (padSize + gap)
        const y = offsetY + row * (padSize + gap)
        if (clientX >= x && clientX <= x + padSize && clientY >= y && clientY <= y + padSize) {
          gridRef.current[row][col] = !gridRef.current[row][col]
          // Trigger sound immediately
          if (gridRef.current[row][col] && audioRef.current) {
            DRUM_FNS[row](audioRef.current, audioRef.current.currentTime)
            flashRef.current.push({ row, col, t: Date.now() })
          }
          return
        }
      }
    }
  }, [getLayout])

  return (
    <canvas
      ref={canvasRef}
      onClick={(e) => handleTap(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        e.preventDefault()
        handleTap(e.touches[0].clientX, e.touches[0].clientY)
      }}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'pointer',
        touchAction: 'none',
      }}
    />
  )
}
