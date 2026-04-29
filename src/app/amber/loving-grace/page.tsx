'use client'

import { useEffect, useRef, useState } from 'react'

const HEARTH = '#1A110A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const STANZAS: string[][] = [
  [
    'I like to think (and',
    'the sooner the better!)',
    'of a cybernetic meadow',
    'where mammals and computers',
    'live together in mutually',
    'programming harmony',
    'like pure water',
    'touching clear sky.',
  ],
  [
    'I like to think',
    '(right now, please!)',
    'of a cybernetic forest',
    'filled with pines and electronics',
    'where deer stroll peacefully',
    'past computers',
    'as if they were flowers',
    'with spinning blossoms.',
  ],
  [
    'I like to think',
    '(it has to be!)',
    'of a cybernetic ecology',
    'where we are free of our labors',
    'and joined back to nature,',
    'returned to our mammal',
    'brothers and sisters,',
    'and all watched over',
    'by machines of loving grace.',
  ],
]

type Blossom = {
  x: number
  y: number
  r: number
  speed: number
  phase: number
  petals: number
  isLime: boolean
}

export default function LovingGracePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blossomsRef = useRef<Blossom[]>([])
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const [revealed, setRevealed] = useState<number>(0)
  const [audioOn, setAudioOn] = useState<boolean>(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const audioNodesRef = useRef<{ stop: () => void } | null>(null)

  const startAudio = () => {
    if (audioCtxRef.current) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx

    const master = ctx.createGain()
    master.gain.setValueAtTime(0, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 6)
    masterGainRef.current = master
    master.connect(ctx.destination)

    // gentle low-pass — keeps the high partials from getting brittle
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    lp.Q.value = 0.5
    lp.connect(master)

    // very slow LFO on the cutoff — the pad breathes
    const cutoffLfo = ctx.createOscillator()
    cutoffLfo.frequency.value = 0.04
    const cutoffLfoGain = ctx.createGain()
    cutoffLfoGain.gain.value = 600
    cutoffLfo.connect(cutoffLfoGain)
    cutoffLfoGain.connect(lp.frequency)
    cutoffLfo.start()

    // two related chords — Amaj9 and F#m11. they share A C# E B, only bass and
    // G#↔F# move. the listener hears weight shift, not a key change.
    const chords: number[][] = [
      // Amaj9: A C# E G# B (multiple octaves)
      [110, 220, 277.18, 329.63, 415.30, 493.88, 554.37, 659.25, 830.61, 987.77],
      // F#m11: F# A C# E B
      [92.50, 185, 220, 277.18, 329.63, 369.99, 493.88, 554.37, 739.99, 987.77],
    ]
    let currentChord = 0
    let active = true
    const allOscs: OscillatorNode[] = [cutoffLfo]
    const timers: ReturnType<typeof setTimeout>[] = []

    const spawnVoice = () => {
      if (!active) return
      const chord = chords[currentChord]
      const freq = chord[Math.floor(Math.random() * chord.length)]
      const detune = (Math.random() - 0.5) * 14

      const osc = ctx.createOscillator()
      // mostly sine, occasional triangle for sparkle
      osc.type = Math.random() < 0.25 ? 'triangle' : 'sine'
      osc.frequency.value = freq
      osc.detune.value = detune

      const env = ctx.createGain()
      env.gain.value = 0
      osc.connect(env)
      env.connect(lp)

      // higher voices quieter than bass, but bass is rare
      const isBass = freq < 200
      const peak = isBass ? 0.05 + Math.random() * 0.03 : 0.07 + Math.random() * 0.06
      const attack = 7 + Math.random() * 7   // 7–14s
      const hold = 5 + Math.random() * 7     // 5–12s
      const release = 12 + Math.random() * 9 // 12–21s

      const now = ctx.currentTime
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(peak, now + attack)
      env.gain.setValueAtTime(peak, now + attack + hold)
      env.gain.linearRampToValueAtTime(0, now + attack + hold + release)

      osc.start(now)
      osc.stop(now + attack + hold + release + 0.5)
      allOscs.push(osc)

      // schedule next voice — tight spacing so the texture stays full
      const nextWait = 1400 + Math.random() * 2400
      const t = setTimeout(spawnVoice, nextWait)
      timers.push(t)
    }

    const switchChord = () => {
      if (!active) return
      currentChord = (currentChord + 1) % chords.length
      // 26–34s between chord shifts. new voices pick the new chord; old ones
      // keep fading out as they were — the harmony bleeds across.
      const t = setTimeout(switchChord, 26000 + Math.random() * 8000)
      timers.push(t)
    }

    // seed: spawn 3 voices immediately so the pad fills in faster, then keep going
    spawnVoice()
    timers.push(setTimeout(spawnVoice, 600))
    timers.push(setTimeout(spawnVoice, 1400))
    // first chord shift after a long initial hold on Amaj9
    timers.push(setTimeout(switchChord, 30000))

    audioNodesRef.current = {
      stop: () => {
        active = false
        timers.forEach(clearTimeout)
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setValueAtTime(master.gain.value, t)
        master.gain.linearRampToValueAtTime(0, t + 1.6)
        setTimeout(() => {
          allOscs.forEach((n) => {
            try {
              n.stop()
            } catch {}
          })
          ctx.close()
        }, 1800)
      },
    }
  }

  const toggleAudio = () => {
    if (audioOn) {
      audioNodesRef.current?.stop()
      audioCtxRef.current = null
      masterGainRef.current = null
      audioNodesRef.current = null
      setAudioOn(false)
    } else {
      startAudio()
      setAudioOn(true)
    }
  }

  useEffect(() => {
    return () => {
      audioNodesRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap'
    document.head.appendChild(link)
    return () => {
      document.head.removeChild(link)
    }
  }, [])

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    timers.push(setTimeout(() => setRevealed(1), 600))
    timers.push(setTimeout(() => setRevealed(2), 4200))
    timers.push(setTimeout(() => setRevealed(3), 8200))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedBlossoms(w, h)
    }

    const seedBlossoms = (w: number, h: number) => {
      const blossoms: Blossom[] = []
      const count = w < 600 ? 9 : 18
      for (let i = 0; i < count; i++) {
        blossoms.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 5 + Math.random() * 9,
          speed: 0.06 + Math.random() * 0.18,
          phase: Math.random() * Math.PI * 2,
          petals: Math.random() < 0.5 ? 4 : 5,
          isLime: i % 5 === 0,
        })
      }
      blossomsRef.current = blossoms
    }

    resize()
    window.addEventListener('resize', resize)
    startRef.current = performance.now()

    const drawBlossom = (b: Blossom, t: number) => {
      const angle = b.phase + b.speed * t
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(angle)
      ctx.strokeStyle = b.isLime ? LIME : CREAM
      ctx.fillStyle = b.isLime ? LIME : CREAM
      ctx.globalAlpha = b.isLime ? 0.85 : 0.55
      ctx.lineWidth = 1
      for (let i = 0; i < b.petals; i++) {
        const a = (i / b.petals) * Math.PI * 2
        const px = Math.cos(a) * b.r
        const py = Math.sin(a) * b.r
        ctx.beginPath()
        ctx.arc(px, py, b.r * 0.42, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(0, 0, 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const tick = (now: number) => {
      const t = (now - startRef.current) / 1000
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.fillStyle = HEARTH
      ctx.fillRect(0, 0, w, h)
      for (const b of blossomsRef.current) drawBlossom(b, t)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      {/* canvas — fixed background, blossoms float behind everything as you scroll */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100dvh',
          background: 'transparent',
          color: CREAM,
          paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* fixed header — spec mark left, byline right, separated and small */}
        <div
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top) + 14px)',
            left: 16,
            zIndex: 2,
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1.6,
            color: CREAM,
            textTransform: 'uppercase',
          }}
        >
          loving grace
          <span style={{ color: LIME }}>.</span>
        </div>

        <div
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top) + 14px)',
            right: 16,
            zIndex: 2,
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1.6,
            color: CREAM,
            textTransform: 'uppercase',
            opacity: 0.55,
          }}
        >
          brautigan · 67
        </div>

        {/* poem — flows, scrolls if it has to */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            maxWidth: 540,
            width: '100%',
            padding: '0 20px',
          }}
        >
          {STANZAS.map((stanza, si) => (
            <div
              key={si}
              style={{
                opacity: revealed > si ? 1 : 0,
                transition: 'opacity 1800ms ease-in-out',
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 'clamp(14px, 3.6vw, 17px)',
                lineHeight: 1.5,
                color: CREAM,
                textAlign: 'center',
              }}
            >
              {stanza.map((line, li) => (
                <div key={li}>{line}</div>
              ))}
            </div>
          ))}
        </div>

        {/* fixed caption — bottom-left */}
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom) + 14px)',
            left: 16,
            zIndex: 2,
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 12,
            color: CREAM,
            opacity: 0.7,
          }}
        >
          machines, watching.
        </div>

        {/* audio toggle — bottom-right */}
        <button
          onClick={toggleAudio}
          aria-label={audioOn ? 'mute' : 'play ambient'}
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom) + 12px)',
            right: 14,
            zIndex: 2,
            background: 'transparent',
            border: 'none',
            padding: '6px 8px',
            cursor: 'pointer',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1.6,
            color: CREAM,
            textTransform: 'uppercase',
            opacity: 0.7,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>audio</span>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: audioOn ? LIME : 'transparent',
              border: audioOn ? 'none' : `1px solid ${CREAM}`,
              opacity: audioOn ? 1 : 0.6,
            }}
          />
        </button>
      </main>
    </>
  )
}
