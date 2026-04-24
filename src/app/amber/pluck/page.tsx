'use client'

import { useEffect, useRef } from 'react'

// pluck — a row of 7 taut strings on a dark plate. drag across them and they
// ring. each string is a 1D transverse wave: 60 mass points with fixed ends
// (top, bottom), updated via discrete wave equation + damping. plucking
// displaces the nearest point to where you crossed it — the disturbance
// propagates as a travelling wave, reflects at the ends, and slowly damps.
// audio: each string has a fundamental pitch (C pentatonic across 7 strings);
// on pluck, a decaying sine plays at that pitch, gain scaled by pluck energy.
// lime flash at the pluck point. no goal. no score. just a thing that rings.

const FIELD = '#1A110A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'
const STRING_DIM = '#8A8270'

const NUM_STRINGS = 7
const POINTS_PER_STRING = 60
const WAVE_C2 = 0.45 // wave speed^2 (in grid units)
const DAMPING = 0.9985 // per-step amplitude damping
const PLUCK_AMP_PX = 18 // max initial horizontal displacement on pluck

// pentatonic C major — C4, D4, E4, G4, A4, C5, D5
const PITCHES_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33]

export default function PluckPage() {
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

    // string state: Float32Array of displacements (current and previous)
    // string k, point i → index k * POINTS_PER_STRING + i
    const x = new Float32Array(NUM_STRINGS * POINTS_PER_STRING)
    const xPrev = new Float32Array(NUM_STRINGS * POINTS_PER_STRING)
    const xNext = new Float32Array(NUM_STRINGS * POINTS_PER_STRING)

    // pluck markers — one fading ring per recent pluck
    const flashes: { sx: number; sy: number; t: number }[] = []

    // pointer state
    let pointerActive = false
    let pointerX = 0
    let pointerY = 0
    let prevPointerX = 0
    let prevPointerY = 0
    let prevHadPointer = false

    function stringX(k: number) {
      // inset from edges so strings don't hug the viewport
      const margin = Math.min(60, W * 0.08)
      return margin + ((W - margin * 2) * k) / (NUM_STRINGS - 1)
    }
    function stringTopY() { return Math.max(60, H * 0.08) }
    function stringBotY() { return Math.min(H - 60, H - H * 0.08) }

    function pointYForIdx(i: number) {
      const top = stringTopY()
      const bot = stringBotY()
      return top + ((bot - top) * i) / (POINTS_PER_STRING - 1)
    }

    // audio
    let audioCtx: AudioContext | null = null
    function ensureAudio() {
      if (audioCtx) return audioCtx
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return null }
      return audioCtx
    }

    function playPluck(k: number, intensity: number) {
      const a = ensureAudio()
      if (!a) return
      const t = a.currentTime
      // sine with slight triangle-ish body via a sine + lower octave
      const osc1 = a.createOscillator()
      osc1.type = 'sine'
      osc1.frequency.value = PITCHES_HZ[k]
      const osc2 = a.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = PITCHES_HZ[k] * 2
      const mix = a.createGain()
      mix.gain.value = 0.0
      const sub = a.createGain()
      sub.gain.value = 0.3
      osc1.connect(mix)
      osc2.connect(sub).connect(mix)
      mix.connect(a.destination)
      const peak = Math.min(0.22, 0.06 + intensity * 0.18)
      mix.gain.setValueAtTime(0, t)
      mix.gain.linearRampToValueAtTime(peak, t + 0.008)
      mix.gain.exponentialRampToValueAtTime(0.001, t + 1.6)
      osc1.start(t); osc2.start(t)
      osc1.stop(t + 1.7); osc2.stop(t + 1.7)
    }

    function pluck(k: number, i: number, amp: number) {
      // ensure i is interior (not endpoint)
      if (i <= 0 || i >= POINTS_PER_STRING - 1) return
      // write a smooth bump centered at i — gaussian of half-width 3
      const base = k * POINTS_PER_STRING
      const half = 3
      for (let j = -half; j <= half; j++) {
        const idx = i + j
        if (idx <= 0 || idx >= POINTS_PER_STRING - 1) continue
        const w = Math.exp(-(j * j) / 3)
        x[base + idx] = amp * w
        xPrev[base + idx] = amp * w * 0.5
      }
      const sx = stringX(k)
      const sy = pointYForIdx(i)
      flashes.push({ sx, sy, t: performance.now() })
      playPluck(k, Math.min(1, Math.abs(amp) / PLUCK_AMP_PX))
    }

    function maybePluckOnMotion() {
      if (!pointerActive || !prevHadPointer) return
      // detect which strings the segment (prev → current) crosses
      for (let k = 0; k < NUM_STRINGS; k++) {
        const sx = stringX(k)
        const a = prevPointerX - sx
        const b = pointerX - sx
        // sign change means the segment crosses this vertical line
        if (a === 0 || b === 0 || a * b < 0) {
          // compute y at crossing via linear interpolation
          let t = 0.5
          if (a - b !== 0) t = a / (a - b) // fraction along prev→curr where x crosses sx
          const y = prevPointerY + (pointerY - prevPointerY) * t
          // map y to point index on the string
          const top = stringTopY()
          const bot = stringBotY()
          if (y < top || y > bot) continue
          const frac = (y - top) / (bot - top)
          const idx = Math.max(1, Math.min(POINTS_PER_STRING - 2, Math.round(frac * (POINTS_PER_STRING - 1))))
          const speed = Math.hypot(pointerX - prevPointerX, pointerY - prevPointerY)
          const amp = Math.min(PLUCK_AMP_PX, 4 + speed * 0.35) * (b > 0 ? 1 : -1)
          pluck(k, idx, amp)
        }
      }
    }

    function xy(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = xy(e)
      pointerX = p.x; pointerY = p.y
      prevPointerX = p.x; prevPointerY = p.y
      pointerActive = true
      prevHadPointer = false
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!pointerActive) return
      prevPointerX = pointerX; prevPointerY = pointerY
      const p = xy(e)
      pointerX = p.x; pointerY = p.y
      maybePluckOnMotion()
      prevHadPointer = true
    })
    canvas.addEventListener('pointerup', () => {
      pointerActive = false
      prevHadPointer = false
    })
    canvas.addEventListener('pointerleave', () => {
      pointerActive = false
      prevHadPointer = false
    })

    function step() {
      // update each string with discrete wave equation
      for (let k = 0; k < NUM_STRINGS; k++) {
        const base = k * POINTS_PER_STRING
        // endpoints stay 0
        xNext[base] = 0
        xNext[base + POINTS_PER_STRING - 1] = 0
        for (let i = 1; i < POINTS_PER_STRING - 1; i++) {
          const idx = base + i
          // discrete wave: x_next = 2x_curr - x_prev + c2 * (x_{i-1} + x_{i+1} - 2x_i)
          xNext[idx] =
            2 * x[idx] -
            xPrev[idx] +
            WAVE_C2 * (x[idx - 1] + x[idx + 1] - 2 * x[idx])
          // damping
          xNext[idx] *= DAMPING
        }
      }
      // rotate buffers
      for (let i = 0; i < x.length; i++) {
        xPrev[i] = x[i]
        x[i] = xNext[i]
      }
    }

    function drawStrings() {
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)

      const top = stringTopY()
      const bot = stringBotY()

      // draw each string as a curve through its displaced points
      for (let k = 0; k < NUM_STRINGS; k++) {
        const sx = stringX(k)
        const base = k * POINTS_PER_STRING
        // opacity by total energy so moving strings pop
        let energy = 0
        for (let i = 1; i < POINTS_PER_STRING - 1; i++) {
          energy += Math.abs(x[base + i])
        }
        energy /= POINTS_PER_STRING
        const alpha = Math.min(1, 0.55 + Math.min(0.4, energy * 0.14))

        // anchor caps
        ctx!.fillStyle = STRING_DIM
        ctx!.fillRect(sx - 4, top - 4, 8, 4)
        ctx!.fillRect(sx - 4, bot, 8, 4)

        ctx!.strokeStyle = `rgba(232, 232, 232, ${alpha.toFixed(3)})`
        ctx!.lineWidth = 2
        ctx!.lineCap = 'round'
        ctx!.beginPath()
        for (let i = 0; i < POINTS_PER_STRING; i++) {
          const y = top + ((bot - top) * i) / (POINTS_PER_STRING - 1)
          const px = sx + x[base + i]
          if (i === 0) ctx!.moveTo(px, y)
          else ctx!.lineTo(px, y)
        }
        ctx!.stroke()
      }

      // draw flashes (lime rings at pluck points)
      const now = performance.now()
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]
        const age = now - f.t
        if (age > 620) { flashes.splice(i, 1); continue }
        const t = age / 620
        const r = 4 + t * 36
        const alpha = 1 - t
        ctx!.strokeStyle = `rgba(198, 255, 60, ${alpha.toFixed(3)})`
        ctx!.lineWidth = 2
        ctx!.beginPath()
        ctx!.arc(f.sx, f.sy, r, 0, Math.PI * 2)
        ctx!.stroke()
      }
    }

    function loop() {
      // more than one physics step per frame for stability / ringing
      for (let s = 0; s < 2; s++) step()
      drawStrings()
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
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          PLUCK · TOY · 003
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
            pluck.
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
            drag across.
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
