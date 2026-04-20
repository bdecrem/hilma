// The viewer will see: the bifurcation diagram of the logistic map x → rx(1-x). On a dark plate,
// the attractor at each r is plotted in cream, accumulated over many iterations — one fixed point
// on the left, a clean period-doubling cascade through 2, 4, 8..., then chaotic bands at r > 3.5699
// broken by periodic windows. A vertical lime line marks the currently selected r; a lime time-series
// below plots the live orbit at that r. Drag horizontally to move r. Detected period is reported
// ("· PERIOD 2 ·", "· PERIOD 4 ·", or "· CHAOS ·").
// The viewer will hear: a quiet 220Hz sine tone whose amplitude is modulated by the live x(t).
// At fixed points the tone is steady; at chaos it wavers and flickers.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const R_MIN = 2.6
const R_MAX = 4.0
// Diagram occupies top portion, orbit trace at bottom
const DIAGRAM_FRAC = 0.62
const ORBIT_HISTORY = 160

export default function L50() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const diagramRef = useRef<HTMLCanvasElement | null>(null)
  const diagramReadyRef = useRef(false)
  const animRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const currentRRef = useRef(3.742) // start at a classic chaos value
  const xRef = useRef(0.35)
  const orbitRef = useRef<number[]>([])
  const dragOriginRef = useRef<{ x: number; r: number } | null>(null)

  const audioRef = useRef<AudioContext | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const audioStartedRef = useRef(false)

  const buildDiagram = useCallback(() => {
    const W = Math.max(1, Math.floor(window.innerWidth))
    const H = Math.max(1, Math.floor(window.innerHeight * DIAGRAM_FRAC))
    const offscreen = document.createElement('canvas')
    offscreen.width = W
    offscreen.height = H
    const ctx = offscreen.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(W, H)
    const data = img.data

    // Fill alpha accumulator (Uint16 to avoid saturation)
    const acc = new Uint16Array(W * H)
    // For each column (each r), iterate and accumulate points
    const burnIn = 200
    const samples = 280
    for (let px = 0; px < W; px++) {
      const r = R_MIN + (px / (W - 1)) * (R_MAX - R_MIN)
      let x = 0.3
      for (let i = 0; i < burnIn; i++) x = r * x * (1 - x)
      for (let i = 0; i < samples; i++) {
        x = r * x * (1 - x)
        const yNorm = 1 - x // flip so 0 is at bottom
        const py = Math.floor(yNorm * (H - 1))
        if (py < 0 || py >= H) continue
        const idx = py * W + px
        if (acc[idx] < 65535) acc[idx]++
      }
    }

    // Render accumulator → cream pixels with alpha based on log(count+1)
    for (let i = 0; i < acc.length; i++) {
      const c = acc[i]
      if (c === 0) {
        data[i * 4 + 0] = 0
        data[i * 4 + 1] = 0
        data[i * 4 + 2] = 0
        data[i * 4 + 3] = 0
      } else {
        // Log mapping — fixed points are very concentrated, cascade bands are thinner
        const k = Math.min(1, Math.log(c + 1) / Math.log(samples))
        const a = Math.floor(60 + k * 180)
        data[i * 4 + 0] = 0xE8
        data[i * 4 + 1] = 0xE8
        data[i * 4 + 2] = 0xE8
        data[i * 4 + 3] = a
      }
    }
    ctx.putImageData(img, 0, 0)
    diagramRef.current = offscreen
    diagramReadyRef.current = true
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    if (!audioStartedRef.current) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 220
      const gain = ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      oscRef.current = osc
      gainRef.current = gain
      audioStartedRef.current = true
    }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    dragOriginRef.current = { x: e.clientX, r: currentRRef.current }
    // Also set r directly by tap position
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    currentRRef.current = R_MIN + frac * (R_MAX - R_MIN)
  }, [ensureAudio])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons === 0 && e.pressure === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    currentRRef.current = R_MIN + frac * (R_MAX - R_MIN)
  }, [])

  const detectPeriod = (orbit: number[]): number | null => {
    const n = orbit.length
    if (n < 32) return null
    // Check for period 1..8 using last window
    const TOL = 0.003
    const tail = orbit.slice(-64)
    for (let p = 1; p <= 8; p++) {
      let ok = true
      for (let i = 0; i < tail.length - p; i++) {
        if (Math.abs(tail[i] - tail[i + p]) > TOL) {
          ok = false
          break
        }
      }
      if (ok) {
        // Report minimum period — so if period-2 is reported but really it's period-1, this stops at 1
        return p
      }
    }
    return null
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      diagramReadyRef.current = false
      // Defer to next tick so first paint isn't blocked
      setTimeout(buildDiagram, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      const diagH = vh * DIAGRAM_FRAC
      const orbitTop = diagH + 40
      const orbitBot = vh - 96

      // Blit pre-rendered diagram
      if (diagramReadyRef.current && diagramRef.current) {
        ctx.drawImage(diagramRef.current, 0, 0, vw, diagH)
      } else {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('COMPUTING DIAGRAM...', vw / 2, diagH / 2)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      // Iterate live logistic map
      const r = currentRRef.current
      let x = xRef.current
      // Multiple iterations per frame so orbit fills faster
      const itersPerFrame = 3
      for (let i = 0; i < itersPerFrame; i++) {
        x = r * x * (1 - x)
        if (!Number.isFinite(x) || x < 0 || x > 1) x = 0.3
        orbitRef.current.push(x)
      }
      xRef.current = x
      while (orbitRef.current.length > ORBIT_HISTORY) orbitRef.current.shift()

      // Audio — modulate amplitude by current x
      if (gainRef.current && audioRef.current) {
        const target = Math.min(0.012, x * 0.012 + 0.0005)
        gainRef.current.gain.setTargetAtTime(target, audioRef.current.currentTime, 0.05)
      }

      // Vertical lime line at current r across the diagram
      const rFrac = (r - R_MIN) / (R_MAX - R_MIN)
      const rX = rFrac * vw
      ctx.save()
      ctx.shadowColor = LIME
      ctx.shadowBlur = 8
      ctx.strokeStyle = LIME
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(rX, 0)
      ctx.lineTo(rX, diagH)
      ctx.stroke()
      ctx.restore()
      ctx.globalAlpha = 1

      // Current x marker on the diagram — lime dot
      const xYOnDiag = (1 - x) * diagH
      ctx.save()
      ctx.shadowColor = LIME
      ctx.shadowBlur = 10
      ctx.fillStyle = LIME
      ctx.beginPath()
      ctx.arc(rX, xYOnDiag, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Divider line
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.12
      ctx.beginPath()
      ctx.moveTo(24, diagH + 6)
      ctx.lineTo(vw - 24, diagH + 6)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Orbit time-series below (lime, scrolls from left to right, newest on right)
      const padX = 24
      const drawW = vw - padX * 2
      const orbH = orbitBot - orbitTop
      const orbit = orbitRef.current
      ctx.strokeStyle = LIME
      ctx.globalAlpha = 0.75
      ctx.lineWidth = 1.2
      ctx.beginPath()
      for (let i = 0; i < orbit.length; i++) {
        const xPos = padX + (i / (ORBIT_HISTORY - 1)) * drawW
        const yPos = orbitTop + (1 - orbit[i]) * orbH
        if (i === 0) ctx.moveTo(xPos, yPos)
        else ctx.lineTo(xPos, yPos)
      }
      ctx.stroke()
      ctx.globalAlpha = 1

      // Period detection
      const period = detectPeriod(orbit)
      const periodLabel =
        period === null ? '· CHAOS ·' : `· PERIOD ${period} ·`

      // Chrome — r readout upper-left
      ctx.textAlign = 'left'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.5
      ctx.fillText(`r · ${r.toFixed(3)}`, 28, 36)
      ctx.globalAlpha = 1

      // Period status — center top
      ctx.textAlign = 'center'
      ctx.fillStyle = period === null ? LIME : CREAM
      ctx.globalAlpha = period === null ? 0.85 : 0.5
      ctx.font = '700 11px "Courier Prime", monospace'
      ctx.fillText(periodLabel, vw / 2, 36)
      ctx.globalAlpha = 1

      // Upper-right spec
      ctx.textAlign = 'right'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.35
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillText('SPEC · L50', vw - 28, 36)
      ctx.globalAlpha = 1

      // r axis tick marks at the bottom of diagram
      ctx.textAlign = 'center'
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.35
      // Mark some reference r values
      const refs: { r: number; label: string }[] = [
        { r: 3.0, label: '3.0' },
        { r: 3.449, label: '·' }, // period-2 boundary
        { r: 3.544, label: '·' }, // period-4 boundary
        { r: 3.5699, label: 'r∞' }, // onset of chaos
        { r: 3.828, label: '3.83' }, // period-3 window
      ]
      for (const ref of refs) {
        const rf = (ref.r - R_MIN) / (R_MAX - R_MIN)
        const rx = rf * vw
        ctx.fillText(ref.label, rx, diagH - 6)
      }
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('L50 · bifurcations', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('order, then the cascade, then chaos', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Touch hint until interaction
      if (!audioStartedRef.current && diagramReadyRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('DRAG TO MOVE r', vw / 2, vh - 30)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      lastTimeRef.current = performance.now()
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      try { oscRef.current?.stop() } catch {}
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      oscRef.current = null
      gainRef.current = null
      audioStartedRef.current = false
    }
  }, [buildDiagram, handlePointerDown, handlePointerMove])

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
