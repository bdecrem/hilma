// The viewer will see: a cream ring at center pulsing with every kick; scattered hat flecks on 16ths; tom hits flash as arcs on the ring (low = lower arc, high = upper); a cymbal shockwave radiates outward at bar 24; the whole ring turns LIME for the peak bars 21–24; breakdown goes toms-only; bar 32 drops to a single ghost kick.
// The viewer will hear: hallman-tribal-01 — 32 bars of 126 BPM percussion only, JB01 drums, multi-section arrangement with tom patterns, claps, open hats, cymbal crash, and a breakdown.
'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const BPM = 126
const BEAT_SEC = 60 / BPM // 0.4762s
const BAR_SEC = BEAT_SEC * 4 // 1.905s
const TOTAL_BARS = 28

// ============== Tom patterns (mirror of hallman-tribal-01.js) ==============
type Hit = { step: number; v: number }
const TOM_A_HI: Hit[] = [{ step: 0, v: 115 }, { step: 6, v: 85 }, { step: 10, v: 95 }, { step: 14, v: 70 }]
const TOM_A_LOW: Hit[] = [{ step: 4, v: 110 }, { step: 11, v: 100 }]
const TOM_B_HI: Hit[] = [{ step: 0, v: 127 }, { step: 2, v: 80 }, { step: 6, v: 90 }, { step: 10, v: 110 }, { step: 14, v: 95 }]
const TOM_B_LOW: Hit[] = [{ step: 1, v: 85 }, { step: 4, v: 120 }, { step: 8, v: 100 }, { step: 11, v: 115 }, { step: 13, v: 75 }]
const FILL15_HI: Hit[] = [{ step: 12, v: 115 }, { step: 13, v: 95 }]
const FILL15_LOW: Hit[] = [{ step: 14, v: 120 }, { step: 15, v: 110 }]
const FILL23_HI: Hit[] = [{ step: 10, v: 100 }, { step: 12, v: 105 }, { step: 14, v: 110 }]
const FILL23_LOW: Hit[] = [{ step: 11, v: 95 }, { step: 13, v: 105 }, { step: 15, v: 115 }]

type ScheduledHit = { t: number; voice: 'hitom' | 'lowtom' | 'clap' | 'cymbal'; velocity: number }

function buildSchedule(): ScheduledHit[] {
  const hits: ScheduledHit[] = []
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    // Toms
    let hiPat: Hit[] | null = null
    let lowPat: Hit[] | null = null
    if (bar === 11) { hiPat = FILL15_HI; lowPat = FILL15_LOW }
    else if (bar === 19) { hiPat = FILL23_HI; lowPat = FILL23_LOW }
    else if ((bar >= 4 && bar < 16) || (bar >= 20 && bar < 24) || (bar >= 24 && bar < 27)) {
      hiPat = TOM_A_HI; lowPat = TOM_A_LOW
    } else if (bar >= 16 && bar < 19) {
      hiPat = TOM_B_HI; lowPat = TOM_B_LOW
    }
    if (hiPat) for (const h of hiPat) hits.push({ t: bar * BAR_SEC + (h.step / 16) * BAR_SEC, voice: 'hitom', velocity: h.v })
    if (lowPat) for (const h of lowPat) hits.push({ t: bar * BAR_SEC + (h.step / 16) * BAR_SEC, voice: 'lowtom', velocity: h.v })

    // Claps on 2 & 4 during bars 13-20 and 25-27 (0-indexed 12-19 and 24-26)
    if ((bar >= 12 && bar < 20) || (bar >= 24 && bar < 27)) {
      for (const step of [4, 12]) {
        hits.push({ t: bar * BAR_SEC + (step / 16) * BAR_SEC, voice: 'clap', velocity: 112 })
      }
    }

    // Cymbal at bar 19 step 8
    if (bar === 19) {
      hits.push({ t: 19 * BAR_SEC + (8 / 16) * BAR_SEC, voice: 'cymbal', velocity: 115 })
    }
  }
  hits.sort((a, b) => a.t - b.t)
  return hits
}

// Scattered hat fleck positions (same seed as before)
const HAT_POSITIONS: { angle: number; dist: number }[] = []
for (let i = 0; i < 14; i++) {
  HAT_POSITIONS.push({
    angle: (i / 14) * Math.PI * 2 + (i * 0.37),
    dist: 0.75 + (i * 0.0713) % 0.6,
  })
}

export default function Track01() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef(0)
  const scheduleRef = useRef<ScheduledHit[]>(buildSchedule())
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
        // iOS requires gesture — will succeed on retry
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
      const t = audio?.currentTime ?? 0
      const barFloat = t / BAR_SEC
      const bar = Math.floor(barFloat)
      const beatFloat = t / BEAT_SEC
      const beatPhase = beatFloat - Math.floor(beatFloat)
      const isEnded = audio?.ended

      const cx = vw / 2
      const cy = vh / 2
      const baseR = Math.min(vw, vh) * 0.22

      // ============== Kick envelope ==============
      // Kick: present bars 0-19, absent 20-23 (breakdown), present 24-26, ghost bar 27 (kick on step 0 only)
      let kickActive = false
      if (bar < 20) kickActive = true
      else if (bar >= 24 && bar < 27) kickActive = true
      const kickEnv = (() => {
        if (isEnded) return 0
        if (bar === 27) {
          // Single hit at start of bar
          const timeInBar = barFloat - 27
          if (timeInBar < 0.25) return Math.pow(1 - timeInBar * 4, 1.8)
          return 0
        }
        if (!kickActive) return 0
        return Math.pow(1 - beatPhase, 1.8)
      })()

      // ============== Peak lime flag (bars 17-19, i.e. 16-18 0-indexed) ==============
      const inPeak = bar >= 16 && bar < 19
      const ringColor = inPeak ? LIME : CREAM
      const ringGlow = inPeak ? 18 : 0

      // ============== Main ring ==============
      const ringR = baseR + kickEnv * 20
      const ringBright = 0.45 + kickEnv * 0.4
      if (ringGlow > 0) {
        ctx.save()
        ctx.shadowColor = LIME
        ctx.shadowBlur = ringGlow
      }
      ctx.strokeStyle = ringColor
      ctx.globalAlpha = ringBright
      ctx.lineWidth = 1.5 + kickEnv * 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
      ctx.stroke()
      if (ringGlow > 0) ctx.restore()

      // Inner faint ring
      ctx.globalAlpha = 0.15 + kickEnv * 0.1
      ctx.strokeStyle = CREAM
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, baseR * 0.7, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      // ============== Hat flecks (16ths during ch bars) ==============
      const chActive = (bar < 20) || (bar >= 24 && bar < 27)
      if (chActive && !isEnded) {
        const sixteenthFloat = t / (BEAT_SEC / 4)
        const sixteenthPhase = sixteenthFloat - Math.floor(sixteenthFloat)
        for (let i = 0; i < HAT_POSITIONS.length; i++) {
          const p = HAT_POSITIONS[i]
          const pr = baseR * p.dist
          const fx = cx + Math.cos(p.angle) * pr
          const fy = cy + Math.sin(p.angle) * pr
          const perFleckPhase = (sixteenthPhase + i * 0.11) % 1
          const fleckBright = Math.pow(1 - perFleckPhase, 3.5) * 0.65 + 0.08
          ctx.fillStyle = CREAM
          ctx.globalAlpha = fleckBright
          ctx.beginPath()
          ctx.arc(fx, fy, 2 + fleckBright * 1.3, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // ============== Tom / clap / cymbal hits from schedule ==============
      // Find hits within age window
      const hits = scheduleRef.current
      for (const hit of hits) {
        const age = t - hit.t
        if (age < 0 || age > 0.5) continue
        const v = hit.velocity / 127
        const decay = Math.pow(1 - age / 0.5, 2.2)
        const alpha = decay * (0.4 + v * 0.5)

        if (hit.voice === 'lowtom') {
          // Thick arc on lower half of ring
          ctx.save()
          ctx.strokeStyle = inPeak ? LIME : CREAM
          ctx.globalAlpha = alpha
          ctx.lineWidth = 3 + v * 4
          ctx.beginPath()
          ctx.arc(cx, cy, baseR + 6, Math.PI * 0.15, Math.PI * 0.85)
          ctx.stroke()
          ctx.restore()
        } else if (hit.voice === 'hitom') {
          // Thinner arc on upper half
          ctx.save()
          ctx.strokeStyle = inPeak ? LIME : CREAM
          ctx.globalAlpha = alpha
          ctx.lineWidth = 2 + v * 2.5
          ctx.beginPath()
          ctx.arc(cx, cy, baseR + 4, Math.PI * 1.15, Math.PI * 1.85)
          ctx.stroke()
          ctx.restore()
        } else if (hit.voice === 'clap') {
          // Radial burst — 4 short lines outward
          ctx.save()
          ctx.strokeStyle = inPeak ? LIME : CREAM
          ctx.globalAlpha = alpha * 0.8
          ctx.lineWidth = 2
          const len = 20 + decay * 24
          const startR = baseR + 14 + (1 - decay) * 20
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + Math.PI / 16
            const x1 = cx + Math.cos(ang) * startR
            const y1 = cy + Math.sin(ang) * startR
            const x2 = cx + Math.cos(ang) * (startR + len)
            const y2 = cy + Math.sin(ang) * (startR + len)
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
          }
          ctx.restore()
        } else if (hit.voice === 'cymbal') {
          // Large radial shockwave — expanding ring
          ctx.save()
          ctx.strokeStyle = inPeak ? LIME : CREAM
          ctx.globalAlpha = alpha * 0.6
          ctx.lineWidth = 1.5
          const shockR = baseR + 10 + (1 - decay) * Math.min(vw, vh) * 0.45
          ctx.beginPath()
          ctx.arc(cx, cy, shockR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1

      // ============== Progress hairline ==============
      const progressFrac = Math.min(1, t / (TOTAL_BARS * BAR_SEC))
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
      ctx.strokeStyle = inPeak ? LIME : CREAM
      ctx.globalAlpha = 0.75
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(trackLeft, trackY)
      ctx.lineTo(trackLeft + (trackRight - trackLeft) * progressFrac, trackY)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Bar counter
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.35
      ctx.textAlign = 'right'
      const barDisplay = Math.min(TOTAL_BARS, Math.floor(barFloat) + (playing ? 1 : 0))
      ctx.fillText(`BAR ${String(barDisplay).padStart(2, '0')} / ${TOTAL_BARS}`, trackRight, trackY - 8)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1

      // Museum label
      const labelX = 32
      const labelY = vh - 68
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('track 01', labelX, labelY)
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('hallman tribal — 126 bpm, no synth', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Play indicator
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

      // Hint
      if (!unlocked) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.4
        ctx.textAlign = 'center'
        ctx.fillText('TAP TO PLAY', vw / 2, vh / 2 + baseR + 46)
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
