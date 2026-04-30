'use client'

import { useEffect, useRef } from 'react'

// crayon — a scribble pad. drag to scribble; marks accumulate. each stroke
// is a cluster of jittered small dots along the path with random radius and
// alpha — gives the broken-wax-on-paper crayon feel. cream by default; fast
// strokes blend toward FLARE pink (the head of an excited stroke). lo-fi
// audio: a continuous bandpassed white-noise loop whose gain and center
// frequency track stroke speed — paper-scrape. tap (no drag) drops a
// stationary mark cluster + a short noise click.

const FIELD = '#0A0A0A'
const CREAM = [232, 232, 232]
const FLARE = [255, 47, 126]

export default function CrayonPage() {
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

    // pointer state
    let down = false
    let lastX = 0,
      lastY = 0
    let lastT = 0
    let strokeSpeed = 0 // px / 100ms
    let downX = 0,
      downY = 0,
      downT = 0
    let moved = false

    // audio
    let audioCtx: AudioContext | null = null
    let scrapeGain: GainNode | null = null
    let scrapeBP: BiquadFilterNode | null = null

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
      scrapeBP = audioCtx.createBiquadFilter()
      scrapeBP.type = 'bandpass'
      scrapeBP.frequency.value = 2000
      scrapeBP.Q.value = 0.9
      scrapeGain = audioCtx.createGain()
      scrapeGain.gain.value = 0
      src.connect(scrapeBP)
      scrapeBP.connect(scrapeGain)
      scrapeGain.connect(audioCtx.destination)
      src.start()
    }

    const playClick = (amp: number) => {
      if (!audioCtx) return
      const now = audioCtx.currentTime
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.04), audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const src = audioCtx.createBufferSource()
      src.buffer = buf
      const hp = audioCtx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1100
      const env = audioCtx.createGain()
      env.gain.setValueAtTime(amp, now)
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
      src.connect(hp)
      hp.connect(env)
      env.connect(audioCtx.destination)
      src.start(now)
      src.stop(now + 0.05)
    }

    const drawCrayonMark = (x: number, y: number, speed: number) => {
      // density falls with speed (faster = more gappy / streaky)
      const density = Math.max(3, Math.floor(13 - speed * 0.04))
      const radius = 4.2 + Math.random() * 2.2
      // flare mix rises with speed, but only past a threshold — slow strokes
      // are pure cream; you have to drag with intent to spark pink.
      const flareMix = Math.max(0, Math.min(0.75, (speed - 90) * 0.011))

      const lr = CREAM[0] * (1 - flareMix) + FLARE[0] * flareMix
      const lg = CREAM[1] * (1 - flareMix) + FLARE[1] * flareMix
      const lb = CREAM[2] * (1 - flareMix) + FLARE[2] * flareMix

      for (let i = 0; i < density; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.pow(Math.random(), 0.7) * radius // bias toward inner cluster
        const px = x + Math.cos(a) * r
        const py = y + Math.sin(a) * r
        const dotR = 0.55 + Math.random() * 1.4
        const alpha = 0.13 + Math.random() * 0.45
        ctx.fillStyle = `rgba(${lr | 0}, ${lg | 0}, ${lb | 0}, ${alpha.toFixed(3)})`
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
      lastX = p.x
      lastY = p.y
      lastT = performance.now()
      strokeSpeed = 0
      downX = p.x
      downY = p.y
      downT = performance.now()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
      drawCrayonMark(p.x, p.y, 0)
      if (scrapeGain && audioCtx) {
        scrapeGain.gain.setTargetAtTime(0.05, audioCtx.currentTime, 0.04)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = pos(e)
      const now = performance.now()
      const dt = Math.max(1, now - lastT)
      const dist = Math.hypot(p.x - lastX, p.y - lastY)
      strokeSpeed = (dist / dt) * 100
      if (Math.abs(p.x - downX) > 4 || Math.abs(p.y - downY) > 4) moved = true

      // sample marks along the path so fast strokes don't have gaps
      const stepSize = 3
      const steps = Math.max(1, Math.floor(dist / stepSize))
      for (let i = 1; i <= steps; i++) {
        const f = i / steps
        const px = lastX + (p.x - lastX) * f
        const py = lastY + (p.y - lastY) * f
        drawCrayonMark(px, py, strokeSpeed)
      }

      lastX = p.x
      lastY = p.y
      lastT = now

      if (scrapeGain && scrapeBP && audioCtx) {
        const norm = Math.min(1, strokeSpeed / 250)
        scrapeGain.gain.setTargetAtTime(0.04 + norm * 0.11, audioCtx.currentTime, 0.04)
        scrapeBP.frequency.setTargetAtTime(1700 + norm * 2400, audioCtx.currentTime, 0.04)
      }
    }

    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      if (scrapeGain && audioCtx) {
        scrapeGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.06)
      }
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        // tap — drop a denser stationary cluster + click
        const p = pos(e)
        for (let i = 0; i < 3; i++) {
          drawCrayonMark(p.x, p.y, 0)
        }
        playClick(0.18)
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    return () => {
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
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />

        {/* tiny corner mark */}
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
          crayon
          <span style={{ color: '#FF2F7E' }}>.</span>
        </div>

        {/* casual caption */}
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
          scribble.
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
