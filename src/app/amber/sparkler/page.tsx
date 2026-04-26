'use client'

import { useEffect, useRef } from 'react'

// sparkler — drag to draw with light. bright sparks fly off the cursor,
// fall, and fade in ~1.5s. behind them you leave a faint cream "scorch"
// trail on the persistent canvas — what you wrote stays after the sparks
// die. lo-fi hiss while dragging, occasional crackle pops. double-tap an
// empty spot to wipe.

const FIELD = '#0A0A0A'
const SCORCH = 'rgba(232, 226, 200, 0.32)'
const COLORS = [
  '#FF2F7E', // FLARE
  '#FF7A1A', // SODIUM
  '#F8F4E8', // cream-ish
  '#FFD700', // gold (off-menu — sparkler-specific bright)
]

type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number    // ms
  color: string
  size: number
}

const SCORCHES_BUDGET = 1500  // cap so memory doesn't grow forever

export default function SparklerPage() {
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
      mkScorch()
    }

    // persistent scorch buffer — accumulates and never auto-clears
    let scorch: OffscreenCanvas | HTMLCanvasElement
    let scorchCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    function mkScorch() {
      if (typeof OffscreenCanvas !== 'undefined') {
        scorch = new OffscreenCanvas(W * DPR, H * DPR)
        scorchCtx = scorch.getContext('2d') as OffscreenCanvasRenderingContext2D
      } else {
        const c = document.createElement('canvas')
        c.width = W * DPR
        c.height = H * DPR
        scorch = c
        scorchCtx = c.getContext('2d')!
      }
      scorchCtx.scale(DPR, DPR)
      scorchCtx.fillStyle = FIELD
      scorchCtx.fillRect(0, 0, W, H)
    }
    resize()
    window.addEventListener('resize', resize)

    // audio — hiss + occasional crackle pops
    let audioCtx: AudioContext | null = null
    let hissNode: AudioBufferSourceNode | null = null
    let hissBP: BiquadFilterNode | null = null
    let hissGain: GainNode | null = null
    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return }
      const len = audioCtx.sampleRate * 2
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      hissNode = audioCtx.createBufferSource()
      hissNode.buffer = buf
      hissNode.loop = true
      hissBP = audioCtx.createBiquadFilter()
      hissBP.type = 'bandpass'
      hissBP.frequency.value = 4200
      hissBP.Q.value = 0.6
      hissGain = audioCtx.createGain()
      hissGain.gain.value = 0
      hissNode.connect(hissBP).connect(hissGain).connect(audioCtx.destination)
      hissNode.start()
    }
    function setHiss(on: boolean) {
      if (!audioCtx || !hissGain) return
      const t = audioCtx.currentTime
      hissGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.06)
    }
    let lastCrackle = 0
    function maybeCrackle() {
      if (!audioCtx) return
      const now = performance.now()
      // a crackle at most every ~70ms, with random skip
      if (now - lastCrackle < 70) return
      if (Math.random() > 0.35) return
      lastCrackle = now
      const a = audioCtx
      const t = a.currentTime
      const osc = a.createOscillator()
      osc.type = 'square'
      osc.frequency.value = 1800 + Math.random() * 3200
      const g = a.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.04, t + 0.001)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.025)
      osc.connect(g).connect(a.destination)
      osc.start(t)
      osc.stop(t + 0.04)
    }

    // pointer
    let down = false
    let lastX = 0, lastY = 0
    let downT = 0
    let downX = 0, downY = 0
    let moved = false
    let lastTapT = 0
    let lastTapX = 0, lastTapY = 0

    const sparks: Spark[] = []

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function pickColor(): string {
      // bias toward FLARE + SODIUM (the bright fire colors)
      const r = Math.random()
      if (r < 0.4) return COLORS[0]      // FLARE
      if (r < 0.75) return COLORS[1]     // SODIUM
      if (r < 0.93) return COLORS[2]     // cream
      return COLORS[3]                   // gold
    }

    function emitSparks(x: number, y: number, count: number) {
      const now = performance.now()
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.4 + Math.random() * 2.6
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.4, // slight upward bias
          born: now,
          life: 700 + Math.random() * 1100,
          color: pickColor(),
          size: 0.6 + Math.random() * 1.6,
        })
      }
    }

    function drawScorch(x: number, y: number, intensity: number) {
      // a soft cream dot on the persistent scorch buffer
      scorchCtx.fillStyle = `rgba(232, 226, 200, ${(0.18 * intensity).toFixed(3)})`
      scorchCtx.beginPath()
      scorchCtx.arc(x, y, 1.6 + intensity * 1.8, 0, Math.PI * 2)
      scorchCtx.fill()
      // suppress unused
      void SCORCH
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      down = true
      lastX = p.x; lastY = p.y
      downX = p.x; downY = p.y
      downT = performance.now()
      moved = false
      // first burst on tap
      emitSparks(p.x, p.y, 8)
      drawScorch(p.x, p.y, 0.4)
      maybeCrackle()
      setHiss(true)
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!down) return
      const p = getXY(e)
      const dx = p.x - lastX
      const dy = p.y - lastY
      const speed = Math.hypot(dx, dy)
      if (speed > 1) moved = true

      // sample along the segment so fast drags don't gap
      const steps = Math.max(1, Math.ceil(speed / 6))
      for (let i = 1; i <= steps; i++) {
        const x = lastX + (dx * i) / steps
        const y = lastY + (dy * i) / steps
        // intensity scales with speed
        const intensity = Math.min(1, 0.35 + speed * 0.04)
        // emit per substep
        emitSparks(x, y, 1 + Math.floor(speed * 0.2))
        drawScorch(x, y, intensity)
      }
      maybeCrackle()
      lastX = p.x; lastY = p.y
    })

    function endStroke(p?: { x: number; y: number }) {
      if (!down) return
      down = false
      setHiss(false)
      const dt = performance.now() - downT
      const xy = p ?? { x: lastX, y: lastY }
      const dist = Math.hypot(xy.x - downX, xy.y - downY)
      // double-tap empty area (no movement) → wipe
      if (!moved && dt < 250 && dist < 6) {
        const now = performance.now()
        const distFromLastTap = Math.hypot(xy.x - lastTapX, xy.y - lastTapY)
        if (now - lastTapT < 380 && distFromLastTap < 60) {
          // wipe
          scorchCtx.save()
          scorchCtx.fillStyle = FIELD
          scorchCtx.fillRect(0, 0, W, H)
          scorchCtx.restore()
          lastTapT = 0
        } else {
          lastTapT = now
          lastTapX = xy.x; lastTapY = xy.y
        }
      }
    }

    canvas.addEventListener('pointerup', (e) => endStroke(getXY(e)))
    canvas.addEventListener('pointerleave', () => endStroke())

    // memory cap on scorch — if buffer gets too dense, slowly let oldest decay
    // (simple approach: don't track ages, just rely on visual subtlety + cap
    // spark count instead)

    function loop() {
      const now = performance.now()

      // base background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // draw the persistent scorch underneath
      ctx!.drawImage(scorch as CanvasImageSource, 0, 0, W, H)

      // update and draw sparks (additive light)
      ctx!.globalCompositeOperation = 'lighter'

      // gravity + drag
      const G = 0.04
      const DRAG = 0.985

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        const age = now - s.born
        if (age > s.life) { sparks.splice(i, 1); continue }
        s.vx *= DRAG
        s.vy = s.vy * DRAG + G
        s.x += s.vx
        s.y += s.vy

        const t = age / s.life
        // brightness falls quickly then long tail
        const alpha = (1 - t) * (1 - t * 0.6)
        const r = s.size * (1 - t * 0.3)

        ctx!.fillStyle = withAlpha(s.color, alpha)
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, r, 0, Math.PI * 2)
        ctx!.fill()

        // glow halo for cream/gold sparks
        if (s.color === '#F8F4E8' || s.color === '#FFD700') {
          ctx!.fillStyle = withAlpha(s.color, alpha * 0.35)
          ctx!.beginPath()
          ctx!.arc(s.x, s.y, r * 2.6, 0, Math.PI * 2)
          ctx!.fill()
        }
      }

      ctx!.globalCompositeOperation = 'source-over'

      // sparks budget cap — drop oldest if over
      if (sparks.length > SCORCHES_BUDGET) {
        sparks.splice(0, sparks.length - SCORCHES_BUDGET)
      }

      // small sparkler "tip" indicator at last position when active
      if (down) {
        ctx!.fillStyle = '#FFD700'
        ctx!.beginPath()
        ctx!.arc(lastX, lastY, 2.2, 0, Math.PI * 2)
        ctx!.fill()
      }

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
            opacity: 0.6,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          draw with light.
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
          SPARKLER · TOY · 006
          <div style={{ marginTop: 4 }}>DOUBLE-TAP EMPTY · WIPE</div>
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

function withAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`
}
