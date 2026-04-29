'use client'

import { useEffect, useRef, useState } from 'react'

const HEARTH = '#1A110A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const STANZAS: string[][] = [
  [
    'I like to think (and',
    'the sooner the better!)',
    'of a cybernetic meadow',
    'where mammals and computers',
    'live together in mutually',
    'programming harmony',
    'like pure water',
    'touching clear sky.',
  ],
  [
    'I like to think',
    '(right now, please!)',
    'of a cybernetic forest',
    'filled with pines and electronics',
    'where deer stroll peacefully',
    'past computers',
    'as if they were flowers',
    'with spinning blossoms.',
  ],
  [
    'I like to think',
    '(it has to be!)',
    'of a cybernetic ecology',
    'where we are free of our labors',
    'and joined back to nature,',
    'returned to our mammal',
    'brothers and sisters,',
    'and all watched over',
    'by machines of loving grace.',
  ],
]

type Blossom = {
  x: number
  y: number
  r: number
  speed: number
  phase: number
  petals: number
  isLime: boolean
}

export default function LovingGracePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blossomsRef = useRef<Blossom[]>([])
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const [revealed, setRevealed] = useState<number>(0)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap'
    document.head.appendChild(link)
    return () => {
      document.head.removeChild(link)
    }
  }, [])

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    timers.push(setTimeout(() => setRevealed(1), 600))
    timers.push(setTimeout(() => setRevealed(2), 4200))
    timers.push(setTimeout(() => setRevealed(3), 8200))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedBlossoms(w, h)
    }

    const seedBlossoms = (w: number, h: number) => {
      const blossoms: Blossom[] = []
      const count = w < 600 ? 11 : 18
      // mostly cream, ~one in five lime — signal is sacred
      for (let i = 0; i < count; i++) {
        blossoms.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 5 + Math.random() * 9,
          speed: 0.06 + Math.random() * 0.18, // radians per second, slow
          phase: Math.random() * Math.PI * 2,
          petals: Math.random() < 0.5 ? 4 : 5,
          isLime: i % 5 === 0,
        })
      }
      blossomsRef.current = blossoms
    }

    resize()
    window.addEventListener('resize', resize)
    startRef.current = performance.now()

    const drawBlossom = (b: Blossom, t: number) => {
      const angle = b.phase + b.speed * t
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(angle)
      ctx.strokeStyle = b.isLime ? LIME : CREAM
      ctx.fillStyle = b.isLime ? LIME : CREAM
      ctx.globalAlpha = b.isLime ? 0.85 : 0.55
      ctx.lineWidth = 1
      // petals as small ovals around center
      for (let i = 0; i < b.petals; i++) {
        const a = (i / b.petals) * Math.PI * 2
        const px = Math.cos(a) * b.r
        const py = Math.sin(a) * b.r
        ctx.beginPath()
        ctx.arc(px, py, b.r * 0.42, 0, Math.PI * 2)
        ctx.stroke()
      }
      // tiny center dot
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(0, 0, 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const tick = (now: number) => {
      const t = (now - startRef.current) / 1000
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.fillStyle = HEARTH
      ctx.fillRect(0, 0, w, h)
      for (const b of blossomsRef.current) drawBlossom(b, t)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: HEARTH,
        color: CREAM,
        overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      />

      {/* header */}
      <div
        style={{
          position: 'absolute',
          top: 22,
          left: 22,
          zIndex: 2,
          fontFamily: '"Courier Prime", monospace',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: 2,
          color: CREAM,
          textTransform: 'uppercase',
        }}
      >
        spec · loving grace
        <span style={{ color: LIME }}>.</span>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 22,
          right: 22,
          zIndex: 2,
          fontFamily: '"Courier Prime", monospace',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: 2,
          color: CREAM,
          textTransform: 'uppercase',
          opacity: 0.55,
        }}
      >
        brautigan · 1967
      </div>

      {/* poem */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            maxWidth: 540,
            width: '100%',
          }}
        >
          {STANZAS.map((stanza, si) => (
            <div
              key={si}
              style={{
                opacity: revealed > si ? 1 : 0,
                transition: 'opacity 1800ms ease-in-out',
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 17,
                lineHeight: 1.55,
                color: CREAM,
                textAlign: 'center',
              }}
            >
              {stanza.map((line, li) => (
                <div key={li}>{line}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* caption */}
      <div
        style={{
          position: 'absolute',
          bottom: 22,
          left: 22,
          zIndex: 2,
          fontFamily: '"Fraunces", serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 13,
          color: CREAM,
          opacity: 0.7,
        }}
      >
        machines, watching.
      </div>
    </main>
  )
}
