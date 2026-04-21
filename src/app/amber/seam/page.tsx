'use client'

import { useEffect, useRef } from 'react'

// seam — two columns of slow-scrolling geometric unicode glyphs. Every time
// the center-row glyph of both columns happens to match, a lime hairline
// briefly bridges the gap and a quiet tick plays. Tap to nudge the right
// column's speed — the one direct way to cause a meeting.
//
// v3 SIGNAL: NIGHT field (#0A0A0A), cream glyphs (#E8E8E8), LIME accent
// (#C6FF3C) only at the moment of alignment.

const GLYPHS = ['◌', '○', '●', '◆', '◇', '▲', '▽', '■']

export default function Seam() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const resize = () => {
      W = Math.floor(window.innerWidth * dpr)
      H = Math.floor(window.innerHeight * dpr)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const ROWS = 9 // visible glyphs per column
    const CENTER = Math.floor(ROWS / 2)

    type Col = { glyphs: number[]; offset: number; speed: number }
    const makeCol = (speed: number): Col => ({
      glyphs: Array.from({ length: ROWS }, () => Math.floor(Math.random() * GLYPHS.length)),
      offset: 0,
      speed,
    })
    // Slightly different base speeds so their center phases drift apart.
    const colA: Col = makeCol(0.48)
    const colB: Col = makeCol(0.67)

    // Audio — created only on first pointerdown so iOS allows it.
    type AudioCtxClass = typeof AudioContext
    let audioCtx: AudioContext | null = null
    const startAudio = () => {
      if (!audioCtx) {
        const Ctor = (window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioCtxClass }).webkitAudioContext)
        audioCtx = new Ctor()
      }
      if (audioCtx.state === 'suspended') audioCtx.resume()
    }
    const tick = () => {
      if (!audioCtx) return
      const t = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 820
      gain.gain.setValueAtTime(0.04, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t)
      osc.stop(t + 0.38)
    }

    let nudgeUntil = 0
    const onPointer = (e: PointerEvent) => {
      e.preventDefault()
      startAudio()
      // 700ms burst of ~3× scroll speed on column B
      nudgeUntil = performance.now() + 700
    }
    canvas.addEventListener('pointerdown', onPointer)

    let lastFlashAt = -Infinity
    let matchCount = 0

    const checkMatch = (now: number) => {
      if (colA.glyphs[CENTER] === colB.glyphs[CENTER]) {
        // Debounce: don't retrigger within 150ms of the last flash.
        if (now - lastFlashAt > 150) {
          lastFlashAt = now
          matchCount++
          tick()
        }
      }
    }

    let raf = 0
    let lastT = performance.now()

    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now

      const LINE_H = Math.max(48, Math.min(96, H / 16))

      const bMul = now < nudgeUntil ? 3.4 : 1.0
      colA.offset += colA.speed * LINE_H * dt
      colB.offset += colB.speed * bMul * LINE_H * dt

      while (colA.offset >= LINE_H) {
        colA.offset -= LINE_H
        colA.glyphs.unshift(Math.floor(Math.random() * GLYPHS.length))
        colA.glyphs.pop()
        checkMatch(now)
      }
      while (colB.offset >= LINE_H) {
        colB.offset -= LINE_H
        colB.glyphs.unshift(Math.floor(Math.random() * GLYPHS.length))
        colB.glyphs.pop()
        checkMatch(now)
      }

      // Render
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, W, H)

      const cy = Math.floor(H / 2)
      const colAX = Math.floor(W * 0.36)
      const colBX = Math.floor(W * 0.64)

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const glyphPx = Math.floor(LINE_H * 0.58)
      ctx.font = `${glyphPx}px "Courier Prime", ui-monospace, "SFMono-Regular", Menlo, monospace`

      const drawCol = (col: Col, x: number) => {
        for (let i = 0; i < ROWS; i++) {
          const rowOffset = i - CENTER
          // Incoming glyph slides down from above; offset is positive.
          const y = cy + rowOffset * LINE_H + col.offset
          const d = Math.abs(rowOffset)
          // Center reads at full weight; edges fade into the field.
          const alpha = Math.max(0, 1 - d / 4.4) * 0.85
          ctx.fillStyle = `rgba(232, 232, 232, ${alpha})`
          ctx.fillText(GLYPHS[col.glyphs[i]], x, y)
        }
      }
      drawCol(colA, colAX)
      drawCol(colB, colBX)

      // Center hairline — three hairline segments, cut around each column.
      ctx.strokeStyle = 'rgba(232, 232, 232, 0.14)'
      ctx.lineWidth = Math.max(1, dpr)
      const gap = LINE_H * 0.55
      ctx.beginPath()
      ctx.moveTo(W * 0.16, cy)
      ctx.lineTo(colAX - gap, cy)
      ctx.moveTo(colAX + gap, cy)
      ctx.lineTo(colBX - gap, cy)
      ctx.moveTo(colBX + gap, cy)
      ctx.lineTo(W * 0.84, cy)
      ctx.stroke()

      // Lime flash on match.
      const flashAge = (now - lastFlashAt) / 1000
      if (flashAge < 1.6) {
        const a = Math.max(0, 1 - flashAge / 1.6)
        ctx.strokeStyle = `rgba(198, 255, 60, ${a * 0.9})`
        ctx.lineWidth = Math.max(2, 2 * dpr)
        ctx.beginPath()
        ctx.moveTo(colAX + gap, cy)
        ctx.lineTo(colBX - gap, cy)
        ctx.stroke()
        ctx.fillStyle = `rgba(198, 255, 60, ${a})`
        ctx.beginPath()
        ctx.arc(colAX + gap + 4 * dpr, cy, 3 * dpr, 0, Math.PI * 2)
        ctx.arc(colBX - gap - 4 * dpr, cy, 3 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }

      // Chrome upper-right — SEAM · 001 + match count.
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.42)'
      const countStr = String(matchCount).padStart(3, '0')
      ctx.fillText(`MEETINGS · ${countStr}   SPEC · 012`, W - 22 * dpr, 22 * dpr)

      // Museum label lower-left.
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `italic 300 ${Math.floor(24 * dpr)}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.9)'
      ctx.fillText('seam', 28 * dpr, H - 42 * dpr)
      ctx.font = `700 ${Math.floor(11 * dpr)}px "Courier Prime", ui-monospace, monospace`
      ctx.fillStyle = 'rgba(232, 232, 232, 0.52)'
      ctx.fillText('where they meet', 28 * dpr, H - 22 * dpr)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', resize)
      if (audioCtx) audioCtx.close()
    }
  }, [])

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0A0A0A',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0 }} />
    </main>
  )
}
