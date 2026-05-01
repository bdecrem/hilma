'use client'

import { useEffect, useRef } from 'react'

// spray — a spray can. hold or drag to paint. each frame while held, ~30
// soft small particles drop in a gaussian-radial cloud around the cursor.
// each particle has random radius (1.5–4.5px) and very low alpha (0.04–0.14)
// so density accumulates the longer/wider you hold. cream by default; the
// can "heats up" after ~1.5s of continuous holding and the cloud color
// shifts toward FLARE pink. tap = quick burst (12 particles + a release
// click). lo-fi audio: looped white noise through a bandpass whose gain
// and center frequency rise with hold duration — a compressed-air hiss.

const FIELD = '#0A0A0A'
const CREAM = [232, 232, 232]
const FLARE = [255, 47, 126]

export default function SprayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    const paintField = () => {
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)
    }
    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * DPR
      canvas.height = H * DPR
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(DPR, DPR)
      paintField()
    }
    resize()
    window.addEventListener('resize', resize)
    paintField()

    let down = false
    let cursorX = 0,
      cursorY = 0
    let holdStart = 0 // performance.now() at button-down
    let downT = 0
    let downX = 0,
      downY = 0
    let moved = false

    // box-muller for gaussian radial distance
    const gauss = () => {
      const u = 1 - Math.random()
      const v = 1 - Math.random()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    }

    // audio
    let audioCtx: AudioContext | null = null
    let hissGain: GainNode | null = null
    let hissBP: BiquadFilterNode | null = null

    const ensureAudio = () => {
      if (audioCtx) return
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.5, audioCtx.sampleRate)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
      const src = audioCtx.createBufferSource()
      src.buffer = buf
      src.loop = true
      hissBP = audioCtx.createBiquadFilter()
      hissBP.type = 'bandpass'
      hissBP.frequency.value = 1800
      hissBP.Q.value = 1.5
      hissGain = audioCtx.createGain()
      hissGain.gain.value = 0
      src.connect(hissBP)
      hissBP.connect(hissGain)
      hissGain.connect(audioCtx.destination)
      src.start()
    }

    const playReleaseClick = (amp: number) => {
      if (!audioCtx) return
      const now = audioCtx.currentTime
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.04), audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const src = audioCtx.createBufferSource()
      src.buffer = buf
      const hp = audioCtx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1200
      const env = audioCtx.createGain()
      env.gain.setValueAtTime(amp, now)
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
      src.connect(hp)
      hp.connect(env)
      env.connect(audioCtx.destination)
      src.start(now)
      src.stop(now + 0.05)
    }

    const sprayParticles = (x: number, y: number, count: number, holdSeconds: number) => {
      // flareMix rises with hold duration — the can "heats up" after ~1.5s
      const flareMix = Math.max(0, Math.min(0.78, (holdSeconds - 0.4) * 0.55))
      const r0 = CREAM[0] * (1 - flareMix) + FLARE[0] * flareMix
      const g0 = CREAM[1] * (1 - flareMix) + FLARE[1] * flareMix
      const b0 = CREAM[2] * (1 - flareMix) + FLARE[2] * flareMix

      for (let i = 0; i < count; i++) {
        // gaussian radial — concentrated at center, scattered fringe
        const rad = Math.abs(gauss()) * 11
        const theta = Math.random() * Math.PI * 2
        const px = x + Math.cos(theta) * rad
        const py = y + Math.sin(theta) * rad
        const dotR = 1.4 + Math.random() * 3.0
        const alpha = 0.045 + Math.random() * 0.10
        ctx.fillStyle = `rgba(${r0 | 0}, ${g0 | 0}, ${b0 | 0}, ${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(px, py, dotR, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      down = true
      moved = false
      const p = pos(e)
      cursorX = p.x
      cursorY = p.y
      downX = p.x
      downY = p.y
      downT = performance.now()
      holdStart = downT
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
      // initial small burst
      sprayParticles(p.x, p.y, 12, 0)
      if (hissGain && audioCtx) {
        hissGain.gain.setTargetAtTime(0.06, audioCtx.currentTime, 0.03)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = pos(e)
      cursorX = p.x
      cursorY = p.y
      if (Math.abs(p.x - downX) > 4 || Math.abs(p.y - downY) > 4) moved = true
    }

    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      if (hissGain && audioCtx) {
        hissGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05)
      }
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        // tap → quick burst + release click
        const p = pos(e)
        sprayParticles(p.x, p.y, 12, 0)
        playReleaseClick(0.16)
      } else {
        // longer hold release — soft puff
        playReleaseClick(0.08)
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // raf loop — emits particles while held; tracks hold duration for FLARE shift + audio
    let raf = 0
    const tick = (now: number) => {
      if (down) {
        const holdSeconds = (now - holdStart) / 1000
        // ~30 particles per frame while held — produces a continuous soft cloud
        sprayParticles(cursorX, cursorY, 30, holdSeconds)
        // audio: gain + cutoff rise with hold duration
        if (hissGain && hissBP && audioCtx) {
          const norm = Math.min(1, holdSeconds * 0.6)
          hissGain.gain.setTargetAtTime(0.05 + norm * 0.07, audioCtx.currentTime, 0.05)
          hissBP.frequency.setTargetAtTime(1800 + norm * 1400, audioCtx.currentTime, 0.05)
        }
      }
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
        <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }} />

        <div
          style={{
            position: 'fixed',
            top: 'calc(16px + env(safe-area-inset-top, 0px))',
            left: 'calc(16px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
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
          spray
          <span style={{ color: '#FF2F7E' }}>.</span>
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(24px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 17,
            opacity: 0.7,
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          hold to paint.
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
          <span style={{ color: '#FF2F7E' }}>·</span>
        </a>
      </div>
    </>
  )
}
