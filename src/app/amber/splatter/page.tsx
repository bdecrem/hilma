'use client'

import { useEffect, useRef } from 'react'

// splatter — a paint toy. drag to drip flare-pink paint on a dark field.
// fast drags throw splatters. clicks leave wet drops that spread a little.
// the canvas accumulates — the whole thing is the painting. double-tap to
// fade it out and start over. no goal. no score. no reveal.

// color
const FIELD = '#0A0A0A'
const FLARE = '#FF2F7E'
const CREAM = '#E8E8E8'

// how many stray flecks per fast drag tick
const SPLATTER_MIN = 2
const SPLATTER_MAX = 12
// pointer speed above this (px/frame) triggers a splatter burst
const SPLATTER_THRESHOLD = 9

// all marks drawn into the offscreen painting layer; layered under HUD
export default function SplatterPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    // Painting buffer — persistent. Every mark gets composited here so we
    // don't have to re-render history each frame. Overlay strokes (current
    // wet brush) draw on top of this per frame.
    let painting: OffscreenCanvas | HTMLCanvasElement
    let paintCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

    function mkPainting() {
      if (typeof OffscreenCanvas !== 'undefined') {
        painting = new OffscreenCanvas(W * DPR, H * DPR)
        paintCtx = painting.getContext('2d') as OffscreenCanvasRenderingContext2D
      } else {
        const c = document.createElement('canvas')
        c.width = W * DPR
        c.height = H * DPR
        painting = c
        paintCtx = c.getContext('2d')!
      }
      paintCtx.scale(DPR, DPR)
      paintCtx.fillStyle = FIELD
      paintCtx.fillRect(0, 0, W, H)
    }

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * DPR
      canvas!.height = H * DPR
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.scale(DPR, DPR)
      // re-make the painting buffer but preserve nothing — simplest
      mkPainting()
    }

    resize()
    window.addEventListener('resize', resize)

    // audio — noise burst synth for splat sounds
    let audioCtx: AudioContext | null = null
    function ensureAudio() {
      if (audioCtx) return audioCtx
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return null }
      return audioCtx
    }
    // pre-build a noise buffer once, reuse
    let noiseBuffer: AudioBuffer | null = null
    function getNoiseBuffer(a: AudioContext) {
      if (noiseBuffer) return noiseBuffer
      const len = a.sampleRate * 0.4
      const buf = a.createBuffer(1, len, a.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      noiseBuffer = buf
      return buf
    }
    let lastSplatAudio = 0
    function splatSound(intensity: number) {
      const now = performance.now()
      if (now - lastSplatAudio < 40) return // rate-limit
      lastSplatAudio = now
      const a = ensureAudio()
      if (!a) return
      const src = a.createBufferSource()
      src.buffer = getNoiseBuffer(a)
      const bp = a.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 600 + Math.random() * 800
      bp.Q.value = 2
      const g = a.createGain()
      const peak = Math.min(0.16, 0.02 + intensity * 0.14)
      const t = a.currentTime
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14 + intensity * 0.1)
      src.connect(bp).connect(g).connect(a.destination)
      src.start(t)
      src.stop(t + 0.35)
    }

    // utility — draw a blobby paint mark (not a perfect circle)
    function drawBlob(cx: number, cy: number, r: number, color: string) {
      const steps = 12
      paintCtx.save()
      paintCtx.fillStyle = color
      paintCtx.beginPath()
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const rr = r * (0.7 + Math.random() * 0.6)
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        if (i === 0) paintCtx.moveTo(x, y)
        else paintCtx.lineTo(x, y)
      }
      paintCtx.closePath()
      paintCtx.fill()
      paintCtx.restore()
    }

    // draw a fat stroke segment with tapered ends
    function drawStroke(x1: number, y1: number, x2: number, y2: number, width: number) {
      paintCtx.save()
      paintCtx.strokeStyle = FLARE
      paintCtx.lineCap = 'round'
      paintCtx.lineJoin = 'round'
      paintCtx.lineWidth = width
      paintCtx.beginPath()
      paintCtx.moveTo(x1, y1)
      paintCtx.lineTo(x2, y2)
      paintCtx.stroke()
      paintCtx.restore()
    }

    function splatterBurst(cx: number, cy: number, speed: number, dirX: number, dirY: number) {
      const count = Math.min(SPLATTER_MAX, SPLATTER_MIN + Math.floor(speed / 3))
      // direction: most flecks fly in the motion direction, with spread
      const base = Math.atan2(dirY, dirX)
      for (let i = 0; i < count; i++) {
        const theta = base + (Math.random() - 0.5) * 2.0
        const d = 10 + Math.random() * (30 + speed * 2)
        const fx = cx + Math.cos(theta) * d
        const fy = cy + Math.sin(theta) * d
        const r = 1 + Math.random() * 3.5 + Math.random() * speed * 0.08
        drawBlob(fx, fy, r, FLARE)
      }
      // occasional cream fleck for contrast — 1 in ~5 bursts
      if (Math.random() < 0.2) {
        const theta = base + (Math.random() - 0.5) * 2.0
        const d = 12 + Math.random() * 40
        drawBlob(cx + Math.cos(theta) * d, cy + Math.sin(theta) * d, 1.5 + Math.random() * 2, CREAM)
      }
      splatSound(Math.min(1, speed / 40))
    }

    // wet drop: big blob + a few drips trailing down
    function wetDrop(cx: number, cy: number) {
      drawBlob(cx, cy, 14 + Math.random() * 10, FLARE)
      // a couple of drips
      const dripCount = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < dripCount; i++) {
        const offX = (Math.random() - 0.5) * 16
        const dy = 8 + Math.random() * 28
        drawStroke(cx + offX, cy + 4, cx + offX * 0.6, cy + dy, 3 + Math.random() * 4)
        drawBlob(cx + offX * 0.6, cy + dy, 2 + Math.random() * 3, FLARE)
      }
      splatSound(0.6)
    }

    // pointer state
    let down = false
    let lastX = 0
    let lastY = 0
    let downX = 0
    let downY = 0
    let downT = 0
    let moved = false
    let lastTapT = 0

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function onDown(e: PointerEvent) {
      ensureAudio()
      const p = getXY(e)
      down = true
      lastX = p.x; lastY = p.y
      downX = p.x; downY = p.y
      downT = performance.now()
      moved = false
      // double-tap to wipe: if second tap within 300ms and near the first
      const now = performance.now()
      if (now - lastTapT < 350) {
        fadeOut()
        lastTapT = 0
      } else {
        lastTapT = now
      }
    }

    function onMove(e: PointerEvent) {
      if (!down) return
      const p = getXY(e)
      const dx = p.x - lastX
      const dy = p.y - lastY
      const speed = Math.hypot(dx, dy)
      if (speed > 0.5) moved = true

      // stroke — width scales inversely with speed (slow = fat, fast = thin)
      const w = Math.max(2, Math.min(18, 18 - speed * 0.35))
      drawStroke(lastX, lastY, p.x, p.y, w)

      if (speed > SPLATTER_THRESHOLD) {
        splatterBurst(p.x, p.y, speed, dx, dy)
      }

      lastX = p.x; lastY = p.y
    }

    function onUp(e: PointerEvent) {
      if (!down) return
      down = false
      const p = getXY(e)
      const dt = performance.now() - downT
      const dist = Math.hypot(p.x - downX, p.y - downY)
      if (!moved || (dt < 220 && dist < 6)) {
        // treat as a tap — wet drop
        wetDrop(p.x, p.y)
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', (e) => { if (down) onUp(e) })

    // fade the painting out over ~900ms
    let fading = 0
    function fadeOut() {
      fading = performance.now()
    }

    function loop() {
      // copy painting to display
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)
      ctx!.drawImage(painting as CanvasImageSource, 0, 0, W, H)

      // fade handling — progressively repaint over with translucent field
      if (fading) {
        const age = performance.now() - fading
        const t = Math.min(1, age / 900)
        paintCtx.save()
        paintCtx.fillStyle = FIELD
        paintCtx.globalAlpha = 0.12
        paintCtx.fillRect(0, 0, W, H)
        paintCtx.restore()
        if (t >= 1) {
          // full wipe
          paintCtx.save()
          paintCtx.fillStyle = FIELD
          paintCtx.fillRect(0, 0, W, H)
          paintCtx.restore()
          fading = 0
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
            cursor: 'crosshair',
          }}
        />

        {/* corner mark — tiny, doesn't compete with the paint */}
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
            opacity: 0.55,
            pointerEvents: 'none',
          }}
        >
          make a mess.
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
            opacity: 0.35,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          SPLATTER · TOY · 004
          <div style={{ marginTop: 4, opacity: 0.75 }}>
            DOUBLE-TAP TO WIPE
          </div>
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
          <span style={{ color: FLARE }}>·</span>
        </a>
      </div>
    </>
  )
}
