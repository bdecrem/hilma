'use client'

import { useEffect, useRef } from 'react'

// slinky — a vertical coil tower. 28 coils stacked top to bottom, connected
// by springs. drag the top coil down (or up) to deform; release to let the
// wave propagate down the chain, bounce off the bottom (free end), come
// back up. tap the top coil = pluck (downward kick). audio: a soft metallic
// shimmer (sustained sine at 3.2kHz through a bandpass) whose gain tracks
// the total absolute coil velocity — silent at rest, gets brighter when
// the wave is moving, dies as it settles.
//
// First piece under prompt v4. No mark-making, no particle clusters,
// no FLARE accent, no canvas accumulation. Cream metal coils on NIGHT.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'

const N_COILS = 28
const COIL_REST_GAP = 14 // px between coils at rest
const SPRING_K = 0.012 // spring stiffness (per ms²)
const DAMPING = 0.984 // per-frame velocity damping
const COIL_W = 90 // ellipse width
const COIL_H = 5

export default function SlinkyPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    // top anchor Y — high in the screen so the chain has room to swing
    let topAnchorY = 0

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * DPR
      canvas.height = H * DPR
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(DPR, DPR)
      topAnchorY = H * 0.18
    }
    resize()
    window.addEventListener('resize', resize)

    // initialize coils at rest positions
    const coils: { y: number; vy: number }[] = Array.from({ length: N_COILS }, (_, i) => ({
      y: topAnchorY + i * COIL_REST_GAP,
      vy: 0,
    }))

    // pointer
    let dragging = false
    let downY = 0,
      downT = 0,
      moved = false

    // audio
    let audioCtx: AudioContext | null = null
    let shimmerGain: GainNode | null = null
    let shimmerBP: BiquadFilterNode | null = null

    const ensureAudio = () => {
      if (audioCtx) return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      // sustained tone — a sine through bandpass for slight warmth
      const osc = audioCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 3200
      shimmerBP = audioCtx.createBiquadFilter()
      shimmerBP.type = 'bandpass'
      shimmerBP.frequency.value = 3200
      shimmerBP.Q.value = 6
      shimmerGain = audioCtx.createGain()
      shimmerGain.gain.value = 0
      osc.connect(shimmerBP)
      shimmerBP.connect(shimmerGain)
      shimmerGain.connect(audioCtx.destination)
      osc.start()
      // a quieter higher-octave layer for shimmer
      const osc2 = audioCtx.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = 4800
      const g2 = audioCtx.createGain()
      g2.gain.value = 0.4
      osc2.connect(g2)
      g2.connect(shimmerGain)
      osc2.start()
    }

    const sphereTop = () => coils[0].y

    const isOnTopCoil = (x: number, y: number) => {
      // top coil ellipse is at (W/2, sphereTop()) with radii (COIL_W/2, COIL_H + 10 hit padding)
      const cx = W / 2
      const cy = sphereTop()
      const rx = COIL_W / 2 + 10
      const ry = COIL_H + 14
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      return dx * dx + dy * dy <= 1
    }

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      const p = pos(e)
      if (!isOnTopCoil(p.x, p.y)) return
      dragging = true
      moved = false
      downY = p.y
      downT = performance.now()
      coils[0].vy = 0
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const p = pos(e)
      const newY = Math.max(topAnchorY - 60, Math.min(H - COIL_REST_GAP * (N_COILS - 1) - 40, p.y))
      coils[0].y = newY
      coils[0].vy = 0
      if (Math.abs(p.y - downY) > 5) moved = true
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        // tap on top coil = pluck (downward kick)
        coils[0].vy = 0.55 // px/ms
      }
      // otherwise the released drag becomes free physics
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // physics + render loop
    let lastT = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(40, now - lastT)
      lastT = now

      // sub-step for stability
      const SUBSTEPS = 4
      const sdt = dt / SUBSTEPS
      for (let s = 0; s < SUBSTEPS; s++) {
        // spring forces between adjacent coils
        const force: number[] = new Array(N_COILS).fill(0)
        for (let i = 0; i < N_COILS - 1; i++) {
          const stretch = coils[i + 1].y - coils[i].y - COIL_REST_GAP
          const f = SPRING_K * stretch
          // pull i down toward i+1 (positive stretch → coil i pulled down, i+1 pulled up)
          force[i] += f
          force[i + 1] -= f
        }
        // also: a tiny "rest pull" on the top coil so it returns to topAnchorY
        // when not dragged — keeps the whole chain from drifting away
        if (!dragging) {
          force[0] += -SPRING_K * 0.4 * (coils[0].y - topAnchorY)
        }

        // integrate
        for (let i = 0; i < N_COILS; i++) {
          if (i === 0 && dragging) continue // top coil locked to cursor
          coils[i].vy += force[i] * sdt
          coils[i].vy *= DAMPING
          coils[i].y += coils[i].vy * sdt
        }
      }

      // total motion → audio gain
      let totalMotion = 0
      for (const c of coils) totalMotion += Math.abs(c.vy)
      if (audioCtx && shimmerGain && shimmerBP) {
        const norm = Math.min(1, totalMotion / 2.5)
        const targetGain = norm * 0.06
        const targetFreq = 2800 + norm * 1200
        shimmerGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05)
        shimmerBP.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.05)
      }

      // render
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2

      // tiny ceiling tab where the top coil rests (a hint of an anchor)
      ctx.strokeStyle = `rgba(232,232,232,0.35)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - COIL_W / 2 - 14, topAnchorY - 18)
      ctx.lineTo(cx + COIL_W / 2 + 14, topAnchorY - 18)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, topAnchorY - 18)
      ctx.lineTo(cx, topAnchorY - 8)
      ctx.stroke()

      // draw each coil as an ellipse, width varying slightly with local stretch
      for (let i = 0; i < N_COILS; i++) {
        // local stretch: average of distance to neighbors
        const above = i > 0 ? coils[i].y - coils[i - 1].y : COIL_REST_GAP
        const below = i < N_COILS - 1 ? coils[i + 1].y - coils[i].y : COIL_REST_GAP
        const localGap = (above + below) / 2
        const stretch = (localGap - COIL_REST_GAP) / COIL_REST_GAP
        // compressed: wider; stretched: narrower (real coil behavior)
        const widthScale = 1 - stretch * 0.18
        const w = COIL_W * Math.max(0.65, Math.min(1.25, widthScale))
        const y = coils[i].y

        // depth shading: top coils brighter, bottom coils slightly dimmer
        const alpha = 0.85 - (i / N_COILS) * 0.25
        ctx.strokeStyle = `rgba(232,232,232,${alpha.toFixed(3)})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.ellipse(cx, y, w / 2, COIL_H, 0, 0, Math.PI * 2)
        ctx.stroke()

        // very thin internal highlight line (suggests metal)
        if (i % 1 === 0) {
          ctx.strokeStyle = `rgba(232,232,232,${(alpha * 0.35).toFixed(3)})`
          ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.ellipse(cx, y - 1, w / 2 - 2, COIL_H - 1.5, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      if (audioCtx) {
        try {
          audioCtx.close()
        } catch {}
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
        <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', cursor: 'grab' }} />

        <div
          style={{
            position: 'fixed',
            top: 'calc(16px + env(safe-area-inset-top, 0px))',
            left: 'calc(16px + env(safe-area-inset-left, 0px))',
            color: CREAM,
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.2em',
            opacity: 0.5,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
            textTransform: 'uppercase',
          }}
        >
          slinky
          <span style={{ color: '#C6FF3C' }}>.</span>
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(24px + env(safe-area-inset-left, 0px))',
            color: CREAM,
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 17,
            opacity: 0.7,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          pull the top.
        </div>

        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(24px + env(safe-area-inset-right, 0px))',
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
          <span style={{ color: '#C6FF3C' }}>·</span>
        </a>
      </div>
    </>
  )
}
