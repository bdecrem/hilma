'use client'

import { useEffect, useRef } from 'react'

// tube — a vacuum tube. hold the pointer down (anywhere on the canvas) to
// apply current. the heater filament inside the glass envelope warms and
// glows SODIUM orange, the glass picks up a warm halo, and a soft 80Hz
// mains hum (with two harmonics) builds in. release: glow dims, hum fades.
//
// No mark-making, no particle clusters, no FLARE. Vintage industrial.
// SODIUM accent (warm orange #FF7A1A) — the heat color. Drag mechanic =
// hold-to-power; release-to-power-down. Different from slinky's mechanical
// wave / cradle's pendulum impact / spray's particle cluster.

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const SODIUM = '#FF7A1A'

export default function TubePage() {
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

    let down = false
    let current = 0 // 0..1, smoothed
    let downX = 0,
      downY = 0,
      downT = 0,
      moved = false

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      const p = pos(e)
      down = true
      moved = false
      downX = p.x
      downY = p.y
      downT = performance.now()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = pos(e)
      if (Math.abs(p.x - downX) > 4 || Math.abs(p.y - downY) > 4) moved = true
    }
    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // audio — 80Hz mains hum with 2 harmonics + faint pink-ish noise
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let noiseGain: GainNode | null = null

    const ensureAudio = () => {
      if (audioCtx) return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0
      masterGain.connect(audioCtx.destination)

      // hum: 80 + 160 + 240 Hz with decreasing amplitudes
      const tones = [
        { f: 80, g: 0.6 },
        { f: 160, g: 0.32 },
        { f: 240, g: 0.18 },
      ]
      for (const { f, g } of tones) {
        const o = audioCtx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const gn = audioCtx.createGain()
        gn.gain.value = g
        o.connect(gn)
        gn.connect(masterGain)
        o.start()
      }

      // filament thermal noise — very quiet pink-ish noise, lowpassed
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate)
      const ch = buf.getChannelData(0)
      let b0 = 0,
        b1 = 0,
        b2 = 0
      for (let i = 0; i < ch.length; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        ch[i] = (b0 + b1 + b2 + w * 0.1848) * 0.05
      }
      const src = audioCtx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1400
      noiseGain = audioCtx.createGain()
      noiseGain.gain.value = 0
      src.connect(lp)
      lp.connect(noiseGain)
      noiseGain.connect(masterGain)
      src.start()
    }

    let lastT = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(40, now - lastT) / 1000
      lastT = now

      // current ramps up while held, down when released
      const targetCurrent = down ? 1 : 0
      const rate = down ? 1.4 : 0.7 // s⁻¹ — power-up faster than power-down? actually slower power-up is more satisfying
      // approach target with first-order lag: c += (target - c) * (1 - exp(-dt*rate))
      const alpha = 1 - Math.exp(-dt * (down ? 1.5 : 1.0))
      current += (targetCurrent - current) * alpha

      // audio gain follows current with tiny delay
      if (audioCtx && masterGain && noiseGain) {
        masterGain.gain.setTargetAtTime(current * 0.12, audioCtx.currentTime, 0.05)
        // noise (filament thermal) ramps in slightly after the hum
        noiseGain.gain.setTargetAtTime(Math.max(0, current - 0.2) * 0.5, audioCtx.currentTime, 0.08)
      }

      // ─── render ───
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2
      const cy = H * 0.5
      // tube proportions — tall ovular envelope on a base
      const tubeH = Math.min(H * 0.62, 480)
      const tubeW = tubeH * 0.36
      const baseH = tubeH * 0.18
      const envTop = cy - tubeH / 2
      const envBottom = cy + tubeH / 2 - baseH
      const envH = envBottom - envTop

      // outside halo when powered (warm orange, big and soft)
      if (current > 0.02) {
        const haloR = tubeH * 0.85
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR)
        const haloAlpha = Math.min(0.55, current * 0.45)
        halo.addColorStop(0, `rgba(255, 122, 26, ${(haloAlpha * 0.35).toFixed(3)})`)
        halo.addColorStop(0.4, `rgba(255, 122, 26, ${(haloAlpha * 0.18).toFixed(3)})`)
        halo.addColorStop(1, `rgba(255, 122, 26, 0)`)
        ctx.fillStyle = halo
        ctx.fillRect(0, 0, W, H)
      }

      // glass envelope (oval) — drawn as a path approximating a tube shape
      // top hemisphere + cylindrical body + bottom curve
      ctx.save()
      ctx.translate(cx, 0)
      ctx.beginPath()
      ctx.moveTo(-tubeW / 2, envTop + tubeW * 0.4)
      ctx.quadraticCurveTo(-tubeW / 2, envTop, 0, envTop) // top-left curve
      ctx.quadraticCurveTo(tubeW / 2, envTop, tubeW / 2, envTop + tubeW * 0.4) // top-right curve
      ctx.lineTo(tubeW / 2, envBottom) // right side down
      ctx.lineTo(-tubeW / 2, envBottom) // bottom
      ctx.closePath()

      // interior glow (warm orange tint inside the glass when powered)
      if (current > 0.02) {
        const innerGrad = ctx.createRadialGradient(0, envTop + envH * 0.65, envH * 0.05, 0, envTop + envH * 0.65, envH * 0.55)
        innerGrad.addColorStop(0, `rgba(255, 122, 26, ${(current * 0.55).toFixed(3)})`)
        innerGrad.addColorStop(0.6, `rgba(255, 122, 26, ${(current * 0.22).toFixed(3)})`)
        innerGrad.addColorStop(1, `rgba(255, 122, 26, 0)`)
        ctx.fillStyle = innerGrad
        ctx.fill()
      }

      // glass outline — thin cream
      ctx.strokeStyle = `rgba(232, 232, 232, 0.55)`
      ctx.lineWidth = 1.2
      ctx.stroke()

      // glass highlight (subtle vertical reflection on the upper-left)
      ctx.strokeStyle = `rgba(232, 232, 232, 0.18)`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(-tubeW / 2 + 6, envTop + tubeW * 0.5)
      ctx.lineTo(-tubeW / 2 + 6, envTop + envH * 0.55)
      ctx.stroke()

      // internal: plate (rectangle box around the cathode/grid) — drawn as 4 cream lines
      const plateTop = envTop + envH * 0.32
      const plateBottom = envBottom - envH * 0.18
      const plateW = tubeW * 0.5
      ctx.strokeStyle = `rgba(232, 232, 232, 0.45)`
      ctx.lineWidth = 1
      ctx.strokeRect(-plateW / 2, plateTop, plateW, plateBottom - plateTop)

      // grid — wavy zigzag inside the plate
      ctx.strokeStyle = `rgba(232, 232, 232, 0.3)`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      const gridLeft = -plateW / 2 + 4
      const gridRight = plateW / 2 - 4
      const gridTop = plateTop + 4
      const gridBottom = plateBottom - 4
      const gridSteps = 16
      for (let i = 0; i <= gridSteps; i++) {
        const ty = gridTop + ((gridBottom - gridTop) * i) / gridSteps
        const tx = i % 2 === 0 ? gridLeft : gridRight
        if (i === 0) ctx.moveTo(tx, ty)
        else ctx.lineTo(tx, ty)
      }
      ctx.stroke()

      // cathode rod — vertical line at center
      ctx.strokeStyle = `rgba(232, 232, 232, 0.55)`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(0, plateTop + 3)
      ctx.lineTo(0, plateBottom - 3)
      ctx.stroke()

      // filament — U-shape near the bottom, warm orange when current > 0
      const filY = plateBottom - 18
      const filW = plateW * 0.35
      const filFlicker = current > 0.05 ? (0.85 + Math.random() * 0.15) : 1
      const filR = Math.floor(255 * filFlicker)
      const filG = Math.floor(122 * Math.min(1, current * 1.2) * filFlicker)
      const filB = Math.floor(26 * Math.min(1, current * 1.2) * filFlicker)
      ctx.strokeStyle =
        current > 0.05
          ? `rgba(${filR}, ${filG}, ${filB}, ${Math.min(1, current * 1.4).toFixed(3)})`
          : `rgba(232, 232, 232, 0.35)`
      ctx.lineWidth = current > 0.05 ? 2.2 : 1.4
      ctx.beginPath()
      ctx.moveTo(-filW / 2, plateBottom - 4)
      ctx.lineTo(-filW / 2, filY)
      ctx.quadraticCurveTo(0, filY + 8, filW / 2, filY)
      ctx.lineTo(filW / 2, plateBottom - 4)
      ctx.stroke()

      // bright glow disc behind the filament (additive feel)
      if (current > 0.05) {
        const glowR = filW * 0.9 * (0.85 + Math.random() * 0.15)
        const glow = ctx.createRadialGradient(0, filY + 4, 0, 0, filY + 4, glowR)
        glow.addColorStop(0, `rgba(255, 180, 80, ${(current * 0.7).toFixed(3)})`)
        glow.addColorStop(0.6, `rgba(255, 122, 26, ${(current * 0.25).toFixed(3)})`)
        glow.addColorStop(1, `rgba(255, 122, 26, 0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(0, filY + 4, glowR, 0, Math.PI * 2)
        ctx.fill()
      }

      // base socket — bakelite-y dark cylinder
      ctx.fillStyle = `rgba(40, 32, 28, 1)`
      ctx.fillRect(-tubeW / 2 - 4, envBottom, tubeW + 8, baseH)
      ctx.strokeStyle = `rgba(232, 232, 232, 0.4)`
      ctx.lineWidth = 1
      ctx.strokeRect(-tubeW / 2 - 4, envBottom, tubeW + 8, baseH)

      // pins — 8 small cream cylinders below the base
      const pinCount = 8
      const pinW = (tubeW + 6) / pinCount
      const pinTop = envBottom + baseH + 1
      const pinH = baseH * 0.6
      ctx.fillStyle = `rgba(232, 232, 232, 0.55)`
      for (let i = 0; i < pinCount; i++) {
        const px = -tubeW / 2 - 3 + i * pinW + pinW * 0.3
        ctx.fillRect(px, pinTop, pinW * 0.4, pinH)
      }

      ctx.restore()

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
        <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', cursor: 'pointer' }} />

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
          tube
          <span style={{ color: SODIUM }}>.</span>
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
          hold to apply current.
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
          <span style={{ color: SODIUM }}>·</span>
        </a>
      </div>
    </>
  )
}
