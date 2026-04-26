'use client'

import { useEffect, useRef } from 'react'

// halo — non-interactive color piece. soft translucent disks of bright color
// bloom from random points on a dark field, drift slowly, overlap and blend
// (additive light), then fade out. multiple at once. nothing ever resolves
// into a shape — just washes of color sliding past each other. spring as
// light through frosted glass. auto-running, no input.

const FIELD = '#0A0A0A'

// brand-bright accents — used as gradient centers
const COLORS = [
  '#FF2F7E', // FLARE
  '#C6FF3C', // LIME
  '#FF7A1A', // SODIUM
  '#A855F7', // UV
]

const COUNT = 9
const PEAK_RADIUS_FRACTION = 0.32 // peak disk radius = this * min(W,H)
const BLOOM_S = 5.2   // seconds to reach peak
const HOLD_S = 12.0   // seconds at full size, drifting
const FADE_S = 6.6    // seconds to fade out
const TOTAL_S = BLOOM_S + HOLD_S + FADE_S

type Halo = {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  startT: number   // performance.now() at spawn
  duration: number // jittered lifetime in ms
  radiusScale: number // per-disk size scale 0.7..1.25
  peakAlpha: number   // peak alpha 0.55..0.9
}

export default function HaloPage() {
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

    let lastColor = ''

    function pickColor(): string {
      // avoid same color twice in a row
      let c = COLORS[Math.floor(Math.random() * COLORS.length)]
      let tries = 0
      while (c === lastColor && tries < 6) {
        c = COLORS[Math.floor(Math.random() * COLORS.length)]
        tries++
      }
      lastColor = c
      return c
    }

    function spawn(now: number, randomStart = false): Halo {
      // bias spawn position toward viewport with margin so disks bloom inside
      const margin = Math.max(60, Math.min(W, H) * 0.1)
      // very slow drift
      const speed = 4 + Math.random() * 8 // px / sec
      const angle = Math.random() * Math.PI * 2
      // if randomStart, pick a startT in the past so the disk is already mid-life
      // (used for the initial population so they're all at different phases)
      const startT = randomStart
        ? now - Math.random() * TOTAL_S * 1000
        : now
      return {
        x: margin + Math.random() * (W - margin * 2),
        y: margin + Math.random() * (H - margin * 2),
        vx: (Math.cos(angle) * speed) / 60, // per frame at ~60fps
        vy: (Math.sin(angle) * speed) / 60,
        color: pickColor(),
        startT,
        duration: (TOTAL_S * 1000) * (0.85 + Math.random() * 0.4), // ±20%
        radiusScale: 0.7 + Math.random() * 0.55,
        peakAlpha: 0.6 + Math.random() * 0.3,
      }
    }

    const halos: Halo[] = []
    {
      const now = performance.now()
      for (let i = 0; i < COUNT; i++) halos.push(spawn(now, true))
    }

    function loop() {
      const now = performance.now()

      // hard reset background each frame
      ctx!.globalCompositeOperation = 'source-over'
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // additive light blending so overlapping halos brighten
      ctx!.globalCompositeOperation = 'lighter'

      const peakR = Math.min(W, H) * PEAK_RADIUS_FRACTION

      for (let i = 0; i < halos.length; i++) {
        const h = halos[i]
        const age = now - h.startT
        if (age > h.duration) {
          halos[i] = spawn(now)
          continue
        }
        // life envelope: bloom (0..bloomS) → hold (..hold) → fade
        const life = age / 1000 // seconds
        const bloomS = (h.duration / 1000) * (BLOOM_S / TOTAL_S)
        const holdS = (h.duration / 1000) * (HOLD_S / TOTAL_S)
        const fadeS = (h.duration / 1000) * (FADE_S / TOTAL_S)

        let radiusEnv = 0
        let alphaEnv = 0
        if (life < bloomS) {
          // smoothstep bloom
          const t = life / bloomS
          radiusEnv = t * t * (3 - 2 * t)
          alphaEnv = t * t * (3 - 2 * t)
        } else if (life < bloomS + holdS) {
          radiusEnv = 1
          // gentle breathing during hold
          const t = (life - bloomS) / holdS
          alphaEnv = 1 - 0.12 * (1 - Math.cos(t * Math.PI * 2))
        } else {
          // fade
          const t = (life - bloomS - holdS) / fadeS
          radiusEnv = 1 + t * 0.18 // grows slightly while fading — softens out
          alphaEnv = 1 - t * t
        }

        // drift with tiny brownian wobble
        h.x += h.vx + (Math.random() - 0.5) * 0.15
        h.y += h.vy + (Math.random() - 0.5) * 0.15

        // gentle wrap if it drifts off-screen so halos don't get marooned
        const r = peakR * h.radiusScale * radiusEnv
        if (h.x < -r) h.x = W + r
        if (h.x > W + r) h.x = -r
        if (h.y < -r) h.y = H + r
        if (h.y > H + r) h.y = -r

        const alpha = h.peakAlpha * alphaEnv

        // build radial gradient: full color at center → transparent at edge
        const grad = ctx!.createRadialGradient(h.x, h.y, 0, h.x, h.y, r)
        // hex → rgba with alpha at center
        const c = h.color
        grad.addColorStop(0, withAlpha(c, alpha))
        grad.addColorStop(0.55, withAlpha(c, alpha * 0.35))
        grad.addColorStop(1, withAlpha(c, 0))

        ctx!.fillStyle = grad
        ctx!.beginPath()
        ctx!.arc(h.x, h.y, r, 0, Math.PI * 2)
        ctx!.fill()
      }

      // restore for any overlay drawing
      ctx!.globalCompositeOperation = 'source-over'

      requestAnimationFrame(loop)
    }
    loop()

    return () => {
      window.removeEventListener('resize', resize)
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
            cursor: 'default',
          }}
        />

        {/* very small, atmospheric caption */}
        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            left: 'calc(22px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 17,
            opacity: 0.55,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          spring.
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
            mixBlendMode: 'difference',
          }}
        >
          HALO · NO. 001
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
  // hex like #RRGGBB
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}
