'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
// Pentatonic scale — C4 to C6
const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00]

interface Note {
  x: number     // 0-1 horizontal position
  pitch: number // index into SCALE
  color: string
  size: number
  born: number
  rang: boolean
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function playNote(ctx: AudioContext, freq: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(0.25, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.6)
}

export default function L17() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const notesRef = useRef<Note[]>([])
  const frameRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

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
    const [bg1, bg2] = pickGradientColors('L17')
    let raf: number

    // Playhead position — sweeps right to left continuously
    const CYCLE_MS = 4000 // 4 seconds per cycle

    const draw = () => {
      frameRef.current++
      const now = Date.now()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Playhead position (0-1)
      const playhead = (now % CYCLE_MS) / CYCLE_MS

      // Draw faint horizontal pitch lines
      const pitchCount = SCALE.length
      for (let i = 0; i < pitchCount; i++) {
        const y = H * 0.08 + (i / (pitchCount - 1)) * H * 0.84
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }

      // Draw playhead line
      const phX = playhead * W
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(phX, 0)
      ctx.lineTo(phX, H)
      ctx.stroke()

      // Glow at playhead
      const phGrad = ctx.createLinearGradient(phX - 30, 0, phX + 30, 0)
      phGrad.addColorStop(0, 'transparent')
      phGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)')
      phGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = phGrad
      ctx.fillRect(phX - 30, 0, 60, H)

      // Draw and check notes
      const notes = notesRef.current
      const actx = audioRef.current

      for (const note of notes) {
        const nx = note.x * W
        const ny = H * 0.08 + (note.pitch / (pitchCount - 1)) * H * 0.84
        const age = (now - note.born) / 1000

        // Check if playhead just crossed this note
        const prevPlayhead = ((now - 16) % CYCLE_MS) / CYCLE_MS
        const crossed = (prevPlayhead < note.x && playhead >= note.x) ||
                        (prevPlayhead > 0.95 && playhead < 0.05 && note.x < 0.05)

        if (crossed && actx) {
          playNote(actx, SCALE[note.pitch])
          note.rang = true
          // Reset rang after a bit
          setTimeout(() => { note.rang = false }, 300)
        }

        // Draw note
        const baseSize = note.size
        const ringScale = note.rang ? 1.4 : 1
        const r = baseSize * ringScale

        // Glow when ringing
        if (note.rang) {
          ctx.beginPath()
          ctx.arc(nx, ny, r * 3, 0, Math.PI * 2)
          ctx.fillStyle = note.color
          ctx.globalAlpha = 0.15
          ctx.fill()
        }

        // Note body
        ctx.beginPath()
        ctx.arc(nx, ny, r, 0, Math.PI * 2)
        ctx.fillStyle = note.color
        ctx.globalAlpha = note.rang ? 1 : 0.6
        ctx.fill()

        // Inner highlight
        ctx.beginPath()
        ctx.arc(nx - r * 0.2, ny - r * 0.2, r * 0.4, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.globalAlpha = note.rang ? 0.5 : 0.2
        ctx.fill()

        ctx.globalAlpha = 1
      }

      // Hint
      if (notes.length === 0) {
        ctx.globalAlpha = 0.25 + Math.sin(frameRef.current * 0.03) * 0.08
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '14px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText('tap to place notes', W / 2, H - 40)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Clear button (top right)
      if (notes.length > 0) {
        roundedRect(ctx, W - 65, 15, 50, 24, 5)
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('clear', W - 40, 31)
        ctx.textAlign = 'start'
      }

      raf = requestAnimationFrame(draw)
    }

    const handleTap = (clientX: number, clientY: number) => {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()

      // Check clear button
      if (notesRef.current.length > 0 && clientX >= W - 65 && clientX <= W - 15 && clientY >= 15 && clientY <= 39) {
        notesRef.current = []
        return
      }

      // Place a note
      const x = clientX / W
      const pitchCount = SCALE.length
      // Map Y to pitch index (top = high, bottom = low)
      const normalY = (clientY - H * 0.08) / (H * 0.84)
      const pitchIdx = Math.max(0, Math.min(pitchCount - 1, Math.round(normalY * (pitchCount - 1))))

      const note: Note = {
        x,
        pitch: pitchIdx,
        color: CITRUS[pitchIdx % CITRUS.length],
        size: 8 + Math.random() * 6,
        born: Date.now(),
        rang: false,
      }
      notesRef.current.push(note)

      // Play immediately on place
      playNote(audioRef.current, SCALE[pitchIdx])

      // Cap at 50 notes
      if (notesRef.current.length > 50) notesRef.current.shift()
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
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
