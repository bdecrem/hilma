'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Wire {
  // Control points for cubic bezier
  x1: number; y1: number
  cx1: number; cy1: number
  cx2: number; cy2: number
  x2: number; y2: number
  color: string
  width: number
  cut: boolean
  cutPoint: number // 0-1 along the curve where it was cut
  cutTime: number
  label: string
  // After cut, the two halves curl
  curlA: number
  curlB: number
}

const LABELS = [
  'supabase', 'postgres', 'session_store', 'redis',
  'amber_state', 'loop_state', 'voice_session', 'trading_inbox',
  'roxi_update', 'alpaca_api', 'persona_table', 'log_entry',
  'cc_inbox', 'creation_log', 'mcp_bridge', 'state_machine',
  'heartbeat', 'persistence', 'infra', 'schema',
  'migration', 'webhook', 'cron_state', 'pubsub',
]

const WIRE_COLORS = [
  '#888888', '#999999', '#777777', '#aaaaaa',
  '#666666', '#7a7a8a', '#8a8a7a', '#909090',
]

// Citrus palette for the warm destination
const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

function distToSegment(px: number, py: number, wire: Wire): { dist: number; t: number } {
  let minDist = Infinity
  let minT = 0
  const steps = 30
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = cubicBezier(t, wire.x1, wire.cx1, wire.cx2, wire.x2)
    const y = cubicBezier(t, wire.y1, wire.cy1, wire.cy2, wire.y2)
    const dx = px - x
    const dy = py - y
    const d = dx * dx + dy * dy
    if (d < minDist) { minDist = d; minT = t }
  }
  return { dist: Math.sqrt(minDist), t: minT }
}

export default function Shed() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wiresRef = useRef<Wire[]>([])
  const progressRef = useRef(0) // 0 = tangled, 1 = all cut
  const frameRef = useRef(0)
  const cursorVisibleRef = useRef(false)
  const sparkRef = useRef<{ x: number; y: number; t: number; color: string }[]>([])

  const initWires = useCallback((w: number, h: number) => {
    const wires: Wire[] = []
    const count = 24
    for (let i = 0; i < count; i++) {
      const side = Math.random()
      let x1: number, y1: number, x2: number, y2: number

      if (side < 0.25) {
        // left to right
        x1 = -20; y1 = Math.random() * h
        x2 = w + 20; y2 = Math.random() * h
      } else if (side < 0.5) {
        // top to bottom
        x1 = Math.random() * w; y1 = -20
        x2 = Math.random() * w; y2 = h + 20
      } else if (side < 0.75) {
        // left to bottom
        x1 = -20; y1 = Math.random() * h
        x2 = Math.random() * w; y2 = h + 20
      } else {
        // top to right
        x1 = Math.random() * w; y1 = -20
        x2 = w + 20; y2 = Math.random() * h
      }

      // Tangled control points — cross over the center
      const cx1 = w * 0.2 + Math.random() * w * 0.6
      const cy1 = h * 0.2 + Math.random() * h * 0.6
      const cx2 = w * 0.2 + Math.random() * w * 0.6
      const cy2 = h * 0.2 + Math.random() * h * 0.6

      wires.push({
        x1, y1, cx1, cy1, cx2, cy2, x2, y2,
        color: WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)],
        width: 1.5 + Math.random() * 2.5,
        cut: false,
        cutPoint: 0.5,
        cutTime: 0,
        label: LABELS[i % LABELS.length],
        curlA: (Math.random() - 0.5) * 200,
        curlB: (Math.random() - 0.5) * 200,
      })
    }
    wiresRef.current = wires
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      if (wiresRef.current.length === 0) initWires(w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    let raf: number

    const draw = () => {
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.save()
      ctx.scale(dpr, dpr)

      frameRef.current++
      const frame = frameRef.current

      // Progress = fraction of wires cut
      const wires = wiresRef.current
      const cutCount = wires.filter(w => w.cut).length
      const targetProgress = cutCount / wires.length
      progressRef.current = lerp(progressRef.current, targetProgress, 0.02)
      const p = progressRef.current

      // Background: grey → warm citrus gradient
      const bg1R = lerp(40, 255, p), bg1G = lerp(40, 236, p), bg1B = lerp(48, 210, p)
      const bg2R = lerp(35, 255, p), bg2G = lerp(35, 253, p), bg2B = lerp(42, 231, p)
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, `rgb(${bg1R},${bg1G},${bg1B})`)
      grad.addColorStop(1, `rgb(${bg2R},${bg2G},${bg2B})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // Draw wires
      const now = Date.now()
      for (const wire of wires) {
        ctx.lineWidth = wire.width
        ctx.lineCap = 'round'

        if (!wire.cut) {
          // Alive wire — subtle sway
          const sway = Math.sin(frame * 0.01 + wiresRef.current.indexOf(wire)) * 2
          ctx.strokeStyle = wire.color
          ctx.globalAlpha = 1 - p * 0.3
          ctx.beginPath()
          ctx.moveTo(wire.x1, wire.y1)
          ctx.bezierCurveTo(
            wire.cx1 + sway, wire.cy1 - sway,
            wire.cx2 - sway, wire.cy2 + sway,
            wire.x2, wire.y2
          )
          ctx.stroke()

          // Label at midpoint
          if (p < 0.9) {
            const mx = cubicBezier(0.5, wire.x1, wire.cx1, wire.cx2, wire.x2)
            const my = cubicBezier(0.5, wire.y1, wire.cy1, wire.cy2, wire.y2)
            ctx.globalAlpha = 0.5 * (1 - p)
            ctx.font = '10px monospace'
            ctx.fillStyle = '#bbbbbb'
            ctx.fillText(wire.label, mx + 5, my - 5)
          }
        } else {
          // Cut wire — two halves curling away
          const elapsed = (now - wire.cutTime) / 1000
          const fade = Math.max(0, 1 - elapsed * 0.4)
          if (fade <= 0) continue

          const curlAmount = Math.min(elapsed * 3, 1)
          const t = wire.cutPoint

          // Draw first half (start to cut point)
          ctx.strokeStyle = wire.color
          ctx.globalAlpha = fade * 0.6
          ctx.beginPath()
          // Simple: draw from start, curling the end down
          const endX = cubicBezier(t, wire.x1, wire.cx1, wire.cx2, wire.x2)
          const endY = cubicBezier(t, wire.y1, wire.cy1, wire.cy2, wire.y2)
          ctx.moveTo(wire.x1, wire.y1)
          ctx.quadraticCurveTo(
            wire.cx1, wire.cy1,
            endX + wire.curlA * curlAmount,
            endY + 40 * curlAmount
          )
          ctx.stroke()

          // Draw second half
          ctx.beginPath()
          ctx.moveTo(wire.x2, wire.y2)
          ctx.quadraticCurveTo(
            wire.cx2, wire.cy2,
            endX + wire.curlB * curlAmount,
            endY + 50 * curlAmount
          )
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Sparks
      const sparks = sparkRef.current
      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i]
        const age = (now - spark.t) / 1000
        if (age > 0.6) { sparks.splice(i, 1); continue }
        const alpha = 1 - age / 0.6
        const radius = 3 + age * 20
        ctx.beginPath()
        ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = spark.color
        ctx.globalAlpha = alpha * 0.6
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Hint text (fades after first cut)
      if (cutCount === 0) {
        ctx.globalAlpha = 0.3 + Math.sin(frame * 0.03) * 0.1
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '14px monospace'
        ctx.fillStyle = '#999999'
        ctx.fillText('tap a wire to cut it', w / 2, h - 40)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Counter (bottom right, shows remaining)
      if (cutCount > 0 && cutCount < wires.length) {
        const remaining = wires.length - cutCount
        ctx.globalAlpha = 0.4
        ctx.textAlign = 'right'
        ctx.font = '11px monospace'
        ctx.fillStyle = p > 0.5 ? '#666666' : '#888888'
        ctx.fillText(`${remaining} remaining`, w - 20, h - 20)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // When all cut: show blinking cursor
      if (p > 0.97) {
        const blink = Math.floor(frame / 30) % 2 === 0
        cursorVisibleRef.current = blink
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // "here." text
        ctx.globalAlpha = Math.min((p - 0.97) / 0.03, 1)
        ctx.font = '24px monospace'
        ctx.fillStyle = '#2D5A27'
        const text = 'here.'
        const textWidth = ctx.measureText(text).width
        ctx.fillText(text, w / 2, h / 2)

        // Blinking cursor
        if (blink) {
          ctx.fillStyle = '#FF4E50'
          ctx.fillRect(w / 2 + textWidth / 2 + 4, h / 2 - 12, 2, 24)
        }

        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      ctx.restore()
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [initWires])

  const handleTap = useCallback((clientX: number, clientY: number) => {
    const wires = wiresRef.current
    const hitRadius = 30

    let closest: Wire | null = null
    let closestDist = Infinity
    let closestT = 0.5

    for (const wire of wires) {
      if (wire.cut) continue
      const { dist, t } = distToSegment(clientX, clientY, wire)
      if (dist < hitRadius && dist < closestDist) {
        closest = wire
        closestDist = dist
        closestT = t
      }
    }

    if (closest) {
      closest.cut = true
      closest.cutPoint = closestT
      closest.cutTime = Date.now()

      // Spawn sparks at cut point
      const cx = cubicBezier(closestT, closest.x1, closest.cx1, closest.cx2, closest.x2)
      const cy = cubicBezier(closestT, closest.y1, closest.cy1, closest.cy2, closest.y2)
      const color = CITRUS[Math.floor(Math.random() * CITRUS.length)]
      for (let i = 0; i < 3; i++) {
        sparkRef.current.push({
          x: cx + (Math.random() - 0.5) * 10,
          y: cy + (Math.random() - 0.5) * 10,
          t: Date.now(),
          color,
        })
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onClick={(e) => handleTap(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        e.preventDefault()
        const touch = e.touches[0]
        handleTap(touch.clientX, touch.clientY)
      }}
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
