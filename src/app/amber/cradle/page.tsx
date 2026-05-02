'use client'

import { useEffect, useRef } from 'react'

// cradle — a Newton's cradle. five spheres on strings from a horizontal beam.
// drag any sphere to swing it out from the line; release to let it fall.
// when a moving sphere collides with the resting row, momentum transfers
// through the chain and the far sphere(s) swing out, then back. each
// metal-on-metal contact triggers a short bandpass-noise click. tap any
// sphere (no drag) to give it a small kick. no mark-making, no particles,
// no continuous-hold mechanic — just one mechanical thing.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'

const N_SPHERES = 5
const SPHERE_R = 22 // pixels
const STRING_LEN = 220 // pixel length of pendulum
const SPHERE_GAP = 1 // gap between spheres at rest (a hair so contact is clean)
const G = 0.0009 // angular acceleration toward zero (pendulum gravity in rad/ms²)
const DAMPING = 0.999 // per-frame velocity damping
const COLLISION_VEL_THRESHOLD = 0.0008 // rad/ms: ignore micro-impacts

type Sphere = {
  angle: number // rad, 0 = straight down; positive = right
  vel: number // rad / ms
}

export default function CradlePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * DPR
      canvas.height = H * DPR
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(DPR, DPR)
    }
    resize()
    window.addEventListener('resize', resize)

    // sphere anchors: arranged horizontally, centered on screen
    const anchors = (): { x: number; y: number }[] => {
      const cx = W / 2
      const cy = H * 0.32 // beam high in the frame so spheres can swing
      const spacing = SPHERE_R * 2 + SPHERE_GAP
      const startX = cx - ((N_SPHERES - 1) * spacing) / 2
      return Array.from({ length: N_SPHERES }, (_, i) => ({
        x: startX + i * spacing,
        y: cy,
      }))
    }

    const spheres: Sphere[] = Array.from({ length: N_SPHERES }, () => ({
      angle: 0,
      vel: 0,
    }))

    // audio
    let audioCtx: AudioContext | null = null
    const ensureAudio = () => {
      if (audioCtx) return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }

    const playClick = (intensity: number) => {
      if (!audioCtx) return
      const now = audioCtx.currentTime
      const amp = Math.min(0.7, 0.18 + intensity * 0.45)
      // metallic click: short HP-noise + a brief sine ping at ~2.8kHz
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.05), audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const noise = audioCtx.createBufferSource()
      noise.buffer = buf
      const bp = audioCtx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2200 + intensity * 600
      bp.Q.value = 4
      const ng = audioCtx.createGain()
      ng.gain.setValueAtTime(amp, now)
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
      noise.connect(bp)
      bp.connect(ng)
      ng.connect(audioCtx.destination)
      noise.start(now)
      noise.stop(now + 0.06)

      // tiny sine ping for that "metallic" character
      const osc = audioCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 2800 + intensity * 400
      const og = audioCtx.createGain()
      og.gain.setValueAtTime(amp * 0.4, now)
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
      osc.connect(og)
      og.connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.05)
    }

    // pointer state
    let dragging: number | null = null // sphere index being dragged
    let downX = 0,
      downY = 0,
      downT = 0,
      moved = false

    const sphereCenter = (idx: number) => {
      const a = anchors()[idx]
      const ang = spheres[idx].angle
      return {
        x: a.x + Math.sin(ang) * STRING_LEN,
        y: a.y + Math.cos(ang) * STRING_LEN,
      }
    }

    const pickSphere = (x: number, y: number): number | null => {
      for (let i = 0; i < N_SPHERES; i++) {
        const c = sphereCenter(i)
        const d = Math.hypot(x - c.x, y - c.y)
        if (d <= SPHERE_R + 8) return i
      }
      return null
    }

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      const p = pos(e)
      const idx = pickSphere(p.x, p.y)
      if (idx === null) return
      dragging = idx
      moved = false
      downX = p.x
      downY = p.y
      downT = performance.now()
      // freeze the dragged sphere
      spheres[idx].vel = 0
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }

    const onMove = (e: PointerEvent) => {
      if (dragging === null) return
      const p = pos(e)
      if (Math.abs(p.x - downX) > 4 || Math.abs(p.y - downY) > 4) moved = true
      // compute angle from anchor → cursor
      const a = anchors()[dragging]
      const dx = p.x - a.x
      const dy = p.y - a.y
      const angle = Math.atan2(dx, dy)
      // clamp to ±0.9 rad (~52°) so we don't over-pull
      spheres[dragging].angle = Math.max(-0.9, Math.min(0.9, angle))
      spheres[dragging].vel = 0
    }

    const onUp = (e: PointerEvent) => {
      if (dragging !== null) {
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {}
        const dur = performance.now() - downT
        if (!moved && dur < 350) {
          // tap on a sphere = give a small kick (push it outward)
          // direction: positive vel = swing right, but we want it to swing AWAY
          // from center, so kick in direction of its position
          const sign = dragging < N_SPHERES / 2 ? -1 : 1
          spheres[dragging].vel = sign * 0.0035
        }
        dragging = null
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // physics + collision step
    let lastT = performance.now()
    let raf = 0

    const step = (now: number) => {
      const dt = Math.min(40, now - lastT) // cap at 40ms to avoid tunneling
      lastT = now

      // sub-step physics for stability when dt is large
      const SUBSTEPS = 2
      const sdt = dt / SUBSTEPS
      for (let s = 0; s < SUBSTEPS; s++) {
        // pendulum integration — each sphere swings independently except for collisions
        for (let i = 0; i < N_SPHERES; i++) {
          if (i === dragging) continue
          // angular acceleration: -G * sin(angle) (pendulum)
          const acc = -G * Math.sin(spheres[i].angle)
          spheres[i].vel += acc * sdt
          spheres[i].vel *= DAMPING
          spheres[i].angle += spheres[i].vel * sdt
        }

        // collision pass: when adjacent spheres' centers overlap, transfer momentum.
        // since they're nearly in contact at rest, the collision happens whenever a
        // moving outer sphere reaches the next one. we model it as elastic 1D.
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < N_SPHERES - 1; i++) {
            const cA = sphereCenter(i)
            const cB = sphereCenter(i + 1)
            const dx = cB.x - cA.x
            const dy = cB.y - cA.y
            const d = Math.hypot(dx, dy)
            const overlap = SPHERE_R * 2 - d
            if (overlap > 0) {
              // elastic 1D collision along the line connecting them (mostly horizontal)
              // approximate: tangential velocity in the swing direction
              // sphere i's tangential velocity (positive = swing right)
              const vA = spheres[i].vel
              const vB = spheres[i + 1].vel
              // only do the swap if they're approaching each other
              const approaching = vA - vB > COLLISION_VEL_THRESHOLD
              if (approaching) {
                // equal-mass elastic collision: swap velocities
                spheres[i].vel = vB
                spheres[i + 1].vel = vA
                // separate them so they don't stick — push apart along the swing axis
                const sep = overlap / (2 * STRING_LEN)
                spheres[i].angle -= sep
                spheres[i + 1].angle += sep
                // click sound — intensity from velocity difference
                const intensity = Math.min(1, Math.abs(vA - vB) * 200)
                if (intensity > 0.05) playClick(intensity)
              } else if (overlap > 0.5) {
                // resting contact — gently separate
                const sep = overlap / (2 * STRING_LEN)
                spheres[i].angle -= sep * 0.5
                spheres[i + 1].angle += sep * 0.5
              }
            }
          }
        }
      }

      // ─── render ───
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      const a0 = anchors()
      const beamLeft = a0[0].x - SPHERE_R - 14
      const beamRight = a0[N_SPHERES - 1].x + SPHERE_R + 14
      const beamY = a0[0].y - 22
      const beamH = 8
      // posts on either side going to top of screen
      const postTopY = Math.max(20, beamY - 90)

      ctx.strokeStyle = `rgba(232,232,232,0.5)`
      ctx.lineWidth = 4
      // left post
      ctx.beginPath()
      ctx.moveTo(beamLeft + 2, postTopY)
      ctx.lineTo(beamLeft + 2, beamY)
      ctx.stroke()
      // right post
      ctx.beginPath()
      ctx.moveTo(beamRight - 2, postTopY)
      ctx.lineTo(beamRight - 2, beamY)
      ctx.stroke()

      // beam
      ctx.fillStyle = `rgba(232,232,232,0.55)`
      ctx.fillRect(beamLeft, beamY, beamRight - beamLeft, beamH)

      // strings + spheres
      for (let i = 0; i < N_SPHERES; i++) {
        const a = a0[i]
        const c = sphereCenter(i)
        // string
        ctx.strokeStyle = `rgba(232,232,232,0.45)`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(c.x, c.y)
        ctx.stroke()

        // sphere — soft radial gradient
        const grad = ctx.createRadialGradient(
          c.x - SPHERE_R * 0.35,
          c.y - SPHERE_R * 0.35,
          SPHERE_R * 0.1,
          c.x,
          c.y,
          SPHERE_R
        )
        grad.addColorStop(0, 'rgba(232,232,232,1)')
        grad.addColorStop(0.4, 'rgba(232,232,232,0.85)')
        grad.addColorStop(1, 'rgba(232,232,232,0.55)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(c.x, c.y, SPHERE_R, 0, Math.PI * 2)
        ctx.fill()
        // subtle outline
        ctx.strokeStyle = 'rgba(232,232,232,0.25)'
        ctx.lineWidth = 0.6
        ctx.stroke()
      }

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

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
            color: '#E8E8E8',
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
          cradle
          <span style={{ color: '#C6FF3C' }}>.</span>
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(24px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 17,
            opacity: 0.7,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          knock the first one.
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
