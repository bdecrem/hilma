'use client'

import { useEffect, useRef } from 'react'

// L54 — lensing
// A field of ~500 cream stars on a NIGHT plate. An invisible point mass
// lives at the cursor (idling gently near center when the pointer is away).
// Each star's displayed position is its true position plus a lensing
// displacement aimed AT the mass, magnitude = strength / distance (classic
// 1/r formula for weak lensing). Near the mass the field distorts heavily;
// far away it barely moves. Hold to increase mass (stars whip inward),
// release and the lens eases back. Ambient sine drone whose pitch and gain
// track the total displacement energy — a hum that rises with the warp.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const N_STARS = 520

type Star = {
  x: number // true position
  y: number
  r: number // star radius
  z: number // parallax factor 0..1, smaller = further
}

export default function L54Page() {
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

    // seed stars uniformly across a generous overscan region so motion into
    // the lens doesn't reveal empty corners. Use deterministic seed for stability.
    let seed = 20260424
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)
    const stars: Star[] = []
    function seedStars() {
      stars.length = 0
      for (let i = 0; i < N_STARS; i++) {
        const z = 0.25 + rand() * 0.75 // 0.25..1
        stars.push({
          x: -W * 0.1 + rand() * W * 1.2,
          y: -H * 0.1 + rand() * H * 1.2,
          r: 0.5 + z * 1.6 + rand() * 0.6,
          z,
        })
      }
    }
    seedStars()
    // re-seed stars on resize so density stays even
    const onResize = () => { resize(); seedStars() }
    window.removeEventListener('resize', resize)
    window.addEventListener('resize', onResize)

    // lens state — position + strength
    const lens = {
      x: W / 2, y: H / 2, // current
      tx: W / 2, ty: H / 2, // target
      strength: 1800, // px*px per unit r, softened
      targetStrength: 1800,
      down: false,
    }

    // pointer
    let hasPointer = false
    let idleT = 0

    function xy(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    canvas.addEventListener('pointerdown', (e) => {
      const p = xy(e)
      lens.tx = p.x; lens.ty = p.y
      hasPointer = true
      lens.down = true
      lens.targetStrength = 4800 // heavy press — whips stars in
      ensureAudio()
    })
    canvas.addEventListener('pointermove', (e) => {
      const p = xy(e)
      lens.tx = p.x; lens.ty = p.y
      hasPointer = true
    })
    canvas.addEventListener('pointerup', () => {
      lens.down = false
      lens.targetStrength = 1800
    })
    canvas.addEventListener('pointerleave', () => {
      hasPointer = false
      lens.down = false
      lens.targetStrength = 1800
    })

    // audio — sine drone, pitch + gain from displacement energy
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
      osc.frequency.value = 70
      gain = audioCtx.createGain()
      gain.gain.value = 0
      osc.connect(gain).connect(audioCtx.destination)
      osc.start()
    }

    function loop() {
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      // lens ease
      if (!hasPointer) {
        // idle: drift the target in a slow Lissajous around center so the
        // stars gently breathe
        idleT += 0.0035
        const r = Math.min(W, H) * 0.12
        lens.tx = W / 2 + Math.cos(idleT) * r
        lens.ty = H / 2 + Math.sin(idleT * 1.3) * r * 0.7
      }
      lens.x += (lens.tx - lens.x) * 0.18
      lens.y += (lens.ty - lens.y) * 0.18
      lens.strength += (lens.targetStrength - lens.strength) * 0.08

      let energy = 0
      // draw each star at displaced position
      for (const s of stars) {
        const dx = lens.x - s.x
        const dy = lens.y - s.y
        const d2 = dx * dx + dy * dy
        // softened 1/r with minimum radius to prevent singularity
        const inv = 1 / Math.sqrt(d2 + 400)
        const mag = lens.strength * inv * inv // stronger than 1/r — looks like lensing
        const disX = dx * mag * 0.08 * s.z
        const disY = dy * mag * 0.08 * s.z

        const px = s.x + disX
        const py = s.y + disY

        const e = Math.abs(disX) + Math.abs(disY)
        energy += e

        // color ramps to lime as displacement grows (stars "heating up")
        let fill = `rgba(232, 232, 232, ${(0.4 + s.z * 0.55).toFixed(3)})`
        if (e > 6) {
          const t = Math.min(1, (e - 6) / 25)
          // interpolate cream -> lime
          const r = Math.round(232 + (198 - 232) * t)
          const g = Math.round(232 + (255 - 232) * t)
          const b = Math.round(232 + (60 - 232) * t)
          const a = (0.5 + s.z * 0.5).toFixed(3)
          fill = `rgba(${r}, ${g}, ${b}, ${a})`
        }

        ctx!.fillStyle = fill
        ctx!.beginPath()
        ctx!.arc(px, py, s.r, 0, Math.PI * 2)
        ctx!.fill()
      }

      // lime dot marks lens position (the invisible mass gets a marker)
      ctx!.fillStyle = LIME
      ctx!.beginPath()
      ctx!.arc(lens.x, lens.y, 3.5, 0, Math.PI * 2)
      ctx!.fill()

      // hum — pitch and gain track normalized energy
      if (audioCtx && osc && gain) {
        const norm = Math.min(1, energy / (N_STARS * 2.0))
        const targetFreq = 60 + norm * 140 // 60..200 Hz
        const targetGain = 0.02 + norm * 0.08
        const t = audioCtx.currentTime
        osc.frequency.setTargetAtTime(targetFreq, t, 0.1)
        gain.gain.setTargetAtTime(targetGain, t, 0.15)
      }

      requestAnimationFrame(loop)
    }
    loop()

    return () => {
      window.removeEventListener('resize', onResize)
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
            cursor: 'crosshair',
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
          ENVIRONMENT · L54
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
            L54.
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
            light bent by what cannot be seen.
          </div>
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.22em',
              marginTop: 12,
              opacity: 0.4,
            }}
          >
            MOVE THE MASS · PRESS TO MAKE IT HEAVIER
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
