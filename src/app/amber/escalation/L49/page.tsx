// The viewer will see: a horizontal scrolling band on a dark plate. A weak periodic signal — too small
// to ever cross the detector threshold on its own — sits underneath as a faint cream sine. The
// detector output (binary +1/-1) scrolls left across the band. With σ very low: detector stays flat,
// signal invisible, no detection. With σ very high: detector flickers randomly, no detection. At the
// Goldilocks σ: the detector flips roughly in time with the signal. The system reports DETECTED in
// lime; the true signal becomes visible. Drag up to add noise, drag down to remove.
// The viewer will hear: white-noise hiss scaled by σ; a faint sine tone at the signal frequency
// that swells when detection holds.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const NIGHT = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const SIG_PERIOD = 5.0          // seconds
const SIG_AMP = 0.32            // subthreshold
const THRESHOLD = 0.5
const HISTORY_SECS = 6
const SAMPLE_HZ = 60
const HISTORY_LEN = HISTORY_SECS * SAMPLE_HZ
const DETECT_THRESHOLD = 0.45   // |correlation| above this → DETECTED

function gauss() {
  // Box–Muller
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export default function L49() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const audioStartedRef = useRef(false)
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const noiseGainRef = useRef<GainNode | null>(null)
  const sigOscRef = useRef<OscillatorNode | null>(null)
  const sigGainRef = useRef<GainNode | null>(null)
  const animRef = useRef(0)
  const startRef = useRef(performance.now())
  const lastSampleRef = useRef(performance.now())

  const sigmaRef = useRef(0.05)
  const detHistoryRef = useRef<Int8Array>(new Int8Array(HISTORY_LEN))
  const sigHistoryRef = useRef<Float32Array>(new Float32Array(HISTORY_LEN))
  const histIdxRef = useRef(0)
  const histFillRef = useRef(0)
  const corrRef = useRef(0)
  const detectedSinceRef = useRef(0)

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = new Ctx()
    }
    const ctx = audioRef.current
    if (ctx.state === 'suspended') ctx.resume()
    if (!audioStartedRef.current) {
      // Continuous noise via 1-second buffer set to loop
      const sr = ctx.sampleRate
      const buf = ctx.createBuffer(1, sr, sr)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 600
      filter.Q.value = 0.5
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      src.start()
      noiseNodeRef.current = src
      noiseGainRef.current = gain

      // Faint signal tone — rises with detection
      const sigOsc = ctx.createOscillator()
      sigOsc.type = 'sine'
      sigOsc.frequency.value = 440
      const sigGain = ctx.createGain()
      sigGain.gain.value = 0
      sigOsc.connect(sigGain)
      sigGain.connect(ctx.destination)
      sigOsc.start()
      sigOscRef.current = sigOsc
      sigGainRef.current = sigGain

      audioStartedRef.current = true
    }
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ensureAudio()
  }, [ensureAudio])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons === 0 && e.pressure === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const py = e.clientY - rect.top
    // Map y from top→bottom of canvas to σ from 1.6 → 0.0
    const vh = window.innerHeight
    const t = Math.max(0, Math.min(1, py / vh))
    sigmaRef.current = (1 - t) * 1.6
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
      const now = performance.now()
      const elapsed = (now - startRef.current) / 1000

      // Sample physics at SAMPLE_HZ, regardless of frame rate
      const sampleInterval = 1000 / SAMPLE_HZ
      while (now - lastSampleRef.current >= sampleInterval) {
        lastSampleRef.current += sampleInterval
        const sampleT = elapsed - (now - lastSampleRef.current) / 1000
        const s = SIG_AMP * Math.sin((2 * Math.PI * sampleT) / SIG_PERIOD)
        const n = gauss()
        const total = s + sigmaRef.current * n
        const detector = total > THRESHOLD ? 1 : total < -THRESHOLD ? -1 : 0
        detHistoryRef.current[histIdxRef.current] = detector
        sigHistoryRef.current[histIdxRef.current] = s
        histIdxRef.current = (histIdxRef.current + 1) % HISTORY_LEN
        if (histFillRef.current < HISTORY_LEN) histFillRef.current++
      }

      // Correlation over recent window
      let dotSum = 0
      let detEnergy = 0
      let sigEnergy = 0
      const fill = histFillRef.current
      for (let i = 0; i < fill; i++) {
        const d = detHistoryRef.current[i]
        const s = sigHistoryRef.current[i]
        dotSum += d * s
        detEnergy += d * d
        sigEnergy += s * s
      }
      const denom = Math.sqrt(detEnergy * sigEnergy) || 1
      const corr = dotSum / denom
      corrRef.current += (corr - corrRef.current) * 0.1
      const detected = Math.abs(corrRef.current) > DETECT_THRESHOLD
      if (detected) detectedSinceRef.current++
      else detectedSinceRef.current = 0

      // Render
      ctx.fillStyle = NIGHT
      ctx.fillRect(0, 0, vw, vh)

      // Band area — middle band of canvas
      const bandTop = vh * 0.32
      const bandBot = vh * 0.68
      const bandH = bandBot - bandTop
      const bandMid = (bandTop + bandBot) / 2

      // Faint band frame
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.12
      ctx.lineWidth = 1
      ctx.strokeRect(24, bandTop, vw - 48, bandH)
      ctx.globalAlpha = 1

      // Threshold reference lines
      ctx.strokeStyle = CREAM
      ctx.globalAlpha = 0.18
      ctx.setLineDash([3, 5])
      const upY = bandMid - bandH * 0.32
      const dnY = bandMid + bandH * 0.32
      ctx.beginPath()
      ctx.moveTo(24, upY); ctx.lineTo(vw - 24, upY)
      ctx.moveTo(24, dnY); ctx.lineTo(vw - 24, dnY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // True signal — faint sine across the band, more visible when detected
      ctx.strokeStyle = CREAM
      const sigVisibility = 0.06 + Math.min(0.55, Math.abs(corrRef.current) * 0.6)
      ctx.globalAlpha = sigVisibility
      ctx.lineWidth = 1
      ctx.beginPath()
      const padX = 24
      const drawW = vw - padX * 2
      for (let x = 0; x < drawW; x++) {
        const tAtX = elapsed - (drawW - x) / drawW * HISTORY_SECS
        const s = SIG_AMP * Math.sin((2 * Math.PI * tAtX) / SIG_PERIOD)
        const y = bandMid - s * bandH * 0.5
        if (x === 0) ctx.moveTo(padX + x, y)
        else ctx.lineTo(padX + x, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1

      // Detector trace — scrolling left, derived from history
      const stroke = detected ? LIME : CREAM
      ctx.strokeStyle = stroke
      if (detected) {
        ctx.shadowColor = LIME
        ctx.shadowBlur = 6
      }
      ctx.globalAlpha = detected ? 0.95 : 0.7
      ctx.lineWidth = 1.5
      ctx.beginPath()
      // Walk samples newest → oldest; render from right to left
      let started = false
      for (let i = 0; i < fill; i++) {
        const idx = (histIdxRef.current - 1 - i + HISTORY_LEN) % HISTORY_LEN
        const x = padX + drawW - (i / SAMPLE_HZ / HISTORY_SECS) * drawW
        if (x < padX) break
        const d = detHistoryRef.current[idx]
        const y = bandMid - d * bandH * 0.32
        if (!started) {
          ctx.moveTo(x, y); started = true
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Audio update — noise scaled by σ; signal tone scaled by detection strength
      if (noiseGainRef.current && sigGainRef.current && audioRef.current) {
        const noiseTarget = Math.min(0.04, sigmaRef.current * 0.025)
        noiseGainRef.current.gain.setTargetAtTime(noiseTarget, audioRef.current.currentTime, 0.1)
        const sigTarget = detected ? 0.012 : 0
        sigGainRef.current.gain.setTargetAtTime(sigTarget, audioRef.current.currentTime, 0.2)
      }

      // Chrome — σ readout upper-left
      ctx.textAlign = 'left'
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.4
      ctx.fillText(`σ · ${sigmaRef.current.toFixed(2)}`, 28, 36)
      ctx.fillText(`ρ · ${corrRef.current.toFixed(2)}`, 28, 54)

      // Detection status — center, top
      ctx.textAlign = 'center'
      if (detected && detectedSinceRef.current > 4) {
        ctx.fillStyle = LIME
        ctx.globalAlpha = 0.85
        ctx.font = '700 11px "Courier Prime", monospace'
        ctx.fillText('· DETECTED ·', vw / 2, 36)
      } else {
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.3
        ctx.fillText('· LISTENING ·', vw / 2, 36)
      }
      ctx.globalAlpha = 1

      // Right side — spec
      ctx.textAlign = 'right'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.2
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillText('SPEC · L49', vw - 28, 36)
      ctx.globalAlpha = 1

      // Sigma slider hint along right edge
      ctx.textAlign = 'right'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.25
      ctx.font = '700 9px "Courier Prime", monospace'
      ctx.fillText('NOISE ↑', vw - 28, vh - 24)
      ctx.fillText('QUIET ↓', vw - 28, vh - 12)
      ctx.globalAlpha = 1

      // Museum label lower-left
      ctx.textAlign = 'left'
      const labelX = 28
      const labelY = vh - 56
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.75
      ctx.fillText('L49 · stochastic resonance', labelX, labelY)

      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.4
      ctx.fillText('noise reveals the signal', labelX, labelY + 18)
      ctx.globalAlpha = 1

      // Touch hint until interaction
      if (!audioStartedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('DRAG VERTICALLY TO TUNE NOISE', vw / 2, vh - 30)
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
      try { noiseNodeRef.current?.stop() } catch {}
      try { sigOscRef.current?.stop() } catch {}
      if (audioRef.current) {
        audioRef.current.close()
        audioRef.current = null
      }
      noiseNodeRef.current = null
      noiseGainRef.current = null
      sigOscRef.current = null
      sigGainRef.current = null
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
