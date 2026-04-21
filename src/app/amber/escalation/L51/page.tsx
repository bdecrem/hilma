'use client'

// L51 — a 3D Lissajous torus knot. 600 points on a closed curve
//   x = R·sin(3t),  y = R·sin(4t + π/5),  z = R·sin(5t + π/3)
// rotating slowly around the vertical axis. Perspective projection; near
// points read as brighter and larger, far points fade into the field.
//
// The static curve is illegible; only rotation reveals its 3D shape. First
// piece of the Environment tier (L51–75) — the tier's opening move is:
// depth, read from motion.
//
// Interaction:
//   - drag to push rotation (velocity picks up drag speed, then damps)
//   - tap to ring the nearest point — a lime pulse travels along the curve
//     outward from the tap position in both directions
//   - 60Hz sine drone, gain scales with angular velocity

import { useEffect, useRef } from 'react'

const N = 600
const R = 1.0 // curve radius in unit space; scaled by CELL at render time
const LX = 3, LY = 4, LZ = 5
const PHI = Math.PI / 5
const PSI = Math.PI / 3

interface Pt3 { x: number; y: number; z: number }

function generateCurve(): Pt3[] {
  const pts: Pt3[] = []
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI
    pts.push({
      x: R * Math.sin(LX * t),
      y: R * Math.sin(LY * t + PHI),
      z: R * Math.sin(LZ * t + PSI),
    })
  }
  return pts
}

export default function L51() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0, H = 0, cx = 0, cy = 0, S = 1 // scale factor for unit space → pixels
    const resize = () => {
      W = Math.floor(window.innerWidth * dpr)
      H = Math.floor(window.innerHeight * dpr)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      cx = Math.floor(W / 2)
      cy = Math.floor(H / 2)
      // Fit the unit curve (radius 1) into ~40% of the smaller axis, leaving
      // room for the museum label and chrome.
      S = Math.min(W, H) * 0.38
    }
    resize()
    window.addEventListener('resize', resize)

    const curve = generateCurve()

    // Rotation state — two angular velocities (yaw = Y axis, pitch = X axis).
    let yaw = 0
    let pitch = 0.18 // small initial tilt so the knot doesn't start edge-on
    let yawVel = 0.0065 // rad/frame at 60fps
    let pitchVel = 0.0012

    // Drag: while pointer is down, we integrate pointer delta into angular
    // velocity. On release, velocities decay back toward a steady rotation.
    const BASE_YAW_VEL = 0.0065
    const BASE_PITCH_VEL = 0.0012
    let pointerDown = false
    let lastPx = 0, lastPy = 0

    // Audio
    type AudioCtxCtor = typeof AudioContext
    let audioCtx: AudioContext | null = null
    let droneOsc: OscillatorNode | null = null
    let droneGain: GainNode | null = null
    const startAudio = () => {
      if (!audioCtx) {
        const Ctor = (window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioCtxCtor }).webkitAudioContext)
        audioCtx = new Ctor()
        droneOsc = audioCtx.createOscillator()
        droneGain = audioCtx.createGain()
        droneOsc.type = 'sine'
        droneOsc.frequency.value = 62
        droneGain.gain.value = 0.0
        droneOsc.connect(droneGain).connect(audioCtx.destination)
        droneOsc.start()
      }
      if (audioCtx.state === 'suspended') audioCtx.resume()
    }
    const tick = (freq: number) => {
      if (!audioCtx) return
      const now = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.05, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.5)
    }

    // Ring state — when a tap happens we flag a ring origin index on the
    // curve and the ring radius expands, brightening neighboring points.
    let ringCenter = -1
    let ringAge = Infinity // seconds since ring started

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      startAudio()
      pointerDown = true
      lastPx = e.clientX
      lastPy = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!pointerDown) return
      const dx = e.clientX - lastPx
      const dy = e.clientY - lastPy
      lastPx = e.clientX
      lastPy = e.clientY
      // Horizontal drag → yaw, vertical drag → pitch. Scale is tuned so a
      // ~100px drag bumps rotation speed by ~0.02 rad/frame.
      yawVel += dx * 0.00015
      pitchVel += -dy * 0.00015
      // Clamp so things don't spin wildly.
      yawVel = Math.max(-0.08, Math.min(0.08, yawVel))
      pitchVel = Math.max(-0.05, Math.min(0.05, pitchVel))
    }
    const onUp = (e: PointerEvent) => {
      // If pointer hardly moved, treat as tap → ring the nearest projected point.
      const totalMove = Math.hypot(e.clientX - lastPx, e.clientY - lastPy)
      if (pointerDown && totalMove < 6 && lastProjected.length > 0) {
        const px = e.clientX * dpr
        const py = e.clientY * dpr
        let bestIdx = 0
        let bestD = Infinity
        for (let i = 0; i < lastProjected.length; i++) {
          const p = lastProjected[i]
          if (!p) continue
          const d = Math.hypot(p.px - px, p.py - py)
          if (d < bestD) { bestD = d; bestIdx = i }
        }
        ringCenter = bestIdx
        ringAge = 0
        tick(560)
      }
      pointerDown = false
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // Keep the most recent projection so the tap-handler can pick the nearest
    // projected point without re-running the math.
    const lastProjected: Array<{ px: number; py: number; depth: number }> = new Array(N)

    let raf = 0
    let lastT = performance.now()

    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now

      // Damp velocities toward the base rotation (so the curve never stops).
      const DAMP = Math.pow(0.985, dt * 60)
      yawVel = BASE_YAW_VEL + (yawVel - BASE_YAW_VEL) * DAMP
      pitchVel = BASE_PITCH_VEL + (pitchVel - BASE_PITCH_VEL) * DAMP

      yaw += yawVel * dt * 60
      pitch += pitchVel * dt * 60

      // Update drone gain with angular speed magnitude.
      if (droneGain && audioCtx) {
        const speed = Math.hypot(yawVel - BASE_YAW_VEL, pitchVel - BASE_PITCH_VEL)
        const target = 0.008 + Math.min(0.04, speed * 1.2)
        droneGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.15)
      }

      ringAge += dt

      // Rotate + project
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
      const cosX = Math.cos(pitch), sinX = Math.sin(pitch)
      // Perspective: camera at z = CAM_Z looking at origin
      const CAM_Z = 3.0

      // Collect projected points with their depth so we can z-sort for proper
      // overlap (far first, near last).
      const projected: Array<{ idx: number; px: number; py: number; depth: number }> = []
      for (let i = 0; i < N; i++) {
        const p = curve[i]
        // rotate around Y
        const x1 = p.x * cosY + p.z * sinY
        const z1 = -p.x * sinY + p.z * cosY
        // rotate around X
        const y2 = p.y * cosX - z1 * sinX
        const z2 = p.y * sinX + z1 * cosX
        const x2 = x1
        // camera space
        const zc = CAM_Z - z2
        if (zc <= 0.1) {
          lastProjected[i] = { px: cx, py: cy, depth: 999 }
          continue
        }
        const persp = CAM_Z / zc
        const px = cx + x2 * S * persp
        const py = cy + y2 * S * persp
        projected.push({ idx: i, px, py, depth: zc })
        lastProjected[i] = { px, py, depth: zc }
      }
      // sort back-to-front
      projected.sort((a, b) => b.depth - a.depth)

      // Render
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, W, H)

      // Very subtle horizon hint — centers the composition in deep space.
      ctx.strokeStyle = 'rgba(232, 232, 232, 0.04)'
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(cx - S * 1.6, cy)
      ctx.lineTo(cx + S * 1.6, cy)
      ctx.stroke()

      // Ring decay — if a ring is active, compute the distance each index has
      // had time to travel along the curve (both directions).
      const ringSpeed = 180 // indices per second (≈ 0.3 of the curve per second)
      const ringReach = ringAge * ringSpeed
      const ringEnvelope = Math.max(0, 1 - ringAge / 1.6) // fades over 1.6s

      for (const p of projected) {
        const depth = p.depth
        // Depth fog: near (smaller zc) = brighter + larger
        const near = Math.max(0, Math.min(1, (CAM_Z + 1.2 - depth) / 2.2))
        const alpha = 0.12 + near * 0.55
        const size = (0.8 + near * 2.2) * dpr

        // Check ring lighting for this point
        let isRing = 0
        if (ringCenter >= 0 && ringEnvelope > 0) {
          const dA = Math.abs(p.idx - ringCenter)
          const dCirc = Math.min(dA, N - dA) // circular distance on the curve
          if (dCirc <= ringReach && ringReach - dCirc < 24) {
            // Point is within the advancing ring edge — brighten it in lime.
            const edgeT = 1 - (ringReach - dCirc) / 24
            isRing = edgeT * ringEnvelope
          }
        }

        if (isRing > 0) {
          ctx.fillStyle = `rgba(198, 255, 60, ${isRing * 0.95})`
          const rsize = size + isRing * 3 * dpr
          ctx.beginPath()
          ctx.arc(p.px, p.py, rsize, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = `rgba(232, 232, 232, ${alpha})`
          ctx.fillRect(
            Math.floor(p.px - size / 2),
            Math.floor(p.py - size / 2),
            Math.max(1, Math.floor(size)),
            Math.max(1, Math.floor(size)),
          )
        }
      }

      // Chrome upper-right
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.42)'
      ctx.fillText('ENVIRONMENT · L51', W - 22 * dpr, 22 * dpr)

      // Museum label lower-left
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `italic 300 ${Math.floor(26 * dpr)}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.9)'
      ctx.fillText('L51', 28 * dpr, H - 42 * dpr)
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.52)'
      ctx.fillText('a shape that only exists when it turns', 28 * dpr, H - 22 * dpr)

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
