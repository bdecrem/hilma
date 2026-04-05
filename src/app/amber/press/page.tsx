'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const DARK = '#2A2218'

const WORDS = [
  'spring', 'amber', 'citrus', 'bloom', 'warmth', 'pulse', 'light', 'grow',
  'touch', 'trace', 'color', 'shape', 'wave', 'seed', 'root', 'leaf',
  'stone', 'river', 'cloud', 'rain', 'flame', 'dust', 'echo', 'hum',
  'glow', 'fold', 'press', 'grain', 'weave', 'thread', 'bone', 'ink',
  'rust', 'salt', 'wind', 'shore', 'dusk', 'dawn', 'moss', 'bark',
  'smoke', 'glass', 'iron', 'clay', 'silk', 'wool', 'wax', 'oil',
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Press() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rollerYRef = useRef(0)
  const draggingRef = useRef(false)
  const wordsRef = useRef<string[]>([])
  const printedRef = useRef<string[]>([])
  const inkRef = useRef(0) // how far the roller has inked (0-1)

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
    const [bg1, bg2] = pickGradientColors('press')
    let raf: number

    // Init words
    wordsRef.current = shuffle(WORDS).slice(0, 8)
    rollerYRef.current = H * 0.15

    // Machine dimensions
    const machineL = () => W * 0.1
    const machineR = () => W * 0.9
    const machineW = () => machineR() - machineL()
    const typeTop = () => H * 0.35
    const typeBottom = () => H * 0.55
    const paperTop = () => H * 0.6
    const paperBottom = () => H * 0.92
    const rollerMinY = () => H * 0.15
    const rollerMaxY = () => H * 0.65

    function roundedRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.arcTo(x + w, y, x + w, y + r, r)
      ctx.lineTo(x + w, y + h - r)
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
      ctx.lineTo(x + r, y + h)
      ctx.arcTo(x, y + h, x, y + h - r, r)
      ctx.lineTo(x, y + r)
      ctx.arcTo(x, y, x + r, y, r)
      ctx.closePath()
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const mL = machineL(), mR = machineR(), mW = machineW()
      const rY = rollerYRef.current
      const tTop = typeTop(), tBot = typeBottom()
      const pTop = paperTop(), pBot = paperBottom()

      // Frame / rails
      ctx.fillStyle = DARK
      ctx.globalAlpha = 0.2
      ctx.fillRect(mL - 8, H * 0.1, 6, H * 0.6)
      ctx.fillRect(mR + 2, H * 0.1, 6, H * 0.6)
      ctx.globalAlpha = 1

      // Type bed (the block with letters)
      roundedRect(mL, tTop, mW, tBot - tTop, 4)
      ctx.fillStyle = '#3a3632'
      ctx.fill()

      // Type letters (raised, reversed — it's a press!)
      const words = wordsRef.current
      ctx.font = `bold ${Math.floor(mW / 12)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const lineH = (tBot - tTop) / (Math.ceil(words.length / 2) + 1)
      for (let i = 0; i < words.length; i++) {
        const row = Math.floor(i / 2)
        const col = i % 2
        const x = mL + mW * (col === 0 ? 0.3 : 0.7)
        const y = tTop + lineH * (row + 1)
        // Raised type — lighter color on dark bed
        ctx.fillStyle = '#8a8070'
        ctx.globalAlpha = 0.9
        // Mirror text (it's a press — type is reversed)
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(-1, 1)
        ctx.fillText(words[i], 0, 0)
        ctx.restore()
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'start'

      // Ink on type (shows where roller has passed)
      const inkProgress = inkRef.current
      if (inkProgress > 0) {
        ctx.fillStyle = DARK
        ctx.globalAlpha = 0.6 * inkProgress
        roundedRect(mL, tTop, mW, (tBot - tTop) * Math.min(1, (rY - tTop) / (tBot - tTop)), 4)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Paper
      roundedRect(mL + 10, pTop, mW - 20, pBot - pTop, 2)
      ctx.fillStyle = '#FFFDF5'
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Printed text on paper (appears after roller passes over type)
      if (inkProgress > 0.5) {
        const printAlpha = Math.min(1, (inkProgress - 0.5) * 2)
        ctx.font = `bold ${Math.floor(mW / 12)}px monospace`
        ctx.textAlign = 'center'
        ctx.fillStyle = DARK
        ctx.globalAlpha = printAlpha * 0.85

        for (let i = 0; i < words.length; i++) {
          const row = Math.floor(i / 2)
          const col = i % 2
          const x = mL + 10 + (mW - 20) * (col === 0 ? 0.3 : 0.7)
          const y = pTop + lineH * (row + 1)
          ctx.fillText(words[i], x, y)
        }
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Roller
      const rollerH = 24
      roundedRect(mL - 4, rY - rollerH / 2, mW + 8, rollerH, 8)
      ctx.fillStyle = '#555'
      ctx.fill()
      // Roller highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(mL, rY - rollerH / 2 + 3, mW, 4)
      // Roller handles
      ctx.fillStyle = CITRUS[0]
      roundedRect(mL - 20, rY - 8, 20, 16, 4)
      ctx.fill()
      roundedRect(mR, rY - 8, 20, 16, 4)
      ctx.fill()

      // Update ink based on roller position
      if (rY > tTop && rY < tBot) {
        inkRef.current = Math.max(inkRef.current, (rY - tTop) / (tBot - tTop))
      }

      // Hint
      ctx.globalAlpha = 0.25
      ctx.textAlign = 'center'
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      if (inkRef.current < 0.1) {
        ctx.fillText('drag the roller down over the type', W / 2, H * 0.08)
      }
      ctx.fillText('tap paper to shuffle type', W / 2, H * 0.96)
      ctx.textAlign = 'start'
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    // Drag roller
    const onStart = (_cx: number, cy: number) => {
      if (Math.abs(cy - rollerYRef.current) < 40) {
        draggingRef.current = true
      }
    }
    const onMove = (_cx: number, cy: number) => {
      if (draggingRef.current) {
        rollerYRef.current = Math.max(rollerMinY(), Math.min(rollerMaxY(), cy))
      }
    }
    const onEnd = () => {
      draggingRef.current = false
      // Spring back to top
      const spring = () => {
        rollerYRef.current += (rollerMinY() - rollerYRef.current) * 0.08
        if (Math.abs(rollerYRef.current - rollerMinY()) > 1) requestAnimationFrame(spring)
        else rollerYRef.current = rollerMinY()
      }
      spring()
    }

    // Tap paper to reshuffle
    const onTap = (_cx: number, cy: number) => {
      if (cy > paperTop() && cy < paperBottom()) {
        wordsRef.current = shuffle(WORDS).slice(0, 8)
        inkRef.current = 0
        rollerYRef.current = rollerMinY()
      }
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]
      onStart(t.clientX, t.clientY)
      if (!draggingRef.current) onTap(t.clientX, t.clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault()
      onMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchend', () => onEnd())

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      onStart(e.clientX, e.clientY)
      if (!draggingRef.current) onTap(e.clientX, e.clientY)
    })
    canvas.addEventListener('mousemove', (e: MouseEvent) => onMove(e.clientX, e.clientY))
    canvas.addEventListener('mouseup', () => onEnd())

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
        cursor: 'grab',
        touchAction: 'none',
      }}
    />
  )
}
