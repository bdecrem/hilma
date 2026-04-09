'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const CELL = 8

export default function L33() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array | null>(null)
  const colsRef = useRef(0)
  const rowsRef = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const runningRef = useRef(true)

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
      colsRef.current = Math.floor(W / CELL)
      rowsRef.current = Math.floor(H / CELL)
      const size = colsRef.current * rowsRef.current
      const grid = new Uint8Array(size)
      // Random seed — ~20% alive
      for (let i = 0; i < size; i++) {
        grid[i] = Math.random() < 0.2 ? 1 : 0
      }
      gridRef.current = grid
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L33')
    let raf: number
    let frame = 0
    let generation = 0
    let population = 0
    let lastStepTime = 0
    const stepInterval = 80 // ms per generation

    function playChime(count: number) {
      if (!audioRef.current || count < 5) return
      const actx = audioRef.current
      const freq = 300 + Math.min(count, 50) * 8
      const osc = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, actx.currentTime)
      gain.gain.setValueAtTime(0.03, actx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.15)
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.start(actx.currentTime)
      osc.stop(actx.currentTime + 0.15)
    }

    function step() {
      const cols = colsRef.current
      const rows = rowsRef.current
      const grid = gridRef.current
      if (!grid) return

      const next = new Uint8Array(cols * rows)
      let births = 0

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Count neighbors (wrapping)
          let neighbors = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue
              const nr = (r + dr + rows) % rows
              const nc = (c + dc + cols) % cols
              if (grid[nr * cols + nc]) neighbors++
            }
          }

          const alive = grid[r * cols + c]
          if (alive) {
            next[r * cols + c] = (neighbors === 2 || neighbors === 3) ? 1 : 0
          } else {
            if (neighbors === 3) {
              next[r * cols + c] = 1
              births++
            }
          }
        }
      }

      gridRef.current = next
      generation++
      playChime(births)
    }

    const draw = () => {
      frame++
      const cols = colsRef.current
      const rows = rowsRef.current
      const grid = gridRef.current
      if (!grid) { raf = requestAnimationFrame(draw); return }

      const now = Date.now()
      if (runningRef.current && now - lastStepTime > stepInterval) {
        step()
        lastStepTime = now
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Draw cells
      population = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r * cols + c]) {
            population++
            const colorIdx = (r + c) % CITRUS.length
            ctx.fillStyle = CITRUS[colorIdx]
            ctx.globalAlpha = 0.75
            ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2)
          }
        }
      }
      ctx.globalAlpha = 1

      // Info
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillText(`gen ${generation} · ${population} alive · ${runningRef.current ? 'running' : 'paused'}`, 12, H - 12)

      // Hint
      if (frame < 180) {
        ctx.globalAlpha = Math.max(0, 1 - frame / 180) * 0.25
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillText('tap cells to toggle. double-tap to clear.', W / 2, H - 30)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    let lastTapTime = 0
    const handleTap = (cx: number, cy: number) => {
      // Init audio on first tap
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()

      const now = Date.now()

      // Double-tap to clear
      if (now - lastTapTime < 300) {
        const grid = gridRef.current
        if (grid) grid.fill(0)
        generation = 0
        lastTapTime = 0
        return
      }
      lastTapTime = now

      // Toggle cell
      const c = Math.floor(cx / CELL)
      const r = Math.floor(cy / CELL)
      const cols = colsRef.current
      const grid = gridRef.current
      if (grid && c >= 0 && c < cols && r >= 0 && r < rowsRef.current) {
        const idx = r * cols + c
        grid[idx] = grid[idx] ? 0 : 1
        // Also place a small pattern (glider) if cell was empty
        if (grid[idx] && r + 2 < rowsRef.current && c + 2 < cols) {
          // Glider
          grid[(r) * cols + (c + 1)] = 1
          grid[(r + 1) * cols + (c + 2)] = 1
          grid[(r + 2) * cols + c] = 1
          grid[(r + 2) * cols + (c + 1)] = 1
          grid[(r + 2) * cols + (c + 2)] = 1
        }
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
