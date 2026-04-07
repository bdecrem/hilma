'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const THREAD_W = 6
const GAP = 1

// Weave patterns: which warp threads go OVER the weft in each row
// Pattern repeats every N rows
const PATTERNS: { name: string; repeat: number; over: (col: number, row: number) => boolean }[] = [
  { name: 'plain', repeat: 2, over: (c, r) => (c + r) % 2 === 0 },
  { name: 'twill', repeat: 4, over: (c, r) => (c + r) % 4 < 2 },
  { name: 'satin', repeat: 5, over: (c, r) => (c * 2 + r) % 5 === 0 },
  { name: 'basket', repeat: 4, over: (c, r) => (Math.floor(c / 2) + Math.floor(r / 2)) % 2 === 0 },
]

export default function Weave() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rowsRef = useRef<{ color: string; patternIdx: number }[]>([])
  const patternRef = useRef(0)
  const colorRef = useRef(0)

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
    const [bg1, bg2] = pickGradientColors('weave')
    let raf: number
    let frame = 0
    let nextRowTimer = 0

    // Warp colors (vertical threads) — alternating citrus
    const cols = Math.floor(W / (THREAD_W + GAP))
    const warpColors = Array.from({ length: cols }, (_, i) => CITRUS[i % CITRUS.length])

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const rows = rowsRef.current
      const maxRows = Math.floor(H / (THREAD_W + GAP))

      // Add new row periodically
      nextRowTimer++
      if (nextRowTimer > 20) {
        nextRowTimer = 0
        const color = CITRUS[colorRef.current % CITRUS.length]
        rows.push({ color, patternIdx: patternRef.current })

        // Auto-advance color every few rows
        if (rows.length % 3 === 0) {
          colorRef.current = (colorRef.current + 1) % CITRUS.length
        }

        // Scroll if too many rows
        if (rows.length > maxRows + 5) {
          rows.shift()
        }
      }

      // Calculate vertical offset for scrolling
      const totalRowH = rows.length * (THREAD_W + GAP)
      const scrollY = Math.max(0, totalRowH - H + 40)

      // Draw warp (vertical threads) — behind the weft where pattern says so
      // Draw in two passes: first under-warp, then weft, then over-warp

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx]
        const y = 20 + rowIdx * (THREAD_W + GAP) - scrollY
        if (y < -THREAD_W || y > H) continue

        const pattern = PATTERNS[row.patternIdx]

        // Draw weft (horizontal thread) for this row
        for (let c = 0; c < cols; c++) {
          const x = c * (THREAD_W + GAP)
          const warpOver = pattern.over(c, rowIdx)

          if (!warpOver) {
            // Weft is on top here — draw weft segment
            ctx.fillStyle = row.color
            ctx.globalAlpha = 0.85
            ctx.fillRect(x, y, THREAD_W + GAP + 1, THREAD_W)
          }
        }

        // Draw warp segments that go OVER the weft
        for (let c = 0; c < cols; c++) {
          const x = c * (THREAD_W + GAP)
          const warpOver = pattern.over(c, rowIdx)

          if (warpOver) {
            // Warp is on top — draw warp crossing over weft
            ctx.fillStyle = warpColors[c]
            ctx.globalAlpha = 0.9
            ctx.fillRect(x, y - GAP, THREAD_W, THREAD_W + GAP * 2)

            // Tiny shadow to show depth
            ctx.fillStyle = 'rgba(0,0,0,0.08)'
            ctx.fillRect(x + THREAD_W - 1, y, 1, THREAD_W)
          } else {
            // Warp goes under — show it in the gaps
            ctx.fillStyle = warpColors[c]
            ctx.globalAlpha = 0.3
            ctx.fillRect(x, y, THREAD_W, THREAD_W)
          }
        }
        ctx.globalAlpha = 1
      }

      // Draw continuous warp threads in empty space above the weave
      const weaveTop = 20 - scrollY
      if (weaveTop > 0) {
        for (let c = 0; c < cols; c++) {
          const x = c * (THREAD_W + GAP)
          ctx.fillStyle = warpColors[c]
          ctx.globalAlpha = 0.25
          ctx.fillRect(x, 0, THREAD_W, weaveTop)
        }
        ctx.globalAlpha = 1
      }

      // Pattern indicator (bottom left)
      const pat = PATTERNS[patternRef.current]
      ctx.globalAlpha = 0.3
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(pat.name, 12, H - 12)
      ctx.globalAlpha = 1

      // Color indicator (bottom right)
      ctx.fillStyle = CITRUS[colorRef.current % CITRUS.length]
      ctx.globalAlpha = 0.5
      ctx.fillRect(W - 24, H - 24, 12, 12)
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    // Tap to change weft color
    const handleTap = (cx: number, cy: number) => {
      // Left third: change pattern
      if (cx < W / 3) {
        patternRef.current = (patternRef.current + 1) % PATTERNS.length
      } else {
        // Right two-thirds: change color
        colorRef.current = (colorRef.current + 1) % CITRUS.length
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
        cursor: 'pointer',
        touchAction: 'none',
      }}
    />
  )
}
