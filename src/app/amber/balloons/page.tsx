'use client'

import { useEffect, useRef } from 'react'

// balloons — bright balloons drift up across a NIGHT field, swaying as they
// rise. tap one to pop it: brief deflation animation, scattered flecks of
// that balloon's color, lo-fi pop sound. they spawn at the bottom and
// despawn off the top, so the supply never runs out. you can pop them all,
// pop a few, or let them rise.

const FIELD = '#0A0A0A'
const COLORS = ['#FF2F7E', '#C6FF3C', '#FF7A1A', '#A855F7', '#EFE7D8']
const STRING_COLOR = 'rgba(180, 170, 150, 0.55)'

type Balloon = {
  x: number
  y: number
  baseX: number
  size: number       // current radius
  color: string
  vy: number         // rise speed (px/sec)
  swaySeed: number
  born: number
  alive: boolean
  popping: boolean
  popT: number
  flecks: Fleck[]
}

type Fleck = {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  color: string
  size: number
}

const MIN_BALLOONS = 5
const MAX_BALLOONS = 8

export default function BalloonsPage() {
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

    const balloons: Balloon[] = []
    let lastSpawnT = 0

    function spawnBalloon(now: number) {
      const minWH = Math.min(W, H)
      const size = minWH * (0.045 + Math.random() * 0.04)
      const baseX = size + Math.random() * (W - size * 2)
      const startY = H + size * 1.5
      balloons.push({
        x: baseX,
        y: startY,
        baseX,
        size,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        // slow rise so you have time to pop them
        vy: 18 + Math.random() * 22, // px/sec
        swaySeed: Math.random() * Math.PI * 2,
        born: now,
        alive: true,
        popping: false,
        popT: 0,
        flecks: [],
      })
    }

    // initial population, distributed up the screen
    {
      const now = performance.now()
      for (let i = 0; i < MIN_BALLOONS; i++) {
        spawnBalloon(now)
        // spread initial y up the screen
        const last = balloons[balloons.length - 1]
        last.y = H - (i / MIN_BALLOONS) * H
      }
    }

    // audio — pop sound per balloon, bigger and brighter than wrap
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
    let lastPopT = 0
    function popSound() {
      const now = performance.now()
      if (now - lastPopT < 22) return
      lastPopT = now
      if (!audioCtx || !noiseBuf) return
      const a = audioCtx
      const t = a.currentTime
      // sharp body: noise burst with a steep bandpass that sweeps down fast
      const src = a.createBufferSource()
      src.buffer = noiseBuf
      const bp = a.createBiquadFilter()
      bp.type = 'bandpass'
      const startF = 1800 + Math.random() * 2400
      bp.frequency.setValueAtTime(startF, t)
      bp.frequency.exponentialRampToValueAtTime(180, t + 0.07)
      bp.Q.value = 5
      const g = a.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.22, t + 0.002)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      src.connect(bp).connect(g).connect(a.destination)
      src.start(t)
      src.stop(t + 0.18)

      // a low thunk underneath
      const osc = a.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(160 + Math.random() * 80, t)
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.08)
      const og = a.createGain()
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(0.08, t + 0.003)
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      osc.connect(og).connect(a.destination)
      osc.start(t)
      osc.stop(t + 0.12)
    }

    function pop(b: Balloon) {
      if (b.popping) return
      b.popping = true
      b.popT = performance.now()
      // emit ~14 flecks of the balloon's color, plus a couple of cream
      for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 80 + Math.random() * 220
        b.flecks.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          born: b.popT,
          life: 700 + Math.random() * 600,
          color: i < 13 ? b.color : '#EFE7D8',
          size: 1.2 + Math.random() * 2.4,
        })
      }
      popSound()
    }

    // pointer
    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function tryPopAt(x: number, y: number) {
      // pop the topmost (most-recently-spawned, last in array, drawn on top)
      // among hits — but we also want hit-tolerance so easier to tap
      for (let i = balloons.length - 1; i >= 0; i--) {
        const b = balloons[i]
        if (!b.alive || b.popping) continue
        const dx = x - b.x
        const dy = y - b.y
        const r = b.size + 6 // tap padding
        if (dx * dx + dy * dy <= r * r) {
          pop(b)
          return
        }
      }
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      tryPopAt(p.x, p.y)
    })

    let lastFrameT = performance.now()
    function loop() {
      const now = performance.now()
      const dt = Math.min(50, now - lastFrameT) / 1000
      lastFrameT = now

      // background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // step balloons + flecks
      for (let i = balloons.length - 1; i >= 0; i--) {
        const b = balloons[i]
        if (!b.alive) {
          balloons.splice(i, 1)
          continue
        }
        if (!b.popping) {
          // rise
          b.y -= b.vy * dt
          // sway
          const t = (now - b.born) / 1000
          b.x = b.baseX + Math.sin(t * 0.9 + b.swaySeed) * b.size * 0.6
        } else {
          // popping — deflation animation lasts ~280ms, then balloon goes away
          const age = now - b.popT
          if (age > 280) {
            // we keep flecks alive even after balloon goes away
            // mark balloon as "no draw" but keep it for fleck rendering
            // simplest: keep balloon entry, but render only flecks once popping >= 280ms
          }
          if (age > 1600) {
            b.alive = false
            continue
          }
        }

        // step flecks
        for (let j = b.flecks.length - 1; j >= 0; j--) {
          const f = b.flecks[j]
          const fage = now - f.born
          if (fage > f.life) { b.flecks.splice(j, 1); continue }
          f.vx *= 0.94
          f.vy = f.vy * 0.94 + 320 * dt // gravity
          f.x += f.vx * dt
          f.y += f.vy * dt
        }

        // remove if drifted off the top
        if (!b.popping && b.y + b.size < -20) {
          b.alive = false
        }
      }

      // spawn new balloons
      if (balloons.filter(b => !b.popping).length < MIN_BALLOONS && now - lastSpawnT > 700) {
        spawnBalloon(now)
        lastSpawnT = now
      }
      if (balloons.length < MAX_BALLOONS && now - lastSpawnT > 2400) {
        spawnBalloon(now)
        lastSpawnT = now
      }

      // draw balloons (sort by y so back ones draw first)
      const drawList = balloons.slice().sort((a, b) => b.y - a.y)
      for (const b of drawList) {
        if (b.popping) {
          const age = now - b.popT
          if (age < 280) {
            const t = age / 280
            const scale = 1 - 0.6 * t
            const alpha = 1 - t
            ctx!.fillStyle = withAlpha(b.color, alpha)
            ctx!.beginPath()
            // draw the balloon shrinking with a tiny shake
            const wobble = Math.sin(age * 0.05) * 1.5
            ctx!.ellipse(b.x + wobble, b.y, b.size * scale, b.size * scale * 1.1, 0, 0, Math.PI * 2)
            ctx!.fill()
          }
        } else {
          // string first (so balloon overlaps it)
          ctx!.strokeStyle = STRING_COLOR
          ctx!.lineWidth = 1
          ctx!.beginPath()
          ctx!.moveTo(b.x, b.y + b.size)
          // a gentle wavy string
          const segs = 6
          const stringLen = b.size * 2.6
          for (let s = 1; s <= segs; s++) {
            const t = s / segs
            const sway = Math.sin((now / 1000) * 1.4 + b.swaySeed + t * 1.2) * b.size * 0.18 * t
            ctx!.lineTo(b.x + sway, b.y + b.size + stringLen * t)
          }
          ctx!.stroke()

          // balloon body
          ctx!.fillStyle = b.color
          ctx!.beginPath()
          ctx!.ellipse(b.x, b.y, b.size, b.size * 1.1, 0, 0, Math.PI * 2)
          ctx!.fill()
          // soft outline
          ctx!.strokeStyle = 'rgba(0,0,0,0.22)'
          ctx!.lineWidth = 1
          ctx!.stroke()
          // sheen — small offset light streak
          ctx!.fillStyle = 'rgba(255,255,255,0.22)'
          ctx!.beginPath()
          ctx!.ellipse(b.x - b.size * 0.32, b.y - b.size * 0.45, b.size * 0.22, b.size * 0.12, -0.5, 0, Math.PI * 2)
          ctx!.fill()
          // tied knot at the bottom
          ctx!.fillStyle = b.color
          ctx!.beginPath()
          ctx!.moveTo(b.x - 4, b.y + b.size)
          ctx!.lineTo(b.x + 4, b.y + b.size)
          ctx!.lineTo(b.x, b.y + b.size + 5)
          ctx!.closePath()
          ctx!.fill()
        }

        // draw any flecks
        for (const f of b.flecks) {
          const fage = now - f.born
          const t = fage / f.life
          const alpha = 1 - t
          ctx!.fillStyle = withAlpha(f.color, alpha)
          ctx!.beginPath()
          ctx!.arc(f.x, f.y, f.size * (1 - t * 0.4), 0, Math.PI * 2)
          ctx!.fill()
        }
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
            cursor: 'pointer',
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
          pop them.
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
          BALLOONS · TOY · 008
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

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`
}
