'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const N_SPECIES = 5
const N_EACH = 80       // 400 particles total
const RMAX = 100        // force radius in pixels
const BETA = 0.3        // inner repulsion zone (normalized [0,1])
const MAX_FORCE = 0.22
const FRICTION = 0.85
const MAX_SPEED = 2.5

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  species: number
}

function randomMatrix(): number[][] {
  return Array.from({ length: N_SPECIES }, () =>
    Array.from({ length: N_SPECIES }, () => Math.random() * 2 - 1)
  )
}

// Particle Life force law (Tom Mohr / Jeffrey Ventrella formulation)
// Returns a signed force magnitude: positive = attract, negative = repel
function pForce(r: number, alpha: number): number {
  if (r < BETA) return r / BETA - 1               // universal short-range repulsion
  if (r < 1)   return alpha * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA))
  return 0
}

export default function L36() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const matrixRef = useRef<number[][]>([])
  const audioRef  = useRef<AudioContext | null>(null)
  const droneRef  = useRef<OscillatorNode | null>(null)

  useEffect(() => {
    matrixRef.current = randomMatrix()

    const canvas = canvasRef.current
    if (!canvas) return
    const el = canvas  // non-null reference for closures

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      el.width  = W * dpr
      el.height = H * dpr
      el.style.width  = W + 'px'
      el.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = el.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L36')

    // Scatter particles randomly across the screen
    const particles: Particle[] = []
    for (let s = 0; s < N_SPECIES; s++) {
      for (let i = 0; i < N_EACH; i++) {
        particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, species: s })
      }
    }

    // One physics step — O(N²) pair interactions with toroidal wrap
    function step() {
      const matrix = matrixRef.current
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        let fx = 0, fy = 0

        for (let j = 0; j < particles.length; j++) {
          if (i === j) continue
          const b = particles[j]

          // Toroidal shortest-path distance
          let dx = b.x - a.x
          let dy = b.y - a.y
          if (dx >  W / 2) dx -= W
          else if (dx < -W / 2) dx += W
          if (dy >  H / 2) dy -= H
          else if (dy < -H / 2) dy += H

          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist === 0 || dist >= RMAX) continue

          const r = dist / RMAX
          const f = pForce(r, matrix[a.species][b.species]) * MAX_FORCE
          fx += (dx / dist) * f
          fy += (dy / dist) * f
        }

        a.vx = (a.vx + fx) * FRICTION
        a.vy = (a.vy + fy) * FRICTION

        // Speed cap
        const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy)
        if (spd > MAX_SPEED) { a.vx = (a.vx / spd) * MAX_SPEED; a.vy = (a.vy / spd) * MAX_SPEED }
      }

      // Integrate positions — toroidal wrapping
      for (const p of particles) {
        p.x = (p.x + p.vx + W) % W
        p.y = (p.y + p.vy + H) % H
      }
    }

    function avgSpeed(): number {
      let sum = 0
      for (const p of particles) sum += Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      return sum / particles.length
    }

    let raf: number

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Fade trails into background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.globalAlpha = 0.18
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1

      // Two physics steps per frame (smoother at 60fps)
      step()
      step()

      // Draw particles
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = CITRUS[p.species]
        ctx.globalAlpha = 0.85
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Hint
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.textAlign = 'center'
      ctx.fillText('tap to rewrite the rules', W / 2, H - 22)
      ctx.textAlign = 'start'

      // Modulate ambient drone with system energy
      if (audioRef.current && droneRef.current) {
        const freq = 55 + avgSpeed() * 55
        droneRef.current.frequency.setTargetAtTime(freq, audioRef.current.currentTime, 0.8)
      }

      raf = requestAnimationFrame(draw)
    }

    function handleTap() {
      // Init audio on first interaction
      if (!audioRef.current) {
        const ActxClass = window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const actx = new ActxClass()
        audioRef.current = actx

        const osc  = actx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = 80
        const gain = actx.createGain()
        gain.gain.value = 0.04
        osc.connect(gain)
        gain.connect(actx.destination)
        osc.start()
        droneRef.current = osc
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()

      // Rewrite the attraction rules
      matrixRef.current = randomMatrix()

      // Brief white flash to mark the change
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = 'rgba(255,255,255,1)'
      ctx.globalAlpha = 0.35
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }

    el.addEventListener('click', handleTap)
    el.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap()
    }, { passive: false })

    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (droneRef.current) { droneRef.current.stop() }
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
      }}
    />
  )
}
