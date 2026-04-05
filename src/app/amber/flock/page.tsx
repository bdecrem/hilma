'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'

const NUM_BOIDS = 280
const MAX_SPEED = 2.8
const MAX_FORCE = 0.08
const PERCEPTION = 80
const TRAIL_LEN = 16

interface Boid {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  trail: { x: number; y: number }[]
  size: number
}

export default function FlockPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0, H = 0
    let boids: Boid[] = []
    let pointer = { x: -999, y: -999, active: false, scatter: false }
    let animId: number

    const [bg1, bg2] = pickGradientColors('flock')

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.scale(dpr, dpr)
      if (boids.length === 0) initBoids()
    }

    function initBoids() {
      boids = []
      for (let i = 0; i < NUM_BOIDS; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = MAX_SPEED * (0.5 + Math.random() * 0.5)
        boids.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: CITRUS[i % CITRUS.length],
          trail: [],
          size: 3 + Math.random() * 2,
        })
      }
    }

    function limit(vx: number, vy: number, max: number): [number, number] {
      const m = Math.sqrt(vx * vx + vy * vy)
      if (m > max) return [vx / m * max, vy / m * max]
      return [vx, vy]
    }

    function setMag(vx: number, vy: number, mag: number): [number, number] {
      const m = Math.sqrt(vx * vx + vy * vy)
      if (m === 0) return [0, 0]
      return [vx / m * mag, vy / m * mag]
    }

    function updateBoid(b: Boid, neighbors: Boid[]) {
      // Separation
      let sx = 0, sy = 0, sc = 0
      // Alignment
      let ax = 0, ay = 0, ac = 0
      // Cohesion
      let cx = 0, cy = 0, cc = 0

      for (const other of neighbors) {
        const dx = b.x - other.x
        const dy = b.y - other.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d === 0) continue

        // Separation — avoid too close
        if (d < 28) {
          sx += dx / (d * d)
          sy += dy / (d * d)
          sc++
        }
        // Alignment
        ax += other.vx
        ay += other.vy
        ac++
        // Cohesion
        cx += other.x
        cy += other.y
        cc++
      }

      let fx = 0, fy = 0

      if (sc > 0) {
        const [tsx, tsy] = setMag(sx, sy, MAX_SPEED)
        let [sfx, sfy] = [tsx - b.vx, tsy - b.vy]
        ;[sfx, sfy] = limit(sfx, sfy, MAX_FORCE)
        fx += sfx * 1.5
        fy += sfy * 1.5
      }
      if (ac > 0) {
        ax /= ac; ay /= ac
        const [tax, tay] = setMag(ax, ay, MAX_SPEED)
        let [afx, afy] = [tax - b.vx, tay - b.vy]
        ;[afx, afy] = limit(afx, afy, MAX_FORCE)
        fx += afx
        fy += afy
      }
      if (cc > 0) {
        cx /= cc; cy /= cc
        let [dcx, dcy] = [cx - b.x, cy - b.y]
        ;[dcx, dcy] = setMag(dcx, dcy, MAX_SPEED)
        let [cfx, cfy] = [dcx - b.vx, dcy - b.vy]
        ;[cfx, cfy] = limit(cfx, cfy, MAX_FORCE)
        fx += cfx
        fy += cfy
      }

      // Pointer influence
      if (pointer.active) {
        const dx = b.x - pointer.x
        const dy = b.y - pointer.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 150 && d > 0) {
          const strength = (150 - d) / 150
          if (pointer.scatter) {
            // scatter away
            fx += (dx / d) * MAX_FORCE * 8 * strength
            fy += (dy / d) * MAX_FORCE * 8 * strength
          } else {
            // attract toward
            fx -= (dx / d) * MAX_FORCE * 4 * strength
            fy -= (dy / d) * MAX_FORCE * 4 * strength
          }
        }
      }

      b.vx += fx
      b.vy += fy
      ;[b.vx, b.vy] = limit(b.vx, b.vy, MAX_SPEED)

      // Ensure minimum speed
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
      if (speed < 0.5) {
        b.vx = (Math.random() - 0.5) * MAX_SPEED
        b.vy = (Math.random() - 0.5) * MAX_SPEED
      }

      b.trail.push({ x: b.x, y: b.y })
      if (b.trail.length > TRAIL_LEN) b.trail.shift()

      b.x += b.vx
      b.y += b.vy

      // Wrap
      if (b.x < -10) b.x = W + 10
      if (b.x > W + 10) b.x = -10
      if (b.y < -10) b.y = H + 10
      if (b.y > H + 10) b.y = -10
    }

    function getNeighbors(b: Boid): Boid[] {
      const result: Boid[] = []
      for (const other of boids) {
        if (other === b) continue
        const dx = b.x - other.x
        const dy = b.y - other.y
        if (dx * dx + dy * dy < PERCEPTION * PERCEPTION) {
          result.push(other)
        }
      }
      return result
    }

    function draw() {
      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Update boids
      for (const b of boids) {
        updateBoid(b, getNeighbors(b))
      }

      // Draw trails
      for (const b of boids) {
        if (b.trail.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(b.trail[0].x, b.trail[0].y)
        for (let i = 1; i < b.trail.length; i++) {
          ctx.lineTo(b.trail[i].x, b.trail[i].y)
        }
        ctx.strokeStyle = b.color + '55'
        ctx.lineWidth = b.size * 0.6
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      // Draw boids as pointed teardrops
      for (const b of boids) {
        const angle = Math.atan2(b.vy, b.vx)
        const s = b.size

        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(angle)

        // Body
        ctx.beginPath()
        ctx.moveTo(s * 2.5, 0)
        ctx.bezierCurveTo(s * 0.5, -s, -s * 1.5, -s * 0.7, -s * 1.5, 0)
        ctx.bezierCurveTo(-s * 1.5, s * 0.7, s * 0.5, s, s * 2.5, 0)
        ctx.fillStyle = b.color
        ctx.fill()

        // Wing glint
        ctx.beginPath()
        ctx.moveTo(s * 1.5, 0)
        ctx.bezierCurveTo(s * 0.8, -s * 0.4, s * 0.2, -s * 0.4, 0, 0)
        ctx.strokeStyle = '#FFFFFF88'
        ctx.lineWidth = 0.7
        ctx.stroke()

        ctx.restore()
      }

      // Amber watermark
      ctx.fillStyle = AMBER + '40'
      ctx.font = '11px monospace'
      ctx.fillText('amber', W - 52, H - 14)

      // Pointer ripple when active
      if (pointer.active) {
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 60, 0, Math.PI * 2)
        ctx.strokeStyle = pointer.scatter ? '#FF4E5044' : '#F9D42344'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      animId = requestAnimationFrame(draw)
    }

    // Input handlers
    function getPos(e: { clientX: number; clientY: number }): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    function onMouseMove(e: MouseEvent) {
      const p = getPos(e)
      pointer.x = p.x; pointer.y = p.y; pointer.active = true
      pointer.scatter = e.buttons > 0
    }
    function onMouseLeave() { pointer.active = false }
    function onMouseDown(e: MouseEvent) {
      pointer.scatter = true
      const p = getPos(e)
      pointer.x = p.x; pointer.y = p.y
    }
    function onMouseUp() { pointer.scatter = false }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      const t = e.touches[0]
      const p = getPos(t)
      pointer.x = p.x; pointer.y = p.y; pointer.active = true
    }
    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      const t = e.touches[0]
      const p = getPos(t)
      pointer.x = p.x; pointer.y = p.y
      pointer.active = true; pointer.scatter = true
    }
    function onTouchEnd() { pointer.scatter = false; pointer.active = false }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    window.addEventListener('resize', resize)
    resize()
    draw()

    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <main
      style={{
        width: '100dvw',
        height: '100dvh',
        overflow: 'hidden',
        background: '#FC913A',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />
    </main>
  )
}
