'use client'

import { useEffect, useRef } from 'react'

// wrap — bubble wrap. tap a bubble to pop it. drag across to pop a row.
// each pop leaves a flare-pink dimple that stays. the sheet fills up with
// little wounds you made. double-tap an empty area to re-inflate.
// no goal. no score. you pop bubbles.

const FIELD = '#1A110A'
const SHEET = '#1F1610'      // slightly lifted from FIELD — a sheet sitting on the table
const SHEET_EDGE = '#2A1F18'
const BUBBLE = '#E8E2D4'     // cream, slightly warm
const BUBBLE_HI = '#F8F4E8'  // sheen
const FLARE = '#FF2F7E'
const POPPED_RIM = '#3A2620'

type Bubble = {
  cx: number
  cy: number
  r: number
  popped: boolean
  popT: number   // time of pop, 0 if never popped (for the pop animation)
  jitterX: number
  jitterY: number
  shrinkR: number // small per-bubble variance
}

export default function WrapPage() {
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
    resize()

    // grid layout — choose columns so cells stay roughly square and fit nicely
    const bubbles: Bubble[] = []
    let bubbleR = 0

    function layoutGrid() {
      bubbles.length = 0
      // target diameter ~46px on desktop, scale for narrower viewports
      const targetD = Math.max(36, Math.min(64, Math.min(W, H) * 0.07))
      const gap = 6
      const cellSize = targetD + gap
      const padding = Math.max(28, Math.min(W, H) * 0.06)
      const cols = Math.max(4, Math.floor((W - padding * 2) / cellSize))
      const rows = Math.max(6, Math.floor((H - padding * 2) / cellSize))
      const spanX = (cols - 1) * cellSize
      const spanY = (rows - 1) * cellSize
      const startX = (W - spanX) / 2
      const startY = (H - spanY) / 2
      bubbleR = targetD / 2
      // small deterministic jitter per cell so the grid doesn't look like a grid
      let s = 20260425
      const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // offset every other row a little — like a real bubble wrap layout
          const stagger = (r % 2) * (cellSize * 0.18)
          bubbles.push({
            cx: startX + c * cellSize + stagger,
            cy: startY + r * cellSize,
            r: bubbleR * (0.92 + rand() * 0.12),
            popped: false,
            popT: 0,
            jitterX: (rand() - 0.5) * 2.2,
            jitterY: (rand() - 0.5) * 2.2,
            shrinkR: bubbleR * (0.34 + rand() * 0.18),
          })
        }
      }
    }
    layoutGrid()

    window.addEventListener('resize', () => { resize(); layoutGrid() })

    // audio — low-fi pop. noise burst → bandpass with quick sweep + a click.
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
    let lastPopAudio = 0
    function popSound() {
      const now = performance.now()
      if (now - lastPopAudio < 18) return // very tight rate-limit so drag-pops still pop
      lastPopAudio = now
      if (!audioCtx) return
      const a = audioCtx
      const t = a.currentTime
      // body: short noise burst through a bandpass that sweeps down
      const src = a.createBufferSource()
      src.buffer = noiseBuf
      const bp = a.createBiquadFilter()
      bp.type = 'bandpass'
      const startF = 1400 + Math.random() * 1800
      bp.frequency.setValueAtTime(startF, t)
      bp.frequency.exponentialRampToValueAtTime(Math.max(220, startF * 0.18), t + 0.09)
      bp.Q.value = 4
      const g = a.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.18, t + 0.003)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11)
      src.connect(bp).connect(g).connect(a.destination)
      src.start(t)
      src.stop(t + 0.16)

      // click: a tiny pitched transient on top
      const osc = a.createOscillator()
      osc.type = 'square'
      osc.frequency.value = 300 + Math.random() * 240
      const og = a.createGain()
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(0.06, t + 0.001)
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
      osc.connect(og).connect(a.destination)
      osc.start(t)
      osc.stop(t + 0.05)
    }

    function bubbleAt(x: number, y: number): Bubble | null {
      // small radius padding so edge taps still register
      for (const b of bubbles) {
        if (b.popped) continue
        const dx = x - b.cx
        const dy = y - b.cy
        if (dx * dx + dy * dy <= b.r * b.r) return b
      }
      return null
    }

    // pointer
    let down = false
    let lastX = 0, lastY = 0
    let downX = 0, downY = 0
    let downT = 0
    let moved = false
    let lastTapT = 0
    let lastTapX = 0, lastTapY = 0

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function popOne(b: Bubble) {
      b.popped = true
      b.popT = performance.now()
      popSound()
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      down = true
      lastX = p.x; lastY = p.y
      downX = p.x; downY = p.y
      downT = performance.now()
      moved = false

      const b = bubbleAt(p.x, p.y)
      if (b) {
        popOne(b)
      } else {
        // empty-area double-tap → reset all
        const now = performance.now()
        const distFromLastTap = Math.hypot(p.x - lastTapX, p.y - lastTapY)
        if (now - lastTapT < 380 && distFromLastTap < 40) {
          for (const bb of bubbles) {
            bb.popped = false
            bb.popT = 0
          }
          lastTapT = 0
        } else {
          lastTapT = now
          lastTapX = p.x; lastTapY = p.y
        }
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!down) return
      const p = getXY(e)
      const dx = p.x - lastX
      const dy = p.y - lastY
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true
      // sample along the segment to catch all crossed bubbles
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (bubbleR * 0.6)))
      for (let i = 1; i <= steps; i++) {
        const x = lastX + (dx * i) / steps
        const y = lastY + (dy * i) / steps
        const b = bubbleAt(x, y)
        if (b) popOne(b)
      }
      lastX = p.x; lastY = p.y
    })

    canvas.addEventListener('pointerup', () => {
      down = false
    })
    canvas.addEventListener('pointerleave', () => {
      down = false
    })
    void downT; void downX; void downY; void moved // keep these for future use

    // draw
    function draw() {
      const now = performance.now()

      // background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // sheet — rectangle tighter than the bubble bounds
      const margin = Math.max(20, Math.min(W, H) * 0.04)
      ctx!.fillStyle = SHEET
      ctx!.fillRect(margin, margin, W - margin * 2, H - margin * 2)
      // sheet edge (subtle inner shadow / outline)
      ctx!.strokeStyle = SHEET_EDGE
      ctx!.lineWidth = 1
      ctx!.strokeRect(margin + 0.5, margin + 0.5, W - margin * 2 - 1, H - margin * 2 - 1)

      // bubbles
      for (const b of bubbles) {
        const cx = b.cx + b.jitterX
        const cy = b.cy + b.jitterY

        if (!b.popped) {
          // unpopped: round cream bubble with sheen
          ctx!.fillStyle = BUBBLE
          ctx!.beginPath()
          ctx!.arc(cx, cy, b.r, 0, Math.PI * 2)
          ctx!.fill()
          // sheen — small offset white-ish circle
          ctx!.fillStyle = BUBBLE_HI
          ctx!.beginPath()
          ctx!.arc(cx - b.r * 0.32, cy - b.r * 0.32, b.r * 0.32, 0, Math.PI * 2)
          ctx!.fill()
          // soft outline
          ctx!.strokeStyle = 'rgba(0,0,0,0.18)'
          ctx!.lineWidth = 1
          ctx!.beginPath()
          ctx!.arc(cx, cy, b.r, 0, Math.PI * 2)
          ctx!.stroke()
        } else {
          // popped: brief deflation animation, then a flare dimple persists
          const age = now - b.popT
          const popDur = 220
          if (age < popDur) {
            // deflating: scale shrinks from 1 → ~0.45, with a tiny scale wobble
            const t = age / popDur
            const scale = 1 - 0.55 * t + Math.sin(t * 18) * 0.04 * (1 - t)
            ctx!.fillStyle = BUBBLE
            ctx!.beginPath()
            ctx!.arc(cx, cy, Math.max(2, b.r * scale), 0, Math.PI * 2)
            ctx!.fill()
            // flare puff expanding outward as the bubble deflates
            const puffR = b.r * (0.6 + t * 1.4)
            ctx!.strokeStyle = `rgba(255, 47, 126, ${(1 - t).toFixed(3)})`
            ctx!.lineWidth = 2
            ctx!.beginPath()
            ctx!.arc(cx, cy, puffR, 0, Math.PI * 2)
            ctx!.stroke()
          } else {
            // settled: a small flare dimple. ringed cavity.
            ctx!.fillStyle = POPPED_RIM
            ctx!.beginPath()
            ctx!.arc(cx, cy, b.shrinkR + 1.5, 0, Math.PI * 2)
            ctx!.fill()
            ctx!.fillStyle = FLARE
            ctx!.beginPath()
            ctx!.arc(cx, cy, b.shrinkR, 0, Math.PI * 2)
            ctx!.fill()
            // tiny dark inner dot to look like a deflated cavity
            ctx!.fillStyle = 'rgba(0,0,0,0.35)'
            ctx!.beginPath()
            ctx!.arc(cx, cy, b.shrinkR * 0.4, 0, Math.PI * 2)
            ctx!.fill()
          }
        }
      }

      requestAnimationFrame(draw)
    }
    draw()

    return () => {
      window.removeEventListener('resize', () => { resize(); layoutGrid() })
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
            cursor: 'pointer',
          }}
        />

        {/* corner caption — fraunces italic, lo-fi */}
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
            opacity: 0.75,
            pointerEvents: 'none',
          }}
        >
          pop them all.
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
          }}
        >
          WRAP · TOY · 005
          <div style={{ marginTop: 4 }}>DOUBLE-TAP EMPTY · RESET</div>
        </div>

        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(22px + env(safe-area-inset-right, 0px))',
            color: 'rgba(232,232,232,0.55)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.18em',
            textDecoration: 'none',
          }}
        >
          a.
          <span style={{ color: '#FF2F7E' }}>·</span>
        </a>
      </div>
    </>
  )
}
