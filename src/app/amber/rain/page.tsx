'use client'

import { useEffect, useRef } from 'react'

// RAIN — unicode rainfall. touch to splash.

const MIST = '⠁⠂⠄⠈⠐⠠'.split('')
const DRIZZLE = '│┃╎╏┆┇'.split('')
const HEAVY = '▏▎▍▌▋▊▉█'.split('')
const SPLASH = '░▒▓·∘○◌◦⊙'.split('')
const PUDDLE = '~≈≋∼∽∾'.split('')

interface Drop {
  col: number
  row: number
  speed: number
  char: string
  alpha: number
  weight: number // 0=mist, 1=drizzle, 2=heavy
}

interface Ripple {
  col: number
  row: number
  radius: number
  maxRadius: number
  alpha: number
}

export default function Rain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const CELL = 14
    let cols = 0, rows = 0
    const drops: Drop[] = []
    const ripples: Ripple[] = []
    const puddle: number[] = [] // shimmer phase per column
    let intensity = 0.3 // 0-1, cycles over time

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      cols = Math.floor(w / CELL)
      rows = Math.floor(h / CELL)
      puddle.length = 0
      for (let i = 0; i < cols; i++) puddle.push(Math.random() * Math.PI * 2)
    }
    resize()
    window.addEventListener('resize', resize)

    const addDrop = () => {
      const r = Math.random()
      let weight: number, chars: string[], speed: number, alpha: number
      if (r < 0.5) { weight = 0; chars = MIST; speed = 0.3 + Math.random() * 0.3; alpha = 0.15 + Math.random() * 0.15 }
      else if (r < 0.85) { weight = 1; chars = DRIZZLE; speed = 0.5 + Math.random() * 0.5; alpha = 0.25 + Math.random() * 0.2 }
      else { weight = 2; chars = HEAVY; speed = 0.8 + Math.random() * 0.7; alpha = 0.4 + Math.random() * 0.3 }

      drops.push({
        col: Math.floor(Math.random() * cols),
        row: -1 - Math.random() * 5,
        speed,
        char: chars[Math.floor(Math.random() * chars.length)],
        alpha,
        weight,
      })
    }

    const addSplash = (col: number, row: number) => {
      ripples.push({
        col, row,
        radius: 0,
        maxRadius: 3 + Math.random() * 5,
        alpha: 0.5,
      })
    }

    // Touch splash
    const handleTouch = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect()
      const col = Math.floor((ex - rect.left) / CELL)
      const row = Math.floor((ey - rect.top) / CELL)
      // Big splash
      for (let i = 0; i < 3; i++) {
        ripples.push({
          col: col + Math.floor(Math.random() * 3 - 1),
          row: row + Math.floor(Math.random() * 3 - 1),
          radius: 0,
          maxRadius: 6 + Math.random() * 8,
          alpha: 0.7,
        })
      }
    }

    canvas.addEventListener('click', (e) => handleTouch(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleTouch(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })

    const tick = () => {
      t++
      ctx.fillStyle = '#0A0908'
      ctx.fillRect(0, 0, w, h)

      // Intensity cycles
      intensity = 0.3 + 0.5 * (Math.sin(t * 0.001) * 0.5 + 0.5)

      // Spawn drops based on intensity
      const spawnRate = Math.floor(1 + intensity * 4)
      for (let i = 0; i < spawnRate; i++) addDrop()

      // Update and draw drops
      ctx.font = `${CELL}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      let i = drops.length
      while (i--) {
        const d = drops[i]
        d.row += d.speed

        if (d.row >= rows - 1) {
          // Splash on landing (heavy drops only)
          if (d.weight >= 1 && Math.random() < 0.3) {
            addSplash(d.col, rows - 1)
          }
          drops.splice(i, 1)
          continue
        }

        if (d.row < 0) continue

        // Check if inside any ripple
        let rippleBoost = 0
        for (const r of ripples) {
          const dist = Math.sqrt((d.col - r.col) ** 2 + (d.row - r.row) ** 2)
          if (Math.abs(dist - r.radius) < 1.5) rippleBoost = r.alpha * 0.3
        }

        const x = d.col * CELL + CELL / 2
        const y = Math.floor(d.row) * CELL + CELL / 2
        ctx.fillStyle = `rgba(212, 165, 116, ${d.alpha + rippleBoost})`
        ctx.fillText(d.char, x, y)
      }

      // Update and draw ripples
      let ri = ripples.length
      while (ri--) {
        const r = ripples[ri]
        r.radius += 0.15
        r.alpha -= 0.008

        if (r.alpha <= 0 || r.radius > r.maxRadius) {
          ripples.splice(ri, 1)
          continue
        }

        // Draw ripple as ring of characters
        const circumference = Math.max(4, Math.floor(r.radius * Math.PI * 2))
        for (let a = 0; a < circumference; a++) {
          const angle = (a / circumference) * Math.PI * 2
          const rc = Math.round(r.col + Math.cos(angle) * r.radius)
          const rr = Math.round(r.row + Math.sin(angle) * r.radius)
          if (rc < 0 || rc >= cols || rr < 0 || rr >= rows) continue

          const x = rc * CELL + CELL / 2
          const y = rr * CELL + CELL / 2
          const char = SPLASH[Math.floor(Math.random() * SPLASH.length)]
          ctx.fillStyle = `rgba(45, 149, 150, ${r.alpha * 0.6})`
          ctx.fillText(char, x, y)
        }
      }

      // Puddle shimmer at bottom 2 rows
      for (let c = 0; c < cols; c++) {
        puddle[c] += 0.02 + Math.random() * 0.01
        const shimmer = Math.sin(puddle[c]) * 0.5 + 0.5
        const alpha = 0.05 + shimmer * 0.1 * intensity

        for (let r = rows - 2; r < rows; r++) {
          const char = PUDDLE[Math.floor((puddle[c] + r) * 2 % PUDDLE.length)]
          const x = c * CELL + CELL / 2
          const y = r * CELL + CELL / 2
          ctx.fillStyle = `rgba(45, 149, 150, ${alpha})`
          ctx.fillText(char, x, y)
        }
      }

      // Cap drops array
      if (drops.length > 500) drops.splice(0, drops.length - 500)

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#0A0908' }} />
}
