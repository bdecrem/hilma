'use client'

import { useEffect, useRef } from 'react'

// dial — a rotary phone dial. classic black bakelite face on a NIGHT field.
// 10 cream finger holes around the dial (numbers 1-2-3-...-9-0 reading CW).
// drag a finger hole clockwise around the dial to "spin" the wheel; release
// at any point and the wheel spring-returns counter-clockwise with momentum,
// ticking through each detent position. each detent triggers a short
// mechanical click (HP noise burst, ~12ms). the wheel cannot spin past its
// CCW rest position (the natural limit). a finger stop on the lower-right
// blocks the dial from going past digit 0.
//
// Different mechanic from everything recent: no waves, no glow, no marks,
// no impact-pendulum. Spring-return rotation with detent ticks. cream only,
// no FLARE.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'

// 10 holes, evenly spaced over the dial face. Position 0 = "1" (top-right of stop).
// Real dials wrap the holes from "1" at the top going CW around to "0" at the bottom-right.
// Angular positions (radians, 0 = right, increasing CCW per math convention).
// We use the visual convention: angle measured CW from the 12 o'clock position.
// holes[i].angleAtRest = i * 32° + offset, going CW from upper-left.
const N_HOLES = 10
const HOLE_ANGULAR_SPAN = (Math.PI * 2 * 0.85) / N_HOLES // gap between holes ~30.6°
const FIRST_HOLE_ANGLE_REST = -Math.PI / 2 + HOLE_ANGULAR_SPAN * 0.5 // first hole near 12 o'clock area

// physics: rotation = how far CW the user has spun the dial from rest, in radians.
// rotation 0 = rest (hole "1" at its rest position).
// rotation > 0 = wound CW.
const SPRING_K = 0.018 // angular spring constant (per ms²) — return-to-zero force per radian
const DAMPING = 0.985 // velocity damping per frame
const MAX_ROTATION = HOLE_ANGULAR_SPAN * (N_HOLES - 1) + HOLE_ANGULAR_SPAN * 0.4 // can't spin past digit 0

export default function DialPage() {
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

    let rotation = 0
    let rotVel = 0
    let lastDetent = 0 // last integer "tick" passed through (for click detection)

    // pointer state
    let dragging = false
    let dragHoleIdx = -1 // which hole the user grabbed (so we can compute rotation)
    let lastDragAngle = 0 // last cursor angle relative to dial center
    let downX = 0,
      downY = 0,
      downT = 0
    let moved = false

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
      // mechanical detent click — short HP-noise burst, plastic-y
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.025), audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const noise = audioCtx.createBufferSource()
      noise.buffer = buf
      const hp = audioCtx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1500
      const lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 5000
      const env = audioCtx.createGain()
      const amp = Math.min(0.6, 0.18 + intensity * 0.45)
      env.gain.setValueAtTime(amp, now)
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.025)
      noise.connect(hp)
      hp.connect(lp)
      lp.connect(env)
      env.connect(audioCtx.destination)
      noise.start(now)
      noise.stop(now + 0.03)
    }

    // dial geometry helpers
    const dialCenter = () => ({
      x: W / 2,
      y: H * 0.5,
    })
    const dialOuterR = () => Math.min(W, H) * 0.32
    const dialInnerR = () => dialOuterR() * 0.55 // inner cream area where labels sit
    const holeR = () => dialOuterR() * 0.10
    const holeOrbitR = () => dialOuterR() * 0.78 // distance from center to hole center

    // hole position given dial rotation
    // hole angles increase CW from FIRST_HOLE_ANGLE_REST (which is in screen coords)
    // when rotation > 0, all holes rotate CW (visual angle decreases in screen-y math sense, but for our convention treat increasing CW)
    const holeScreenAngle = (idx: number) => FIRST_HOLE_ANGLE_REST + idx * HOLE_ANGULAR_SPAN + rotation
    const holeCenter = (idx: number) => {
      const a = holeScreenAngle(idx)
      const c = dialCenter()
      const r = holeOrbitR()
      // visual: screen Y goes down, so y = center.y + r*sin(a). Rotation in our convention
      // is CW = increasing a in screen coords (since +a in screen = CW for the standard
      // canvas where +x right, +y down).
      return {
        x: c.x + Math.cos(a) * r,
        y: c.y + Math.sin(a) * r,
      }
    }

    // pointer helpers
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const cursorAngleFromCenter = (x: number, y: number) => {
      const c = dialCenter()
      return Math.atan2(y - c.y, x - c.x)
    }

    const onDown = (e: PointerEvent) => {
      const p = pos(e)
      // find which hole was grabbed (closest hole within hit radius)
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < N_HOLES; i++) {
        const hc = holeCenter(i)
        const d = Math.hypot(p.x - hc.x, p.y - hc.y)
        if (d < holeR() + 12 && d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      if (bestIdx < 0) return
      dragging = true
      dragHoleIdx = bestIdx
      moved = false
      downX = p.x
      downY = p.y
      downT = performance.now()
      lastDragAngle = cursorAngleFromCenter(p.x, p.y)
      rotVel = 0
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }

    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const p = pos(e)
      const angleNow = cursorAngleFromCenter(p.x, p.y)
      let delta = angleNow - lastDragAngle
      // handle wraparound (atan2 jumps from π to -π or vice versa)
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      // only allow CW spin (positive delta in screen coords); CCW drag does nothing
      if (delta > 0) {
        const newRot = Math.min(MAX_ROTATION, rotation + delta)
        rotation = newRot
      }
      lastDragAngle = angleNow
      if (Math.abs(p.x - downX) > 4 || Math.abs(p.y - downY) > 4) moved = true
    }

    const onUp = (e: PointerEvent) => {
      if (dragging) {
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {}
        dragging = false
        dragHoleIdx = -1
        // give a small CCW velocity to start the spring-return
        // (the spring will do the rest, but a kick feels more mechanical)
        rotVel = -0.0008 * Math.sqrt(rotation) // bigger initial velocity if dial was wound farther
      }
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

      if (!dragging && rotation > 0.0001) {
        // spring force: F = -k * rotation (pulls back to 0)
        const force = -SPRING_K * rotation
        rotVel += force * dt
        rotVel *= DAMPING
        rotation += rotVel * dt
        // clamp at rest
        if (rotation < 0) {
          rotation = 0
          rotVel = 0
        }
      }

      // detent click detection — when rotation crosses an integer multiple of HOLE_ANGULAR_SPAN
      const currentDetent = Math.floor(rotation / HOLE_ANGULAR_SPAN)
      if (currentDetent !== lastDetent) {
        // we crossed a detent boundary — click
        const intensity = Math.min(1, Math.abs(rotVel) * 80)
        // only click if there's meaningful motion (avoid micro-clicks on settling)
        if (Math.abs(rotVel) > 0.0001 || dragging) {
          playClick(intensity)
        }
        lastDetent = currentDetent
      }

      // ─── render ───
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      const c = dialCenter()
      const outerR = dialOuterR()
      const innerR = dialInnerR()
      const holeOrbitRadius = holeOrbitR()

      // dial face — bakelite black with cream outline
      ctx.fillStyle = '#1a1a1a'
      ctx.beginPath()
      ctx.arc(c.x, c.y, outerR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(232, 232, 232, 0.4)`
      ctx.lineWidth = 1.2
      ctx.stroke()

      // number labels (1-9 then 0) printed on the cream ring around each hole position at REST
      ctx.fillStyle = `rgba(232, 232, 232, 0.55)`
      ctx.font = `${Math.floor(outerR * 0.085)}px "Courier Prime", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
      for (let i = 0; i < N_HOLES; i++) {
        // labels stay in their rest position (don't rotate with the dial)
        const a = FIRST_HOLE_ANGLE_REST + i * HOLE_ANGULAR_SPAN
        const lr = holeOrbitRadius + outerR * 0.13
        const lx = c.x + Math.cos(a) * lr
        const ly = c.y + Math.sin(a) * lr
        ctx.fillText(labels[i], lx, ly)
      }

      // finger holes — these MOVE with the dial
      for (let i = 0; i < N_HOLES; i++) {
        const hc = holeCenter(i)
        // dark background hole (cut into the bakelite)
        ctx.fillStyle = FIELD
        ctx.beginPath()
        ctx.arc(hc.x, hc.y, holeR(), 0, Math.PI * 2)
        ctx.fill()
        // inner cream ring (the chrome rim of a finger hole)
        ctx.strokeStyle = `rgba(232, 232, 232, ${dragging && dragHoleIdx === i ? 0.85 : 0.55})`
        ctx.lineWidth = dragging && dragHoleIdx === i ? 2 : 1
        ctx.beginPath()
        ctx.arc(hc.x, hc.y, holeR(), 0, Math.PI * 2)
        ctx.stroke()
      }

      // inner circle (the dial's central plate) — slightly lighter
      ctx.fillStyle = '#262626'
      ctx.beginPath()
      ctx.arc(c.x, c.y, innerR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(232, 232, 232, 0.25)`
      ctx.lineWidth = 0.8
      ctx.stroke()

      // finger stop — the curved metal piece on the lower-right that prevents over-rotation
      // it sits at angle ~60° below horizontal-right, just outside the dial perimeter
      const stopAngle = Math.PI / 6 // 30° below horizontal-right
      const stopX = c.x + Math.cos(stopAngle) * (outerR + 4)
      const stopY = c.y + Math.sin(stopAngle) * (outerR + 4)
      ctx.fillStyle = `rgba(232, 232, 232, 0.5)`
      ctx.beginPath()
      ctx.arc(stopX, stopY, outerR * 0.06, 0, Math.PI * 2)
      ctx.fill()
      // small arm
      ctx.strokeStyle = `rgba(232, 232, 232, 0.5)`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(c.x + Math.cos(stopAngle) * outerR, c.y + Math.sin(stopAngle) * outerR)
      ctx.lineTo(stopX, stopY)
      ctx.stroke()

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
          dial
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
          spin a number.
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
