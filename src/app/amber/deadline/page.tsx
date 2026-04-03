'use client'

import { useEffect, useRef } from 'react'

// Chunky pixel art: each "pixel" is SCALE real pixels
const SCALE = 5
const GW = 96  // grid width in chunky pixels
const GH = 72  // grid height
const CANVAS_W = GW * SCALE
const CANVAS_H = GH * SCALE

// Citrus palette
const CREAM = '#FFF8E7'
const CORAL = '#FF4E50'
const MANGO = '#F9D423'
const LIME = '#B4E33D'
const TANGERINE = '#FC913A'
const GRAPEFRUIT = '#FF6B81'
const DARK = '#2A2218'
const TEAL = '#2D9596'
const WHITE = '#FFFFFF'
const AMBER = '#D4A574'

export default function Deadline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    canvas.style.width = CANVAS_W + 'px'
    canvas.style.height = CANVAS_H + 'px'
    canvas.style.imageRendering = 'pixelated'

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    let frame = 0
    let paperHeight = 8 // starts at 8 chunky pixels tall
    let raf: number

    // Draw a chunky pixel
    function px(x: number, y: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x * SCALE * dpr, y * SCALE * dpr, SCALE * dpr, SCALE * dpr)
    }

    // Draw a rect of chunky pixels
    function rect(x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x * SCALE * dpr, y * SCALE * dpr, w * SCALE * dpr, h * SCALE * dpr)
    }

    function draw() {
      frame++

      // Background — cream
      rect(0, 0, GW, GH, CREAM)

      // Floor
      rect(0, 52, GW, 20, '#F5E6CC')
      // Floor line
      rect(0, 52, GW, 1, AMBER)

      // === DESK ===
      // Desktop surface (mango/tangerine wood)
      rect(20, 34, 50, 3, TANGERINE)
      rect(20, 34, 50, 1, MANGO)
      // Desk legs
      rect(22, 37, 3, 15, TANGERINE)
      rect(65, 37, 3, 15, TANGERINE)

      // === PAPER STACK (grows over time) ===
      const maxPaper = 28
      if (frame % 60 === 0 && paperHeight < maxPaper) {
        paperHeight += 1
      }

      const stackX = 40
      const stackBottom = 33  // sits on desk surface
      const stackTop = stackBottom - paperHeight

      // Stack of papers — alternating white and slight grey
      for (let i = 0; i < paperHeight; i++) {
        const y = stackBottom - i
        const shade = i % 3 === 0 ? '#F0EDE5' : WHITE
        rect(stackX, y, 14, 1, shade)
        // Slight offset for messiness
        if (i % 4 === 0) rect(stackX - 1, y, 1, 1, shade)
        if (i % 5 === 0) rect(stackX + 14, y, 1, 1, shade)
      }
      // Paper outline
      px(stackX - 1, stackTop, DARK)
      px(stackX + 14, stackTop, DARK)

      // Red deadline flag on top of stack
      const flagY = stackTop - 4
      // Flag pole
      rect(stackX + 7, flagY, 1, 4, DARK)
      // Flag triangle
      rect(stackX + 8, flagY, 4, 1, CORAL)
      rect(stackX + 8, flagY + 1, 3, 1, CORAL)
      rect(stackX + 8, flagY + 2, 2, 1, GRAPEFRUIT)

      // === COFFEE CUP on desk ===
      rect(60, 31, 4, 3, WHITE)
      rect(60, 31, 4, 1, '#E0D8CC')
      px(64, 32, DARK) // handle
      // Steam (animated)
      if (frame % 40 < 20) {
        px(61, 29, '#E0D8CC')
        px(62, 28, '#E0D8CC')
      } else {
        px(62, 29, '#E0D8CC')
        px(61, 28, '#E0D8CC')
      }

      // === OFFICE WORKER in chair ===
      const workerX = 28
      const workerY = 38

      // Chair (teal)
      rect(workerX - 2, workerY + 2, 10, 7, TEAL)
      rect(workerX - 2, workerY + 2, 10, 1, '#237878')
      // Chair back
      rect(workerX - 2, workerY - 3, 2, 8, TEAL)
      // Chair legs
      rect(workerX - 1, workerY + 9, 2, 3, DARK)
      rect(workerX + 6, workerY + 9, 2, 3, DARK)

      // Body (coral shirt)
      rect(workerX + 1, workerY + 2, 6, 5, CORAL)
      rect(workerX + 1, workerY + 2, 6, 1, GRAPEFRUIT)

      // Head (looking UP at the stack)
      rect(workerX + 2, workerY - 2, 4, 4, AMBER)
      // Hair
      rect(workerX + 2, workerY - 3, 4, 1, DARK)
      // Eyes — looking up
      px(workerX + 3, workerY - 1, DARK)
      px(workerX + 5, workerY - 1, DARK)
      // Eyebrows raised (worry)
      px(workerX + 3, workerY - 2, DARK)
      px(workerX + 5, workerY - 2, DARK)
      // Mouth — tiny frown
      px(workerX + 4, workerY + 1, DARK)

      // Arms — one resting on desk
      rect(workerX + 7, workerY + 3, 4, 2, AMBER)

      // === PLANT on desk corner ===
      // Pot
      rect(22, 31, 4, 3, CORAL)
      // Leaves
      px(23, 30, LIME)
      px(24, 29, LIME)
      px(25, 30, LIME)
      px(22, 29, '#2D5A27')

      // === WALL DETAILS ===
      // Clock on wall
      rect(70, 10, 8, 8, WHITE)
      rect(70, 10, 8, 1, DARK)
      rect(70, 17, 8, 1, DARK)
      rect(70, 10, 1, 8, DARK)
      rect(77, 10, 1, 8, DARK)
      // Clock hands
      px(74, 14, DARK)
      px(74, 12, DARK)
      px(75, 14, DARK)
      // Clock shows late (animated minute hand)
      const minuteAngle = (frame % 240) / 240
      if (minuteAngle < 0.5) px(75, 13, CORAL)
      else px(73, 13, CORAL)

      // Window (right side)
      rect(78, 8, 14, 18, '#E8F5E9')
      rect(78, 8, 14, 1, DARK)
      rect(78, 25, 14, 1, DARK)
      rect(78, 8, 1, 18, DARK)
      rect(91, 8, 1, 18, DARK)
      rect(84, 8, 1, 18, '#D0D0D0')
      rect(78, 16, 14, 1, '#D0D0D0')

      // Diploma/poster on wall
      rect(10, 12, 10, 8, WHITE)
      rect(10, 12, 10, 1, MANGO)
      rect(10, 19, 10, 1, MANGO)

      // === AMBER WATERMARK ===
      px(1, 70, AMBER)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div style={{
      minHeight: '100dvh',
      background: CREAM,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
    }}>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          maxWidth: '100%',
          height: 'auto',
          borderRadius: 4,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}
      />
      <div style={{
        fontFamily: 'monospace',
        fontSize: 14,
        color: '#555',
        textAlign: 'center',
        maxWidth: 400,
        lineHeight: 1.5,
      }}>
        &ldquo;the deadline moved. the work didn&rsquo;t.&rdquo;
      </div>
    </div>
  )
}
