'use client'

import { useEffect, useRef } from 'react'

// AMBER v3 · SIGNAL
const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N = 72              // grid resolution
const P_CRIT = 0.5927     // site percolation threshold for 2D square lattice
const DIRS: readonly (readonly number[])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export default function L45() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pRef = useRef(0.45)              // start below critical
  const thresholdsRef = useRef<Float32Array | null>(null)
  const spanIdRef = useRef(-1)
  const compsRef = useRef<Int16Array | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!

    // Fixed per-site thresholds — dragging p reveals/hides deterministically
    const thresholds = new Float32Array(N * N)
    for (let i = 0; i < thresholds.length; i++) thresholds[i] = Math.random()
    thresholdsRef.current = thresholds

    const comps = new Int16Array(N * N)
    compsRef.current = comps

    // Flood-fill to label connected components of "filled" sites.
    // Also detect the spanning component (touches both top AND bottom).
    function recomputeComponents(p: number) {
      comps.fill(-1)
      let nextId = 0
      let spanId = -1
      const stack: number[] = []
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const idx = y * N + x
          if (comps[idx] !== -1) continue
          if (thresholds[idx] >= p) continue      // empty site
          // BFS
          comps[idx] = nextId
          stack.length = 0
          stack.push(idx)
          let touchesTop = (y === 0)
          let touchesBot = (y === N - 1)
          while (stack.length > 0) {
            const k = stack.pop()!
            const ky = (k / N) | 0
            const kx = k - ky * N
            if (ky === 0) touchesTop = true
            if (ky === N - 1) touchesBot = true
            for (const [dy, dx] of DIRS) {
              const ny = ky + dy
              const nx = kx + dx
              if (ny < 0 || ny >= N || nx < 0 || nx >= N) continue
              const n = ny * N + nx
              if (comps[n] !== -1) continue
              if (thresholds[n] >= p) continue
              comps[n] = nextId
              stack.push(n)
            }
          }
          if (spanId === -1 && touchesTop && touchesBot) spanId = nextId
          nextId++
        }
      }
      spanIdRef.current = spanId
    }

    recomputeComponents(pRef.current)

    let raf = 0

    function draw() {
      const now = performance.now()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Field
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, W, H)

      // Temporal grain
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.015
      for (let i = 0; i < 90; i++) {
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
      }
      ctx.globalAlpha = 1

      // Grid layout — square, centered in upper portion
      const padTop = Math.max(50, H * 0.08)
      const padBot = Math.max(180, H * 0.26)  // leaves space for label + dial
      const available = Math.min(W - 60, H - padTop - padBot)
      const cellSize = Math.floor(available / N)
      const gridSize = cellSize * N
      const gx = Math.floor((W - gridSize) / 2)
      const gy = Math.floor(padTop + (H - padTop - padBot - gridSize) / 2)

      const p = pRef.current
      const spanId = spanIdRef.current

      // Render cells
      const gap = cellSize >= 6 ? 1 : 0
      const fillSize = cellSize - gap
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const idx = y * N + x
          if (thresholds[idx] >= p) continue
          const cid = comps[idx]
          const isSpan = cid === spanId && spanId !== -1
          ctx.fillStyle = isSpan ? LIME : CREAM
          ctx.globalAlpha = isSpan ? 0.95 : 0.55
          ctx.fillRect(gx + x * cellSize, gy + y * cellSize, fillSize, fillSize)
        }
      }
      ctx.globalAlpha = 1

      // Grid frame — hairline
      ctx.strokeStyle = 'rgba(232, 232, 232, 0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(gx - 2, gy - 2, gridSize + 4, gridSize + 4)

      // Dial (p slider) — below grid, centered
      const dialY = gy + gridSize + 60
      const dialX1 = gx
      const dialX2 = gx + gridSize
      const dialLen = dialX2 - dialX1

      // Track
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(dialX1, dialY)
      ctx.lineTo(dialX2, dialY)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Tick marks at 0, 0.25, 0.5, 0.75, 1
      for (let i = 0; i <= 4; i++) {
        const tx = dialX1 + (i / 4) * dialLen
        ctx.strokeStyle = CREAM
        ctx.globalAlpha = 0.25
        ctx.beginPath()
        ctx.moveTo(tx, dialY - 4)
        ctx.lineTo(tx, dialY + 4)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Critical marker (p_c) — lime hairline
      const pcX = dialX1 + P_CRIT * dialLen
      ctx.strokeStyle = LIME
      ctx.globalAlpha = 0.65
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pcX, dialY - 10)
      ctx.lineTo(pcX, dialY + 10)
      ctx.stroke()
      ctx.globalAlpha = 1
      // Small "pc" label
      ctx.fillStyle = 'rgba(198, 255, 60, 0.7)'
      ctx.font = '700 10px "Courier Prime", "Courier New", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('pc', pcX, dialY + 26)

      // Indicator
      const indX = dialX1 + p * dialLen
      const locked = spanId !== -1
      ctx.strokeStyle = locked ? LIME : CREAM
      ctx.lineWidth = locked ? 2 : 1.5
      ctx.beginPath()
      ctx.moveTo(indX, dialY - 16)
      ctx.lineTo(indX, dialY + 16)
      ctx.stroke()
      ctx.fillStyle = locked ? LIME : CREAM
      ctx.fillRect(indX - 3, dialY - 20, 7, 4)
      ctx.fillRect(indX - 3, dialY + 16, 7, 4)

      // p readout
      ctx.font = '700 11px "Courier Prime", "Courier New", monospace'
      ctx.fillStyle = locked ? LIME : 'rgba(232, 232, 232, 0.6)'
      ctx.textAlign = 'center'
      ctx.fillText(`p = ${p.toFixed(3)}`, indX, dialY - 28)

      // Status: spans / does not span
      ctx.font = '700 10px "Courier Prime", "Courier New", monospace'
      ctx.fillStyle = locked ? LIME : 'rgba(232, 232, 232, 0.4)'
      ctx.textAlign = 'left'
      ctx.fillText(locked ? 'spans ◆' : 'does not span', dialX1, dialY + 44)

      // Museum label — lower left
      const labelX = Math.max(20, Math.floor(W * 0.055))
      const labelY = H - 30
      ctx.textAlign = 'left'
      ctx.fillStyle = CREAM
      const titleSize = Math.min(34, W * 0.055)
      ctx.font = `300 italic ${titleSize}px "Fraunces", Georgia, serif`
      ctx.fillText('threshold', labelX, labelY - titleSize * 0.3)
      ctx.fillStyle = 'rgba(232, 232, 232, 0.55)'
      const subSize = Math.min(11, W * 0.022)
      ctx.font = `700 ${subSize}px "Courier Prime", "Courier New", monospace`
      ctx.fillText('the moment something spans', labelX, labelY + 10)

      // Bottom-right spec
      ctx.fillStyle = 'rgba(232, 232, 232, 0.3)'
      ctx.font = '700 10px "Courier Prime", "Courier New", monospace'
      ctx.textAlign = 'right'
      ctx.fillText('L45 · percolation · 04.15.26', W - labelX, labelY + 10)

      // Quiet hint if pre-interaction
      if (!draggingRef.current && spanId === -1) {
        const age = (now / 1000) % 4
        if (age < 2) {
          ctx.globalAlpha = Math.min(1, 2 - age) * 0.35
          ctx.fillStyle = CREAM
          ctx.font = '700 11px "Courier Prime", "Courier New", monospace'
          ctx.textAlign = 'center'
          ctx.fillText('drag the dial', (dialX1 + dialX2) / 2, dialY - 48)
          ctx.globalAlpha = 1
        }
      }

      raf = requestAnimationFrame(draw)
    }

    function setPFromEvent(clientX: number, clientY: number) {
      // Only accept if pointer is in the dial zone OR clearly below the grid
      const p = Math.max(0, Math.min(1, (clientX - 20) / (W - 40)))
      pRef.current = p
      recomputeComponents(p)
      // Prevent unused warning
      void clientY
    }

    canvas.addEventListener('pointerdown', (e) => {
      draggingRef.current = true
      setPFromEvent(e.clientX, e.clientY)
    })
    window.addEventListener('pointermove', (e) => {
      if (draggingRef.current) setPFromEvent(e.clientX, e.clientY)
    })
    window.addEventListener('pointerup', () => { draggingRef.current = false })

    const onResize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100dvh',
          cursor: 'ew-resize',
          touchAction: 'none',
        }}
      />
    </>
  )
}
