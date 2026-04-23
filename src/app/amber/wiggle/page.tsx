'use client'

import { useEffect, useRef } from 'react'

export default function WigglePage() {
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

    const SEGMENTS = 40
    type Node = { x: number; y: number; vx: number; vy: number; wave: number }
    const chain: Node[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      chain.push({ x: W * 0.5, y: H * 0.5, vx: 0, vy: 0, wave: 0 })
    }

    const target = { x: W * 0.5, y: H * 0.5 }
    let hasPointer = false
    let lastMove = performance.now()
    let whipFromHead = 0 // timestamp of last tap — triggers a wave down the chain

    function getXY(e: PointerEvent | MouseEvent | Touch) {
      const rect = canvas!.getBoundingClientRect()
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top }
    }

    function onMove(e: PointerEvent) {
      const p = getXY(e)
      target.x = p.x
      target.y = p.y
      hasPointer = true
      lastMove = performance.now()
    }

    function onDown(e: PointerEvent) {
      const p = getXY(e)
      target.x = p.x
      target.y = p.y
      hasPointer = true
      lastMove = performance.now()
      whipFromHead = performance.now()
    }

    function onLeave() {
      hasPointer = false
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerleave', onLeave)

    // Orbit target when idle — chain sleeps into a slow drift
    const idleOrbit = { t: 0 }

    // Radii: head is big, tail narrows — adaptive to viewport so mobile looks right
    function radiusForIndex(i: number) {
      const scale = Math.min(W, H) / 700
      const headR = 18 * Math.max(0.7, Math.min(1.4, scale))
      const tailR = 3 * Math.max(0.7, Math.min(1.4, scale))
      const t = i / (SEGMENTS - 1)
      return headR + (tailR - headR) * t
    }

    function loop() {
      const now = performance.now()

      // background — BRUISE field
      ctx!.fillStyle = '#150826'
      ctx!.fillRect(0, 0, W, H)

      // idle: spiral target gently around center if no pointer for >1.5s
      const idleMs = now - lastMove
      if (!hasPointer || idleMs > 1500) {
        idleOrbit.t += 0.004
        const idleness = Math.min(1, Math.max(0, (idleMs - 1500) / 1500))
        const cx = W * 0.5
        const cy = H * 0.5
        const r = Math.min(W, H) * 0.12 * idleness
        target.x = cx + Math.cos(idleOrbit.t) * r
        target.y = cy + Math.sin(idleOrbit.t * 1.3) * r
      }

      // head follows target with spring-damp
      const head = chain[0]
      const kHead = 0.18
      const dampHead = 0.78
      head.vx = (head.vx + (target.x - head.x) * kHead) * dampHead
      head.vy = (head.vy + (target.y - head.y) * kHead) * dampHead
      head.x += head.vx
      head.y += head.vy

      // each follower eases toward previous, with per-segment soft distance constraint
      for (let i = 1; i < SEGMENTS; i++) {
        const prev = chain[i - 1]
        const curr = chain[i]
        // spring toward previous — slightly weaker further back (more lag = more wiggle)
        const softness = 0.28 - (i / SEGMENTS) * 0.12
        const damp = 0.72 + (i / SEGMENTS) * 0.1
        curr.vx = (curr.vx + (prev.x - curr.x) * softness) * damp
        curr.vy = (curr.vy + (prev.y - curr.y) * softness) * damp
        curr.x += curr.vx
        curr.y += curr.vy

        // maintain preferred spacing between prev and curr (soft constraint)
        const dx = curr.x - prev.x
        const dy = curr.y - prev.y
        const d = Math.hypot(dx, dy) || 0.0001
        const desired = Math.max(6, radiusForIndex(i - 1) + radiusForIndex(i) - 4)
        const diff = (d - desired) / d
        const push = 0.5
        curr.x -= dx * diff * push
        curr.y -= dy * diff * push
      }

      // whip wave: if whipFromHead recent, propagate a "wave" index down the chain
      // Each segment briefly gets a positive "wave" value when the wavefront reaches it,
      // decaying over time. We draw this as a lime ring at that segment.
      if (whipFromHead) {
        const age = now - whipFromHead
        const speed = 80 // segments per second
        const front = (age / 1000) * speed
        for (let i = 0; i < SEGMENTS; i++) {
          const distFromFront = Math.abs(i - front)
          if (distFromFront < 1.5) {
            chain[i].wave = Math.max(chain[i].wave, 1)
          }
        }
        if (front > SEGMENTS + 2) whipFromHead = 0
      }
      for (const n of chain) n.wave *= 0.93

      // draw chain as a continuous cream ribbon of circles, thickest at head
      for (let i = SEGMENTS - 1; i >= 0; i--) {
        const n = chain[i]
        const r = radiusForIndex(i)
        ctx!.fillStyle = '#E8E8E8'
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx!.fill()

        // lime ring on wave-passing segments
        if (n.wave > 0.05) {
          ctx!.strokeStyle = `rgba(198, 255, 60, ${n.wave})`
          ctx!.lineWidth = 2
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, r + 4 + (1 - n.wave) * 10, 0, Math.PI * 2)
          ctx!.stroke()
        }
      }

      // lime signal dot in the center of the head
      ctx!.fillStyle = '#C6FF3C'
      ctx!.beginPath()
      ctx!.arc(head.x, head.y, Math.max(3, radiusForIndex(0) * 0.28), 0, Math.PI * 2)
      ctx!.fill()

      requestAnimationFrame(loop)
    }

    loop()

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerleave', onLeave)
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
          background: '#150826',
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
            cursor: 'none',
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
          WIGGLE · SPEC · 014
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
            wiggle.
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
            follow.
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
