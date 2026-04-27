'use client'

import { useEffect, useRef } from 'react'

// L57 — incense
// a thin column of smoke rising from a single point at the bottom of a NIGHT
// plate. ~700 cream particles emit from the source, drift upward (buoyancy),
// and are carried sideways by a 3D curl-noise vector field that drifts in
// time. each particle fades and dies over ~3.5s. drag rotates the camera
// around the column; tap sends a brief wind gust impulse from the tap
// direction (decays over ~1.6s). lime tip on the source — a small ember.
// audio: low-passed noise that opens when the column is dense.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N_MAX = 720

type Particle = {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  born: number
  life: number
  size: number
  alive: boolean
}

export default function L57Page() {
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

    // particles — pre-allocated pool, alive flag controls slot use
    const ps: Particle[] = []
    for (let i = 0; i < N_MAX; i++) {
      ps.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        born: 0, life: 0, size: 0, alive: false,
      })
    }

    // source location in world space (bottom-center of column)
    // y axis: up. source at y = -1.5 (low). column rises along +y.
    const SOURCE = { x: 0, y: -1.5, z: 0 }

    function spawn(now: number) {
      // find a dead slot; if none, recycle the oldest (born first)
      let oldestIdx = 0
      let oldestBorn = Infinity
      for (let i = 0; i < ps.length; i++) {
        if (!ps[i].alive) { oldestIdx = i; oldestBorn = -1; break }
        if (ps[i].born < oldestBorn) { oldestBorn = ps[i].born; oldestIdx = i }
      }
      const p = ps[oldestIdx]
      // slight random initial spread in xy near the source (the "ember" radius)
      const r = (Math.random() ** 2) * 0.06
      const a = Math.random() * Math.PI * 2
      p.x = SOURCE.x + Math.cos(a) * r
      p.y = SOURCE.y
      p.z = SOURCE.z + Math.sin(a) * r
      // tiny lateral noise on initial velocity, stronger upward
      p.vx = (Math.random() - 0.5) * 0.005
      p.vy = 0.012 + Math.random() * 0.008
      p.vz = (Math.random() - 0.5) * 0.005
      p.born = now
      p.life = 2400 + Math.random() * 1700
      p.size = 0.7 + Math.random() * 1.3
      p.alive = true
    }

    // 3D curl-ish noise — cheap pseudo-curl by sampling smooth functions
    let noiseT = 0
    function curlNoiseAt(x: number, y: number, z: number): [number, number, number] {
      // not true curl, but a divergence-free-feeling vector field built from
      // sin/cos of position + time. cheap and visually plausible.
      const t = noiseT
      const fx =
        Math.sin(0.9 * y + 0.4 * t) * 0.012 +
        Math.cos(1.4 * y + 0.7 * z + t) * 0.006
      const fz =
        Math.cos(0.7 * y + 0.5 * t) * 0.012 +
        Math.sin(1.3 * y + 0.9 * x + t) * 0.006
      // upward bias decreases with height (smoke spreads as it rises)
      const fy = -Math.abs(Math.sin(0.6 * x + 0.4 * t + z)) * 0.003
      return [fx, fy, fz]
    }

    // pointer / camera
    let camRY = 0.4
    let camRX = 0.05
    let camDragRY = 0
    let camDragRX = 0
    let lastPx = 0, lastPy = 0
    let dragging = false
    let tapDownT = 0
    let tapMoved = false

    let gustT = 0          // ms timestamp of last tap-induced gust
    let gustVx = 0, gustVz = 0 // direction of the gust impulse

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
      camDragRX += -dy * 0.003
    })
    canvas.addEventListener('pointerup', (e) => {
      dragging = false
      const dt = performance.now() - tapDownT
      if (dt < 280 && !tapMoved) {
        // tap — wind gust. direction = vector from screen-center to tap.
        const p = getXY(e)
        const dx = p.x - W / 2
        const dy = p.y - H / 2
        const m = Math.hypot(dx, dy) || 1
        // express in world XZ (treating screen as a rough 3D plane projection)
        gustVx = (dx / m) * 0.04
        gustVz = (dy / m) * 0.04
        gustT = performance.now()
      }
    })
    canvas.addEventListener('pointerleave', () => { dragging = false })

    // audio
    let audioCtx: AudioContext | null = null
    let noiseSrc: AudioBufferSourceNode | null = null
    let lp: BiquadFilterNode | null = null
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
      lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 240
      lp.Q.value = 0.4
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0
      noiseSrc.connect(lp).connect(masterGain).connect(audioCtx.destination)
      noiseSrc.start()
      masterGain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 1.4)
    }

    // emission rate — keep adding smoke continuously
    let lastEmitT = 0
    const EMIT_INTERVAL = 28 // ms — ~36 spawns/sec at base
    let lastFrameT = performance.now()

    function loop() {
      const now = performance.now()
      const dt = Math.min(50, now - lastFrameT)
      lastFrameT = now

      // ease drag deltas into camera
      camRY += camDragRY
      camRX += camDragRX
      camDragRY = 0
      camDragRX = 0
      camRX = Math.max(-0.7, Math.min(0.6, camRX))

      // advance noise time
      noiseT += dt * 0.0007

      // emit
      if (now - lastEmitT > EMIT_INTERVAL) {
        const burst = 1 + Math.floor(Math.random() * 2)
        for (let k = 0; k < burst; k++) spawn(now)
        lastEmitT = now
      }

      // gust factor — exponential decay
      const gustAge = now - gustT
      const gustFactor = gustT ? Math.max(0, Math.exp(-gustAge / 600)) : 0

      // step particles
      let aliveCount = 0
      let densityAccum = 0
      for (const p of ps) {
        if (!p.alive) continue
        const age = now - p.born
        if (age > p.life) { p.alive = false; continue }

        // curl-ish field
        const [fx, fy, fz] = curlNoiseAt(p.x, p.y, p.z)
        // buoyancy — strong upward; weakens slightly with altitude so column
        // doesn't shoot off
        const altitude = p.y - SOURCE.y
        const buoy = 0.0005 * Math.max(0.4, 1 - altitude * 0.25)

        p.vx = p.vx * 0.984 + fx + gustVx * gustFactor * 0.04
        p.vy = p.vy * 0.985 + fy + buoy
        p.vz = p.vz * 0.984 + fz + gustVz * gustFactor * 0.04

        p.x += p.vx
        p.y += p.vy
        p.z += p.vz

        aliveCount++
        densityAccum += 1
      }
      // suppress unused warnings
      void densityAccum

      // background
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // perspective project
      const cy = Math.cos(camRY); const sy = Math.sin(camRY)
      const cx = Math.cos(camRX); const sx = Math.sin(camRX)
      const camD = 4
      const fov = Math.min(W, H) * 0.42
      const cxOff = W / 2
      const cyOff = H * 0.62 // shift the source toward the lower portion of the viewport

      type Proj = { sx: number; sy: number; depth: number; alpha: number; size: number; isLime: boolean }
      function project(x3: number, y3: number, z3: number, sz: number, isLime = false): Proj | null {
        const xr = cy * x3 + sy * z3
        const zr = -sy * x3 + cy * z3
        // y3 is "up" — invert sign in the rotation so positive y goes up on screen
        const yWorld = -y3
        const yr = cx * yWorld - sx * zr
        const zr2 = sx * yWorld + cx * zr
        const denom = (camD - zr2)
        if (denom <= 0.1) return null
        const sx2 = (xr / denom) * fov + cxOff
        const sy2 = (yr / denom) * fov + cyOff
        const alpha = Math.max(0.18, Math.min(1, (zr2 + 2) / 4))
        return { sx: sx2, sy: sy2, depth: zr2, alpha, size: sz, isLime }
      }

      // draw particles back-to-front
      const projected: Proj[] = []
      for (const p of ps) {
        if (!p.alive) continue
        const v = project(p.x, p.y, p.z, p.size, false)
        if (v) {
          // age fade
          const age = now - p.born
          const lifeFrac = age / p.life
          // gentle fade-in then long fade-out
          let envelope: number
          if (lifeFrac < 0.15) envelope = lifeFrac / 0.15
          else envelope = (1 - lifeFrac) * (1 - lifeFrac * 0.5)
          v.alpha *= envelope * 0.55
          projected.push(v)
        }
      }
      projected.sort((a, b) => a.depth - b.depth)

      for (const v of projected) {
        ctx!.fillStyle = `rgba(232, 232, 232, ${v.alpha.toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(v.sx, v.sy, v.size, 0, Math.PI * 2)
        ctx!.fill()
      }

      // ember at the source (lime, with halo)
      const pSrc = project(SOURCE.x, SOURCE.y, SOURCE.z, 1, true)
      if (pSrc) {
        ctx!.fillStyle = `rgba(198, 255, 60, ${(0.18 * pSrc.alpha).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(pSrc.sx, pSrc.sy, 14, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.fillStyle = `rgba(198, 255, 60, ${(0.7 + pSrc.alpha * 0.25).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(pSrc.sx, pSrc.sy, 4, 0, Math.PI * 2)
        ctx!.fill()
      }

      // small chrome — a thin cream "incense stick" line below the ember
      if (pSrc) {
        ctx!.strokeStyle = `rgba(180, 170, 150, ${(0.5 * pSrc.alpha).toFixed(3)})`
        ctx!.lineWidth = 1.5
        ctx!.beginPath()
        ctx!.moveTo(pSrc.sx, pSrc.sy + 4)
        ctx!.lineTo(pSrc.sx, pSrc.sy + 70)
        ctx!.stroke()
      }

      // audio — cutoff opens with alive count
      if (audioCtx && lp && masterGain) {
        const t = audioCtx.currentTime
        const norm = Math.min(1, aliveCount / (N_MAX * 0.55))
        lp.frequency.setTargetAtTime(180 + norm * 480, t, 0.3)
        masterGain.gain.setTargetAtTime(0.03 + norm * 0.05, t, 0.4)
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
          ENVIRONMENT · L57
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
            L57.
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
            smoke from a single point.
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
            DRAG · ORBIT &nbsp; TAP · WIND
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
