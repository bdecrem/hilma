'use client'

import { useEffect, useRef } from 'react'

// L55 — vortex
// ~640 cream points distributed in a vertical cylinder around the y-axis.
// Each point has (theta, r, h) and its angular velocity ω(r) follows a
// Rankine vortex: solid-body rotation in the core (r ≤ a) and 1/r in the
// outer flow (r > a). Differential rotation produces the signature
// shearing of a real vortex — a horizontal lime tracer line winds itself
// into a tighter and tighter spiral as time passes (until you tap to
// reset). drag X to orbit the camera; drag Y to modulate vortex strength;
// tap to scatter (points get a brief outward velocity) then settle back.
// audio: bandpassed wind-like noise, center frequency and gain track
// average angular velocity. you can hear the wind speed up.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N = 640
const CORE = 0.42 // a — core radius (in normalized units)
const TRACER_COUNT = 56

type Pt = {
  r: number
  h: number
  theta: number
  size: number
  vR: number // outward radial velocity (used during scatter)
}

type Tracer = {
  r: number
  h: number
  theta: number
  size: number
}

export default function L55Page() {
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

    let seed = 20260425
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)

    const points: Pt[] = []
    for (let i = 0; i < N; i++) {
      // bias r toward smaller values (more density in the core)
      const u = rand()
      const r = Math.sqrt(u) * 1.6 // 0..1.6
      points.push({
        r,
        h: (rand() - 0.5) * 2.4, // -1.2..1.2
        theta: rand() * Math.PI * 2,
        size: 0.8 + rand() * 1.2,
        vR: 0,
      })
    }

    // tracer — a horizontal line of points at h=0, equally spaced in r
    const tracer: Tracer[] = []
    for (let i = 0; i < TRACER_COUNT; i++) {
      const r = 0.05 + (i / (TRACER_COUNT - 1)) * 1.55
      tracer.push({ r, h: 0, theta: 0, size: 1.2 })
    }

    // K controls vortex strength — angular velocity scaling
    let K = 0.024
    const Kmin = 0.002
    const Kmax = 0.07

    // camera state
    let camRY = 0.4
    let camRX = 0.18
    let camDragRY = 0
    let camDragKDelta = 0

    let lastPx = 0, lastPy = 0
    let dragging = false
    let scatterFrom = 0

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    let tapDownT = 0
    let tapMoved = false

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      lastPx = p.x; lastPy = p.y
      dragging = true
      tapDownT = performance.now()
      tapMoved = false
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const p = getXY(e)
      const dx = p.x - lastPx
      const dy = p.y - lastPy
      lastPx = p.x; lastPy = p.y
      if (Math.abs(dx) + Math.abs(dy) > 3) tapMoved = true
      camDragRY += dx * 0.005
      // dy modulates K
      camDragKDelta += -dy * 0.00015
    })
    canvas.addEventListener('pointerup', () => {
      dragging = false
      const dt = performance.now() - tapDownT
      if (dt < 280 && !tapMoved) {
        // tap — scatter
        scatterFrom = performance.now()
        for (const p of points) {
          p.vR = 0.025 + Math.random() * 0.02
        }
      }
    })
    canvas.addEventListener('pointerleave', () => { dragging = false })

    // audio — bandpassed noise (wind)
    let audioCtx: AudioContext | null = null
    let noiseSrc: AudioBufferSourceNode | null = null
    let bpFilter: BiquadFilterNode | null = null
    let masterGain: GainNode | null = null
    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return }
      const len = audioCtx.sampleRate * 2
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      noiseSrc = audioCtx.createBufferSource()
      noiseSrc.buffer = buf
      noiseSrc.loop = true
      bpFilter = audioCtx.createBiquadFilter()
      bpFilter.type = 'bandpass'
      bpFilter.frequency.value = 360
      bpFilter.Q.value = 0.9
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0
      noiseSrc.connect(bpFilter).connect(masterGain).connect(audioCtx.destination)
      noiseSrc.start()
      // fade in
      masterGain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 1.5)
    }

    function omegaFor(r: number): number {
      if (r <= CORE) return K  // solid-body in the core
      return K * (CORE / r)    // 1/r outside (so velocity v = ω·r is constant past the core)
    }

    function loop() {
      const now = performance.now()

      // ease drag deltas into camera + K
      camRY += camDragRY
      camDragRY *= 0.0
      K = Math.max(Kmin, Math.min(Kmax, K + camDragKDelta))
      camDragKDelta *= 0.0

      // step rotation for each point (and any radial velocity from scatter)
      for (const p of points) {
        p.theta += omegaFor(p.r)
        if (p.vR !== 0) {
          p.r += p.vR
          p.vR *= 0.94
          // pull back toward center after the kick
          if (p.r > 1.6) p.r = 1.6
          if (Math.abs(p.vR) < 0.0005) {
            p.vR = 0
            // gentle pull toward original-ish radius is implicit since omega
            // depends on r — just keep them where they ended up
          }
        }
      }
      for (const t of tracer) {
        t.theta += omegaFor(t.r)
      }

      // background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // perspective projection — rotate around y by camRY, then around x by camRX
      const cy = Math.cos(camRY); const sy = Math.sin(camRY)
      const cx = Math.cos(camRX); const sx = Math.sin(camRX)
      const camD = 4
      const fov = Math.min(W, H) * 0.42

      type Proj = { sx: number; sy: number; depth: number; size: number; lime: boolean }
      const projected: Proj[] = []

      function project(x3: number, y3: number, z3: number, sz: number, lime: boolean) {
        // rotate Y (camRY)
        const xr = cy * x3 + sy * z3
        const zr = -sy * x3 + cy * z3
        // rotate X (camRX)
        const yr = cx * y3 - sx * zr
        const zr2 = sx * y3 + cx * zr
        // perspective
        const denom = (camD - zr2)
        if (denom <= 0.1) return null
        const sx2 = (xr / denom) * fov + W / 2
        const sy2 = (yr / denom) * fov + H / 2
        return { sx: sx2, sy: sy2, depth: zr2, size: sz, lime }
      }

      for (const p of points) {
        const x3 = p.r * Math.cos(p.theta)
        const z3 = p.r * Math.sin(p.theta)
        const v = project(x3, p.h, z3, p.size, false)
        if (v) projected.push(v)
      }
      for (const t of tracer) {
        const x3 = t.r * Math.cos(t.theta)
        const z3 = t.r * Math.sin(t.theta)
        const v = project(x3, t.h, z3, t.size, true)
        if (v) projected.push(v)
      }

      // sort back-to-front
      projected.sort((a, b) => a.depth - b.depth)

      for (const v of projected) {
        const depthFactor = Math.max(0.18, Math.min(1, (v.depth + 2) / 4))
        if (v.lime) {
          ctx!.fillStyle = `rgba(198, 255, 60, ${(0.6 * depthFactor + 0.3).toFixed(3)})`
          ctx!.beginPath()
          ctx!.arc(v.sx, v.sy, v.size * 1.4 + 0.5, 0, Math.PI * 2)
          ctx!.fill()
        } else {
          const alpha = (0.5 * depthFactor + 0.25).toFixed(3)
          ctx!.fillStyle = `rgba(232, 232, 232, ${alpha})`
          ctx!.beginPath()
          ctx!.arc(v.sx, v.sy, v.size * (0.8 + depthFactor * 0.5), 0, Math.PI * 2)
          ctx!.fill()
        }
      }

      // wind audio — center freq + gain track K
      if (audioCtx && bpFilter && masterGain) {
        const t = audioCtx.currentTime
        const norm = (K - Kmin) / (Kmax - Kmin)
        bpFilter.frequency.setTargetAtTime(280 + norm * 1200, t, 0.15)
        masterGain.gain.setTargetAtTime(0.025 + norm * 0.07, t, 0.2)
      }

      // suppress scatterFrom unused warning
      void scatterFrom

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
            right: 'calc(20px + env(safe-area-inset-right, 0px))',
            color: CREAM,
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.18em',
            opacity: 0.55,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          ENVIRONMENT · L55
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(28px + env(safe-area-inset-left, 0px))',
            color: CREAM,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.15em',
            }}
          >
            L55.
          </div>
          <div
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 17,
              marginTop: 4,
              opacity: 0.8,
            }}
          >
            the inside spins faster than the outside.
          </div>
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.22em',
              marginTop: 12,
              opacity: 0.42,
            }}
          >
            DRAG X · ORBIT &nbsp; DRAG Y · STRENGTHEN &nbsp; TAP · DISTURB
          </div>
        </div>

        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(28px + env(safe-area-inset-right, 0px))',
            color: 'rgba(232,232,232,0.55)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.18em',
            textDecoration: 'none',
          }}
        >
          a.
          <span style={{ color: LIME }}>·</span>
        </a>
      </div>
    </>
  )
}
