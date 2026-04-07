'use client'

import { useEffect, useRef } from 'react'

const FLAME_CHARS = ['⠁', '⠃', '⠇', '⡇', '⡏', '⣏', '⣿', '↑', '↟', '⇡', '▲', '△', '♦', '◆']
const EMBER_CHARS = ['·', '∘', '○', '◦', '•', '∙', '⁘', '⁙']
const SMOKE_CHARS = ['⠄', '⠂', '⠁', '⠈', '⠐', '⠠', '░', '·']
const LOG_CHARS = ['▓', '▒', '░', '█', '▄', '▀', '▌', '▐']

const FLAME_COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#FF6B81', '#FFD54F']
const EMBER_COLORS = ['#FF4E50', '#FC913A', '#F9D423']
const SMOKE_COLORS = ['#888', '#777', '#666', '#555']

interface Particle {
  x: number; y: number
  vx: number; vy: number
  char: string
  color: string
  size: number
  life: number
  maxLife: number
  type: 'flame' | 'ember' | 'smoke'
}

export default function Fire() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const logsRef = useRef(3)

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
    let raf: number
    let frame = 0

    const fireBaseY = () => H * 0.7
    const fireX = () => W / 2

    function spawnFlame() {
      const spread = 30 + logsRef.current * 12
      particlesRef.current.push({
        x: fireX() + (Math.random() - 0.5) * spread,
        y: fireBaseY() - Math.random() * 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(1.5 + Math.random() * 2.5),
        char: FLAME_CHARS[Math.floor(Math.random() * FLAME_CHARS.length)],
        color: FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)],
        size: 16 + Math.random() * 14,
        life: 0,
        maxLife: 30 + Math.random() * 40,
        type: 'flame',
      })
    }

    function spawnEmber() {
      particlesRef.current.push({
        x: fireX() + (Math.random() - 0.5) * 40,
        y: fireBaseY() - 20 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 2,
        vy: -(2 + Math.random() * 3),
        char: EMBER_CHARS[Math.floor(Math.random() * EMBER_CHARS.length)],
        color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)],
        size: 8 + Math.random() * 6,
        life: 0,
        maxLife: 60 + Math.random() * 80,
        type: 'ember',
      })
    }

    function spawnSmoke() {
      particlesRef.current.push({
        x: fireX() + (Math.random() - 0.5) * 20,
        y: fireBaseY() - 60 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(0.3 + Math.random() * 0.8),
        char: SMOKE_CHARS[Math.floor(Math.random() * SMOKE_CHARS.length)],
        color: SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)],
        size: 14 + Math.random() * 10,
        life: 0,
        maxLife: 80 + Math.random() * 120,
        type: 'smoke',
      })
    }

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background — dark warm ground
      ctx.fillStyle = '#1a1512'
      ctx.fillRect(0, 0, W, H)

      // Subtle warm glow behind fire
      const glowR = 100 + logsRef.current * 30
      const glow = ctx.createRadialGradient(fireX(), fireBaseY() - 30, 0, fireX(), fireBaseY() - 30, glowR)
      glow.addColorStop(0, 'rgba(255,78,80,0.08)')
      glow.addColorStop(0.5, 'rgba(252,145,58,0.04)')
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, W, H)

      // Draw logs
      const logY = fireBaseY()
      const logSpread = 20 + logsRef.current * 8
      ctx.textAlign = 'center'
      for (let i = 0; i < logsRef.current; i++) {
        const lx = fireX() + (i - logsRef.current / 2) * 18 + (Math.sin(i * 2.3) * 8)
        const ly = logY + 5 + (i % 2) * 8
        ctx.font = `${20 + i * 2}px monospace`
        ctx.fillStyle = '#8B5E3C'
        ctx.globalAlpha = 0.8
        const logChar = LOG_CHARS[i % LOG_CHARS.length]
        ctx.fillText(logChar + logChar + logChar, lx, ly)
      }
      // Cross logs
      ctx.font = '18px monospace'
      ctx.fillStyle = '#6B4226'
      ctx.globalAlpha = 0.7
      ctx.fillText('═══════', fireX(), logY + 2)
      ctx.fillText('═════', fireX(), logY + 14)
      ctx.globalAlpha = 1

      // Spawn particles
      const spawnRate = 1 + logsRef.current * 0.5
      if (frame % 2 === 0) for (let i = 0; i < spawnRate; i++) spawnFlame()
      if (frame % 8 === 0) spawnEmber()
      if (frame % 6 === 0) spawnSmoke()

      // Update and draw particles
      const particles = particlesRef.current
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        p.x += p.vx
        p.y += p.vy

        // Flames flicker
        if (p.type === 'flame') {
          p.vx += (Math.random() - 0.5) * 0.4
          p.vy -= 0.02
          // Cycle char
          if (frame % 4 === 0) p.char = FLAME_CHARS[Math.floor(Math.random() * FLAME_CHARS.length)]
        }

        // Embers drift
        if (p.type === 'ember') {
          p.vx += (Math.random() - 0.5) * 0.1
          p.vy += 0.01 // slight gravity
        }

        // Smoke drifts wider
        if (p.type === 'smoke') {
          p.vx += (Math.random() - 0.5) * 0.05
        }

        const progress = p.life / p.maxLife
        const alpha = progress < 0.2 ? progress * 5 : (1 - progress)

        if (alpha <= 0 || p.life > p.maxLife) {
          particles.splice(i, 1)
          continue
        }

        ctx.font = `${p.size}px monospace`
        ctx.fillStyle = p.color
        ctx.globalAlpha = alpha * (p.type === 'smoke' ? 0.3 : 0.7)
        ctx.fillText(p.char, p.x, p.y)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'start'

      // Ground line
      ctx.fillStyle = '#2a2018'
      ctx.fillRect(0, fireBaseY() + 22, W, H)

      // Stars
      if (frame === 1) {
        // Draw once to a persistent layer... or just use deterministic positions
      }
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 137.5) % W)
        const sy = ((i * 73.1) % (fireBaseY() - 80)) + 20
        ctx.fillStyle = '#FFF8E7'
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1
        ctx.font = '6px monospace'
        ctx.fillText('·', sx, sy)
      }
      ctx.globalAlpha = 1

      // Log count
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(255,248,231,0.2)'
      ctx.fillText(`${logsRef.current} logs`, 12, H - 12)

      // Hint
      if (frame < 200) {
        ctx.globalAlpha = Math.max(0, 1 - frame / 200) * 0.3
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,248,231,0.5)'
        ctx.fillText('tap to add a log', W / 2, H - 30)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Cap particles
      if (particles.length > 300) particles.splice(0, particles.length - 250)

      raf = requestAnimationFrame(draw)
    }

    const handleTap = () => {
      logsRef.current = Math.min(12, logsRef.current + 1)
      // Burst of embers
      for (let i = 0; i < 8; i++) spawnEmber()
      for (let i = 0; i < 4; i++) spawnFlame()
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap()
    }, { passive: false })
    canvas.addEventListener('click', handleTap)

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
        cursor: 'pointer',
        touchAction: 'none',
        background: '#1a1512',
      }}
    />
  )
}
