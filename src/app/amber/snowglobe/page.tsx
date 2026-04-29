'use client'

import { useEffect, useRef } from 'react'

// snowglobe — a glass dome on a dark plate. ~140 cream and flare-pink
// glitter flecks live inside. each frame, gravity pulls them toward the
// dome floor, with viscous drag making the descent slow and dreamy. drag
// the dome to shake — every fleck inside gets a velocity kick in your drag
// direction (with random spread) and starts floating again. release and
// they drift back to the bottom, settling in a small pile. soft rattle
// audio while shaking — short bandpassed noise pops, rate-limited so it
// doesn't crackle.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const FLARE = '#FF2F7E'
const DOME_OUTLINE = 'rgba(232, 232, 232, 0.12)'
const BASE_FILL = '#1A1410' // base of the snowglobe (the wood/plastic part)
const BASE_OUTLINE = 'rgba(232, 232, 232, 0.18)'

type Fleck = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  // spin
  rot: number
  spin: number
}

const FLECK_COUNT = 140

export default function SnowglobePage() {
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
    window.addEventListener('resize', resize)

    // dome geometry — recomputed on resize
    function getDome() {
      const r = Math.min(W, H) * 0.32
      // dome center positioned slightly up so the base sits below
      const cx = W / 2
      const cy = H / 2 - r * 0.08
      // base — a wooden disc beneath the dome
      const baseY = cy + r + 8
      const baseW = r * 1.4
      const baseH = Math.max(28, r * 0.18)
      // dome interior — circular for hit-test purposes; render as proper sphere outline
      return { cx, cy, r, baseY, baseW, baseH }
    }
    let dome = getDome()
    window.addEventListener('resize', () => { dome = getDome() })

    // flecks live in dome-relative coords (centered at dome center)
    const flecks: Fleck[] = []
    function seed() {
      flecks.length = 0
      for (let i = 0; i < FLECK_COUNT; i++) {
        // start them piled at the bottom
        const a = (Math.random() - 0.5) * Math.PI * 0.95 + Math.PI / 2 // bottom half
        const r = dome.r * (0.7 + Math.random() * 0.28)
        flecks.push({
          x: dome.cx + Math.cos(a) * r * Math.random(),
          y: dome.cy + Math.sin(a) * r,
          vx: 0,
          vy: 0,
          size: 1.2 + Math.random() * 1.6,
          color: Math.random() < 0.78 ? CREAM : FLARE,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.06,
        })
      }
    }
    seed()
    window.addEventListener('resize', () => seed())

    // audio — rattle pops while shaking
    let audioCtx: AudioContext | null = null
    let noiseBuf: AudioBuffer | null = null
    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return }
      const len = audioCtx.sampleRate * 0.4
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      noiseBuf = buf
    }
    let lastRattle = 0
    function rattlePop(intensity: number) {
      const now = performance.now()
      if (now - lastRattle < 28) return
      lastRattle = now
      if (!audioCtx || !noiseBuf) return
      const a = audioCtx
      const t = a.currentTime
      const src = a.createBufferSource()
      src.buffer = noiseBuf
      const bp = a.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(2200 + Math.random() * 2400, t)
      bp.Q.value = 1.6
      const g = a.createGain()
      const peak = Math.min(0.10, 0.02 + intensity * 0.08)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + 0.003)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
      src.connect(bp).connect(g).connect(a.destination)
      src.start(t)
      src.stop(t + 0.06)
    }

    // pointer
    let down = false
    let lastX = 0, lastY = 0

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function shake(dx: number, dy: number) {
      // any drag inside the dome circle pushes glitter in that direction
      const speed = Math.hypot(dx, dy)
      for (const f of flecks) {
        // small random spread per fleck
        const spread = 0.35
        f.vx += dx * (1 + (Math.random() - 0.5) * spread) * 0.6
        f.vy += dy * (1 + (Math.random() - 0.5) * spread) * 0.6
        f.spin += (Math.random() - 0.5) * 0.08
      }
      rattlePop(Math.min(1, speed / 50))
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      down = true
      lastX = p.x
      lastY = p.y
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return
      const p = getXY(e)
      const dx = p.x - lastX
      const dy = p.y - lastY
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        shake(dx, dy)
      }
      lastX = p.x
      lastY = p.y
    })
    canvas.addEventListener('pointerup', () => { down = false })
    canvas.addEventListener('pointerleave', () => { down = false })

    // physics constants
    const GRAVITY = 0.045 // gentle (water-like)
    const DRAG = 0.965    // viscous

    let lastFrameT = performance.now()
    function loop() {
      const now = performance.now()
      const dt = Math.min(50, now - lastFrameT)
      lastFrameT = now

      // background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // base of the snowglobe — a wooden disc + outline
      ctx!.fillStyle = BASE_FILL
      ctx!.beginPath()
      ctx!.ellipse(dome.cx, dome.baseY + dome.baseH * 0.5, dome.baseW * 0.5, dome.baseH * 0.5, 0, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.strokeStyle = BASE_OUTLINE
      ctx!.lineWidth = 1
      ctx!.stroke()
      // a faint horizontal seam line on the base — that little detail
      ctx!.strokeStyle = 'rgba(232, 232, 232, 0.06)'
      ctx!.beginPath()
      ctx!.moveTo(dome.cx - dome.baseW * 0.45, dome.baseY + dome.baseH * 0.55)
      ctx!.lineTo(dome.cx + dome.baseW * 0.45, dome.baseY + dome.baseH * 0.55)
      ctx!.stroke()

      // step glitter
      for (const f of flecks) {
        // gravity (pulls toward dome floor, but in screen coords gravity is +y)
        f.vy += GRAVITY
        // drag (viscous, like water)
        f.vx *= DRAG
        f.vy *= DRAG
        f.x += f.vx
        f.y += f.vy
        f.rot += f.spin
        f.spin *= 0.985

        // contain inside dome circle (radius dome.r) — if outside, project back
        const dx = f.x - dome.cx
        const dy = f.y - dome.cy
        const d = Math.hypot(dx, dy)
        if (d > dome.r - 1) {
          // push back to inside dome edge, with bounce
          const nx = dx / d
          const ny = dy / d
          f.x = dome.cx + nx * (dome.r - 1)
          f.y = dome.cy + ny * (dome.r - 1)
          // velocity: reflect, dampen
          const dot = f.vx * nx + f.vy * ny
          f.vx -= 2 * dot * nx
          f.vy -= 2 * dot * ny
          f.vx *= 0.4
          f.vy *= 0.4
        }
      }

      // draw flecks
      for (const f of flecks) {
        ctx!.save()
        ctx!.translate(f.x, f.y)
        ctx!.rotate(f.rot)
        ctx!.fillStyle = f.color
        // small rectangular flake
        ctx!.fillRect(-f.size, -f.size * 0.4, f.size * 2, f.size * 0.8)
        ctx!.restore()
      }

      // draw dome outline LAST so it sits on top
      ctx!.strokeStyle = DOME_OUTLINE
      ctx!.lineWidth = 2
      ctx!.beginPath()
      ctx!.arc(dome.cx, dome.cy, dome.r, 0, Math.PI * 2)
      ctx!.stroke()

      // subtle inner highlight at the upper-left of the dome to suggest glass
      const grad = ctx!.createRadialGradient(
        dome.cx - dome.r * 0.45,
        dome.cy - dome.r * 0.45,
        0,
        dome.cx - dome.r * 0.45,
        dome.cy - dome.r * 0.45,
        dome.r * 0.6,
      )
      grad.addColorStop(0, 'rgba(232, 232, 232, 0.06)')
      grad.addColorStop(1, 'rgba(232, 232, 232, 0)')
      ctx!.fillStyle = grad
      ctx!.beginPath()
      ctx!.arc(dome.cx, dome.cy, dome.r - 1, 0, Math.PI * 2)
      ctx!.fill()

      void dt

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
            cursor: 'grab',
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
          shake it.
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
          SNOWGLOBE · TOY · 010
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
          <span style={{ color: FLARE }}>·</span>
        </a>
      </div>
    </>
  )
}
