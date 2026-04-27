'use client'

import { useEffect, useRef } from 'react'

// stickers — tap to place. each placement spawns a sticker at the cursor:
// random shape (star / heart / circle / smiley / blob), random color
// (flare / lime / sodium / uv / cream), random rotation, slight scale wobble,
// slightly irregular edges. stickers persist and accumulate. drag drops a
// sticker every ~32px so a swipe lays a row. lo-fi peel + thunk audio per
// placement. double-tap an empty area to clear.

const FIELD = '#1A110A'
const COLORS: Record<string, string> = {
  flare: '#FF2F7E',
  lime:  '#C6FF3C',
  sodium:'#FF7A1A',
  uv:    '#A855F7',
  cream: '#EFE7D8',
}
const COLOR_KEYS = Object.keys(COLORS)
type ShapeKind = 'star' | 'heart' | 'circle' | 'smiley' | 'blob'
const SHAPES: ShapeKind[] = ['star', 'heart', 'circle', 'smiley', 'blob']

type Sticker = {
  x: number
  y: number
  size: number    // base radius
  rot: number     // radians
  shape: ShapeKind
  colorKey: string
  // shape-specific seed for stable irregular edges
  seed: number
}

export default function StickersPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * DPR
      canvas!.height = H * DPR
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.scale(DPR, DPR)
    }

    // persistent buffer — stickers don't redraw every frame
    let stickerCanvas: OffscreenCanvas | HTMLCanvasElement
    let stickerCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    function mkStickerBuffer() {
      if (typeof OffscreenCanvas !== 'undefined') {
        stickerCanvas = new OffscreenCanvas(W * DPR, H * DPR)
        stickerCtx = stickerCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D
      } else {
        const c = document.createElement('canvas')
        c.width = W * DPR
        c.height = H * DPR
        stickerCanvas = c
        stickerCtx = c.getContext('2d')!
      }
      stickerCtx.scale(DPR, DPR)
      stickerCtx.fillStyle = FIELD
      stickerCtx.fillRect(0, 0, W, H)
    }

    resize()
    mkStickerBuffer()
    window.addEventListener('resize', () => {
      resize()
      mkStickerBuffer()
    })

    // audio — short peel sound + thunk
    let audioCtx: AudioContext | null = null
    let noiseBuf: AudioBuffer | null = null
    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return }
      const len = audioCtx.sampleRate * 0.3
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      noiseBuf = buf
    }
    let lastSoundT = 0
    function peelSound() {
      const now = performance.now()
      if (now - lastSoundT < 30) return
      lastSoundT = now
      if (!audioCtx || !noiseBuf) return
      const a = audioCtx
      const t = a.currentTime
      // peel: short noise burst with hi-pass sweep down (rip-y)
      const src = a.createBufferSource()
      src.buffer = noiseBuf
      const hp = a.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.setValueAtTime(2400 + Math.random() * 1600, t)
      hp.frequency.exponentialRampToValueAtTime(700, t + 0.1)
      const g = a.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.10, t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      src.connect(hp).connect(g).connect(a.destination)
      src.start(t)
      src.stop(t + 0.18)

      // thunk: low square click
      const osc = a.createOscillator()
      osc.type = 'square'
      osc.frequency.value = 110 + Math.random() * 70
      const og = a.createGain()
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(0.05, t + 0.002)
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
      osc.connect(og).connect(a.destination)
      osc.start(t)
      osc.stop(t + 0.08)
    }

    // sticker drawing
    // small cheap pseudo-random for shape jitter
    function srand(seed: number, k: number): number {
      const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453
      return x - Math.floor(x)
    }

    function drawSticker(s: Sticker) {
      const c = stickerCtx
      const color = COLORS[s.colorKey]
      c.save()
      c.translate(s.x, s.y)
      c.rotate(s.rot)

      // soft shadow first
      c.save()
      c.translate(2, 3)
      c.fillStyle = 'rgba(0,0,0,0.35)'
      drawShapePath(c, s.shape, s.size * 1.02, s.seed)
      c.fill()
      c.restore()

      // main sticker
      c.fillStyle = color
      drawShapePath(c, s.shape, s.size, s.seed)
      c.fill()
      // thin darker outline so it reads as a sticker, not just a fill
      c.strokeStyle = 'rgba(0,0,0,0.22)'
      c.lineWidth = 1
      c.stroke()

      // sheen highlight — small offset light streak
      c.save()
      c.globalCompositeOperation = 'lighter'
      c.fillStyle = 'rgba(255,255,255,0.18)'
      c.beginPath()
      c.ellipse(-s.size * 0.32, -s.size * 0.32, s.size * 0.26, s.size * 0.14, -0.4, 0, Math.PI * 2)
      c.fill()
      c.restore()

      // shape-specific overlay (smiley face features)
      if (s.shape === 'smiley') {
        c.fillStyle = '#1A110A'
        c.beginPath()
        c.arc(-s.size * 0.32, -s.size * 0.18, s.size * 0.08, 0, Math.PI * 2)
        c.arc( s.size * 0.32, -s.size * 0.18, s.size * 0.08, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#1A110A'
        c.lineWidth = Math.max(1.5, s.size * 0.06)
        c.lineCap = 'round'
        c.beginPath()
        c.arc(0, s.size * 0.05, s.size * 0.42, 0.2, Math.PI - 0.2)
        c.stroke()
      }

      c.restore()
    }

    function drawShapePath(c: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, shape: ShapeKind, r: number, seed: number) {
      c.beginPath()
      const jitter = (k: number) => 1 + (srand(seed, k) - 0.5) * 0.12
      switch (shape) {
        case 'circle': {
          // slightly irregular circle (16 sides with jitter)
          const N = 16
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2
            const rr = r * jitter(i)
            const x = Math.cos(a) * rr
            const y = Math.sin(a) * rr
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
          }
          c.closePath()
          break
        }
        case 'star': {
          // 5-point star with slight per-vertex jitter
          const N = 10 // 5 outer + 5 inner
          const outer = r * 1.05
          const inner = r * 0.46
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2 - Math.PI / 2
            const rr = (i % 2 === 0 ? outer : inner) * jitter(i)
            const x = Math.cos(a) * rr
            const y = Math.sin(a) * rr
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
          }
          c.closePath()
          break
        }
        case 'heart': {
          // parametric heart, scaled into r
          const SCALE = r / 18
          c.moveTo(0, 5 * SCALE)
          for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.08) {
            const x = 16 * Math.pow(Math.sin(t), 3)
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
            c.lineTo(x * SCALE * jitter(Math.floor(t * 4)), y * SCALE * jitter(Math.floor(t * 4) + 1))
          }
          c.closePath()
          break
        }
        case 'smiley': {
          // a near-circle with face features overlaid by drawSticker
          const N = 24
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2
            const rr = r * (0.96 + (srand(seed, i) - 0.5) * 0.04)
            const x = Math.cos(a) * rr
            const y = Math.sin(a) * rr
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
          }
          c.closePath()
          break
        }
        case 'blob': {
          // organic irregular blob — 12 sides, larger jitter
          const N = 12
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2
            const rr = r * (0.8 + srand(seed, i) * 0.5)
            const x = Math.cos(a) * rr
            const y = Math.sin(a) * rr
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
          }
          c.closePath()
          break
        }
      }
    }

    // pointer state
    let down = false
    let lastPlaceX = 0, lastPlaceY = 0
    let downX = 0, downY = 0
    let downT = 0
    let moved = false
    let lastTapT = 0
    let lastTapX = 0, lastTapY = 0

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function placeSticker(x: number, y: number) {
      const minWH = Math.min(W, H)
      const size = (minWH * 0.06) * (0.85 + Math.random() * 0.4)
      const rot = (Math.random() - 0.5) * 0.85 // ±~25°
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
      const colorKey = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)]
      const s: Sticker = {
        x, y, size, rot, shape, colorKey,
        seed: Math.floor(Math.random() * 1e6),
      }
      drawSticker(s)
      peelSound()
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      down = true
      downX = p.x; downY = p.y
      downT = performance.now()
      lastPlaceX = p.x; lastPlaceY = p.y
      moved = false
      placeSticker(p.x, p.y)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return
      const p = getXY(e)
      const d = Math.hypot(p.x - lastPlaceX, p.y - lastPlaceY)
      if (d > 32) {
        // drop a sticker every ~32px along the path
        placeSticker(p.x, p.y)
        lastPlaceX = p.x; lastPlaceY = p.y
      }
      const totalMoved = Math.hypot(p.x - downX, p.y - downY)
      if (totalMoved > 4) moved = true
    })
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return
      const p = getXY(e)
      const dt = performance.now() - downT
      down = false
      // double-tap empty (no movement) → wipe
      if (!moved && dt < 250) {
        const now = performance.now()
        const distFromLastTap = Math.hypot(p.x - lastTapX, p.y - lastTapY)
        if (now - lastTapT < 380 && distFromLastTap < 60) {
          // wipe
          stickerCtx.save()
          stickerCtx.fillStyle = FIELD
          stickerCtx.fillRect(0, 0, W, H)
          stickerCtx.restore()
          lastTapT = 0
        } else {
          lastTapT = now
          lastTapX = p.x; lastTapY = p.y
        }
      }
    })
    canvas.addEventListener('pointerleave', () => { down = false })

    function loop() {
      // composite the persistent sticker buffer onto the visible canvas
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)
      ctx!.drawImage(stickerCanvas as CanvasImageSource, 0, 0, W, H)
      requestAnimationFrame(loop)
    }
    loop()

    return () => {
      window.removeEventListener('resize', resize)
      if (audioCtx) {
        try { audioCtx.close() } catch {}
      }
    }
  }, [])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: FIELD,
          overflow: 'hidden',
          height: '100dvh',
          width: '100vw',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />

        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            left: 'calc(22px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 18,
            opacity: 0.65,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          stick it.
        </div>

        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            right: 'calc(22px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.22em',
            opacity: 0.32,
            pointerEvents: 'none',
            textAlign: 'right',
            mixBlendMode: 'difference',
          }}
        >
          STICKERS · TOY · 007
          <div style={{ marginTop: 4 }}>DOUBLE-TAP EMPTY · WIPE</div>
        </div>

        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(22px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.18em',
            textDecoration: 'none',
            opacity: 0.55,
            mixBlendMode: 'difference',
          }}
        >
          a.
          <span style={{ color: '#FF2F7E' }}>·</span>
        </a>
      </div>
    </>
  )
}
