'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// FILAMENT — slime mold transport network
// Physarum polycephalum: the organism that solved the Tokyo rail map.
// Tap to place food. Watch the network grow, connect, optimize.

const COLORS = [
  '#FF4E50', // blood orange
  '#FC913A', // tangerine
  '#F9D423', // mango
  '#B4E33D', // lime
  '#FF6B81', // grapefruit
]

const AMBER = '#D4A574'
const [BG1, BG2] = pickGradientColors('filament')

interface FoodNode {
  x: number
  y: number
  radius: number
  color: string
  pulse: number
}

interface Agent {
  x: number
  y: number
  angle: number
  speed: number
  colorIdx: number
}

interface Filament {
  from: number
  to: number
  strength: number
  age: number
}

export default function FilamentPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number

    const foods: FoodNode[] = []
    const agents: Agent[] = []
    const filaments: Filament[] = []
    // Trail map — stores chemical concentration per cell
    let trailMap: Float32Array
    let trailW = 0, trailH = 0
    const CELL = 4 // trail resolution
    const MAX_AGENTS = 2000
    const SENSOR_DIST = 16
    const SENSOR_ANGLE = Math.PI / 4
    const TURN_SPEED = 0.3
    const DEPOSIT = 0.6
    const DECAY = 0.985
    const DIFFUSE = 0.15

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      trailW = Math.ceil(w / CELL)
      trailH = Math.ceil(h / CELL)
      trailMap = new Float32Array(trailW * trailH)
    }
    resize()
    window.addEventListener('resize', resize)

    // Seed with a few initial food sources
    const addFood = (x: number, y: number) => {
      const color = COLORS[foods.length % COLORS.length]
      foods.push({ x, y, radius: 12, color, pulse: Math.random() * Math.PI * 2 })
      // Spawn agents around the food
      const count = Math.min(80, MAX_AGENTS - agents.length)
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        agents.push({
          x: x + Math.cos(angle) * (8 + Math.random() * 20),
          y: y + Math.sin(angle) * (8 + Math.random() * 20),
          angle: angle + Math.PI + (Math.random() - 0.5) * 1.5,
          speed: 0.8 + Math.random() * 0.8,
          colorIdx: foods.length % COLORS.length,
        })
      }
    }

    // Initial seeds
    addFood(w * 0.3, h * 0.4)
    addFood(w * 0.7, h * 0.6)
    addFood(w * 0.5, h * 0.25)

    // Interaction
    const handleTap = (x: number, y: number) => {
      addFood(x, y)
      // Check for new filament connections
      if (foods.length > 1) {
        const newIdx = foods.length - 1
        for (let i = 0; i < foods.length - 1; i++) {
          filaments.push({ from: i, to: newIdx, strength: 0, age: 0 })
        }
      }
    }

    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect()
      handleTap(e.clientX - r.left, e.clientY - r.top)
    })
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      handleTap(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top)
    }, { passive: false })

    const senseTrail = (x: number, y: number): number => {
      const cx = Math.floor(x / CELL)
      const cy = Math.floor(y / CELL)
      if (cx < 0 || cx >= trailW || cy < 0 || cy >= trailH) return 0
      return trailMap[cy * trailW + cx]
    }

    const depositTrail = (x: number, y: number, amount: number) => {
      const cx = Math.floor(x / CELL)
      const cy = Math.floor(y / CELL)
      if (cx < 0 || cx >= trailW || cy < 0 || cy >= trailH) return
      trailMap[cy * trailW + cx] = Math.min(trailMap[cy * trailW + cx] + amount, 1.0)
    }

    const diffuseTrail = () => {
      const next = new Float32Array(trailW * trailH)
      for (let y = 1; y < trailH - 1; y++) {
        for (let x = 1; x < trailW - 1; x++) {
          const i = y * trailW + x
          let sum = trailMap[i] * (1 - DIFFUSE)
          const neighbors = DIFFUSE / 4
          sum += trailMap[i - 1] * neighbors
          sum += trailMap[i + 1] * neighbors
          sum += trailMap[i - trailW] * neighbors
          sum += trailMap[i + trailW] * neighbors
          next[i] = sum * DECAY
        }
      }
      trailMap = next
    }

    // Add food attraction bias
    const foodAttraction = (x: number, y: number): { ax: number; ay: number } => {
      let ax = 0, ay = 0
      for (const f of foods) {
        const dx = f.x - x
        const dy = f.y - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200 && dist > 5) {
          const force = 0.3 / (dist * 0.1)
          ax += (dx / dist) * force
          ay += (dy / dist) * force
        }
      }
      return { ax, ay }
    }

    const drawBackground = () => {
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, BG1)
      grad.addColorStop(1, BG2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }

    const tick = () => {
      t++

      // Semi-transparent background for trail effect
      drawBackground()
      ctx.fillStyle = `${BG1}18`
      ctx.fillRect(0, 0, w, h)

      // Draw trail map as soft glow
      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data
      for (let cy = 0; cy < trailH; cy++) {
        for (let cx = 0; cx < trailW; cx++) {
          const val = trailMap[cy * trailW + cx]
          if (val > 0.02) {
            const intensity = Math.min(val * 1.5, 1)
            const px = cx * CELL
            const py = cy * CELL
            for (let dy = 0; dy < CELL && py + dy < h; dy++) {
              for (let dx = 0; dx < CELL && px + dx < w; dx++) {
                const i = ((py + dy) * w + (px + dx)) * 4
                // Warm citrus glow: blend tangerine into the background
                data[i] = Math.min(255, data[i] + 252 * intensity * 0.4)
                data[i + 1] = Math.min(255, data[i + 1] + 145 * intensity * 0.25)
                data[i + 2] = Math.max(0, data[i + 2] - 30 * intensity)
              }
            }
          }
        }
      }
      ctx.putImageData(imageData, 0, 0)

      // Update and draw agents
      for (const agent of agents) {
        // Sense in three directions
        const fwd = senseTrail(
          agent.x + Math.cos(agent.angle) * SENSOR_DIST,
          agent.y + Math.sin(agent.angle) * SENSOR_DIST
        )
        const left = senseTrail(
          agent.x + Math.cos(agent.angle - SENSOR_ANGLE) * SENSOR_DIST,
          agent.y + Math.sin(agent.angle - SENSOR_ANGLE) * SENSOR_DIST
        )
        const right = senseTrail(
          agent.x + Math.cos(agent.angle + SENSOR_ANGLE) * SENSOR_DIST,
          agent.y + Math.sin(agent.angle + SENSOR_ANGLE) * SENSOR_DIST
        )

        // Steer toward stronger trail
        if (fwd >= left && fwd >= right) {
          // keep going
        } else if (left > right) {
          agent.angle -= TURN_SPEED
        } else if (right > left) {
          agent.angle += TURN_SPEED
        } else {
          agent.angle += (Math.random() - 0.5) * TURN_SPEED
        }

        // Food attraction
        const { ax, ay } = foodAttraction(agent.x, agent.y)
        agent.angle += Math.atan2(ay, ax) * 0.02

        // Random wander
        agent.angle += (Math.random() - 0.5) * 0.15

        // Move
        agent.x += Math.cos(agent.angle) * agent.speed
        agent.y += Math.sin(agent.angle) * agent.speed

        // Wrap
        if (agent.x < 0) agent.x = w
        if (agent.x > w) agent.x = 0
        if (agent.y < 0) agent.y = h
        if (agent.y > h) agent.y = 0

        // Deposit trail
        depositTrail(agent.x, agent.y, DEPOSIT)

        // Draw agent as tiny dot
        const c = COLORS[agent.colorIdx]
        ctx.fillStyle = c
        ctx.globalAlpha = 0.6
        ctx.fillRect(Math.floor(agent.x), Math.floor(agent.y), 2, 2)
      }
      ctx.globalAlpha = 1

      // Diffuse and decay trail
      if (t % 2 === 0) diffuseTrail()

      // Draw filament connections (where trails are strong between foods)
      for (const fil of filaments) {
        fil.age++
        const a = foods[fil.from]
        const b = foods[fil.to]
        if (!a || !b) continue

        // Sample trail strength along the line
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const steps = Math.floor(dist / CELL)
        let totalStrength = 0
        for (let s = 0; s < steps; s++) {
          const px = a.x + (dx / steps) * s
          const py = a.y + (dy / steps) * s
          totalStrength += senseTrail(px, py)
        }
        fil.strength = steps > 0 ? totalStrength / steps : 0

        // Draw connection if trail is strong enough
        if (fil.strength > 0.05) {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          // Slight curve for organic feel
          const midX = (a.x + b.x) / 2 + Math.sin(t * 0.01 + fil.age * 0.1) * 15
          const midY = (a.y + b.y) / 2 + Math.cos(t * 0.01 + fil.age * 0.1) * 15
          ctx.quadraticCurveTo(midX, midY, b.x, b.y)
          const alpha = Math.min(fil.strength * 0.8, 0.5)
          ctx.strokeStyle = `rgba(252, 145, 58, ${alpha})`
          ctx.lineWidth = 1 + fil.strength * 4
          ctx.stroke()
        }
      }

      // Draw food nodes
      for (const food of foods) {
        food.pulse += 0.03
        const pulseR = food.radius + Math.sin(food.pulse) * 3

        // Outer glow
        ctx.beginPath()
        ctx.arc(food.x, food.y, pulseR + 8, 0, Math.PI * 2)
        ctx.fillStyle = food.color + '20'
        ctx.fill()

        // Main circle
        ctx.beginPath()
        ctx.arc(food.x, food.y, pulseR, 0, Math.PI * 2)
        ctx.fillStyle = food.color
        ctx.fill()

        // Inner highlight
        ctx.beginPath()
        ctx.arc(food.x - 3, food.y - 3, pulseR * 0.4, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fill()
      }

      // Legacy amber dot — center
      ctx.fillStyle = `rgba(212, 165, 116, ${0.15 + Math.sin(t * 0.02) * 0.08})`
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2)
      ctx.fill()

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ touchAction: 'none' }} />
}
