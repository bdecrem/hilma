'use client'

import { useEffect, useRef } from 'react'

export default function Drift() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = window.innerWidth
    let h = window.innerHeight
    canvas.width = w
    canvas.height = h

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w
      canvas.height = h
    }
    window.addEventListener('resize', resize)

    // Citrus palette
    const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

    interface Particle {
      x: number; y: number; vx: number; vy: number
      r: number; color: string; life: number; maxLife: number
    }

    const particles: Particle[] = []
    let mouseX = w / 2, mouseY = h / 2
    let frame = 0

    function spawn(x: number, y: number, count: number) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.3 + Math.random() * 1.5
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 0,
          maxLife: 200 + Math.random() * 300,
        })
      }
    }

    // Initial burst
    for (let i = 0; i < 80; i++) {
      spawn(Math.random() * w, Math.random() * h, 1)
    }

    canvas.addEventListener('pointermove', (e) => {
      mouseX = e.clientX
      mouseY = e.clientY
      spawn(e.clientX, e.clientY, 3)
    })

    canvas.addEventListener('pointerdown', (e) => {
      spawn(e.clientX, e.clientY, 20)
    })

    function draw() {
      frame++
      // Warm cream background with slight fade for trails
      ctx!.fillStyle = 'rgba(255, 248, 231, 0.08)'
      ctx!.fillRect(0, 0, w, h)

      // Auto-spawn slowly
      if (frame % 10 === 0) {
        spawn(
          w * 0.2 + Math.random() * w * 0.6,
          h * 0.2 + Math.random() * h * 0.6,
          1
        )
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++

        if (p.life > p.maxLife) {
          particles.splice(i, 1)
          continue
        }

        // Gentle attraction to mouse
        const dx = mouseX - p.x
        const dy = mouseY - p.y
        const dist = Math.sqrt(dx * dx + dy * dy) + 1
        const force = Math.min(0.15, 50 / (dist * dist))
        p.vx += dx / dist * force
        p.vy += dy / dist * force

        // Slight circular drift
        const angle = Math.atan2(dy, dx)
        p.vx += Math.cos(angle + Math.PI / 2) * 0.02
        p.vy += Math.sin(angle + Math.PI / 2) * 0.02

        // Damping
        p.vx *= 0.995
        p.vy *= 0.995

        p.x += p.vx
        p.y += p.vy

        // Wrap edges
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20

        const alpha = 1 - p.life / p.maxLife
        const pulse = 1 + 0.2 * Math.sin(frame * 0.03 + i)

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2)
        ctx!.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx!.fill()

        // Glow
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r * pulse * 2.5, 0, Math.PI * 2)
        ctx!.fillStyle = p.color + Math.floor(alpha * 40).toString(16).padStart(2, '0')
        ctx!.fill()
      }

      // Connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < 80) {
            const alpha = (1 - d / 80) * 0.15
            ctx!.strokeStyle = `rgba(252, 145, 58, ${alpha})`
            ctx!.lineWidth = 0.5
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }

      requestAnimationFrame(draw)
    }

    // Initial fill
    ctx.fillStyle = '#FFF8E7'
    ctx.fillRect(0, 0, w, h)
    draw()

    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
    />
  )
}
