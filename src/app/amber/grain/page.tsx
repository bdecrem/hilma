// The viewer will see: a dark plate covered by evenly spaced horizontal cream hairlines — wood grain.
// A single lime dot sits off-center: the knot. The grain curves permanently around it. Touch or drag
// the plate to add local ripples — the lines bend, then slowly relax. The knot's shape never goes
// away. Everything else does.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N_LINES = 28
const POINTS_PER_LINE = 96
const KNOT_RADIUS = 90            // screen px — the static knot distortion reach
const TOUCH_RADIUS = 140          // reach of a touch ripple
const TOUCH_STRENGTH = 28         // peak displacement (px)
const RELAX_RATE = 0.9            // per-second
const SPRING = 140                // pull toward zero (per-second-squared)
const DAMPING = 6.5               // velocity decay

interface PointState {
  disp: number // vertical displacement from base line
  vel: number
}

export default function Grain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const linesRef = useRef<PointState[][]>([])
  const knotRef = useRef({ x: 0, y: 0 })
  const audioRef = useRef<AudioContext | null>(null)
  const audioStartedRef = useRef(false)
  const lastTouchRef = useRef(0)
  const touchCountRef = useRef(0)

  const buildLines = useCallback(() => {
    const lines: PointState[][] = []
    for (let l = 0; l < N_LINES; l++) {
      const row: PointState[] = []
      for (let p = 0; p < POINTS_PER_LINE; p++) row.push({ disp: 0, vel: 0 })
      lines.push(row)
    }
    linesRef.current = lines
  }, [])

  const layout = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Knot positioned off-center: ~32% across, ~44% down — inside the drawing band
    knotRef.current = { x: vw * 0.32, y: vh * 0.44 }
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    audioStartedRef.current = true
  }, [])

  const playWood = useCallback((amount: number) => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime
    if (now - lastTouchRef.current < 0.04) return
    lastTouchRef.current = now
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 140 + amount * 260
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    const peak = Math.min(0.03, 0.008 + amount * 0.022)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.24)
  }, [])

  const applyTouch = useCallback((px: number, py: number, strength: number) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const padTop = vh * 0.12
    const padBot = vh * 0.16
    const spacing = (vh - padTop - padBot) / (N_LINES - 1)
    const lines = linesRef.current
    for (let l = 0; l < N_LINES; l++) {
      const baseY = padTop + l * spacing
      for (let p = 0; p < POINTS_PER_LINE; p++) {
        const x = (p / (POINTS_PER_LINE - 1)) * vw
        const dx = x - px
        const dy = baseY - py
        const d = Math.hypot(dx, dy)
        if (d > TOUCH_RADIUS) continue
        const falloff = Math.cos((d / TOUCH_RADIUS) * (Math.PI / 2))
        // Push away vertically: points above the touch go up, below go down
        const dir = Math.sign(dy) || 1
        lines[l][p].vel += dir * TOUCH_STRENGTH * falloff * strength
      }
    }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyTouch(e.clientX - rect.left, e.clientY - rect.top, 1)
    touchCountRef.current++
    playWood(0.8)
  }, [applyTouch, ensureAudio, playWood])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons === 0 && e.pressure === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyTouch(e.clientX - rect.left, e.clientY - rect.top, 0.35)
    if (Math.random() < 0.08) playWood(0.3)
  }, [applyTouch, playWood])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    buildLines()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layout()
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000)
      lastTimeRef.current = now

      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      const padTop = vh * 0.12
      const padBot = vh * 0.16
      const spacing = (vh - padTop - padBot) / (N_LINES - 1)
      const knot = knotRef.current
      const lines = linesRef.current

      // Relax physics — spring-damped return to zero
      let totalDisp = 0
      for (let l = 0; l < N_LINES; l++) {
        const row = lines[l]
        for (let p = 0; p < POINTS_PER_LINE; p++) {
          const pt = row[p]
          const accel = -SPRING * pt.disp - DAMPING * pt.vel
          pt.vel += accel * dt
          pt.disp += pt.vel * dt
          // Extra decay to settle cleanly
          pt.vel *= Math.max(0, 1 - RELAX_RATE * dt)
          totalDisp += Math.abs(pt.disp)
        }
      }

      // Draw each line
      ctx.strokeStyle = CREAM
      ctx.lineWidth = 1
      for (let l = 0; l < N_LINES; l++) {
        const baseY = padTop + l * spacing
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        for (let p = 0; p < POINTS_PER_LINE; p++) {
          const x = (p / (POINTS_PER_LINE - 1)) * vw
          // Permanent knot distortion: lines bend away from the knot
          const dx = x - knot.x
          const dy = baseY - knot.y
          const d = Math.hypot(dx, dy)
          let knotDisp = 0
          if (d < KNOT_RADIUS) {
            const f = Math.cos((d / KNOT_RADIUS) * (Math.PI / 2))
            const dir = Math.sign(dy) || 1
            knotDisp = dir * f * 26 + Math.sign(dx) * f * 6 * Math.sign(dy)
          }
          const y = baseY + knotDisp + lines[l][p].disp
          if (p === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Knot — lime dot
      ctx.save()
      ctx.shadowColor = LIME
      ctx.shadowBlur = 12
      ctx.fillStyle = LIME
      ctx.beginPath()
      ctx.arc(knot.x, knot.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Chrome — displacement readout upper-left
      const avgDisp = totalDisp / (N_LINES * POINTS_PER_LINE)
      ctx.textAlign = 'left'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      ctx.fillText(`DISPLACEMENT · ${avgDisp.toFixed(2).padStart(5, '0')}`, 28, 36)

      // Upper-right — grain count + spec
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.4
      ctx.fillText(`GRAIN · ${N_LINES}L`, vw - 28, 36)
      ctx.globalAlpha = 0.2
      ctx.fillText('SPEC · 010', vw - 28, 54)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('grain', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('the shape it has to keep', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Touch hint until interaction
      if (touchCountRef.current === 0) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TOUCH OR DRAG', vw / 2, vh - 30)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      audioStartedRef.current = false
    }
  }, [buildLines, handlePointerDown, handlePointerMove, layout])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          touchAction: 'none',
          background: NIGHT,
        }}
      />
    </>
  )
}
