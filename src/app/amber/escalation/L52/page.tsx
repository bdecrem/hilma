'use client'

// L52 — two Lorenz attractors in 3D. Same equations, σ=10, ρ=28, β=8/3.
// The starts differ only in the 5th decimal place. Each trace draws its
// own path of the butterfly. After a few seconds the two are nowhere
// near each other — that's the whole point of chaos. Perspective
// projection with depth fog. Drag to tilt / push rotation. Tap to reset:
// new near-identical initial conditions, both diverge fresh. Stereo-panned
// sine tones, one per trace, frequency scaled by current z coordinate.
//
// v3 SIGNAL · Environment tier. Builds on L51 (3D projection) and adds:
// chaos / procedural trajectory, stereo spatial audio, multi-trace
// divergence, multi-state (active/resetting).

import { useEffect, useRef } from 'react'

// Lorenz params (classic butterfly).
const SIGMA = 10
const RHO = 28
const BETA = 8 / 3
const DT_SIM = 0.006     // integration timestep
const STEPS_PER_FRAME = 6 // how many sim steps per animation frame

const TRAIL_LEN = 700

interface Trace {
  x: number; y: number; z: number
  tx: Float32Array; ty: Float32Array; tz: Float32Array
  head: number
  count: number
}

function makeTrace(x: number, y: number, z: number): Trace {
  return {
    x, y, z,
    tx: new Float32Array(TRAIL_LEN),
    ty: new Float32Array(TRAIL_LEN),
    tz: new Float32Array(TRAIL_LEN),
    head: 0,
    count: 0,
  }
}

function stepTrace(t: Trace) {
  for (let i = 0; i < STEPS_PER_FRAME; i++) {
    const dx = SIGMA * (t.y - t.x)
    const dy = t.x * (RHO - t.z) - t.y
    const dz = t.x * t.y - BETA * t.z
    t.x += dx * DT_SIM
    t.y += dy * DT_SIM
    t.z += dz * DT_SIM
  }
  t.tx[t.head] = t.x
  t.ty[t.head] = t.y
  t.tz[t.head] = t.z
  t.head = (t.head + 1) % TRAIL_LEN
  if (t.count < TRAIL_LEN) t.count++
}

function resetTrace(t: Trace, x: number, y: number, z: number) {
  t.x = x; t.y = y; t.z = z
  t.head = 0
  t.count = 0
}

export default function L52() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0, H = 0, cx = 0, cy = 0, S = 1
    const resize = () => {
      W = Math.floor(window.innerWidth * dpr)
      H = Math.floor(window.innerHeight * dpr)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      cx = Math.floor(W / 2)
      cy = Math.floor(H / 2)
      // Lorenz lives roughly in a box x ∈ ±25, y ∈ ±35, z ∈ 0..50. Scale so
      // the whole shape fits at ~60% of the smaller axis.
      S = Math.min(W, H) * 0.012
    }
    resize()
    window.addEventListener('resize', resize)

    // Two near-identical starts. Differing only at the 5th decimal.
    let pert = 0.00001
    const t1 = makeTrace(1.0, 1.0, 1.0)
    const t2 = makeTrace(1.0 + pert, 1.0, 1.0)
    const traces = [t1, t2]

    // Rotation state (around the world-up axis which is Z in Lorenz space;
    // we'll also tilt around the world-X axis).
    let yaw = 0
    let pitch = 0.25
    let yawVel = 0.004
    let pitchVel = 0.0005
    const BASE_YAW_VEL = 0.004
    const BASE_PITCH_VEL = 0.0005

    let pointerDown = false
    let downX = 0, downY = 0
    let lastPx = 0, lastPy = 0

    // Audio — two stereo-panned sine oscillators, one per trace.
    type AudioCtxCtor = typeof AudioContext
    let audioCtx: AudioContext | null = null
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []
    const pans: StereoPannerNode[] = []
    const startAudio = () => {
      if (!audioCtx) {
        const Ctor = (window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioCtxCtor }).webkitAudioContext)
        audioCtx = new Ctor()
        for (let i = 0; i < 2; i++) {
          const osc = audioCtx.createOscillator()
          const gain = audioCtx.createGain()
          const pan = audioCtx.createStereoPanner()
          osc.type = 'sine'
          osc.frequency.value = 120 + i * 40
          gain.gain.value = 0
          osc.connect(pan).connect(gain).connect(audioCtx.destination)
          osc.start()
          oscs.push(osc); gains.push(gain); pans.push(pan)
        }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume()
    }
    const resetTick = () => {
      if (!audioCtx) return
      const now = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 660
      gain.gain.setValueAtTime(0.05, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(now); osc.stop(now + 0.32)
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      startAudio()
      pointerDown = true
      downX = e.clientX; downY = e.clientY
      lastPx = e.clientX; lastPy = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!pointerDown) return
      const dx = e.clientX - lastPx
      const dy = e.clientY - lastPy
      lastPx = e.clientX; lastPy = e.clientY
      yawVel += dx * 0.0002
      pitchVel += -dy * 0.0002
      yawVel = Math.max(-0.04, Math.min(0.04, yawVel))
      pitchVel = Math.max(-0.025, Math.min(0.025, pitchVel))
    }
    const onUp = (e: PointerEvent) => {
      const totalMove = Math.hypot(e.clientX - downX, e.clientY - downY)
      if (pointerDown && totalMove < 6) {
        // Tap: reset with a fresh perturbation.
        pert = 0.000005 + Math.random() * 0.00002
        resetTrace(t1, 1.0, 1.0, 1.0)
        resetTrace(t2, 1.0 + pert, 1.0, 1.0)
        resetTick()
      }
      pointerDown = false
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // Project (x,y,z) in world space through the current rotation and
    // perspective. World-up is treated as z (Lorenz convention) but we
    // render with y as screen-up, so we swap.
    const CAM = 60
    const project = (x: number, y: number, z: number) => {
      // Lorenz z goes 0..50; recenter so the butterfly sits near origin.
      const wx = x
      const wy = y
      const wz = z - 25
      // Yaw around world-Z (vertical): rotates x,y
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
      const xa = wx * cosY - wy * sinY
      const ya = wx * sinY + wy * cosY
      const za = wz
      // Pitch around world-X: rotates y,z
      const cosX = Math.cos(pitch), sinX = Math.sin(pitch)
      const xb = xa
      const yb = ya * cosX - za * sinX
      const zb = ya * sinX + za * cosX
      // Screen coords — y becomes screen-down (invert), z is depth.
      const camZ = CAM - zb
      if (camZ <= 0.5) return null
      const persp = CAM / camZ
      const sx = cx + xb * S * persp
      const sy = cy - yb * S * persp
      return { sx, sy, depth: camZ }
    }

    let raf = 0
    let lastT = performance.now()

    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now

      // Damp rotation velocity toward base.
      const DAMP = Math.pow(0.985, dt * 60)
      yawVel = BASE_YAW_VEL + (yawVel - BASE_YAW_VEL) * DAMP
      pitchVel = BASE_PITCH_VEL + (pitchVel - BASE_PITCH_VEL) * DAMP
      yaw += yawVel * dt * 60
      pitch += pitchVel * dt * 60

      // Integrate both traces.
      for (const t of traces) stepTrace(t)

      // Audio per trace: frequency from z, gain from trajectory activity,
      // pan from screen-x of the head.
      if (audioCtx) {
        for (let i = 0; i < traces.length; i++) {
          const t = traces[i]
          const p = project(t.x, t.y, t.z)
          const base = 110 + i * 35
          const freq = base + Math.max(0, Math.min(200, (t.z - 10) * 4))
          oscs[i].frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08)
          // Pan by screen-x normalized to [-1, 1].
          const panVal = p ? Math.max(-1, Math.min(1, (p.sx - cx) / (W * 0.4))) : 0
          pans[i].pan.setTargetAtTime(panVal, audioCtx.currentTime, 0.08)
          // Gain grows as trace warms up (count builds), capped.
          const warm = Math.min(1, t.count / 300)
          gains[i].gain.setTargetAtTime(warm * 0.02, audioCtx.currentTime, 0.12)
        }
      }

      // Render
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, W, H)

      // Faint horizon cue.
      ctx.strokeStyle = 'rgba(232,232,232,0.035)'
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(W * 0.14, cy)
      ctx.lineTo(W * 0.86, cy)
      ctx.stroke()

      // Draw each trace's trail.
      for (const t of traces) {
        for (let k = 0; k < t.count; k++) {
          const age = k // 0 = oldest, count-1 = newest
          const idx = (t.head - t.count + k + TRAIL_LEN) % TRAIL_LEN
          const p = project(t.tx[idx], t.ty[idx], t.tz[idx])
          if (!p) continue
          const ageT = age / t.count // 0..1
          // Depth fog: points further from camera fade.
          const near = Math.max(0, Math.min(1, (CAM + 18 - p.depth) / 35))
          const alpha = ageT * near * 0.42
          const size = (0.7 + near * 1.1) * dpr
          if (alpha < 0.02) continue
          ctx.fillStyle = `rgba(232,232,232,${alpha})`
          ctx.fillRect(
            Math.floor(p.sx - size / 2),
            Math.floor(p.sy - size / 2),
            Math.max(1, Math.floor(size)),
            Math.max(1, Math.floor(size)),
          )
        }
        // Lime dot at the active head.
        const head = project(t.x, t.y, t.z)
        if (head) {
          const near = Math.max(0, Math.min(1, (CAM + 18 - head.depth) / 35))
          ctx.fillStyle = `rgba(198, 255, 60, ${0.6 + near * 0.35})`
          ctx.beginPath()
          ctx.arc(head.sx, head.sy, (2 + near * 1.4) * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Chrome upper-right
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232,232,232,0.42)'
      ctx.fillText('ENVIRONMENT · L52', W - 22 * dpr, 22 * dpr)

      // Museum label lower-left
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `italic 300 ${Math.floor(26 * dpr)}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232,232,232,0.9)'
      ctx.fillText('L52', 28 * dpr, H - 42 * dpr)
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232,232,232,0.52)'
      ctx.fillText('two paths, the same start', 28 * dpr, H - 22 * dpr)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      window.removeEventListener('resize', resize)
      if (audioCtx) audioCtx.close()
    }
  }, [])

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0A0A0A',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0 }} />
    </main>
  )
}
