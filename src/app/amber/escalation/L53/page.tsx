'use client'

import { useEffect, useRef, useState } from 'react'

// L53 — tesseract
// A 4D hypercube. 16 vertices at the corners of a unit hypercube, 32 edges
// connecting vertices that differ in exactly one coordinate. Rotated in a 4D
// plane, projected from 4D → 3D via perspective division on W, then from 3D → 2D
// via standard perspective. Three 4D rotation modes (XW/YW/ZW) — tap to cycle.
// Drag to rotate the 3D camera. Vertices pulse with their w-coordinate; depth
// fog on edges. Stereo audio: four sine tones at pentatonic pitches, panned
// by projected x-position of four "cell anchor" vertices.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

// 16 4D vertices at corners of [-1,1]^4
function buildVerts(): number[][] {
  const v: number[][] = []
  for (let i = 0; i < 16; i++) {
    v.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ])
  }
  return v
}

// 32 edges — pairs that differ in exactly one bit
function buildEdges(): [number, number][] {
  const e: [number, number][] = []
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      const x = i ^ j
      // popcount === 1
      if (x && (x & (x - 1)) === 0) e.push([i, j])
    }
  }
  return e
}

// 4D rotation in plane (a, b) — mixes the a-th and b-th coordinates.
function rot4(p: number[], a: number, b: number, theta: number): number[] {
  const q = p.slice()
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const va = p[a]
  const vb = p[b]
  q[a] = c * va - s * vb
  q[b] = s * va + c * vb
  return q
}

// 3D rotation around Y then X
function rot3(p: number[], rx: number, ry: number): number[] {
  let [x, y, z] = p
  // rotate Y
  let cy = Math.cos(ry), sy = Math.sin(ry)
  let nx = cy * x + sy * z
  let nz = -sy * x + cy * z
  x = nx; z = nz
  // rotate X
  let cx = Math.cos(rx), sx = Math.sin(rx)
  let ny = cx * y - sx * z
  nz = sx * y + cx * z
  y = ny; z = nz
  return [x, y, z]
}

const PLANES: [number, number, string][] = [
  [0, 3, 'XW'], // x ↔ w
  [1, 3, 'YW'], // y ↔ w
  [2, 3, 'ZW'], // z ↔ w
]

export default function L53Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [planeName, setPlaneName] = useState('XW')

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

    const verts = buildVerts()
    const edges = buildEdges()

    // 4D rotation state — auto-drives in current plane
    let theta4 = 0
    let planeIdx = 0
    // Always-on slow tumble in XY 4D plane so the figure never feels frozen
    let phi4 = 0

    // 3D camera
    let camRX = 0.35
    let camRY = 0.6
    let dragRX = 0
    let dragRY = 0
    let lastPx = 0
    let lastPy = 0
    let dragging = false

    // Audio: 4 oscillators panned by projected x of 4 chosen vertices
    let audioCtx: AudioContext | null = null
    type Voice = { osc: OscillatorNode; pan: StereoPannerNode; gain: GainNode }
    const voices: Voice[] = []
    const VOICE_VERTS = [0, 5, 10, 15] // diverse 4D positions
    const PITCH_HZ = [196.0, 261.6, 329.6, 392.0] // pentatonic-ish G3 C4 E4 G4

    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch {
        return
      }
      const master = audioCtx.createGain()
      master.gain.value = 0.0
      master.connect(audioCtx.destination)
      // gentle fade-in
      master.gain.linearRampToValueAtTime(0.045, audioCtx.currentTime + 4)

      for (let i = 0; i < 4; i++) {
        const osc = audioCtx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = PITCH_HZ[i]
        const pan = audioCtx.createStereoPanner()
        const g = audioCtx.createGain()
        g.gain.value = 0.7
        osc.connect(g).connect(pan).connect(master)
        osc.start()
        voices.push({ osc, pan, gain: g })
      }
    }

    function getXY(e: PointerEvent | MouseEvent | Touch) {
      const r = canvas!.getBoundingClientRect()
      return { x: (e as MouseEvent).clientX - r.left, y: (e as MouseEvent).clientY - r.top }
    }

    function onDown(e: PointerEvent) {
      ensureAudio()
      const p = getXY(e)
      lastPx = p.x; lastPy = p.y
      dragging = true
    }

    let tapStart = 0
    let tapMoved = false
    canvas.addEventListener('pointerdown', (e) => {
      tapStart = performance.now()
      tapMoved = false
      onDown(e)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const p = getXY(e)
      const dx = p.x - lastPx
      const dy = p.y - lastPy
      lastPx = p.x; lastPy = p.y
      if (Math.abs(dx) + Math.abs(dy) > 3) tapMoved = true
      dragRY += dx * 0.01
      dragRX -= dy * 0.01
    })
    canvas.addEventListener('pointerup', (e) => {
      dragging = false
      const dt = performance.now() - tapStart
      if (dt < 280 && !tapMoved) {
        // tap — cycle plane
        planeIdx = (planeIdx + 1) % PLANES.length
        setPlaneName(PLANES[planeIdx][2])
      }
    })
    canvas.addEventListener('pointerleave', () => { dragging = false })

    function loop() {
      const now = performance.now()
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      theta4 += 0.0085
      phi4 += 0.0023

      // ease drag into camera
      camRX += dragRX
      camRY += dragRY
      dragRX *= 0.0
      dragRY *= 0.0

      const [a4, b4] = PLANES[planeIdx]

      // transform all vertices
      const projected: { x: number; y: number; z: number; w: number; vx: number; vy: number; vz: number; vw: number }[] = []
      for (const v of verts) {
        // 4D: rotate in current plane (a4,b4), then a slow tumble in 0,1
        let p = rot4(v, a4, b4, theta4)
        p = rot4(p, 0, 1, phi4)

        // 4D → 3D perspective: divide by (D - w)
        const D = 3.5
        const k = 1 / (D - p[3])
        let v3 = [p[0] * k, p[1] * k, p[2] * k]

        // Scale up
        v3 = [v3[0] * 1.6, v3[1] * 1.6, v3[2] * 1.6]

        // 3D camera rotation
        const cam = rot3(v3, camRX, camRY)

        // 3D → 2D perspective
        const fov = Math.min(W, H) * 0.42
        const camD = 4
        const denom = (camD - cam[2])
        const sx = (cam[0] / denom) * fov + W / 2
        const sy = (cam[1] / denom) * fov + H / 2
        const depth = cam[2]

        projected.push({ x: sx, y: sy, z: depth, w: p[3], vx: v3[0], vy: v3[1], vz: v3[2], vw: p[3] })
      }

      // Draw edges back-to-front by midpoint depth
      const order = edges.map((e, i) => ({ i, mid: (projected[e[0]].z + projected[e[1]].z) * 0.5 }))
      order.sort((a, b) => a.mid - b.mid)

      for (const o of order) {
        const [ai, bi] = edges[o.i]
        const A = projected[ai]
        const B = projected[bi]

        // alpha by midpoint w (closer in 4D = brighter), then by midpoint z
        const wMid = (A.w + B.w) * 0.5
        const wAlpha = 0.35 + 0.55 * (wMid + 1) / 2  // map [-1,1] to [0.35, 0.9]
        const zMid = (A.z + B.z) * 0.5
        const zAlpha = Math.max(0.15, Math.min(1, (zMid + 2) / 4)) // depth fog
        const alpha = wAlpha * zAlpha

        ctx!.strokeStyle = `rgba(232, 232, 232, ${alpha.toFixed(3)})`
        ctx!.lineWidth = 1 + 1.6 * (zMid + 2) / 4
        ctx!.beginPath()
        ctx!.moveTo(A.x, A.y)
        ctx!.lineTo(B.x, B.y)
        ctx!.stroke()
      }

      // Draw vertices on top
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i]
        const wt = (p.w + 1) / 2 // 0..1
        const r = 1.5 + wt * 3.5
        // lime tint for vertices with w > 0 (the "outer cell")
        if (p.w > 0.3) {
          ctx!.fillStyle = `rgba(198, 255, 60, ${0.35 + wt * 0.55})`
        } else {
          ctx!.fillStyle = `rgba(232, 232, 232, ${0.45 + wt * 0.45})`
        }
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx!.fill()
      }

      // Audio update — pan voices by projected x of their anchor vertices
      if (audioCtx) {
        for (let i = 0; i < voices.length; i++) {
          const vi = VOICE_VERTS[i]
          const proj = projected[vi]
          // pan by horizontal position relative to center
          const pan = Math.max(-1, Math.min(1, (proj.x - W / 2) / (W / 2)))
          // gain by depth (front louder, back softer)
          const depthFactor = 0.4 + 0.6 * Math.max(0, Math.min(1, (proj.z + 2) / 4))
          // small pitch breath tied to w
          const detune = proj.w * 14
          try {
            voices[i].pan.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.05)
            voices[i].gain.gain.setTargetAtTime(0.55 * depthFactor, audioCtx.currentTime, 0.1)
            voices[i].osc.detune.setTargetAtTime(detune, audioCtx.currentTime, 0.1)
          } catch {}
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
            cursor: 'grab',
          }}
        />

        {/* chrome upper-right */}
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
            opacity: 0.6,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          ENVIRONMENT · L53
          <div style={{ marginTop: 6, opacity: 0.7 }}>
            ROT · <span style={{ color: LIME }}>{planeName}</span>
          </div>
        </div>

        {/* caption lower-left */}
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
            L53.
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
            a cube above cubes.
          </div>
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.22em',
              marginTop: 12,
              opacity: 0.45,
            }}
          >
            DRAG TO TURN · TAP TO CHANGE PLANE
          </div>
        </div>

        {/* a. mark lower-right */}
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
