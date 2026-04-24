'use client'

import { useEffect, useRef } from 'react'

export default function MurmurPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight
    let lineGap = 14
    let stepX = 5
    let startY = 21

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * DPR
      canvas!.height = H * DPR
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.scale(DPR, DPR)
      lineGap = Math.max(10, Math.min(18, Math.round(H / 60)))
      stepX = Math.max(3, Math.min(6, Math.round(W / 320)))
      startY = lineGap * 1.5
    }

    resize()
    window.addEventListener('resize', resize)

    type Ripple = { x: number; y: number; t0: number; amp: number }
    const ripples: Ripple[] = []
    const WAVE_SPEED = 280
    const WAVE_LIFE = 3.2
    const MAX_RIPPLES = 12
    const SIGMA = 70
    const INV_TWO_SIGMA_SQ = 1 / (2 * SIGMA * SIGMA)
    const CUTOFF_DIST = 3 * SIGMA // envelope ≈ 0 beyond this

    function addRipple(x: number, y: number, amp: number) {
      ripples.push({ x, y, t0: performance.now(), amp })
      if (ripples.length > MAX_RIPPLES) ripples.shift()
    }

    function getXY(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function onDown(e: PointerEvent) {
      const p = getXY(e)
      addRipple(p.x, p.y, 18)
    }

    function onMove(e: PointerEvent) {
      // pressure-held drag keeps murmuring, softly
      if (!e.buttons) return
      const last = ripples[ripples.length - 1]
      if (last && performance.now() - last.t0 < 140) return
      const p = getXY(e)
      addRipple(p.x, p.y, 9)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)

    // idle murmur — the field whispers to itself occasionally
    let nextIdle = performance.now() + 2200 + Math.random() * 1800

    let rafId = 0

    // per-frame scratch for ripple state (avoids recomputing in inner loop)
    type Active = { x: number; y: number; amp: number; radius: number; timeDecay: number; age: number }
    const active: Active[] = []

    function loop() {
      const now = performance.now()

      if (now > nextIdle) {
        const margin = Math.min(W, H) * 0.18
        addRipple(
          margin + Math.random() * (W - margin * 2),
          margin + Math.random() * (H - margin * 2),
          6
        )
        nextIdle = now + 3800 + Math.random() * 4200
      }

      ctx!.fillStyle = '#0C1424'
      ctx!.fillRect(0, 0, W, H)

      active.length = 0
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        const age = (now - r.t0) / 1000
        if (age > WAVE_LIFE) {
          ripples.splice(i, 1)
          continue
        }
        active.push({
          x: r.x,
          y: r.y,
          amp: r.amp,
          age,
          radius: WAVE_SPEED * age,
          timeDecay: Math.exp(-age * 0.75),
        })
      }

      ctx!.lineCap = 'round'
      ctx!.lineJoin = 'round'
      ctx!.lineWidth = 1

      const endX = W + stepX
      const endY = H - lineGap
      const halfH = H * 0.5

      for (let yLine = startY; yLine < endY; yLine += lineGap) {
        const yFrac = (yLine - halfH) / halfH
        const atmoFade = 0.55 - Math.abs(yFrac) * 0.2

        let maxBend = 0

        ctx!.beginPath()
        let first = true
        for (let x = 0; x <= endX; x += stepX) {
          let dy = 0
          for (let i = 0; i < active.length; i++) {
            const a = active[i]
            const dx = x - a.x
            const dyRef = yLine - a.y
            const dist = Math.sqrt(dx * dx + dyRef * dyRef)
            const offset = dist - a.radius
            if (offset > CUTOFF_DIST || offset < -CUTOFF_DIST) continue
            const envelope = Math.exp(-(offset * offset) * INV_TWO_SIGMA_SQ)
            // direction of displacement: y-component of the radial unit vector
            const radialY = dist > 0.001 ? dyRef / dist : 0
            const phase = Math.cos(0.055 * dist - a.age * 9)
            dy += -a.amp * envelope * a.timeDecay * radialY * phase
          }
          const absDy = dy < 0 ? -dy : dy
          if (absDy > maxBend) maxBend = absDy
          const yDraw = yLine + dy
          if (first) {
            ctx!.moveTo(x, yDraw)
            first = false
          } else {
            ctx!.lineTo(x, yDraw)
          }
        }

        const activeBoost = Math.min(0.35, maxBend / 24)
        const alpha = Math.min(0.95, atmoFade + activeBoost)
        ctx!.strokeStyle = `rgba(232, 232, 232, ${alpha})`
        ctx!.stroke()
      }

      for (let i = 0; i < active.length; i++) {
        const a = active[i]
        if (a.age > 1.2) continue
        const alpha = 1 - a.age / 1.2
        ctx!.fillStyle = `rgba(198, 255, 60, ${alpha})`
        ctx!.beginPath()
        ctx!.arc(a.x, a.y, 3 + a.age * 2, 0, Math.PI * 2)
        ctx!.fill()

        if (a.radius > 8 && a.age < 2.2) {
          const ringAlpha = (1 - a.age / 2.2) * 0.22
          ctx!.strokeStyle = `rgba(198, 255, 60, ${ringAlpha})`
          ctx!.beginPath()
          ctx!.arc(a.x, a.y, a.radius, 0, Math.PI * 2)
          ctx!.stroke()
        }
      }

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
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
          background: '#0C1424',
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

        {/* chrome upper-right */}
        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            right: 'calc(20px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.18em',
            opacity: 0.55,
            pointerEvents: 'none',
          }}
        >
          MURMUR · SPEC · 015
        </div>

        {/* caption lower-left */}
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(32px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.12em',
            }}
          >
            murmur.
          </div>
          <div
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 16,
              marginTop: 4,
              opacity: 0.7,
            }}
          >
            a small signal in the dark.
          </div>
        </div>

        {/* back link lower-right */}
        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(32px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.18em',
            opacity: 0.5,
            textDecoration: 'none',
          }}
        >
          a.
          <span style={{ color: '#C6FF3C' }}>·</span>
        </a>
      </div>
    </>
  )
}
