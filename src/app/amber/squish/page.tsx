'use client'

import { useEffect, useRef } from 'react'

// squish — a soft-body blob you can poke, pinch, pull, squeeze.
// Verlet integration on a ring of ~28 nodes with:
//  - perimeter spring edges (keep neighbors at rest spacing)
//  - radial spring edges to a central point (restore shape)
//  - constant outward pressure (keeps it "inflated")
//  - cursor force field (push outward when near, grab-and-pull on press)
// Rendered as a smooth filled blob via Catmull–Rom → bezier interpolation
// through the ring. Lime signal dot tracks the centroid. No goal, no reveal.

const FIELD = '#1A110A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'
const BODY_FILL = '#EFEAD8'
const BODY_DIM = '#B8B09E'

type Node = { x: number; y: number; px: number; py: number }

export default function SquishPage() {
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

    const N = 28
    let blob: Node[] = []
    let restRadius = Math.min(W, H) * 0.18
    let center = { x: W / 2, y: H / 2 }

    function seedBlob() {
      blob = []
      center = { x: W / 2, y: H / 2 }
      restRadius = Math.min(W, H) * 0.18
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        const x = center.x + Math.cos(a) * restRadius
        const y = center.y + Math.sin(a) * restRadius
        blob.push({ x, y, px: x, py: y })
      }
    }
    seedBlob()

    // pointer state
    const pointer = { x: W / 2, y: H / 2, active: false, down: false, grabIdx: -1 }

    function xy(e: PointerEvent): { x: number; y: number } {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function nearestNode(x: number, y: number): number {
      let best = 0
      let bd = Infinity
      for (let i = 0; i < N; i++) {
        const dx = blob[i].x - x
        const dy = blob[i].y - y
        const d = dx * dx + dy * dy
        if (d < bd) { bd = d; best = i }
      }
      return best
    }

    canvas.addEventListener('pointerdown', (e) => {
      const p = xy(e)
      pointer.x = p.x; pointer.y = p.y
      pointer.active = true; pointer.down = true
      pointer.grabIdx = nearestNode(p.x, p.y)
    })
    canvas.addEventListener('pointermove', (e) => {
      const p = xy(e)
      pointer.x = p.x; pointer.y = p.y
      pointer.active = true
    })
    canvas.addEventListener('pointerup', () => {
      pointer.down = false
      pointer.grabIdx = -1
    })
    canvas.addEventListener('pointerleave', () => {
      pointer.active = false
      pointer.down = false
      pointer.grabIdx = -1
    })

    // audio — soft boing when large deformation happens
    let audioCtx: AudioContext | null = null
    let lastBoing = 0
    function boing(intensity: number) {
      const now = performance.now()
      if (now - lastBoing < 90) return
      lastBoing = now
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        }
        const t = audioCtx.currentTime
        const osc = audioCtx.createOscillator()
        const g = audioCtx.createGain()
        osc.type = 'sine'
        const base = 180 + Math.random() * 40
        osc.frequency.setValueAtTime(base * 1.4, t)
        osc.frequency.exponentialRampToValueAtTime(base, t + 0.22)
        osc.connect(g).connect(audioCtx.destination)
        const vol = Math.min(0.08, 0.015 + intensity * 0.06)
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(vol, t + 0.005)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
        osc.start(t)
        osc.stop(t + 0.35)
      } catch {}
    }

    let lastEnergy = 0

    function step() {
      // verlet integrate
      const damping = 0.92
      for (const n of blob) {
        const vx = (n.x - n.px) * damping
        const vy = (n.y - n.py) * damping
        n.px = n.x
        n.py = n.y
        n.x += vx
        n.y += vy
      }

      // recompute center as centroid
      let cx = 0, cy = 0
      for (const n of blob) { cx += n.x; cy += n.y }
      cx /= N; cy /= N
      // ease center back toward viewport center (so blob doesn't drift off)
      center.x = cx + (W / 2 - cx) * 0.02
      center.y = cy + (H / 2 - cy) * 0.02

      // constraints — run multiple iterations for stability
      const iters = 4
      for (let it = 0; it < iters; it++) {
        // perimeter springs — neighbor distance
        const rest = (2 * Math.PI * restRadius) / N
        for (let i = 0; i < N; i++) {
          const a = blob[i]
          const b = blob[(i + 1) % N]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.0001
          const diff = (d - rest) / d
          const kx = dx * diff * 0.5
          const ky = dy * diff * 0.5
          a.x += kx; a.y += ky
          b.x -= kx; b.y -= ky
        }
        // radial springs to centroid — keeps shape
        for (const n of blob) {
          const dx = n.x - center.x
          const dy = n.y - center.y
          const d = Math.hypot(dx, dy) || 0.0001
          const diff = (d - restRadius) / d
          n.x -= dx * diff * 0.06
          n.y -= dy * diff * 0.06
        }
        // pressure — gently push all nodes outward from centroid (inflation)
        for (const n of blob) {
          const dx = n.x - center.x
          const dy = n.y - center.y
          const d = Math.hypot(dx, dy) || 0.0001
          n.x += (dx / d) * 0.12
          n.y += (dy / d) * 0.12
        }
      }

      // cursor force
      if (pointer.active) {
        if (pointer.down && pointer.grabIdx >= 0) {
          // hard-grab the grabbed node toward the pointer
          const g = blob[pointer.grabIdx]
          g.x += (pointer.x - g.x) * 0.4
          g.y += (pointer.y - g.y) * 0.4
          // mild pull on neighbors, softer
          for (let off = 1; off <= 2; off++) {
            for (const k of [(pointer.grabIdx + off + N) % N, (pointer.grabIdx - off + N) % N]) {
              const n = blob[k]
              const f = 0.12 / off
              n.x += (pointer.x - n.x) * f
              n.y += (pointer.y - n.y) * f
            }
          }
        } else {
          // gentle radial push away from pointer when hovering (no press)
          for (const n of blob) {
            const dx = n.x - pointer.x
            const dy = n.y - pointer.y
            const d = Math.hypot(dx, dy) || 0.0001
            if (d < 90) {
              const f = (90 - d) * 0.012
              n.x += (dx / d) * f
              n.y += (dy / d) * f
            }
          }
        }
      }

      // approximate energy (deformation) for audio
      let energy = 0
      for (const n of blob) {
        const dx = n.x - center.x
        const dy = n.y - center.y
        const d = Math.hypot(dx, dy)
        energy += Math.abs(d - restRadius)
      }
      energy /= N
      if (energy - lastEnergy > 3 && pointer.down) {
        boing(Math.min(1, energy / 30))
      }
      lastEnergy = energy
    }

    // draw the blob as a smooth closed bezier through ring
    function drawBlob() {
      // body fill — soft radial gradient so it reads as 3d
      const grad = ctx!.createRadialGradient(
        center.x - restRadius * 0.3,
        center.y - restRadius * 0.3,
        restRadius * 0.2,
        center.x,
        center.y,
        restRadius * 1.3,
      )
      grad.addColorStop(0, BODY_FILL)
      grad.addColorStop(1, BODY_DIM)
      ctx!.fillStyle = grad

      ctx!.beginPath()
      // Catmull–Rom through the N ring nodes with tension 0.5 → convert to cubic bezier
      for (let i = 0; i < N; i++) {
        const p0 = blob[(i - 1 + N) % N]
        const p1 = blob[i]
        const p2 = blob[(i + 1) % N]
        const p3 = blob[(i + 2) % N]
        if (i === 0) {
          // first move
          const startX = (p1.x + p2.x) / 2
          const startY = (p1.y + p2.y) / 2
          ctx!.moveTo(startX, startY)
        }
        // midpoint of p1-p2
        const endX = (p1.x + p2.x) / 2
        const endY = (p1.y + p2.y) / 2
        // quadratic with p1 as control from midpoint of p0-p1 to midpoint of p1-p2
        const startX = (p0.x + p1.x) / 2
        const startY = (p0.y + p1.y) / 2
        void startX; void startY
        // use next node as control
        ctx!.quadraticCurveTo(p2.x, p2.y, endX, endY)
      }
      ctx!.closePath()
      ctx!.fill()

      // subtle rim — thin cream stroke outside
      ctx!.strokeStyle = 'rgba(232, 232, 232, 0.18)'
      ctx!.lineWidth = 1
      ctx!.stroke()

      // lime dot at centroid — the signal
      ctx!.fillStyle = LIME
      ctx!.beginPath()
      ctx!.arc(center.x, center.y, 4, 0, Math.PI * 2)
      ctx!.fill()
    }

    function loop() {
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)
      step()
      drawBlob()
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
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          SQUISH · TOY · 002
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
            squish.
          </div>
          <div
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 16,
              marginTop: 4,
              opacity: 0.7,
            }}
          >
            press it. press it again.
          </div>
        </div>

        {/* a. lower-right */}
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
