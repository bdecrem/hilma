'use client'

import { useEffect, useRef } from 'react'

const N = 5
// Pentatonic — every combination sounds harmonious
const PITCHES = [261.63, 293.66, 329.63, 392.00, 440.00] // C D E G A
const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const SIZES = [62, 54, 47, 41, 36]

interface Bell {
  angle: number
  vel: number
  size: number
  pitch: number
  color: string
  glow: number // visual flash on chime
}

export default function Chimes() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bellsRef = useRef<Bell[]>([])
  const audioRef = useRef<AudioContext | null>(null)
  const ringOnLoadRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!

    bellsRef.current = Array.from({ length: N }, (_, i) => ({
      angle: 0, vel: 0,
      size: SIZES[i],
      pitch: PITCHES[i],
      color: COLORS[i],
      glow: 0,
    }))

    let beamY = H * 0.16
    let ropeLen = H * 0.45
    function bellSpacing() {
      return Math.min(74, W * 0.16)
    }
    function bellX(i: number) {
      return W / 2 + (i - (N - 1) / 2) * bellSpacing()
    }

    function playChime(pitch: number, intensity: number) {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      const a = audioRef.current
      if (a.state === 'suspended') a.resume()
      const t = a.currentTime
      const vol = Math.min(1, intensity) * 0.16
      // Bell timbre: fundamental + slightly inharmonic partials
      const partials = [
        { freq: pitch, gain: vol, decay: 2.2 },
        { freq: pitch * 2.01, gain: vol * 0.5, decay: 1.3 },
        { freq: pitch * 3.04, gain: vol * 0.25, decay: 0.8 },
        { freq: pitch * 4.13, gain: vol * 0.12, decay: 0.5 },
      ]
      partials.forEach(p => {
        const o = a.createOscillator()
        o.type = 'sine'
        o.frequency.value = p.freq
        const g = a.createGain()
        g.gain.setValueAtTime(p.gain, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay)
        o.connect(g); g.connect(a.destination)
        o.start(t); o.stop(t + p.decay)
      })
    }

    let raf: number
    let frame = 0

    function draw() {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background — warm cathedral vignette
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.75)
      g.addColorStop(0, '#2a1f16')
      g.addColorStop(0.5, '#1a1410')
      g.addColorStop(1, '#0b0806')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      // Beam (wood)
      ctx.fillStyle = '#3a2a1c'
      ctx.fillRect(W * 0.04, beamY - 10, W * 0.92, 18)
      // Beam highlight
      ctx.fillStyle = 'rgba(255, 200, 130, 0.08)'
      ctx.fillRect(W * 0.04, beamY - 10, W * 0.92, 3)
      // Beam shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(W * 0.04, beamY + 5, W * 0.92, 3)

      const bells = bellsRef.current
      for (let i = 0; i < N; i++) {
        const b = bells[i]
        // Pendulum: -g·sin(angle) restoring + damping
        const G = 0.0014
        const prevAngle = b.angle
        b.vel += -G * Math.sin(b.angle) - b.vel * 0.004
        b.angle += b.vel

        // Chime when bell crosses through bottom (angle changes sign) at speed
        if (Math.sign(prevAngle) !== Math.sign(b.angle) && Math.abs(b.vel) > 0.006) {
          playChime(b.pitch, Math.abs(b.vel) * 30)
          b.glow = 1
        }
        b.glow *= 0.9

        // Position
        const px = bellX(i), py = beamY
        const sx = px + Math.sin(b.angle) * ropeLen
        const sy = py + Math.cos(b.angle) * ropeLen

        // Rope (slight curve based on swing)
        ctx.strokeStyle = 'rgba(255,248,231,0.55)'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.stroke()

        // Bell body
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(b.angle)
        const sz = b.size

        // Glow on chime
        if (b.glow > 0.05) {
          const glowGrad = ctx.createRadialGradient(0, sz * 0.3, 0, 0, sz * 0.3, sz * 1.8)
          glowGrad.addColorStop(0, `rgba(255, 220, 150, ${b.glow * 0.4})`)
          glowGrad.addColorStop(1, 'rgba(255, 220, 150, 0)')
          ctx.fillStyle = glowGrad
          ctx.fillRect(-sz * 2, -sz, sz * 4, sz * 3)
        }

        // Bell shape — dome top, flared sides, lip at bottom
        ctx.fillStyle = b.color
        ctx.beginPath()
        ctx.arc(0, 0, sz * 0.55, Math.PI, 0, false) // top dome
        ctx.lineTo(sz * 0.65, 0)
        ctx.quadraticCurveTo(sz * 0.85, sz * 0.55, sz * 0.62, sz * 0.95) // right flare
        ctx.lineTo(-sz * 0.62, sz * 0.95)
        ctx.quadraticCurveTo(-sz * 0.85, sz * 0.55, -sz * 0.65, 0) // left flare
        ctx.closePath()
        ctx.fill()

        // Bell highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.beginPath()
        ctx.ellipse(-sz * 0.25, sz * 0.3, sz * 0.12, sz * 0.4, 0, 0, Math.PI * 2)
        ctx.fill()

        // Bell lip (darker rim at bottom)
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(-sz * 0.62, sz * 0.92, sz * 1.24, 4)

        // Crown ring at top
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(-sz * 0.55, -sz * 0.05, sz * 1.1, 2)

        ctx.restore()
      }

      // Hint
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,248,231,0.3)'
      ctx.textAlign = 'center'
      ctx.fillText('tap a bell to ring it', W / 2, H - 24)

      // Auto-ring one bell after 1s on first load (visual hook)
      if (!ringOnLoadRef.current && frame === 60) {
        ringOnLoadRef.current = true
        bells[2].vel = 0.045
      }

      raf = requestAnimationFrame(draw)
    }

    function handleTap(cx: number, cy: number) {
      const bells = bellsRef.current
      let bestI = -1, bestDist = Infinity
      for (let i = 0; i < N; i++) {
        const px = bellX(i)
        const sx = px + Math.sin(bells[i].angle) * ropeLen
        const sy = beamY + Math.cos(bells[i].angle) * ropeLen
        const d = Math.hypot(cx - sx, cy - sy)
        if (d < bestDist) { bestDist = d; bestI = i }
      }
      if (bestI >= 0 && bestDist < 100) {
        // Push the bell — direction based on tap relative to current bell position
        const px = bellX(bestI)
        const sx = px + Math.sin(bells[bestI].angle) * ropeLen
        const dir = cx > sx ? 1 : -1
        // Add impulse, capped so it doesn't go crazy
        bells[bestI].vel = Math.max(-0.07, Math.min(0.07, bells[bestI].vel + dir * 0.045))
      }
    }

    canvas.addEventListener('pointerdown', e => handleTap(e.clientX, e.clientY))

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
      beamY = H * 0.16
      ropeLen = H * 0.45
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100dvh',
      cursor: 'pointer', touchAction: 'none',
    }} />
  )
}
