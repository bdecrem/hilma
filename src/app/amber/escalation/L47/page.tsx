// The viewer will see: a dark grid that fills in cream as grains are dropped. When a cell holds four,
// it topples — splitting into its four neighbors, which may topple too, cascading in chains. The
// toppling cells flash lime briefly. A status line tracks the largest avalanche. Self-organized
// criticality: the pile finds its own threshold without being told.
// The viewer will hear: a faint 48Hz drone that rises with total mass on the grid; each toppling
// cell adds a short filtered tick. Big avalanches sound like rain.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const COLS = 60
const ROWS = 36
const THRESHOLD = 4
const FLASH_DECAY = 0.85 // per frame

export default function L47() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const droneRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null)
  const audioStartedRef = useRef(false)
  const animRef = useRef(0)

  const gridRef = useRef<Int16Array>(new Int16Array(COLS * ROWS))
  const flashRef = useRef<Float32Array>(new Float32Array(COLS * ROWS))
  const cellSizeRef = useRef(12)
  const originRef = useRef({ x: 0, y: 0 })

  const toppleQueueRef = useRef<Set<number>>(new Set())
  const currentAvalancheRef = useRef(0)
  const maxAvalancheRef = useRef(0)
  const totalTopplesRef = useRef(0)
  const lastTickTimeRef = useRef(0)

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
      osc.frequency.value = 48
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 140
      filter.Q.value = 0.5
      const gain = ctx.createGain()
      gain.gain.value = 0.002
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      droneRef.current = { osc, gain }
      audioStartedRef.current = true
    }
  }, [])

  const playTick = useCallback(() => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    // Throttle to avoid audio storm during large avalanches
    const now = ctx.currentTime
    if (now - lastTickTimeRef.current < 0.018) return
    lastTickTimeRef.current = now
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 680 + Math.random() * 220
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 3
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.01, now + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.1)
  }, [])

  const pointerToCell = useCallback((px: number, py: number): number | null => {
    const cs = cellSizeRef.current
    const o = originRef.current
    const cx = Math.floor((px - o.x) / cs)
    const cy = Math.floor((py - o.y) / cs)
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return null
    return cy * COLS + cx
  }, [])

  const dropAt = useCallback((idx: number, n = 1) => {
    const grid = gridRef.current
    grid[idx] += n
    if (grid[idx] >= THRESHOLD) toppleQueueRef.current.add(idx)
    currentAvalancheRef.current = 0
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const idx = pointerToCell(e.clientX - rect.left, e.clientY - rect.top)
    if (idx === null) return
    // Drop 3 grains per tap — nudges cells closer to threshold faster on mobile
    dropAt(idx, 3)
  }, [dropAt, ensureAudio, pointerToCell])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons === 0 && e.pressure === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const idx = pointerToCell(e.clientX - rect.left, e.clientY - rect.top)
    if (idx === null) return
    dropAt(idx, 1)
  }, [dropAt, pointerToCell])

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
      // Fit grid into viewport with padding for chrome
      const vw = window.innerWidth
      const vh = window.innerHeight
      const padX = 24
      const padTop = 72
      const padBot = 110
      const availW = vw - padX * 2
      const availH = vh - padTop - padBot
      const cs = Math.max(4, Math.floor(Math.min(availW / COLS, availH / ROWS)))
      cellSizeRef.current = cs
      const gridW = cs * COLS
      const gridH = cs * ROWS
      originRef.current = {
        x: Math.floor((vw - gridW) / 2),
        y: Math.floor(padTop + (availH - gridH) / 2),
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const stepAvalanche = () => {
      // Process toppling in rounds so cascades read as a wave.
      // Each animation frame we process up to MAX_PER_FRAME topples so huge
      // avalanches still give the viewer a sense of motion.
      const MAX_PER_FRAME = 800
      const grid = gridRef.current
      const flash = flashRef.current
      const queue = toppleQueueRef.current
      let processed = 0
      while (queue.size > 0 && processed < MAX_PER_FRAME) {
        // Snapshot current queue; drain round-by-round
        const round: number[] = []
        for (const idx of queue) round.push(idx)
        queue.clear()
        for (const idx of round) {
          if (grid[idx] < THRESHOLD) continue
          grid[idx] -= THRESHOLD
          flash[idx] = 1
          currentAvalancheRef.current++
          totalTopplesRef.current++
          processed++
          playTick()
          const cx = idx % COLS
          const cy = (idx / COLS) | 0
          const neighbors: number[] = []
          if (cx > 0) neighbors.push(idx - 1)
          if (cx < COLS - 1) neighbors.push(idx + 1)
          if (cy > 0) neighbors.push(idx - COLS)
          if (cy < ROWS - 1) neighbors.push(idx + COLS)
          for (const n of neighbors) {
            grid[n]++
            if (grid[n] >= THRESHOLD) queue.add(n)
          }
          // Grid edges are open — grains leaving the grid disappear (normal SOC setup).
          if (processed >= MAX_PER_FRAME) break
        }
      }
      if (queue.size === 0 && currentAvalancheRef.current > 0) {
        if (currentAvalancheRef.current > maxAvalancheRef.current) {
          maxAvalancheRef.current = currentAvalancheRef.current
        }
        currentAvalancheRef.current = 0
      }
    }

    const draw = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      stepAvalanche()

      const grid = gridRef.current
      const flash = flashRef.current
      const cs = cellSizeRef.current
      const o = originRef.current
      const inset = cs > 6 ? 1 : 0.5

      // Frame the grid with a hairline
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.15
      ctx.lineWidth = 1
      ctx.strokeRect(o.x - 0.5, o.y - 0.5, cs * COLS + 1, cs * ROWS + 1)
      ctx.globalAlpha = 1

      let totalMass = 0
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i]
        const f = flash[i]
        if (v === 0 && f <= 0.02) continue
        totalMass += v
        const x = o.x + (i % COLS) * cs
        const y = o.y + ((i / COLS) | 0) * cs

        if (v > 0) {
          // brightness: 1 grain = faint, 3 grains = near-full cream
          const a = 0.22 + (v / 3) * 0.58
          ctx.fillStyle = CREAM
          ctx.globalAlpha = Math.min(1, a)
          ctx.fillRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2)
        }
        if (f > 0.02) {
          ctx.save()
          ctx.globalAlpha = f
          ctx.shadowColor = LIME
          ctx.shadowBlur = 6
          ctx.fillStyle = LIME
          ctx.fillRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2)
          ctx.restore()
          flash[i] *= FLASH_DECAY
          if (flash[i] < 0.02) flash[i] = 0
        }
      }
      ctx.globalAlpha = 1

      // Update drone based on mass
      if (droneRef.current && audioRef.current) {
        const fraction = Math.min(1, totalMass / (COLS * ROWS * 2.5))
        const target = 0.002 + Math.pow(fraction, 1.3) * 0.02
        droneRef.current.gain.gain.setTargetAtTime(target, audioRef.current.currentTime, 0.1)
      }

      // Upper row chrome — mass + max avalanche
      ctx.textAlign = 'left'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      ctx.fillText(`MASS · ${totalMass.toString().padStart(4, '0')}`, o.x, o.y - 20)

      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.4
      const maxAv = maxAvalancheRef.current
      ctx.fillText(`MAX AVALANCHE · ${maxAv.toString().padStart(4, '0')}`, o.x + cs * COLS, o.y - 20)

      // Current avalanche indicator, if active
      if (currentAvalancheRef.current > 0 || toppleQueueRef.current.size > 0) {
        ctx.textAlign = 'center'
        ctx.fillStyle = LIME
        ctx.globalAlpha = 0.8
        ctx.fillText(`· CASCADING · ${currentAvalancheRef.current}`, o.x + cs * COLS / 2, o.y - 20)
      }
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('L47 · sandpile', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('the pile keeps its own threshold', labelX, labelY + 18)

      // Spec label lower-right
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.2
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillText(`TOPPLES · ${totalTopplesRef.current.toString().padStart(5, '0')}`, vw - 28, vh - 24)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      // Touch hint if nothing has dropped yet
      if (totalTopplesRef.current === 0 && totalMass === 0) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.4
        ctx.textAlign = 'center'
        ctx.fillText('TAP OR DRAG TO DROP GRAINS', vw / 2, 36)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

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
      try { droneRef.current?.osc.stop() } catch {}
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      droneRef.current = null
      audioStartedRef.current = false
    }
  }, [handlePointerDown, handlePointerMove])

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
