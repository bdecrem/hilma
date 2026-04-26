'use client'

import { useEffect, useRef } from 'react'

// L56 — dipole
// two point charges in 3D (+ at top, - at bottom). 540 cream particles flow
// along the local electric field direction: at each frame, compute the
// vector field as the sum over charges of (sign_i · (r - r_i) / |r - r_i|³),
// which points away from + and toward -. each particle integrates along
// that direction. trails fade behind. when a particle gets too close to
// the - charge (a sink), it teleports near the + charge so the flow stays
// dense. drag X to orbit camera; drag Y to modulate charge separation; tap
// to swap polarities (the field reverses, particles drift the other way
// until they hit the new sink). lime marks the + pole, cream marks the -.
// audio: a low sine drone with a subtle beat that tightens as flow speeds.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N = 540

type Pt = {
  x: number; y: number; z: number
  trail: { x: number; y: number; z: number }[]
}

export default function L56Page() {
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

    let seed = 20260426
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)

    // charge state — separation can grow/shrink, polarity can flip
    let dipoleSep = 1.05      // half-distance between charges along y
    const SEP_MIN = 0.55
    const SEP_MAX = 1.7
    let polarity = +1         // +1 means top is +, -1 means top is -
    let polarityFlipT = 0     // animate the flip

    // particles — start randomly distributed in the volume
    function spawnAtSource(p: Pt) {
      // spawn near the + charge with a small radial offset
      const sourceY = polarity * dipoleSep // top if polarity=+1
      const r = 0.08 + rand() * 0.18
      const theta = rand() * Math.PI * 2
      const phi = (rand() - 0.5) * Math.PI * 0.7 // mostly above-horizontal so flow goes outward and down
      p.x = Math.cos(theta) * Math.sin(phi + Math.PI / 2) * r
      p.z = Math.sin(theta) * Math.sin(phi + Math.PI / 2) * r
      p.y = sourceY + Math.cos(phi + Math.PI / 2) * r * 0.6
      p.trail.length = 0
    }

    const points: Pt[] = []
    for (let i = 0; i < N; i++) {
      const p: Pt = { x: 0, y: 0, z: 0, trail: [] }
      // distribute initial state across the volume so the field is full from frame 1
      p.x = (rand() - 0.5) * 3
      p.y = (rand() - 0.5) * 3
      p.z = (rand() - 0.5) * 3
      points.push(p)
    }

    // camera
    let camRY = 0.45
    let camRX = 0.12
    let camDragRY = 0
    let camDragSepDelta = 0
    let lastPx = 0, lastPy = 0
    let dragging = false
    let tapDownT = 0
    let tapMoved = false

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

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
      camDragSepDelta += dy * 0.0015
    })
    canvas.addEventListener('pointerup', () => {
      dragging = false
      const dt = performance.now() - tapDownT
      if (dt < 280 && !tapMoved) {
        // tap — swap polarities
        polarity *= -1
        polarityFlipT = performance.now()
      }
    })
    canvas.addEventListener('pointerleave', () => { dragging = false })

    // audio
    let audioCtx: AudioContext | null = null
    let osc: OscillatorNode | null = null
    let gain: GainNode | null = null
    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return }
      osc = audioCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 80
      gain = audioCtx.createGain()
      gain.gain.value = 0
      osc.connect(gain).connect(audioCtx.destination)
      osc.start()
      gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 1.5)
    }

    // small helper — vector-field at point r=(x,y,z)
    // returns (fx, fy, fz) — clamped magnitude to avoid blow-ups near charges
    function fieldAt(x: number, y: number, z: number): [number, number, number] {
      // + charge at (0, +sep, 0) when polarity=+1 — its sign is polarity (+1)
      // - charge at (0, -sep, 0) — its sign is -polarity (-1)
      const charges = [
        { px: 0, py: polarity * dipoleSep, pz: 0, sign: +1 },
        { px: 0, py: -polarity * dipoleSep, pz: 0, sign: -1 },
      ]
      let fx = 0, fy = 0, fz = 0
      for (const c of charges) {
        const rx = x - c.px
        const ry = y - c.py
        const rz = z - c.pz
        const r2 = rx * rx + ry * ry + rz * rz + 0.04 // softened
        const inv = 1 / Math.sqrt(r2)
        const k = c.sign / r2 * inv // (sign/r²) * (1/|r|) — i.e. sign·r̂/r²
        fx += rx * k
        fy += ry * k
        fz += rz * k
      }
      return [fx, fy, fz]
    }

    function loop() {
      const now = performance.now()

      // ease drag deltas
      camRY += camDragRY
      camDragRY = 0
      const targetSep = Math.max(SEP_MIN, Math.min(SEP_MAX, dipoleSep + camDragSepDelta))
      dipoleSep += (targetSep - dipoleSep) * 0.5
      camDragSepDelta = 0

      // background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // step particles along the field
      const sinkY = -polarity * dipoleSep
      const sourceY = polarity * dipoleSep
      const SINK_THRESH = 0.18 * 0.18 // squared distance to - to consider "absorbed"
      const SPEED = 0.018 // base step
      const MAX_TRAIL = 7

      for (const p of points) {
        const [fx, fy, fz] = fieldAt(p.x, p.y, p.z)
        // normalize then step (so flow speed is roughly uniform, not blasted near charges)
        const m = Math.hypot(fx, fy, fz) || 1e-6
        const nx = fx / m, ny = fy / m, nz = fz / m

        // push into trail buffer
        if (p.trail.length >= MAX_TRAIL) p.trail.shift()
        p.trail.push({ x: p.x, y: p.y, z: p.z })

        p.x += nx * SPEED
        p.y += ny * SPEED
        p.z += nz * SPEED

        // sink: distance to - charge
        const dx = p.x - 0
        const dy = p.y - sinkY
        const dz = p.z - 0
        if (dx * dx + dy * dy + dz * dz < SINK_THRESH) {
          spawnAtSource(p)
        }
        // also respawn if drifted very far
        if (p.x * p.x + p.y * p.y + p.z * p.z > 16) {
          spawnAtSource(p)
        }
        // suppress unused
        void sourceY
      }

      // perspective project
      const cy = Math.cos(camRY); const sy = Math.sin(camRY)
      const cx = Math.cos(camRX); const sx = Math.sin(camRX)
      const camD = 4
      const fov = Math.min(W, H) * 0.42
      const cxOff = W / 2
      const cyOff = H / 2

      type Proj = { sx: number; sy: number; depth: number; alpha: number; size: number }
      function project(x3: number, y3: number, z3: number): Proj | null {
        const xr = cy * x3 + sy * z3
        const zr = -sy * x3 + cy * z3
        const yr = cx * y3 - sx * zr
        const zr2 = sx * y3 + cx * zr
        const denom = (camD - zr2)
        if (denom <= 0.1) return null
        const sx2 = (xr / denom) * fov + cxOff
        const sy2 = (yr / denom) * fov + cyOff
        const depthFactor = Math.max(0.18, Math.min(1, (zr2 + 2) / 4))
        return { sx: sx2, sy: sy2, depth: zr2, alpha: depthFactor, size: 0.9 + depthFactor * 1.1 }
      }

      // draw trails first (cream, low alpha, sorted back-to-front)
      type DrawSeg = { ax: number; ay: number; bx: number; by: number; alpha: number; depth: number }
      const segs: DrawSeg[] = []
      for (const p of points) {
        if (p.trail.length < 2) continue
        for (let i = 1; i < p.trail.length; i++) {
          const a = p.trail[i - 1]
          const b = p.trail[i]
          const pa = project(a.x, a.y, a.z)
          const pb = project(b.x, b.y, b.z)
          if (!pa || !pb) continue
          const t = i / p.trail.length
          segs.push({
            ax: pa.sx, ay: pa.sy, bx: pb.sx, by: pb.sy,
            alpha: t * 0.6 * pa.alpha,
            depth: (pa.depth + pb.depth) * 0.5,
          })
        }
      }
      segs.sort((a, b) => a.depth - b.depth)
      ctx!.lineCap = 'round'
      for (const s of segs) {
        ctx!.strokeStyle = `rgba(232, 232, 232, ${s.alpha.toFixed(3)})`
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.moveTo(s.ax, s.ay)
        ctx!.lineTo(s.bx, s.by)
        ctx!.stroke()
      }

      // draw point heads (brighter)
      const heads: Proj[] = []
      for (const p of points) {
        const v = project(p.x, p.y, p.z)
        if (v) heads.push(v)
      }
      heads.sort((a, b) => a.depth - b.depth)
      for (const v of heads) {
        ctx!.fillStyle = `rgba(232, 232, 232, ${(0.45 + v.alpha * 0.5).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(v.sx, v.sy, v.size, 0, Math.PI * 2)
        ctx!.fill()
      }

      // charge markers — + LIME (animated polarity flip swaps colors briefly)
      const flipAge = polarityFlipT ? Math.min(1, (now - polarityFlipT) / 600) : 1
      const plusY = polarity * dipoleSep
      const minusY = -polarity * dipoleSep
      const pPlus = project(0, plusY, 0)
      const pMinus = project(0, minusY, 0)
      if (pPlus) {
        // halo
        ctx!.fillStyle = `rgba(198, 255, 60, ${(0.18 * pPlus.alpha).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(pPlus.sx, pPlus.sy, 18, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.fillStyle = `rgba(198, 255, 60, ${(0.55 + pPlus.alpha * 0.35).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(pPlus.sx, pPlus.sy, 5 * (1 + (1 - flipAge) * 0.6), 0, Math.PI * 2)
        ctx!.fill()
      }
      if (pMinus) {
        ctx!.fillStyle = `rgba(232, 232, 232, ${(0.12 * pMinus.alpha).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(pMinus.sx, pMinus.sy, 14, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.fillStyle = `rgba(232, 232, 232, ${(0.5 + pMinus.alpha * 0.4).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(pMinus.sx, pMinus.sy, 4, 0, Math.PI * 2)
        ctx!.fill()
      }

      // audio — pitch slightly tracks separation; gain steady
      if (audioCtx && osc) {
        const t = audioCtx.currentTime
        const norm = (dipoleSep - SEP_MIN) / (SEP_MAX - SEP_MIN)
        // closer poles = higher freq (tighter beat in your head)
        osc.frequency.setTargetAtTime(70 + (1 - norm) * 70, t, 0.2)
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
          ENVIRONMENT · L56
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
            L56.
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
            the field between two points.
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
            DRAG X · ORBIT &nbsp; DRAG Y · SEPARATE &nbsp; TAP · REVERSE
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
