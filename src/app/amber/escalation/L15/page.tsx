'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

interface StringState {
  y: number
  color: string
  freq: number
  points: number[] // displacement at each point along the string
  velocities: number[]
  damping: number
}

export default function L15Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const [bg1, bg2] = pickGradientColors('L15')

    // Audio context (created on first interaction)
    let audioCtx: AudioContext | null = null
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext()
      return audioCtx
    }

    function playTone(freq: number, amp: number) {
      const ac = ensureAudio()
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(Math.min(0.3, amp * 0.15), ac.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.5)
      osc.connect(gain)
      gain.connect(ac.destination)
      osc.start()
      osc.stop(ac.currentTime + 1.5)
    }

    // Create strings
    const NUM_STRINGS = 8
    const POINTS_PER_STRING = 80
    const PAD = W * 0.08
    const strings: StringState[] = []

    // Pentatonic scale frequencies
    const SCALE = [196, 220, 261.6, 293.7, 329.6, 392, 440, 523.3]

    for (let i = 0; i < NUM_STRINGS; i++) {
      const y = (H / (NUM_STRINGS + 1)) * (i + 1)
      const pts = new Array(POINTS_PER_STRING).fill(0)
      const vels = new Array(POINTS_PER_STRING).fill(0)
      strings.push({
        y,
        color: CITRUS[i % CITRUS.length],
        freq: SCALE[i],
        points: pts,
        velocities: vels,
        damping: 0.997,
      })
    }

    // Pluck a string at a position
    function pluck(s: StringState, normX: number, strength: number) {
      const pluckIdx = Math.floor(normX * POINTS_PER_STRING)
      for (let i = 0; i < POINTS_PER_STRING; i++) {
        const dist = Math.abs(i - pluckIdx) / POINTS_PER_STRING
        if (dist < 0.3) {
          s.points[i] += strength * (1 - dist / 0.3) * 25
        }
      }
      playTone(s.freq, Math.abs(strength))
    }

    // Wave physics step
    function stepString(s: StringState) {
      const tension = 0.4
      const n = s.points.length
      for (let i = 1; i < n - 1; i++) {
        const force = tension * (s.points[i - 1] + s.points[i + 1] - 2 * s.points[i])
        s.velocities[i] += force
        s.velocities[i] *= s.damping
      }
      for (let i = 1; i < n - 1; i++) {
        s.points[i] += s.velocities[i]
      }
      // Clamp endpoints
      s.points[0] = 0
      s.points[n - 1] = 0
    }

    // Interaction
    let dragString: StringState | null = null
    let dragIdx = 0

    function findString(y: number): StringState | null {
      let closest: StringState | null = null
      let minDist = 40
      for (const s of strings) {
        const d = Math.abs(y - s.y)
        if (d < minDist) { minDist = d; closest = s }
      }
      return closest
    }

    canvas.addEventListener('pointerdown', (e) => {
      const s = findString(e.clientY)
      if (s) {
        dragString = s
        const normX = (e.clientX - PAD) / (W - PAD * 2)
        dragIdx = Math.floor(Math.max(0, Math.min(1, normX)) * POINTS_PER_STRING)
        ensureAudio()
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      if (dragString) {
        const dy = e.clientY - dragString.y
        const normX = (e.clientX - PAD) / (W - PAD * 2)
        dragIdx = Math.floor(Math.max(0, Math.min(1, normX)) * POINTS_PER_STRING)
        // Bend string toward finger
        for (let i = Math.max(1, dragIdx - 5); i < Math.min(POINTS_PER_STRING - 1, dragIdx + 5); i++) {
          const dist = Math.abs(i - dragIdx)
          const influence = 1 - dist / 5
          dragString.points[i] = dy * influence
          dragString.velocities[i] = 0
        }
      }
    })

    canvas.addEventListener('pointerup', () => {
      if (dragString) {
        // Release — the wave physics will take over naturally
        const normX = dragIdx / POINTS_PER_STRING
        const amp = Math.abs(dragString.points[dragIdx]) / 25
        if (amp > 0.3) playTone(dragString.freq, Math.min(1, amp))
        dragString = null
      }
    })

    canvas.addEventListener('pointercancel', () => { dragString = null })

    // Quick tap = pluck
    let tapStart = 0
    let tapY = 0
    canvas.addEventListener('pointerdown', (e) => { tapStart = Date.now(); tapY = e.clientY })
    canvas.addEventListener('pointerup', (e) => {
      if (Date.now() - tapStart < 200 && Math.abs(e.clientY - tapY) < 10) {
        const s = findString(e.clientY)
        if (s) {
          const normX = (e.clientX - PAD) / (W - PAD * 2)
          pluck(s, Math.max(0, Math.min(1, normX)), 1)
        }
      }
    })

    let raf: number
    function animate() {
      // Physics
      for (const s of strings) {
        if (s !== dragString) stepString(s)
      }

      // Draw background
      const grad = ctx!.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, W, H)

      // Draw bridge/nut
      ctx!.fillStyle = '#2A221840'
      ctx!.fillRect(PAD - 4, 0, 3, H)
      ctx!.fillRect(W - PAD + 1, 0, 3, H)

      // Draw strings
      for (const s of strings) {
        const segW = (W - PAD * 2) / (POINTS_PER_STRING - 1)

        // String shadow
        ctx!.save()
        ctx!.strokeStyle = '#2A221820'
        ctx!.lineWidth = 4
        ctx!.beginPath()
        for (let i = 0; i < POINTS_PER_STRING; i++) {
          const x = PAD + i * segW
          const y = s.y + s.points[i] + 2
          if (i === 0) ctx!.moveTo(x, y)
          else ctx!.lineTo(x, y)
        }
        ctx!.stroke()
        ctx!.restore()

        // String body
        const maxDisp = Math.max(...s.points.map(Math.abs))
        const lineW = 2 + Math.min(2, maxDisp * 0.05)
        ctx!.strokeStyle = s.color
        ctx!.lineWidth = lineW
        ctx!.lineCap = 'round'
        ctx!.lineJoin = 'round'
        ctx!.beginPath()
        for (let i = 0; i < POINTS_PER_STRING; i++) {
          const x = PAD + i * segW
          const y = s.y + s.points[i]
          if (i === 0) ctx!.moveTo(x, y)
          else ctx!.lineTo(x, y)
        }
        ctx!.stroke()

        // Glow when vibrating
        if (maxDisp > 2) {
          ctx!.save()
          ctx!.globalAlpha = Math.min(0.3, maxDisp * 0.01)
          ctx!.strokeStyle = s.color
          ctx!.lineWidth = lineW + 6
          ctx!.filter = 'blur(4px)'
          ctx!.beginPath()
          for (let i = 0; i < POINTS_PER_STRING; i++) {
            const x = PAD + i * segW
            const y = s.y + s.points[i]
            if (i === 0) ctx!.moveTo(x, y)
            else ctx!.lineTo(x, y)
          }
          ctx!.stroke()
          ctx!.restore()
        }

        // Note label
        const notes = ['G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5']
        ctx!.save()
        ctx!.globalAlpha = 0.25
        ctx!.fillStyle = '#2A2218'
        ctx!.font = `${Math.max(11, W * 0.012)}px system-ui, sans-serif`
        ctx!.textAlign = 'right'
        ctx!.textBaseline = 'middle'
        ctx!.fillText(notes[strings.indexOf(s)], PAD - 14, s.y)
        ctx!.restore()
      }

      // Hint
      const anyVibrating = strings.some(s => Math.max(...s.points.map(Math.abs)) > 1)
      if (!anyVibrating) {
        ctx!.save()
        ctx!.globalAlpha = 0.3 + Math.sin(Date.now() / 700) * 0.1
        ctx!.fillStyle = '#2A2218'
        ctx!.font = `${Math.max(14, W * 0.018)}px system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.fillText('tap or drag the strings', W / 2, H - 30)
        ctx!.restore()
      }

      raf = requestAnimationFrame(animate)
    }

    animate()

    function onResize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
      // Reposition strings
      for (let i = 0; i < NUM_STRINGS; i++) {
        strings[i].y = (H / (NUM_STRINGS + 1)) * (i + 1)
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      audioCtx?.close()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    />
  )
}
