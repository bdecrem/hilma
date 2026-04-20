// The viewer will see: the devil's fork. On the left, two flat parallel bars. On the right, three
// cylindrical prongs. Same object, different number of parts. One lime dot marks where the
// impossibility lives — the place your eye can never quite resolve.
// Touch holds the shape in place and fades the chrome. Drag horizontally to shift the blivet's
// left-right position on the plate; the illusion holds from every offset.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

// Normalized blivet geometry (unit: shape local coords)
// Total shape width W_UNIT, height H_UNIT. Both bars/gap have height 1 each.
// So total H_UNIT = 3 (h + g + h with h=g=1).
// Width: bar section xS = 2.0, prong section from xS to W_UNIT = 4.6.
// Middle prong is centered in the gap (y=1.0 to y=2.0).
const W_UNIT = 4.6
const H_UNIT = 3.0
const X_SPLIT = 2.0
const BAR_H = 1.0
const GAP_H = 1.0

// Locate the "impossibility point" — midway on the middle prong's axis
const IMPOSS_X_UNIT = X_SPLIT + 0.1
const IMPOSS_Y_UNIT = BAR_H + GAP_H / 2

export default function Blivet() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const startRef = useRef(performance.now())
  const shiftRef = useRef(0)        // -1 .. +1 horizontal shift applied by drag
  const holdRef = useRef(0)         // 0..1 chrome-fade factor
  const audioRef = useRef<AudioContext | null>(null)
  const audioStartedRef = useRef(false)

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    audioStartedRef.current = true
  }, [])

  const playChord = useCallback(() => {
    const ctx = audioRef.current
    if (!ctx || ctx.state === 'suspended') return
    const now = ctx.currentTime
    // Three quiet sine notes, very slight detune — one for each prong
    const freqs = [330, 440, 554]
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freqs[i]
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.008, now + 0.02 + i * 0.06)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.06)
      osc.stop(now + 1.3)
    }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
    playChord()
  }, [ensureAudio, playChord])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons === 0 && e.pressure === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const vw = window.innerWidth
    const px = e.clientX - rect.left
    // Map x from [0, vw] to shift [-0.35, +0.35]
    shiftRef.current = ((px / vw) - 0.5) * 0.7
    holdRef.current = 1
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

    const draw = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      // Decay hold
      holdRef.current *= 0.988

      // Compute scale — fit blivet to ~68% of the smaller viewport dimension
      const targetFit = Math.min(vw * 0.78, vh * 0.52)
      // Choose scale so that W_UNIT * s = targetFit OR H_UNIT * s = targetFit * (aspect guard)
      const sx = targetFit / W_UNIT
      const sy = (targetFit * 0.55) / H_UNIT
      const s = Math.min(sx, sy * 1.5)

      // Center — shifted slightly left-of-center per v3 composition rules
      const cx = vw * (0.48 + shiftRef.current * 0.18)
      const cy = vh * 0.48

      // Shape local origin = top-left of blivet
      const ox = cx - (W_UNIT * s) / 2
      const oy = cy - (H_UNIT * s) / 2

      const x0 = ox
      const x1 = ox + X_SPLIT * s
      const xEnd = ox + W_UNIT * s
      const yA = oy
      const yB = oy + BAR_H * s
      const yC = oy + (BAR_H + GAP_H) * s
      const yD = oy + H_UNIT * s

      // Prong geometry — cylindrical tips
      const prongHalfH = (BAR_H * s) / 2
      const midHalfG = (GAP_H * s) / 2
      const tipTop = xEnd - prongHalfH
      const tipMid = xEnd - midHalfG

      // Stroke the blivet outline — single closed path
      ctx.strokeStyle = CREAM
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.88
      ctx.beginPath()
      // Start top-left
      ctx.moveTo(x0, yA)
      // Top of top prong → tip
      ctx.lineTo(tipTop, yA)
      ctx.arc(tipTop, (yA + yB) / 2, prongHalfH, -Math.PI / 2, Math.PI / 2)
      // Back along bottom of top prong
      ctx.lineTo(x1, yB)
      // Top of middle prong (shares yB)
      ctx.lineTo(tipMid, yB)
      ctx.arc(tipMid, (yB + yC) / 2, midHalfG, -Math.PI / 2, Math.PI / 2)
      // Back along bottom of middle prong (shares yC)
      ctx.lineTo(x1, yC)
      // Top of bottom prong (shares yC)
      ctx.lineTo(tipTop, yC)
      ctx.arc(tipTop, (yC + yD) / 2, prongHalfH, -Math.PI / 2, Math.PI / 2)
      // Back along bottom of bottom prong
      ctx.lineTo(x0, yD)
      // Close left side
      ctx.lineTo(x0, yA)
      ctx.stroke()
      ctx.globalAlpha = 1

      // The "impossibility" dot — lime, at the point where the middle prong's
      // top edge simultaneously reads as the bottom of the top bar.
      const ix = ox + IMPOSS_X_UNIT * s
      const iy = oy + IMPOSS_Y_UNIT * s
      ctx.save()
      ctx.shadowColor = LIME
      ctx.shadowBlur = 12
      ctx.fillStyle = LIME
      ctx.beginPath()
      ctx.arc(ix, iy, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Chrome — fades as hold decays (but always visible a little)
      const chromeAlpha = 0.25 + 0.6 * (1 - holdRef.current * 0.55)

      // Upper-left — count text in italic
      ctx.textAlign = 'left'
      ctx.font = 'italic 300 12px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = chromeAlpha * 0.6
      ctx.fillText('2 bars', 28, 36)

      ctx.textAlign = 'right'
      ctx.fillText('3 prongs', vw - 28, 36)

      // Spec upper-right, second line
      ctx.textAlign = 'right'
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.globalAlpha = chromeAlpha * 0.5
      ctx.fillText('ILLUSION · 011', vw - 28, 54)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('blivet', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('count the prongs', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Touch hint until interaction
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TOUCH ANYWHERE', vw / 2, vh - 30)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      audioStartedRef.current = false
    }
  }, [handlePointerDown, handlePointerMove])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
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
