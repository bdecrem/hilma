// The viewer will see: a cream ring at center pulsing with every kick; at bar 3 scattered hat flecks appear; at bar 5 a lime core blooms and swells as the filter opens over 24 bars; at bar 32 everything drops to silence except the lime still glowing.
// The viewer will hear: the full hallman-hawtin-01 track — 32 bars of 126 BPM Plastikman-style minimal techno, JB01 drums + JT10 acid with cutoff 100→500Hz sweep. Pre-rendered Jambot.
'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const BPM = 126
const BEATS_PER_BAR = 4
const BEAT_SEC = 60 / BPM // 0.4762s
const BAR_SEC = BEAT_SEC * BEATS_PER_BAR // 1.905s
const TOTAL_BARS = 32

// Arrangement timeline (matches hallman-hawtin-01.js)
const BAR_HATS_IN = 2 // bars 3-4 (0-indexed: >= 2)
const BAR_ACID_IN = 4 // bar 5 (0-indexed: >= 4)
const BAR_FILTER_FULL_OPEN = 28 // bar 28 peak
const BAR_PULLBACK_END = 31
const BAR_GHOST = 31

// Scattered hat fleck positions (fixed seed for consistency)
const HAT_POSITIONS: { angle: number; dist: number }[] = []
for (let i = 0; i < 14; i++) {
  HAT_POSITIONS.push({
    angle: (i / 14) * Math.PI * 2 + (i * 0.37),
    dist: 0.75 + (i * 0.0713) % 0.6, // ratio of ring radius
  })
}

export default function Track01() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  const handlePointer = useCallback(async (e: PointerEvent) => {
    e.preventDefault()
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try {
        await audio.play()
        setPlaying(true)
        setUnlocked(true)
      } catch {
        // iOS gesture required — will succeed on retry
      }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      const audio = audioRef.current
      const t = audio && !audio.paused ? audio.currentTime : (audio?.currentTime ?? 0)
      const barFloat = t / BAR_SEC
      const bar = Math.floor(barFloat)
      const beatFloat = t / BEAT_SEC
      const beatPhase = beatFloat - Math.floor(beatFloat) // 0..1 within current beat
      const isEnded = audio?.ended

      // Center
      const cx = vw / 2
      const cy = vh / 2
      const baseR = Math.min(vw, vh) * 0.22

      // === Kick-pulse envelope ===
      // Kick hits on beats 1,2,3,4 (every beat). Attack-decay-ish envelope.
      // Suppress kick on ghost bar (bar index 31)
      const kickEnv = bar >= TOTAL_BARS - 1 || isEnded
        ? 0
        : Math.pow(1 - beatPhase, 1.8) // 1 at hit, 0 by next hit

      // === Filter-open automation (matches the track) ===
      // bars 5-28: 100→500Hz mapped to 0→1 intensity
      let filterIntensity = 0
      if (bar >= BAR_ACID_IN) {
        if (bar < BAR_FILTER_FULL_OPEN) {
          filterIntensity = (bar - BAR_ACID_IN) / (BAR_FILTER_FULL_OPEN - BAR_ACID_IN)
        } else if (bar < BAR_PULLBACK_END) {
          // bars 28-30: hold near full, slight pull (0.75)
          filterIntensity = 0.8
        } else {
          // Ghost bar 31
          filterIntensity = 0.3
        }
      }

      // === Draw main ring ===
      const ringR = baseR + kickEnv * 18
      const ringBright = 0.45 + kickEnv * 0.35
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = ringBright
      ctx.lineWidth = 1.5 + kickEnv * 2
      ctx.beginPath()
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
      ctx.stroke()

      // Inner faint ring for depth
      ctx.globalAlpha = 0.15 + kickEnv * 0.12
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, baseR * 0.7, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      // === Hat flecks ===
      if (bar >= BAR_HATS_IN && !isEnded && bar < TOTAL_BARS - 1) {
        // Hats are on 16ths. Use the 16th phase
        const sixteenthFloat = t / (BEAT_SEC / 4)
        const sixteenthPhase = sixteenthFloat - Math.floor(sixteenthFloat)
        for (let i = 0; i < HAT_POSITIONS.length; i++) {
          const p = HAT_POSITIONS[i]
          const pr = baseR * p.dist
          const fx = cx + Math.cos(p.angle) * pr
          const fy = cy + Math.sin(p.angle) * pr
          // Each fleck flashes with a per-fleck offset
          const perFleckPhase = (sixteenthPhase + i * 0.11) % 1
          const fleckBright = Math.pow(1 - perFleckPhase, 3.5) * 0.7 + 0.08
          ctx.fillStyle = CREAM
          ctx.globalAlpha = fleckBright
          ctx.beginPath()
          ctx.arc(fx, fy, 2 + fleckBright * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // === Lime core (acid bass, filter-driven) ===
      if (filterIntensity > 0 || isEnded) {
        const coreR = baseR * 0.35 * (isEnded ? 0.8 : filterIntensity)
        const coreAlpha = isEnded ? 0.55 : 0.35 + filterIntensity * 0.55
        // Glow
        ctx.save()
        ctx.shadowColor = LIME
        ctx.shadowBlur = 20 + filterIntensity * 30
        ctx.fillStyle = LIME
        ctx.globalAlpha = coreAlpha
        ctx.beginPath()
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Thin lime ring around the core, breathing with kick
        ctx.strokeStyle = LIME
        ctx.globalAlpha = 0.3 + filterIntensity * 0.3 + kickEnv * 0.1
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, coreR + 10 + kickEnv * 6, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // === Ghost bar — subtle fade to near-silent ===
      if (bar === TOTAL_BARS - 1 && !isEnded) {
        // Everything already mostly suppressed via kickEnv=0; lime lingers
      }

      // === Bottom progress hairline ===
      const barsPlayed = Math.min(TOTAL_BARS, t / BAR_SEC)
      const progressFrac = barsPlayed / TOTAL_BARS
      const trackLeft = 32
      const trackRight = vw - 32
      const trackY = vh - 40
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.15
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(trackLeft, trackY)
      ctx.lineTo(trackRight, trackY)
      ctx.stroke()
      ctx.strokeStyle = filterIntensity > 0 ? LIME : CREAM
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(trackLeft, trackY)
      ctx.lineTo(trackLeft + (trackRight - trackLeft) * progressFrac, trackY)
      ctx.stroke()
      ctx.globalAlpha = 1

      // === Bar counter ===
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.35
      ctx.textAlign = 'right'
      const barDisplay = Math.min(TOTAL_BARS, Math.floor(barFloat) + (playing ? 1 : 0))
      ctx.fillText(`BAR ${String(barDisplay).padStart(2, '0')} / ${TOTAL_BARS}`, trackRight, trackY - 8)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      // === Museum label lower-left ===
      const labelX = 32
      const labelY = vh - 68
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('track 01', labelX, labelY)
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('hallman — minimal, 126 bpm', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // === Play indicator top-right ===
      ctx.fillStyle = playing ? LIME : CREAM
      ctx.globalAlpha = playing ? 0.85 : 0.35
      if (playing) {
        ctx.shadowColor = LIME
        ctx.shadowBlur = 10
      }
      ctx.beginPath()
      ctx.arc(vw - 32, 32, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // === Hint before first play ===
      if (!unlocked) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.4
        ctx.textAlign = 'center'
        ctx.fillText('TAP TO PLAY', vw / 2, vh / 2 + baseR + 40)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()

    canvas.addEventListener('pointerdown', handlePointer)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointer)
    }
  }, [handlePointer, playing, unlocked])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <audio
        ref={audioRef}
        src="/amber/tracks/hallman-01.m4a"
        preload="auto"
        playsInline
        onEnded={() => setPlaying(false)}
      />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          touchAction: 'none',
          background: NIGHT,
        }}
      />
    </>
  )
}
