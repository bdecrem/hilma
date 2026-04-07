'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const PREDATOR_COLOR = '#FF4E50'
const PREY_COLOR = '#B4E33D'
const PLANT_COLOR = '#F9D423'

interface Creature {
  x: number; y: number
  vx: number; vy: number
  type: 'predator' | 'prey' | 'plant'
  energy: number
  size: number
}

function randomDir(speed: number): [number, number] {
  const a = Math.random() * Math.PI * 2
  return [Math.cos(a) * speed, Math.sin(a) * speed]
}

export default function L27() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const creaturesRef = useRef<Creature[]>([])

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
    const [bg1, bg2] = pickGradientColors('L27')
    let raf: number

    // Seed
    const creatures: Creature[] = []
    for (let i = 0; i < 30; i++) {
      creatures.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: 0, vy: 0, type: 'plant', energy: 100,
        size: 4 + Math.random() * 3,
      })
    }
    for (let i = 0; i < 20; i++) {
      const [vx, vy] = randomDir(1)
      creatures.push({
        x: Math.random() * W, y: Math.random() * H,
        vx, vy, type: 'prey', energy: 80,
        size: 5,
      })
    }
    for (let i = 0; i < 8; i++) {
      const [vx, vy] = randomDir(1.5)
      creatures.push({
        x: Math.random() * W, y: Math.random() * H,
        vx, vy, type: 'predator', energy: 100,
        size: 7,
      })
    }
    creaturesRef.current = creatures

    let frame = 0
    let spawnPlantTimer = 0

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const c = creaturesRef.current

      // Spawn plants periodically
      spawnPlantTimer++
      if (spawnPlantTimer > 30 && c.filter(x => x.type === 'plant').length < 50) {
        spawnPlantTimer = 0
        c.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: 0, vy: 0, type: 'plant', energy: 100,
          size: 4 + Math.random() * 3,
        })
      }

      // Update
      for (let i = c.length - 1; i >= 0; i--) {
        const a = c[i]

        if (a.type !== 'plant') {
          // Move
          a.x += a.vx
          a.y += a.vy

          // Wander
          a.vx += (Math.random() - 0.5) * 0.3
          a.vy += (Math.random() - 0.5) * 0.3

          // Speed limit
          const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy)
          const maxSpd = a.type === 'predator' ? 2.5 : 1.8
          if (spd > maxSpd) { a.vx = (a.vx / spd) * maxSpd; a.vy = (a.vy / spd) * maxSpd }

          // Wrap
          if (a.x < 0) a.x = W
          if (a.x > W) a.x = 0
          if (a.y < 0) a.y = H
          if (a.y > H) a.y = 0

          // Lose energy
          a.energy -= a.type === 'predator' ? 0.15 : 0.08

          // Seek food
          let nearestFood = -1
          let nearestDist = Infinity
          const foodType = a.type === 'predator' ? 'prey' : 'plant'

          for (let j = 0; j < c.length; j++) {
            if (c[j].type !== foodType) continue
            const dx = c[j].x - a.x
            const dy = c[j].y - a.y
            const d = dx * dx + dy * dy
            if (d < nearestDist) { nearestDist = d; nearestFood = j }
          }

          // Steer toward food
          if (nearestFood >= 0 && nearestDist < 15000) {
            const dx = c[nearestFood].x - a.x
            const dy = c[nearestFood].y - a.y
            const d = Math.sqrt(dx * dx + dy * dy)
            const force = a.type === 'predator' ? 0.12 : 0.06
            a.vx += (dx / d) * force
            a.vy += (dy / d) * force
          }

          // Eat if close enough
          if (nearestFood >= 0 && nearestDist < 200) {
            a.energy = Math.min(150, a.energy + 40)
            c.splice(nearestFood, 1)
            if (nearestFood < i) i--
          }

          // Reproduce if enough energy
          if (a.energy > 120 && Math.random() < 0.02) {
            a.energy -= 50
            const [nvx, nvy] = randomDir(a.type === 'predator' ? 1.5 : 1)
            c.push({
              x: a.x + (Math.random() - 0.5) * 20,
              y: a.y + (Math.random() - 0.5) * 20,
              vx: nvx, vy: nvy,
              type: a.type, energy: 60,
              size: a.size,
            })
          }

          // Die if no energy
          if (a.energy <= 0) {
            c.splice(i, 1)
            continue
          }

          // Prey: flee from nearby predators
          if (a.type === 'prey') {
            for (const p of c) {
              if (p.type !== 'predator') continue
              const dx = a.x - p.x
              const dy = a.y - p.y
              const d = dx * dx + dy * dy
              if (d < 8000) {
                const dist = Math.sqrt(d)
                a.vx += (dx / dist) * 0.2
                a.vy += (dy / dist) * 0.2
              }
            }
          }
        }

        // Plants grow
        if (a.type === 'plant') {
          a.size = Math.min(8, a.size + 0.005)
        }
      }

      // Draw
      for (const a of c) {
        const color = a.type === 'predator' ? PREDATOR_COLOR
          : a.type === 'prey' ? PREY_COLOR : PLANT_COLOR

        if (a.type === 'plant') {
          // Star/flower shape
          ctx.fillStyle = color
          ctx.globalAlpha = 0.6
          ctx.beginPath()
          for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2 - Math.PI / 2
            const x = a.x + Math.cos(angle) * a.size
            const y = a.y + Math.sin(angle) * a.size
            if (p === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.fill()
        } else {
          // Circle with direction indicator
          ctx.beginPath()
          ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.globalAlpha = 0.8
          ctx.fill()

          // Direction line
          const angle = Math.atan2(a.vy, a.vx)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(a.x + Math.cos(angle) * a.size * 1.8, a.y + Math.sin(angle) * a.size * 1.8)
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.4
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Population counters
      const preds = c.filter(x => x.type === 'predator').length
      const preys = c.filter(x => x.type === 'prey').length
      const plants = c.filter(x => x.type === 'plant').length

      ctx.font = '11px monospace'
      ctx.globalAlpha = 0.4
      ctx.fillStyle = PREDATOR_COLOR
      ctx.fillText(`predators: ${preds}`, 12, 20)
      ctx.fillStyle = PREY_COLOR
      ctx.fillText(`prey: ${preys}`, 12, 34)
      ctx.fillStyle = PLANT_COLOR
      ctx.fillText(`plants: ${plants}`, 12, 48)
      ctx.globalAlpha = 1

      // Cap total
      if (c.length > 200) {
        // Remove oldest plants
        for (let i = c.length - 1; i >= 0 && c.length > 180; i--) {
          if (c[i].type === 'plant') { c.splice(i, 1) }
        }
      }

      raf = requestAnimationFrame(draw)
    }

    // Tap to spawn
    const handleTap = (cx: number, cy: number) => {
      const third = H / 3
      let type: 'predator' | 'prey' | 'plant'
      if (cy < third) type = 'predator'
      else if (cy < third * 2) type = 'prey'
      else type = 'plant'

      for (let i = 0; i < 5; i++) {
        const [vx, vy] = type === 'plant' ? [0, 0] as [number, number] : randomDir(type === 'predator' ? 1.5 : 1)
        creaturesRef.current.push({
          x: cx + (Math.random() - 0.5) * 30,
          y: cy + (Math.random() - 0.5) * 30,
          vx, vy, type, energy: 80,
          size: type === 'predator' ? 7 : type === 'prey' ? 5 : 5,
        })
      }
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

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
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
