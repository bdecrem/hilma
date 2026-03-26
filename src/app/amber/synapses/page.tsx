'use client'

import { useEffect, useRef } from 'react'

// SYNAPSES — a neural mesh. tap a node. watch the thought travel.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#E8585A']

interface Neuron {
  x: number; y: number; charge: number; threshold: number
  connections: number[]; lastFire: number; color: string
}

interface Signal {
  from: number; to: number; progress: number; speed: number
}

export default function Synapses() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let w = c.width = innerWidth, h = c.height = innerHeight
    let t = 0

    const neurons: Neuron[] = []
    const signals: Signal[] = []
    const N = Math.min(50, Math.floor((w * h) / 15000))

    // Place neurons
    for (let i = 0; i < N; i++) {
      neurons.push({
        x: 60 + Math.random() * (w - 120),
        y: 60 + Math.random() * (h - 120),
        charge: 0,
        threshold: 0.7 + Math.random() * 0.3,
        connections: [],
        lastFire: -999,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
    }

    // Connect nearby neurons (3-5 connections each)
    for (let i = 0; i < N; i++) {
      const dists: [number, number][] = []
      for (let j = 0; j < N; j++) {
        if (i === j) continue
        const d = Math.hypot(neurons[i].x - neurons[j].x, neurons[i].y - neurons[j].y)
        dists.push([j, d])
      }
      dists.sort((a, b) => a[1] - b[1])
      const count = 3 + Math.floor(Math.random() * 3)
      neurons[i].connections = dists.slice(0, count).map(d => d[0])
    }

    function fire(idx: number) {
      const n = neurons[idx]
      if (t - n.lastFire < 30) return // refractory period
      n.lastFire = t
      n.charge = 1
      for (const target of n.connections) {
        signals.push({
          from: idx, to: target,
          progress: 0,
          speed: 0.02 + Math.random() * 0.03,
        })
      }
    }

    c.addEventListener('pointerdown', (e) => {
      let closest = 0, minD = Infinity
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(neurons[i].x - e.clientX, neurons[i].y - e.clientY)
        if (d < minD) { minD = d; closest = i }
      }
      if (minD < 120) fire(closest)
    })

    addEventListener('resize', () => { w = c.width = innerWidth; h = c.height = innerHeight })

    function draw() {
      t++
      // Warm cream background with trails
      ctx.fillStyle = 'rgba(255, 248, 231, 0.06)'
      ctx.fillRect(0, 0, w, h)

      // Draw connections (subtle)
      for (let i = 0; i < N; i++) {
        const n = neurons[i]
        for (const j of n.connections) {
          const m = neurons[j]
          ctx.strokeStyle = 'rgba(42, 34, 24, 0.04)'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(n.x, n.y)
          ctx.lineTo(m.x, m.y)
          ctx.stroke()
        }
      }

      // Update and draw signals
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i]
        s.progress += s.speed

        if (s.progress >= 1) {
          // Signal arrived — add charge
          neurons[s.to].charge += 0.4
          if (neurons[s.to].charge >= neurons[s.to].threshold) {
            fire(s.to)
          }
          signals.splice(i, 1)
          continue
        }

        const from = neurons[s.from]
        const to = neurons[s.to]
        const x = from.x + (to.x - from.x) * s.progress
        const y = from.y + (to.y - from.y) * s.progress

        // Signal dot
        const size = 3 + 2 * Math.sin(s.progress * Math.PI)
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle = from.color
        ctx.fill()

        // Signal trail line
        const px = from.x + (to.x - from.x) * Math.max(0, s.progress - 0.15)
        const py = from.y + (to.y - from.y) * Math.max(0, s.progress - 0.15)
        ctx.strokeStyle = from.color + '60'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      // Draw neurons
      for (const n of neurons) {
        n.charge *= 0.97 // decay

        const firing = t - n.lastFire < 15
        const radius = firing ? 8 + 6 * Math.exp(-(t - n.lastFire) * 0.2) : 5 + n.charge * 3
        const alpha = firing ? 1 : 0.3 + n.charge * 0.7

        // Glow
        if (firing || n.charge > 0.2) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, radius * 4, 0, Math.PI * 2)
          const a = firing ? 0.15 : n.charge * 0.08
          ctx.fillStyle = n.color + Math.floor(a * 255).toString(16).padStart(2, '0')
          ctx.fill()
        }

        // Core
        ctx.beginPath()
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = n.color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx.fill()

        // Outline when firing
        if (firing) {
          ctx.strokeStyle = '#2A2218'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // Spontaneous firing (rare)
      if (Math.random() < 0.005) {
        fire(Math.floor(Math.random() * N))
      }

      requestAnimationFrame(draw)
    }

    // Fill initial background
    ctx.fillStyle = '#FFF8E7'
    ctx.fillRect(0, 0, w, h)
    draw()

    return () => {}
  }, [])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', touchAction: 'none', cursor: 'crosshair' }} />
}
