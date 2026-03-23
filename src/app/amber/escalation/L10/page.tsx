'use client'

import { useEffect, useRef } from 'react'

// L10: REUNION — with asymmetry and irregularities.
// Nothing is perfectly centered, perfectly round, or perfectly timed.
// The shapes breathe at different rates, wobble, drift, overshoot.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

// Seeded randomness — same every load but different per shape
function seeded(seed: number) {
  return () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646 }
}

export default function L10() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    let mx = -1, my = -1
    const rng = seeded(42)

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY })
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); mx = e.touches[0].clientX; my = e.touches[0].clientY }, { passive: false })

    let triX = 0, triY = 0
    const drops: { x: number; y: number; vy: number; vx: number; r: number; c: string; settled: boolean; wobble: number }[] = []

    // Each element gets its own slightly off position and timing
    const offsets = Array.from({ length: 20 }, () => ({
      x: (rng() - 0.5) * 40,
      y: (rng() - 0.5) * 30,
      phase: rng() * Math.PI * 2,
      speed: 0.8 + rng() * 0.4,
      scale: 0.85 + rng() * 0.3,
    }))

    const spawnDrop = () => {
      drops.push({
        x: w * 0.65 + (rng() - 0.5) * w * 0.25,
        y: h * 0.05 + rng() * h * 0.08,
        vy: rng() * 0.5, vx: (rng() - 0.5) * 0.8,
        r: 3 + rng() * 8,
        c: COLORS[Math.floor(rng() * COLORS.length)],
        settled: false,
        wobble: rng() * Math.PI * 2,
      })
      if (drops.length > 35) drops.shift()
    }

    const tick = () => {
      t++

      // Gradient bg — asymmetric, not centered
      const grad = ctx.createLinearGradient(w * 0.1, 0, w * 0.8, h)
      grad.addColorStop(0, '#F9D423')
      grad.addColorStop(0.6, '#FCEQ66')
      grad.addColorStop(1, '#FFF8E7')
      ctx.fillStyle = '#F9D423'
      ctx.fillRect(0, 0, w, h)
      // Subtle uneven wash
      const wash = ctx.createRadialGradient(w * 0.35, h * 0.4, 0, w * 0.35, h * 0.4, w * 0.5)
      wash.addColorStop(0, 'rgba(255,248,231,0.15)')
      wash.addColorStop(1, 'rgba(255,248,231,0)')
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2, cy = h / 2
      const unit = Math.min(w, h) * 0.03
      const o = offsets

      // ── L1: breathing circle — NOT centered in its zone, slightly egg-shaped
      const c1x = w * 0.17 + o[0].x + Math.sin(t * 0.003) * 5
      const c1y = h * 0.23 + o[0].y
      const breathA = Math.sin(t * 0.018 + o[0].phase) * 0.25 + 0.8
      const breathB = Math.sin(t * 0.022 + o[0].phase + 0.5) * 0.2 + 0.85
      ctx.beginPath()
      ctx.ellipse(c1x, c1y, unit * breathA * o[0].scale, unit * breathB * o[0].scale, t * 0.001, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[0]
      ctx.fill()

      // ── L2: rotating line — uneven length, slight curve
      const l2x = w * 0.83 + o[1].x
      const l2y = h * 0.22 + o[1].y
      const lineLen1 = unit * 2.3 * o[1].scale
      const lineLen2 = unit * 1.7 * o[1].scale // asymmetric!
      const lineAngle = t * 0.009 + o[1].phase
      ctx.beginPath()
      ctx.moveTo(l2x - Math.cos(lineAngle) * lineLen1, l2y - Math.sin(lineAngle) * lineLen1)
      // Slight curve through a control point
      const cpx = l2x + Math.sin(t * 0.015) * 3
      const cpy = l2y + Math.cos(t * 0.012) * 4
      ctx.quadraticCurveTo(cpx, cpy, l2x + Math.cos(lineAngle) * lineLen2, l2y + Math.sin(lineAngle) * lineLen2)
      ctx.strokeStyle = COLORS[1]
      ctx.lineWidth = 2 + Math.sin(t * 0.03) * 0.5
      ctx.lineCap = 'round'
      ctx.stroke()

      // ── L3: triangle follows cursor — wobbly, overshoots
      const targetX = mx > 0 ? mx : cx + Math.sin(t * 0.007) * 50
      const targetY = my > 0 ? my : cy + Math.cos(t * 0.009) * 30
      const ease = 0.025 + Math.sin(t * 0.01) * 0.008 // variable easing = overshoot
      triX += (targetX - triX) * ease
      triY += (targetY - triY) * ease
      const triAngle = Math.atan2(targetY - triY, targetX - triX) + Math.PI / 2
      const triR = unit * (0.7 + Math.sin(t * 0.025 + o[2].phase) * 0.15)
      ctx.save()
      ctx.translate(triX, triY)
      ctx.rotate(triAngle + Math.sin(t * 0.02) * 0.05) // slight wobble
      ctx.beginPath()
      ctx.moveTo(0, -triR)
      ctx.lineTo(-triR * 0.55, triR * 0.55) // not equilateral
      ctx.lineTo(triR * 0.65, triR * 0.45)
      ctx.closePath()
      ctx.fillStyle = COLORS[2]
      ctx.fill()
      ctx.restore()

      // ── L4: orbiting trio — elliptical orbit, uneven spacing
      const orbitRx = unit * 4.5
      const orbitRy = unit * 2.8 // ellipse, not circle
      const orbitSpeeds = [0.0048, 0.0055, 0.0042] // different speeds!
      const orbitPhases = [0, 2.2, 4.1] // not evenly spaced
      for (let i = 0; i < 3; i++) {
        const a = orbitPhases[i] + t * orbitSpeeds[i]
        const ox = cx + o[3].x + Math.cos(a) * orbitRx
        const oy = cy + o[3].y + Math.sin(a) * orbitRy
        ctx.beginPath()
        if (i === 0) {
          ctx.ellipse(ox, oy, unit * 0.55, unit * 0.45, t * 0.005, 0, Math.PI * 2)
          ctx.fillStyle = COLORS[4]; ctx.fill()
        } else if (i === 1) {
          ctx.moveTo(ox - unit * 0.7, oy + 1)
          ctx.lineTo(ox + unit * 0.5, oy - 1)
          ctx.strokeStyle = COLORS[3]; ctx.lineWidth = 2.2; ctx.stroke()
        } else {
          ctx.moveTo(ox + 1, oy - unit * 0.5)
          ctx.lineTo(ox - unit * 0.45, oy + unit * 0.35)
          ctx.lineTo(ox + unit * 0.4, oy + unit * 0.25)
          ctx.closePath()
          ctx.fillStyle = COLORS[0]; ctx.fill()
        }
      }

      // ── L6: concentric rings — off-center, irregular gaps
      const ringX = w * 0.22 + o[5].x + Math.sin(t * 0.004) * 8
      const ringY = h * 0.73 + o[5].y
      const ringGaps = [1.5, 2.4, 3.1, 4.2] // irregular spacing
      for (let i = 0; i < 4; i++) {
        const rr = unit * ringGaps[i] * (0.88 + Math.sin(t * 0.013 + i * 1.1 + o[5].phase) * 0.12)
        const sweep = Math.PI * (1.3 + i * 0.15) // different arc lengths
        ctx.beginPath()
        ctx.arc(ringX, ringY, rr, t * 0.003 + i * 0.8, t * 0.003 + i * 0.8 + sweep)
        ctx.strokeStyle = COLORS[i % COLORS.length]
        ctx.lineWidth = 1.5 + i * 0.3
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // ── L7: bouncing drops — varied gravity, drift sideways
      if (t % 25 === 0) spawnDrop()
      for (const d of drops) {
        if (d.settled) {
          ctx.beginPath()
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, 0, 0, Math.PI * 2) // squished when settled
          ctx.fillStyle = d.c
          ctx.globalAlpha = 0.6
          ctx.fill()
          ctx.globalAlpha = 1
          continue
        }
        d.vy += 0.18 + Math.sin(d.wobble + t * 0.01) * 0.03 // uneven gravity
        d.x += d.vx + Math.sin(t * 0.02 + d.wobble) * 0.3 // wind wobble
        d.y += d.vy
        if (d.y > h * (0.82 + Math.sin(d.x * 0.01) * 0.03)) { // uneven ground
          d.y = h * (0.82 + Math.sin(d.x * 0.01) * 0.03)
          d.vy *= -0.35
          if (Math.abs(d.vy) < 0.8) d.settled = true
        }
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = d.c
        ctx.fill()
        ctx.beginPath()
        ctx.arc(d.x - d.r * 0.25, d.y - d.r * 0.25, d.r * 0.28, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fill()
      }

      // ── L8+L9: nodes — drifting, not fixed positions
      const nodeBase = [
        { bx: cx - unit * 3.5, by: h * 0.62, pos: true },
        { bx: cx + unit * 1.7, by: h * 0.68, pos: true },
        { bx: cx - unit * 0.5, by: h * 0.58, pos: false },
        { bx: cx + unit * 4.2, by: h * 0.63, pos: false },
        { bx: cx + unit * 0.8, by: h * 0.73, pos: true },
      ]
      const nodePositions = nodeBase.map((n, i) => ({
        x: n.bx + Math.sin(t * 0.003 + i * 1.7) * 8 + Math.cos(t * 0.005 + i * 2.3) * 5,
        y: n.by + Math.cos(t * 0.004 + i * 1.3) * 6,
        pos: n.pos,
      }))

      for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
          const a = nodePositions[i], b = nodePositions[j]
          const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
          if (dist < unit * 9) {
            const alpha = (1 - dist / (unit * 9)) * 0.25
            ctx.beginPath()
            // Slightly curved connection lines
            const mpx = (a.x + b.x) / 2 + Math.sin(t * 0.01 + i + j) * 5
            const mpy = (a.y + b.y) / 2 + Math.cos(t * 0.008 + i * j) * 4
            ctx.moveTo(a.x, a.y)
            ctx.quadraticCurveTo(mpx, mpy, b.x, b.y)
            ctx.strokeStyle = a.pos !== b.pos ? `rgba(252,145,58,${alpha})` : `rgba(45,90,39,${alpha * 0.5})`
            ctx.setLineDash(a.pos === b.pos ? [3, 6] : [])
            ctx.lineWidth = 1 + Math.sin(t * 0.02 + i) * 0.3
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
      }
      for (const n of nodePositions) {
        const r = unit * (0.45 + Math.sin(t * 0.025 + n.x * 0.01) * 0.08)
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = n.pos ? COLORS[1] : '#2D5A27'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.font = `${r * 1.1}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(n.pos ? '+' : '−', n.x + 0.5, n.y)
      }

      frame = requestAnimationFrame(tick)
    }

    triX = w / 2 + 20; triY = h / 2 - 15 // not centered
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: '#F9D423' }} />
}
