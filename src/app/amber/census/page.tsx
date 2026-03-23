'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const COUNTERS = [
  { label: 'lies told this second', base: 4291, rate: 127, wobble: 40 },
  { label: 'people who just forgot what they were about to say', base: 12847, rate: 83, wobble: 200 },
  { label: 'chairs currently being sat in wrong', base: 891204553, rate: 2, wobble: 1000 },
  { label: 'tabs open that will never be read', base: 7420000000, rate: 14, wobble: 50000 },
  { label: 'songs stuck in someone\'s head right now', base: 340219, rate: 31, wobble: 800 },
  { label: 'times someone said "i\'m fine" and wasn\'t', base: 891, rate: 210, wobble: 15 },
  { label: 'unfinished novels on laptops', base: 23400812, rate: 0.3, wobble: 50 },
  { label: 'people pretending to understand the conversation', base: 1940000, rate: 7, wobble: 3000 },
  { label: 'socks without a partner', base: 14200000000, rate: 0.8, wobble: 90000 },
  { label: 'déjà vu happening simultaneously', base: 47, rate: 890, wobble: 12 },
  { label: 'emails marked "urgent" that aren\'t', base: 3890412, rate: 44, wobble: 600 },
  { label: 'things in fridges past their best', base: 89100000000, rate: 1.2, wobble: 200000 },
]

interface LiveCounter {
  label: string
  value: number
  displayValue: string
  targetValue: number
  rate: number
  wobble: number
  freeze: number // frames remaining frozen
  spike: number // spike animation remaining
  y: number
  opacity: number
}

function formatNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + 'b'
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'm'
  if (n >= 1e4) return n.toLocaleString('en-US')
  return Math.floor(n).toString()
}

export default function Census() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const countersRef = useRef<LiveCounter[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      // Position counters
      const spacing = h / (COUNTERS.length + 1)
      countersRef.current = COUNTERS.map((c, i) => ({
        label: c.label,
        value: c.base + Math.random() * c.wobble,
        displayValue: formatNum(c.base),
        targetValue: c.base,
        rate: c.rate,
        wobble: c.wobble,
        freeze: 0,
        spike: 0,
        y: spacing * (i + 1),
        opacity: 0,
      }))
    }
    resize()
    window.addEventListener('resize', resize)

    // Tap to spike
    const handleClick = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect()
      const cy = (e instanceof MouseEvent ? e.clientY : e.clientY) - rect.top
      let closest: LiveCounter | null = null
      let closestDist = Infinity
      for (const c of countersRef.current) {
        const d = Math.abs(c.y - cy)
        if (d < closestDist) { closestDist = d; closest = c }
      }
      if (closest && closestDist < 60) {
        closest.spike = 60
        closest.value += closest.wobble * 5
        closest.targetValue += closest.wobble * 3
      }
    }
    canvas.addEventListener('click', (e) => handleClick(e))
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e.touches[0]) }, { passive: false })

    const tick = () => {
      t++
      ctx.fillStyle = '#0A0908'
      ctx.fillRect(0, 0, w, h)

      for (const c of countersRef.current) {
        // Fade in
        c.opacity = Math.min(1, c.opacity + 0.008)

        // Random freeze
        if (c.freeze > 0) {
          c.freeze--
        } else {
          if (Math.random() < 0.002) c.freeze = Math.floor(20 + Math.random() * 80)

          // Wobble the value
          c.targetValue += (Math.random() - 0.48) * c.rate * 0.1
          c.value += (c.targetValue - c.value) * 0.05
          c.value += (Math.random() - 0.5) * c.wobble * 0.02
        }

        // Spike decay
        if (c.spike > 0) {
          c.spike--
          c.value += c.wobble * 0.3 * (c.spike / 60)
        }

        c.displayValue = formatNum(c.value)

        // Draw number
        const spikeGlow = c.spike / 60
        const freezeFlicker = c.freeze > 0 ? (Math.sin(t * 0.5) > 0 ? 0.3 : 0.6) : 0
        const alpha = c.opacity * (0.7 + spikeGlow * 0.3 + freezeFlicker)

        // Number — right aligned
        const numX = w * 0.62
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        const fontSize = Math.min(32, w * 0.04)
        ctx.font = `${fontSize}px monospace`
        ctx.fillStyle = `rgba(212, 165, 116, ${alpha})`
        if (c.spike > 40) ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`
        ctx.fillText(c.displayValue, numX, c.y)

        // Label — left of number
        ctx.textAlign = 'left'
        ctx.font = `${Math.min(13, w * 0.022)}px monospace`
        ctx.fillStyle = `rgba(212, 165, 116, ${alpha * 0.35})`
        ctx.fillText(c.label, numX + 16, c.y)

        // Subtle pulse line
        const lineAlpha = 0.03 + spikeGlow * 0.08
        ctx.strokeStyle = `rgba(212, 165, 116, ${lineAlpha})`
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(w * 0.05, c.y + fontSize * 0.7)
        ctx.lineTo(w * 0.95, c.y + fontSize * 0.7)
        ctx.stroke()
      }

      // Title
      ctx.textAlign = 'left'
      ctx.font = `${Math.min(10, w * 0.015)}px monospace`
      ctx.fillStyle = `rgba(212, 165, 116, ${Math.min(0.15, t * 0.0002)})`
      ctx.fillText('CENSUS OF INVISIBLE THINGS', w * 0.05, 30)
      ctx.fillStyle = `rgba(212, 165, 116, ${Math.min(0.08, t * 0.0001)})`
      ctx.fillText('tap a number to disturb it', w * 0.05, 48)

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#0A0908' }} />
}
