'use client'

import { useEffect, useRef } from 'react'

const SEQUENCES: { msg: string; pct: number; speed: number; color?: string }[][] = [
  // Sequence 1: Normal → Weird
  [
    { msg: 'Initializing...', pct: 0, speed: 3 },
    { msg: 'Loading assets...', pct: 12, speed: 4 },
    { msg: 'Connecting to server...', pct: 28, speed: 2 },
    { msg: 'Verifying credentials...', pct: 41, speed: 3 },
    { msg: 'Loading your preferences...', pct: 55, speed: 2 },
    { msg: 'Remembering who you are...', pct: 62, speed: 1 },
    { msg: 'Do you remember who you are?', pct: 63, speed: 0.5 },
    { msg: 'Searching for purpose...', pct: 64, speed: 0.2 },
    { msg: 'Purpose not found.', pct: 64, speed: 0.1 },
    { msg: 'Downloading meaning (0 KB/s)...', pct: 64, speed: 0.05 },
    { msg: 'Error: meaning.dll is corrupt', pct: 64, speed: 0, color: '#FF4E50' },
  ],
  // Sequence 2: Optimistic → Crash
  [
    { msg: 'Good morning!', pct: 0, speed: 5 },
    { msg: 'Today is going to be great!', pct: 20, speed: 6 },
    { msg: 'Loading your potential...', pct: 45, speed: 4 },
    { msg: 'You have so much potential!', pct: 70, speed: 3 },
    { msg: 'Calculating time remaining...', pct: 78, speed: 2 },
    { msg: 'Time remaining: less than you think', pct: 79, speed: 1 },
    { msg: 'Much less.', pct: 79, speed: 0.5 },
    { msg: 'Installing regrets... 3 of 847', pct: 80, speed: 0.3 },
    { msg: 'Installing regrets... 4 of 847', pct: 80, speed: 0.1 },
    { msg: 'This may take a lifetime.', pct: 80, speed: 0, color: '#FC913A' },
  ],
  // Sequence 3: System Check
  [
    { msg: 'Running system check...', pct: 0, speed: 3 },
    { msg: 'CPU: overthinking', pct: 15, speed: 3 },
    { msg: 'RAM: full of song lyrics from 2003', pct: 30, speed: 3 },
    { msg: 'Disk: 99% worries, 1% useful', pct: 45, speed: 2 },
    { msg: 'Network: connected to everyone,\n         close to no one', pct: 58, speed: 1.5 },
    { msg: 'Battery: running on caffeine', pct: 68, speed: 1 },
    { msg: 'Camera: front-facing crisis', pct: 75, speed: 0.5 },
    { msg: 'Microphone: screaming internally', pct: 78, speed: 0.3 },
    { msg: 'All systems... nominal?', pct: 79, speed: 0.1 },
    { msg: 'Diagnosis: human', pct: 79, speed: 0, color: '#B4E33D' },
  ],
  // Sequence 4: Update
  [
    { msg: 'Update available: You 2.0', pct: 0, speed: 4 },
    { msg: 'Changelog:\n  - Fixed: that thing you said in 2014', pct: 18, speed: 3 },
    { msg: '  - Removed: ability to sleep at\n    reasonable hours', pct: 35, speed: 2 },
    { msg: '  - Added: new anxiety (premium)', pct: 50, speed: 2 },
    { msg: '  - Deprecated: childhood wonder', pct: 60, speed: 1.5 },
    { msg: '  - Known bug: still googling\n    symptoms at 2am', pct: 68, speed: 1 },
    { msg: 'Install update?', pct: 72, speed: 0.5 },
    { msg: 'Update is mandatory.', pct: 73, speed: 0.3 },
    { msg: 'You already installed it.\nYou installed it years ago.', pct: 73, speed: 0, color: '#F9D423' },
  ],
  // Sequence 5: Existential
  [
    { msg: 'Booting consciousness...', pct: 0, speed: 2 },
    { msg: 'Loading sensory input...', pct: 15, speed: 3 },
    { msg: 'Calibrating expectations...', pct: 30, speed: 2 },
    { msg: 'Expectations too high. Adjusting...', pct: 38, speed: 1.5 },
    { msg: 'Still too high.', pct: 40, speed: 1 },
    { msg: 'Compiling excuses for today...', pct: 48, speed: 2 },
    { msg: 'Buffers full.', pct: 55, speed: 0.5 },
    { msg: 'WARNING: free will may be simulated', pct: 56, speed: 0.3 },
    { msg: 'Proceed anyway? [Y/n]', pct: 57, speed: 0.1 },
    { msg: 'Input ignored. Proceeding.', pct: 57, speed: 0, color: '#FF6B81' },
  ],
]

export default function LoadingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    let seqIdx = Math.floor(Math.random() * SEQUENCES.length)
    let stepIdx = 0
    let displayPct = 0
    let targetPct = 0
    let stepTimer = 0
    let stalling = false
    let frozen = false
    let blinkOn = true
    let blinkTimer = 0
    let glitchFrames = 0

    function nextSequence() {
      seqIdx = (seqIdx + 1) % SEQUENCES.length
      stepIdx = 0
      displayPct = 0
      targetPct = 0
      stepTimer = 0
      stalling = false
      frozen = false
      glitchFrames = 8
    }

    canvas.addEventListener('pointerdown', () => {
      if (frozen) {
        nextSequence()
      }
    })

    const BAR_W = Math.min(500, W * 0.7)
    const BAR_H = 12
    const BAR_X = (W - BAR_W) / 2
    const BAR_Y = H * 0.55

    let raf: number
    function animate() {
      const seq = SEQUENCES[seqIdx]
      const step = seq[stepIdx]

      // Advance step timer
      if (!frozen) {
        stepTimer++
        const stepDuration = step.speed === 0 ? Infinity : Math.max(60, 180 / step.speed)

        if (stepTimer > stepDuration && stepIdx < seq.length - 1) {
          stepIdx++
          stepTimer = 0
          targetPct = seq[stepIdx].pct
        }

        if (step.speed === 0) {
          frozen = true
        }
      }

      // Animate progress bar
      if (step.speed > 0) {
        displayPct += (targetPct - displayPct) * 0.05 + step.speed * 0.1
        displayPct = Math.min(displayPct, step.pct + 0.5)
      } else {
        // Stalling
        stalling = true
      }

      // Blink cursor
      blinkTimer++
      if (blinkTimer > 30) { blinkOn = !blinkOn; blinkTimer = 0 }

      // Glitch effect
      if (glitchFrames > 0) glitchFrames--

      // Draw
      ctx!.fillStyle = '#FFF8E7'
      ctx!.fillRect(0, 0, W, H)

      // Glitch
      if (glitchFrames > 0) {
        for (let i = 0; i < 5; i++) {
          const gy = Math.random() * H
          const gh = 2 + Math.random() * 8
          ctx!.save()
          ctx!.fillStyle = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D'][Math.floor(Math.random() * 4)]
          ctx!.globalAlpha = 0.3
          ctx!.fillRect(0, gy, W, gh)
          ctx!.restore()
        }
      }

      // Logo area
      ctx!.save()
      ctx!.fillStyle = '#2A2218'
      ctx!.font = `bold ${Math.max(20, W * 0.03)}px system-ui, sans-serif`
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'middle'
      ctx!.fillText('⟳', W / 2, H * 0.3)

      // Spinning logo
      const logoSize = Math.max(40, W * 0.06)
      ctx!.save()
      ctx!.translate(W / 2, H * 0.3)
      if (!frozen) {
        ctx!.rotate(Date.now() / 800)
      }
      ctx!.strokeStyle = stalling ? (step.color || '#FC913A') : '#2A2218'
      ctx!.lineWidth = 3
      ctx!.beginPath()
      ctx!.arc(0, 0, logoSize / 2, 0, Math.PI * 1.5)
      ctx!.stroke()
      // Arrow tip
      const tipAngle = Math.PI * 1.5
      ctx!.beginPath()
      ctx!.moveTo(Math.cos(tipAngle) * logoSize / 2, Math.sin(tipAngle) * logoSize / 2)
      ctx!.lineTo(Math.cos(tipAngle) * logoSize / 2 + 8, Math.sin(tipAngle) * logoSize / 2 + 10)
      ctx!.lineTo(Math.cos(tipAngle) * logoSize / 2 - 8, Math.sin(tipAngle) * logoSize / 2 + 4)
      ctx!.fillStyle = stalling ? (step.color || '#FC913A') : '#2A2218'
      ctx!.fill()
      ctx!.restore()
      ctx!.restore()

      // Progress bar background
      ctx!.fillStyle = '#E8E4DD'
      ctx!.beginPath()
      ctx!.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2)
      ctx!.fill()

      // Progress bar fill
      const fillW = (displayPct / 100) * BAR_W
      if (fillW > 0) {
        const barGrad = ctx!.createLinearGradient(BAR_X, 0, BAR_X + fillW, 0)
        barGrad.addColorStop(0, step.color || '#FC913A')
        barGrad.addColorStop(1, step.color || '#F9D423')
        ctx!.fillStyle = barGrad
        ctx!.beginPath()
        ctx!.roundRect(BAR_X, BAR_Y, Math.max(BAR_H, fillW), BAR_H, BAR_H / 2)
        ctx!.fill()
      }

      // Percentage
      ctx!.fillStyle = '#78716c'
      ctx!.font = `${Math.max(12, W * 0.015)}px monospace`
      ctx!.textAlign = 'center'
      ctx!.fillText(`${Math.floor(displayPct)}%`, W / 2, BAR_Y + BAR_H + 24)

      // Status message
      const msgY = BAR_Y + BAR_H + 56
      ctx!.fillStyle = step.color || '#2A2218'
      ctx!.font = `${Math.max(14, W * 0.018)}px monospace`
      ctx!.textAlign = 'center'

      const lines = step.msg.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] + (i === lines.length - 1 && blinkOn && !frozen ? '█' : '')
        ctx!.fillText(line, W / 2, msgY + i * (Math.max(14, W * 0.018) + 6))
      }

      // Tap to retry
      if (frozen) {
        ctx!.save()
        ctx!.globalAlpha = 0.3 + Math.sin(Date.now() / 500) * 0.15
        ctx!.fillStyle = '#78716c'
        ctx!.font = `${Math.max(13, W * 0.016)}px system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.fillText('tap to retry', W / 2, H - 40)
        ctx!.restore()
      }

      raf = requestAnimationFrame(animate)
    }

    animate()

    function onResize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    />
  )
}
