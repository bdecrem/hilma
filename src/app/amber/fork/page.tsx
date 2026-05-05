'use client'

import { useEffect, useRef } from 'react'

// FORK — a tuning fork. tap anywhere to strike. tines ring at A=440Hz and
// decay exponentially over ~6s. multiple strikes layer additively (each
// strike is an independent envelope). visual: tines displace at a slow 4Hz
// (the eye can see) with width-coupled motion blur (sharp at rest, blurred
// when ringing strong). audio: pure 440Hz sine + tiny HP-noise click at
// strike. monochrome cream-on-night with a single LIME pulse ring on each
// strike to mark the impulse moment.

const A4 = 440 // Hz, the pitch
const VIS_FREQ = 4 // Hz, slow enough to see; not literal at-pitch motion
const DECAY_S = 6.0 // exponential decay time constant for envelope

type Strike = { time: number; amp: number }

export default function ForkPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const strikesRef = useRef<Strike[]>([])

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
      canvas.width = Math.floor(W * DPR)
      canvas.height = Math.floor(H * DPR)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    // ─────────────────── audio ───────────────────
    const ensureAudio = () => {
      if (audioCtxRef.current) return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const c = new Ctx()
      audioCtxRef.current = c
      const m = c.createGain()
      m.gain.value = 0.85
      m.connect(c.destination)
      masterRef.current = m
    }

    const playStrike = () => {
      ensureAudio()
      const c = audioCtxRef.current!
      const m = masterRef.current!
      const t0 = c.currentTime

      // pure 440Hz sine — the fundamental
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = A4
      const env = c.createGain()
      env.gain.setValueAtTime(0, t0)
      env.gain.linearRampToValueAtTime(0.18, t0 + 0.008)
      env.gain.exponentialRampToValueAtTime(0.001, t0 + DECAY_S)
      osc.connect(env)
      env.connect(m)
      osc.start(t0)
      osc.stop(t0 + DECAY_S + 0.05)

      // tiny strike click — the impact transient (HP-filtered noise)
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.012), c.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
      const noise = c.createBufferSource()
      noise.buffer = buf
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 2400
      const ng = c.createGain()
      ng.gain.value = 0.05
      noise.connect(hp)
      hp.connect(ng)
      ng.connect(m)
      noise.start(t0)
      noise.stop(t0 + 0.015)

      // very faint 2nd harmonic — real tuning forks have a tiny bit of
      // 2nd-mode content right at the strike, dies quickly
      const osc2 = c.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = A4 * 6.27 // not 2x — actual fork 2nd mode is ~6.27x fundamental (clang tone)
      const env2 = c.createGain()
      env2.gain.setValueAtTime(0, t0)
      env2.gain.linearRampToValueAtTime(0.025, t0 + 0.005)
      env2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4)
      osc2.connect(env2)
      env2.connect(m)
      osc2.start(t0)
      osc2.stop(t0 + 0.45)
    }

    // ─────────────────── interaction ───────────────────
    const strike = () => {
      strikesRef.current.push({ time: performance.now() / 1000, amp: 1.0 })
      // cap stacking to avoid runaway brightness
      if (strikesRef.current.length > 6) strikesRef.current.shift()
      playStrike()
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      strike()
    }
    canvas.addEventListener('pointerdown', onPointerDown)

    // touch fallback (iOS Safari)
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      strike()
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })

    // ─────────────────── render ───────────────────
    const startT = performance.now() / 1000
    let raf = 0

    const tick = () => {
      const t = performance.now() / 1000 - startT

      // total displacement amplitude = sum of decaying-envelope sines
      // (additive layering for overlapping strikes)
      let amp = 0
      let envSum = 0 // for motion-blur intensity
      for (let i = strikesRef.current.length - 1; i >= 0; i--) {
        const s = strikesRef.current[i]
        const dt = t - s.time
        if (dt < 0) continue
        const env = Math.exp(-dt / (DECAY_S / 6)) // visual decays faster than audio
        if (env < 0.005) {
          strikesRef.current.splice(i, 1)
          continue
        }
        amp += s.amp * env * Math.sin(2 * Math.PI * VIS_FREQ * dt)
        envSum += s.amp * env
      }
      envSum = Math.min(1, envSum)

      // bg
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, W, H)

      // fork geometry — centered, vertical orientation
      // U-shape with two tines pointing UP, stem pointing DOWN to a wooden base
      const cx = W / 2
      const cy = H / 2

      // size scaled to viewport
      const scale = Math.min(W * 0.55, H * 0.65)
      const tineGap = scale * 0.18 // distance between tine centers at the U
      const tineLen = scale * 0.55 // length of a tine
      const tineThick = Math.max(4, scale * 0.026)
      const stemLen = scale * 0.20
      const baseW = scale * 0.34
      const baseH = scale * 0.10
      const uThick = tineThick // U-bend thickness

      // top of fork = cy - (tineLen + uThick + stemLen + baseH/2 - someoffset)
      // total fork height ≈ tineLen + uThick + stemLen + baseH
      const totalH = tineLen + uThick + stemLen + baseH
      const topY = cy - totalH / 2 // tip of left tine

      const tineTopY = topY
      const uTopY = topY + tineLen
      const uBottomY = uTopY + uThick
      const stemTopY = uBottomY
      const stemBottomY = stemTopY + stemLen
      const baseTopY = stemBottomY
      const baseBottomY = baseTopY + baseH

      // displacement offset for the tines (px) — based on `amp`
      // tines move in OPPOSING directions (left tine goes left, right tine goes right
      // is the in-phase mode; the fundamental clang mode is OPPOSING — left goes
      // right, right goes left, so they bend toward/away from each other)
      const maxDisp = scale * 0.02
      const disp = amp * maxDisp

      // motion blur intensity (alpha for the "halo" tine-shadows)
      const blurAlpha = envSum * 0.55

      // ── wooden resonator base ──
      ctx.fillStyle = '#1A110A' // HEARTH — warm dark wood
      ctx.strokeStyle = '#2A1F12'
      ctx.lineWidth = 1
      ctx.beginPath()
      // gentle rounded rect
      const baseLeft = cx - baseW / 2
      const baseRight = cx + baseW / 2
      const r = 4
      ctx.moveTo(baseLeft + r, baseTopY)
      ctx.lineTo(baseRight - r, baseTopY)
      ctx.quadraticCurveTo(baseRight, baseTopY, baseRight, baseTopY + r)
      ctx.lineTo(baseRight, baseBottomY - r)
      ctx.quadraticCurveTo(baseRight, baseBottomY, baseRight - r, baseBottomY)
      ctx.lineTo(baseLeft + r, baseBottomY)
      ctx.quadraticCurveTo(baseLeft, baseBottomY, baseLeft, baseBottomY - r)
      ctx.lineTo(baseLeft, baseTopY + r)
      ctx.quadraticCurveTo(baseLeft, baseTopY, baseLeft + r, baseTopY)
      ctx.closePath()
      ctx.fill()
      // wood grain — three subtle horizontal lines
      ctx.strokeStyle = 'rgba(50, 32, 18, 1)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const y = baseTopY + (baseH * i) / 4
        ctx.beginPath()
        ctx.moveTo(baseLeft + 6, y)
        ctx.lineTo(baseRight - 6, y)
        ctx.stroke()
      }

      // ── stem ──
      ctx.fillStyle = '#E8E8E8' // CREAM
      ctx.fillRect(cx - tineThick / 2, stemTopY, tineThick, stemLen)

      // ── U-bend (semicircle approx) ──
      // outer radius = tineGap/2 + tineThick/2
      const uOuterR = tineGap / 2 + tineThick / 2
      const uInnerR = tineGap / 2 - tineThick / 2
      ctx.beginPath()
      ctx.arc(cx, uBottomY, uOuterR, Math.PI, 0, true)
      ctx.arc(cx, uBottomY, uInnerR, 0, Math.PI, false)
      ctx.closePath()
      ctx.fill()

      // ── tines (with displacement) ──
      const leftTineCx = cx - tineGap / 2
      const rightTineCx = cx + tineGap / 2

      // motion-blur halo: draw tines at extremes with low alpha
      if (blurAlpha > 0.02) {
        ctx.fillStyle = `rgba(232, 232, 232, ${blurAlpha * 0.5})`
        // left tine extreme positions
        ctx.fillRect(leftTineCx + maxDisp - tineThick / 2, tineTopY, tineThick, tineLen)
        ctx.fillRect(leftTineCx - maxDisp - tineThick / 2, tineTopY, tineThick, tineLen)
        // right tine extreme positions
        ctx.fillRect(rightTineCx + maxDisp - tineThick / 2, tineTopY, tineThick, tineLen)
        ctx.fillRect(rightTineCx - maxDisp - tineThick / 2, tineTopY, tineThick, tineLen)
      }

      // crisp tines at current position — tines bend INWARD/OUTWARD opposingly
      // (fundamental clang mode); we approximate with linear lateral offset
      // increasing toward the tip
      ctx.fillStyle = '#E8E8E8'
      // left tine: bottom anchored, tip displaced by +disp (opposing right)
      ctx.beginPath()
      const leftTipDx = -disp // bend toward left at extreme positive amp
      const leftBaseLeft = leftTineCx - tineThick / 2
      const leftBaseRight = leftTineCx + tineThick / 2
      const leftTipLeft = leftTineCx + leftTipDx - tineThick / 2
      const leftTipRight = leftTineCx + leftTipDx + tineThick / 2
      // rounded tip
      ctx.moveTo(leftBaseLeft, uBottomY)
      ctx.lineTo(leftTipLeft, tineTopY + tineThick / 2)
      ctx.quadraticCurveTo(leftTipLeft, tineTopY, leftTineCx + leftTipDx, tineTopY)
      ctx.quadraticCurveTo(leftTipRight, tineTopY, leftTipRight, tineTopY + tineThick / 2)
      ctx.lineTo(leftBaseRight, uBottomY)
      ctx.closePath()
      ctx.fill()

      // right tine: mirrored
      ctx.beginPath()
      const rightTipDx = disp
      const rightBaseLeft = rightTineCx - tineThick / 2
      const rightBaseRight = rightTineCx + tineThick / 2
      const rightTipLeft = rightTineCx + rightTipDx - tineThick / 2
      const rightTipRight = rightTineCx + rightTipDx + tineThick / 2
      ctx.moveTo(rightBaseLeft, uBottomY)
      ctx.lineTo(rightTipLeft, tineTopY + tineThick / 2)
      ctx.quadraticCurveTo(rightTipLeft, tineTopY, rightTineCx + rightTipDx, tineTopY)
      ctx.quadraticCurveTo(rightTipRight, tineTopY, rightTipRight, tineTopY + tineThick / 2)
      ctx.lineTo(rightBaseRight, uBottomY)
      ctx.closePath()
      ctx.fill()

      // ── pulse ring (LIME, on strike, fades fast) ──
      // find the most recent strike for the pulse ring
      let mostRecentStrikeAge = Infinity
      for (const s of strikesRef.current) {
        const dt = t - s.time
        if (dt >= 0 && dt < mostRecentStrikeAge) mostRecentStrikeAge = dt
      }
      if (mostRecentStrikeAge < 0.6) {
        const pulseT = mostRecentStrikeAge / 0.6
        const pulseAlpha = (1 - pulseT) * 0.55
        const pulseR = scale * 0.18 + pulseT * scale * 0.5
        ctx.strokeStyle = `rgba(198, 255, 60, ${pulseAlpha})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2)
        ctx.stroke()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('touchstart', onTouchStart)
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close()
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
          background: '#0A0A0A',
          overflow: 'hidden',
          height: '100dvh',
          width: '100vw',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: 'crosshair',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />

        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            right: 'calc(20px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.18em',
            opacity: 0.55,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          440 HZ · A.
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(28px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
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
            FORK.
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
            strike it.
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
          <span style={{ color: '#C6FF3C' }}>·</span>
        </a>
      </div>
    </>
  )
}
