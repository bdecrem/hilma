'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const N_PARTICLES = 700
const SPEED = 1.5

interface Particle {
  x: number; y: number
  px: number; py: number
  age: number; maxAge: number
  color: string
  alpha: number
}

interface Disturbance {
  x: number; y: number
  r: number; strength: number; life: number; maxLife: number
}

// Layered sin/cos flow field — creates organic, fabric-like currents
function fieldAngle(x: number, y: number, t: number, W: number, H: number): number {
  const nx = (x / W) * Math.PI * 3
  const ny = (y / H) * Math.PI * 3
  return (
    Math.sin(nx * 1.2 + t * 0.35) * Math.PI +
    Math.cos(ny * 1.8 - t * 0.28) * Math.PI * 0.8 +
    Math.sin((nx + ny) * 0.7 + t * 0.18) * Math.PI * 0.5
  )
}

export default function L20() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)
  const disturbancesRef = useRef<Disturbance[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    const particles: Particle[] = []

    const spawnParticle = (): Particle => {
      const x = Math.random() * W
      const y = Math.random() * H
      const color = CITRUS[Math.floor(Math.random() * CITRUS.length)]
      const maxAge = 100 + Math.random() * 140
      return { x, y, px: x, py: y, age: 0, maxAge, color, alpha: 0 }
    }

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      particles.length = 0
      for (let i = 0; i < N_PARTICLES; i++) particles.push(spawnParticle())
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L20')
    let raf: number
    let t = 0
    let frame = 0

    const makeBgGrad = () => {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, bg1)
      g.addColorStop(1, bg2)
      return g
    }

    const draw = () => {
      frame++
      t += 0.008
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Soft fade — particles leave persistent trails
      ctx.globalAlpha = 0.045
      ctx.fillStyle = makeBgGrad()
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1

      // Update + draw disturbances
      const disturbances = disturbancesRef.current
      for (let i = disturbances.length - 1; i >= 0; i--) {
        const d = disturbances[i]
        d.life--
        if (d.life <= 0) { disturbances.splice(i, 1); continue }
        const prog = 1 - d.life / d.maxLife
        const ringR = d.r * Math.min(prog * 3, 1)
        ctx.beginPath()
        ctx.arc(d.x, d.y, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 1.5
        ctx.globalAlpha = (1 - prog) * 0.35
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Update + draw particles
      for (const p of particles) {
        p.age++
        p.px = p.x
        p.py = p.y

        // Field angle at current position
        let angle = fieldAngle(p.x, p.y, t, W, H)

        // Apply disturbance deflection
        for (const d of disturbances) {
          const dx = p.x - d.x
          const dy = p.y - d.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < d.r && dist > 1) {
            const force = (1 - dist / d.r) * d.strength * (d.life / d.maxLife)
            angle += Math.atan2(dy, dx) * force * 0.4
          }
        }

        p.x += Math.cos(angle) * SPEED
        p.y += Math.sin(angle) * SPEED

        // Fade in/out over lifetime
        if (p.age < 25) p.alpha = p.age / 25
        else if (p.age > p.maxAge - 25) p.alpha = (p.maxAge - p.age) / 25
        else p.alpha = 1

        // Wrap edges
        const wrapped =
          (p.px < 2 && p.x > W - 2) || (p.px > W - 2 && p.x < 2) ||
          (p.py < 2 && p.y > H - 2) || (p.py > H - 2 && p.y < 2)

        if (p.x < 0) p.x += W
        if (p.x > W) p.x -= W
        if (p.y < 0) p.y += H
        if (p.y > H) p.y -= H

        if (p.age >= p.maxAge) {
          Object.assign(p, spawnParticle())
          continue
        }

        // Skip draw on wrap-around frame to avoid crossing lines
        if (wrapped) continue

        ctx.beginPath()
        ctx.moveTo(p.px, p.py)
        ctx.lineTo(p.x, p.y)
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.1
        ctx.globalAlpha = p.alpha * 0.55
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Hint text (fades after first interaction)
      if (frame < 280) {
        ctx.globalAlpha = Math.min(1, frame / 60) * (0.22 + Math.sin(frame * 0.04) * 0.06)
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText('tap to disturb the current', W / 2, H - 32)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Drift audio pitch slowly
      if (oscRef.current && audioRef.current) {
        const freq = 55 + Math.sin(t * 0.6) * 12 + Math.cos(t * 0.37) * 8
        oscRef.current.frequency.setTargetAtTime(freq, audioRef.current.currentTime, 1.2)
      }

      raf = requestAnimationFrame(draw)
    }

    const initAudio = () => {
      if (audioRef.current) return
      const ac = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      audioRef.current = ac
      if (ac.state === 'suspended') ac.resume()

      const osc = ac.createOscillator()
      const gain = ac.createGain()
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 180
      filter.Q.value = 2

      osc.type = 'sawtooth'
      osc.frequency.value = 55
      gain.gain.value = 0
      gain.gain.linearRampToValueAtTime(0.05, ac.currentTime + 3)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ac.destination)
      osc.start()
      oscRef.current = osc
    }

    const handleTap = (cx: number, cy: number) => {
      initAudio()
      disturbancesRef.current.push({
        x: cx, y: cy,
        r: 140 + Math.random() * 40,
        strength: 3.5 + Math.random() * 2,
        life: 110, maxLife: 110,
      })
      // Cap disturbances
      if (disturbancesRef.current.length > 12) {
        disturbancesRef.current.splice(0, disturbancesRef.current.length - 12)
      }
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      Array.from(e.touches).forEach(t => handleTap(t.clientX, t.clientY))
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      oscRef.current?.stop()
      audioRef.current?.close()
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
