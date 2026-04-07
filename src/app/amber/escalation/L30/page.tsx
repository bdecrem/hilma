'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// L30 — The Butterfly
// Lorenz chaotic attractor in 3D perspective projection.
// 600 particles trace the famous butterfly shape simultaneously.
// Drag to rotate in 3D. Tap to scatter. Ambient drone required from L30.

const N = 600
const SIGMA = 10, RHO = 28, BETA = 8 / 3
const DT = 0.006
const FADE = 0.018   // low = longer trails

// Citrus: velocity-mapped, fast = lime/mango, slow = coral/tangerine
const COLS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

type P3 = [number, number, number]

function lorenzStep([x, y, z]: P3): P3 {
  return [
    x + SIGMA * (y - x) * DT,
    y + (x * (RHO - z) - y) * DT,
    z + (x * y - BETA * z) * DT,
  ]
}

function lorenzVelMag([x, y, z]: P3): number {
  const dx = SIGMA * (y - x)
  const dy = x * (RHO - z) - y
  const dz = x * y - BETA * z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function velToColor(v: number): string {
  const t = Math.min(v / 40, 1)
  return COLS[Math.floor(t * (COLS.length - 1))]
}

export default function L30() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const [bg1] = pickGradientColors('L30')   // '#FC913A' tangerine

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

    // 3D rotation
    let rotX = -0.35
    let rotY = 0.5

    const project = ([x, y, z]: P3): [number, number] => {
      // Center attractor (natural center is ~0,0,25)
      const scale = Math.min(W, H) / 55
      const cx = x * scale
      const cy = y * scale
      const cz = (z - 25) * scale

      // Rotate Y
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY)
      const rx = cx * cosY + cz * sinY
      const rz = -cx * sinY + cz * cosY

      // Rotate X
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX)
      const ry = cy * cosX - rz * sinX
      const rz2 = cy * sinX + rz * cosX

      // Perspective projection
      const fov = 520
      const p = fov / (fov + rz2 + 100)

      return [W / 2 + rx * p, H / 2 - ry * p]
    }

    // Particle state
    let particles: P3[] = []
    let prevParticles: P3[] = []

    const initParticles = () => {
      particles = []
      prevParticles = []
      for (let i = 0; i < N; i++) {
        const p: P3 = [
          0.1 + (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 1.5,
          25 + (Math.random() - 0.5) * 1.5,
        ]
        particles.push(p)
        prevParticles.push([...p])
      }
    }
    initParticles()

    // Audio — ambient filtered drone, required at L30
    let audioCtx: AudioContext | null = null
    let droneOsc: OscillatorNode | null = null
    let filterNode: BiquadFilterNode | null = null
    let gainNode: GainNode | null = null

    const startAudio = () => {
      if (audioCtx) return
      try {
        audioCtx = new AudioContext()
        droneOsc = audioCtx.createOscillator()
        filterNode = audioCtx.createBiquadFilter()
        gainNode = audioCtx.createGain()
        droneOsc.connect(filterNode)
        filterNode.connect(gainNode)
        gainNode.connect(audioCtx.destination)
        droneOsc.type = 'sawtooth'
        filterNode.type = 'lowpass'
        filterNode.frequency.value = 180
        filterNode.Q.value = 3
        droneOsc.frequency.value = 55     // low A
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
        gainNode.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 2)
        droneOsc.start()
      } catch {}
    }

    // Drag to rotate
    let dragging = false
    let lastMX = 0, lastMY = 0
    let dragDist = 0

    const onDown = (clientX: number, clientY: number) => {
      dragging = true
      lastMX = clientX; lastMY = clientY; dragDist = 0
      startAudio()
    }
    const onMove = (clientX: number, clientY: number) => {
      if (!dragging) return
      const dx = clientX - lastMX, dy = clientY - lastMY
      rotY += dx * 0.006
      rotX += dy * 0.006
      dragDist += Math.abs(dx) + Math.abs(dy)
      lastMX = clientX; lastMY = clientY
    }
    const onUp = () => {
      if (dragDist < 8) {
        // Was a tap — scatter and reinit
        initParticles()
        ctx.fillStyle = bg1
        ctx.globalAlpha = 0.6
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
      }
      dragging = false
    }

    canvas.addEventListener('mousedown', e => onDown(e.clientX, e.clientY))
    canvas.addEventListener('mousemove', e => onMove(e.clientX, e.clientY))
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseleave', () => { dragging = false })

    canvas.addEventListener('touchstart', e => {
      e.preventDefault()
      onDown(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', e => {
      e.preventDefault()
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchend', e => {
      e.preventDefault()
      onUp()
    }, { passive: false })

    let raf: number
    let frame = 0

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Fade toward bg
      ctx.fillStyle = bg1
      ctx.globalAlpha = FADE
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1

      // Slow auto-rotation when not dragging
      if (!dragging) rotY += 0.0006

      // Step particles and draw segments
      for (let i = 0; i < N; i++) {
        prevParticles[i] = particles[i]
        particles[i] = lorenzStep(particles[i])

        const vel = lorenzVelMag(prevParticles[i])
        const [px, py] = project(prevParticles[i])
        const [sx, sy] = project(particles[i])

        ctx.strokeStyle = velToColor(vel)
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 0.85
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Modulate drone: avg z of particles → pitch + filter
      if (audioCtx && droneOsc && filterNode) {
        let sumZ = 0
        for (const p of particles) sumZ += p[2]
        const avgZ = sumZ / N
        const t = Math.max(0, Math.min((avgZ - 5) / 45, 1))
        droneOsc.frequency.setTargetAtTime(40 + t * 70, audioCtx.currentTime, 1.5)
        filterNode.frequency.setTargetAtTime(120 + t * 380, audioCtx.currentTime, 1.5)
      }

      // Label
      ctx.font = '11px monospace'
      ctx.fillStyle = '#FFF8E7'
      ctx.globalAlpha = 0.35
      ctx.fillText('lorenz attractor · drag to rotate · tap to scatter', 12, H - 12)
      ctx.globalAlpha = 1

      // Intro text
      if (frame < 200) {
        const a = Math.max(0, 1 - frame / 200) * 0.45
        ctx.globalAlpha = a
        ctx.fillStyle = '#FFF8E7'
        ctx.font = `${Math.min(W * 0.06, 22)}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText('the butterfly of chaos', W / 2, H / 2)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    // Initial fill
    ctx.fillStyle = bg1
    ctx.fillRect(0, 0, W, H)

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      droneOsc?.stop()
      audioCtx?.close()
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
        cursor: 'grab',
        touchAction: 'none',
        background: '#FC913A',
      }}
    />
  )
}
