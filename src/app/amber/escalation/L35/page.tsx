'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const NUM_PARTICLES = 2000

interface Particle {
  x: number; y: number
  vx: number; vy: number
}

// Chladni pattern function: cos(n*pi*x/L)*cos(m*pi*y/L) - cos(m*pi*x/L)*cos(n*pi*y/L)
// Particles settle at nodal lines where this equals zero
function chladni(x: number, y: number, n: number, m: number): number {
  return Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y)
       - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y)
}

const MODES: [number, number][] = [
  [1, 2], [2, 3], [3, 4], [1, 4], [2, 5], [3, 5], [4, 5], [1, 6], [3, 7],
]

export default function L35() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const modeRef = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)

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
    const [bg1, bg2] = pickGradientColors('L35')
    let raf: number

    // Init particles randomly
    const particles: Particle[] = []
    for (let i = 0; i < NUM_PARTICLES; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: 0, vy: 0,
      })
    }
    particlesRef.current = particles

    function updateSound() {
      if (!audioRef.current || !oscRef.current) return
      const [n, m] = MODES[modeRef.current]
      // Map mode to frequency
      const freq = 100 + (n * m) * 30
      oscRef.current.frequency.setTargetAtTime(freq, audioRef.current.currentTime, 0.1)
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.globalAlpha = 0.15
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1

      // Full clear periodically
      if (Math.random() < 0.003) {
        ctx.globalAlpha = 1
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      const [n, m] = MODES[modeRef.current]
      const size = Math.min(W, H) * 0.85
      const ox = (W - size) / 2
      const oy = (H - size) / 2

      // Draw plate border
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, size / 2, 0, Math.PI * 2)
      ctx.stroke()

      // Update particles — move toward nodal lines
      for (const p of particles) {
        // Gradient of Chladni function
        const eps = 0.002
        const val = chladni(p.x, p.y, n, m)
        const dx = chladni(p.x + eps, p.y, n, m) - val
        const dy = chladni(p.x, p.y + eps, n, m) - val

        // Move toward zero crossings (nodal lines)
        // Force proportional to value, direction toward zero
        const force = 0.0008
        p.vx -= val * dx * force * 500
        p.vy -= val * dy * force * 500

        // Random vibration (simulates plate vibrating)
        p.vx += (Math.random() - 0.5) * 0.001
        p.vy += (Math.random() - 0.5) * 0.001

        // Damping
        p.vx *= 0.92
        p.vy *= 0.92

        p.x += p.vx
        p.y += p.vy

        // Keep in unit square
        p.x = Math.max(0.01, Math.min(0.99, p.x))
        p.y = Math.max(0.01, Math.min(0.99, p.y))

        // Circular boundary
        const cx = p.x - 0.5
        const cy = p.y - 0.5
        const dist = Math.sqrt(cx * cx + cy * cy)
        if (dist > 0.48) {
          p.x = 0.5 + (cx / dist) * 0.47
          p.y = 0.5 + (cy / dist) * 0.47
          p.vx *= -0.5
          p.vy *= -0.5
        }

        // Draw particle
        const screenX = ox + p.x * size
        const screenY = oy + p.y * size
        const colorIdx = Math.floor(Math.abs(val) * 10) % CITRUS.length

        ctx.beginPath()
        ctx.arc(screenX, screenY, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = CITRUS[colorIdx]
        ctx.globalAlpha = 0.6
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Mode label
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillText(`mode ${n}:${m}`, 12, H - 12)

      // Hint
      ctx.globalAlpha = 0.2
      ctx.textAlign = 'center'
      ctx.font = '13px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText('tap to change frequency', W / 2, H - 25)
      ctx.textAlign = 'start'
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    const handleTap = () => {
      // Init audio on first tap
      if (!audioRef.current) {
        const actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioRef.current = actx

        const osc = actx.createOscillator()
        osc.type = 'sine'
        const gain = actx.createGain()
        gain.gain.value = 0.06
        osc.connect(gain)
        gain.connect(actx.destination)
        osc.start()
        oscRef.current = osc
        gainRef.current = gain
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()

      // Change mode
      modeRef.current = (modeRef.current + 1) % MODES.length

      // Scatter particles for visual reset
      for (const p of particles) {
        p.vx += (Math.random() - 0.5) * 0.02
        p.vy += (Math.random() - 0.5) * 0.02
      }

      // Clear canvas for fresh pattern
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      updateSound()
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
      if (oscRef.current) oscRef.current.stop()
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
