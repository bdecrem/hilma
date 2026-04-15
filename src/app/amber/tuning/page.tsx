'use client'

import { useEffect, useRef } from 'react'

// AMBER v3 — SIGNAL palette
const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

// Noise characters — glyphs, marks, typography debris
const NOISE = '⟟⎿⎾⎽⎻▚▜▟▛▞▟◌◍◉◎◈◇◆◊⌁⌇⎔⎕⎖⎗⎚▓░▒·.:-=/\\|+*'
const NOISE_CHARS = Array.from(NOISE)

// Stations — frequency (0..1) and what broadcasts there
const STATIONS: { f: number; phrase: string }[] = [
  { f: 0.12, phrase: 'still no reply' },
  { f: 0.28, phrase: 'listening mostly' },
  { f: 0.44, phrase: 'the signal you wanted is not there' },
  { f: 0.58, phrase: 'something arrived' },
  { f: 0.73, phrase: 'you are not alone on this frequency' },
  { f: 0.88, phrase: 'this one is for you' },
]

export default function Tuning() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const freqRef = useRef(0.04)
  const draggingRef = useRef(false)
  const noiseSeedRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!

    // Seeded PRNG — so noise chars are stable per-frame when freq doesn't change
    function sRand(seed: number) {
      let s = (seed * 2654435761) >>> 0
      return () => {
        s = (s * 1103515245 + 12345) >>> 0
        return ((s >>> 16) & 0x7fff) / 0x7fff
      }
    }

    let raf = 0

    function draw() {
      const now = performance.now()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // NIGHT field
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, W, H)

      // Temporal grain
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.015
      for (let i = 0; i < 100; i++) {
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
      }
      ctx.globalAlpha = 1

      // Grid of characters — fills most of screen
      const charSize = Math.max(14, Math.min(20, W * 0.028))
      const lineH = charSize * 1.55
      const colW = charSize * 0.62
      const padX = Math.max(24, W * 0.06)
      const topY = Math.max(60, H * 0.10)
      const bottomY = H * 0.78 // leave room for dial
      const cols = Math.floor((W - padX * 2) / colW)
      const rows = Math.floor((bottomY - topY) / lineH)

      // Find closest station & readability (0 = pure noise, 1 = full signal)
      const f = freqRef.current
      let closest: { f: number; phrase: string } = STATIONS[0]
      let minDist = Infinity
      for (const s of STATIONS) {
        const d = Math.abs(s.f - f)
        if (d < minDist) { minDist = d; closest = s }
      }
      // Readable within a band of ±0.035
      const clarity = Math.max(0, 1 - minDist / 0.055)

      // Place the phrase on the middle row, centered, when clarity > 0
      const phrase = closest.phrase
      const midRow = Math.floor(rows / 2)
      const phraseStartCol = Math.max(0, Math.floor((cols - phrase.length) / 2))

      // Noise re-seeds slowly — very subtle char drift
      const noiseSeed = Math.floor(now / 180)
      const rng = sRand(noiseSeed + 1000)

      ctx.font = `700 ${charSize}px "Courier Prime", "Courier New", monospace`
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Position
          const x = padX + c * colW
          const y = topY + r * lineH

          // Skip cells randomly for density < 100%
          if (rng() > 0.82) continue

          // Is this a phrase cell?
          const phraseCol = c - phraseStartCol
          const isPhraseCell = r === midRow && phraseCol >= 0 && phraseCol < phrase.length
          if (isPhraseCell && clarity > 0.05) {
            // Render the phrase character, clarity controls opacity
            const ch = phrase[phraseCol]
            if (ch === ' ') continue
            ctx.fillStyle = CREAM
            ctx.globalAlpha = clarity
            ctx.fillText(ch, x, y)
            ctx.globalAlpha = 1
            continue
          }

          // Otherwise noise
          // Distance to phrase row modulates visibility
          const rowDist = Math.abs(r - midRow)
          const noiseOpacity = 0.18 + rng() * 0.42 - rowDist * 0.02
          if (noiseOpacity < 0.1) continue
          const ch = NOISE_CHARS[Math.floor(rng() * NOISE_CHARS.length)]
          ctx.fillStyle = CREAM
          ctx.globalAlpha = Math.max(0, noiseOpacity * (1 - clarity * 0.4))
          ctx.fillText(ch, x, y)
          ctx.globalAlpha = 1
        }
      }

      // ── The dial ──
      const dialY = H * 0.88
      const dialX1 = padX
      const dialX2 = W - padX
      const dialLen = dialX2 - dialX1

      // Dial track
      ctx.strokeStyle = CREAM
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(dialX1, dialY)
      ctx.lineTo(dialX2, dialY)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Tick marks
      for (let i = 0; i <= 20; i++) {
        const tx = dialX1 + (i / 20) * dialLen
        const tickH = i % 5 === 0 ? 8 : 4
        ctx.strokeStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.moveTo(tx, dialY - tickH / 2)
        ctx.lineTo(tx, dialY + tickH / 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Station markers (cream hairlines below dial)
      for (const s of STATIONS) {
        const sx = dialX1 + s.f * dialLen
        ctx.strokeStyle = CREAM
        ctx.globalAlpha = 0.22
        ctx.beginPath()
        ctx.moveTo(sx, dialY + 4)
        ctx.lineTo(sx, dialY + 10)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Indicator — lime when locked on a station
      const indX = dialX1 + f * dialLen
      const locked = clarity > 0.6
      ctx.strokeStyle = locked ? LIME : CREAM
      ctx.lineWidth = locked ? 2 : 1.5
      ctx.beginPath()
      ctx.moveTo(indX, dialY - 18)
      ctx.lineTo(indX, dialY + 18)
      ctx.stroke()
      // Indicator caps
      ctx.fillStyle = locked ? LIME : CREAM
      ctx.fillRect(indX - 3, dialY - 22, 7, 4)
      ctx.fillRect(indX - 3, dialY + 18, 7, 4)

      // Glow when locked
      if (locked) {
        ctx.fillStyle = `rgba(198, 255, 60, ${(clarity - 0.6) * 0.6})`
        ctx.fillRect(indX - 18, dialY - 26, 36, 52)
      }

      // Frequency readout
      ctx.font = `700 11px "Courier Prime", "Courier New", monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.5)'
      ctx.textAlign = 'center'
      ctx.fillText(`${(80 + f * 20).toFixed(2)} MHz`, indX, dialY - 32)

      // Museum label — lower left
      const labelX = Math.max(20, Math.floor(W * 0.055))
      const labelY = Math.floor(H * 0.96)
      ctx.textAlign = 'left'
      ctx.fillStyle = CREAM
      const titleSize = Math.min(34, W * 0.055)
      ctx.font = `300 italic ${titleSize}px "Fraunces", Georgia, serif`
      ctx.fillText('tuning', labelX, labelY - titleSize)
      ctx.fillStyle = 'rgba(232, 232, 232, 0.55)'
      const subSize = Math.min(11, W * 0.022)
      ctx.font = `700 ${subSize}px "Courier Prime", "Courier New", monospace`
      ctx.fillText('drag the dial. most of it is noise.', labelX, labelY - titleSize + titleSize * 0.5 + 8)

      // Bottom right spec
      ctx.fillStyle = 'rgba(232, 232, 232, 0.3)'
      ctx.font = `700 10px "Courier Prime", "Courier New", monospace`
      ctx.textAlign = 'right'
      ctx.fillText('signal · spec 002 · 04.15.26', W - labelX, H - 14)

      raf = requestAnimationFrame(draw)
    }

    function setFreqFromX(clientX: number) {
      const padX = Math.max(24, W * 0.06)
      const t = Math.max(0, Math.min(1, (clientX - padX) / (W - padX * 2)))
      freqRef.current = t
    }

    canvas.addEventListener('pointerdown', (e) => {
      draggingRef.current = true
      setFreqFromX(e.clientX)
    })
    window.addEventListener('pointermove', (e) => {
      if (draggingRef.current) setFreqFromX(e.clientX)
    })
    window.addEventListener('pointerup', () => { draggingRef.current = false })

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100dvh',
        cursor: 'pointer', touchAction: 'none',
      }} />
    </>
  )
}
