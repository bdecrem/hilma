'use client'

import { useEffect, useRef } from 'react'

// BENCH — two robots on a park bench. awkward silence.
// "i was trained on your data."

const PX = 5
const W = 240
const H = 180

const CREAM = '#FFF8E7'
const OUTLINE = '#2A2218'
const CORAL = '#FF6B6B'
const MANGO = '#FC913A'
const LIME = '#B4E33D'
const PEACH = '#FFDAB9'
const TEAL = '#5BC0BE'
const SKY = '#FFF0D4'
const BROWN = '#8B6914'
const GRAY = '#9CA3AF'
const LGRAY = '#D1D5DB'

export default function Bench() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    c.width = W * PX
    c.height = H * PX
    ctx.imageSmoothingEnabled = false
    let frame = 0

    function px(x: number, y: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x * PX, y * PX, PX, PX)
    }

    function rect(x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x * PX, y * PX, w * PX, h * PX)
    }

    function outline(x: number, y: number, w: number, h: number) {
      rect(x, y, w, h, OUTLINE)
    }

    function draw() {
      frame++
      // Sky
      rect(0, 0, W, 100, SKY)
      // Ground
      rect(0, 100, W, 80, PEACH)
      // Grass tufts
      for (let i = 10; i < W; i += 15) {
        const sway = Math.sin(frame * 0.03 + i) > 0.5 ? 1 : 0
        px(i + sway, 99, LIME)
        px(i + 1, 98, LIME)
        px(i + 2 + sway, 99, LIME)
      }

      // Park bench
      outline(60, 95, 120, 2) // seat top
      rect(61, 95, 118, 1, BROWN)
      outline(60, 97, 120, 1) // seat bottom
      rect(61, 97, 118, 1, '#A0782C')
      // Bench back
      outline(60, 82, 120, 2)
      rect(61, 82, 118, 1, BROWN)
      outline(60, 85, 120, 2)
      rect(61, 85, 118, 1, '#A0782C')
      // Bench legs
      rect(65, 98, 2, 12, OUTLINE)
      rect(175, 98, 2, 12, OUTLINE)

      // Robot A (left) — boxy, coral
      const bobA = Math.sin(frame * 0.04) > 0.3 ? 0 : 1
      // Body
      rect(80, 70 + bobA, 20, 25, CORAL)
      outline(79, 69 + bobA, 22, 1)
      outline(79, 95 + bobA, 22, 1)
      outline(79, 69 + bobA, 1, 27)
      outline(101, 69 + bobA, 1, 27)
      // Head
      rect(82, 56 + bobA, 16, 14, LGRAY)
      outline(81, 55 + bobA, 18, 1)
      outline(81, 70 + bobA, 18, 1)
      outline(81, 55 + bobA, 1, 16)
      outline(99, 55 + bobA, 1, 16)
      // Eyes — blink
      const blinkA = frame % 120 < 5
      if (!blinkA) {
        px(86, 60 + bobA, OUTLINE)
        px(87, 60 + bobA, OUTLINE)
        px(93, 60 + bobA, OUTLINE)
        px(94, 60 + bobA, OUTLINE)
      } else {
        rect(86, 60 + bobA, 2, 1, OUTLINE)
        rect(93, 60 + bobA, 2, 1, OUTLINE)
      }
      // Antenna
      rect(89, 51 + bobA, 2, 5, GRAY)
      px(89, 49 + bobA, MANGO)
      px(90, 49 + bobA, MANGO)
      // Legs
      rect(84, 96, 3, 8, GRAY)
      rect(93, 96, 3, 8, GRAY)

      // Robot B (right) — boxy, teal, slightly different shape
      const bobB = Math.sin(frame * 0.04 + 2) > 0.3 ? 0 : 1
      // Body
      rect(140, 68 + bobB, 22, 27, TEAL)
      outline(139, 67 + bobB, 24, 1)
      outline(139, 95 + bobB, 24, 1)
      outline(139, 67 + bobB, 1, 29)
      outline(163, 67 + bobB, 1, 29)
      // Head — rounder
      rect(143, 53 + bobB, 16, 15, LGRAY)
      outline(142, 52 + bobB, 18, 1)
      outline(142, 68 + bobB, 18, 1)
      outline(142, 52 + bobB, 1, 17)
      outline(160, 52 + bobB, 1, 17)
      // Eyes
      const blinkB = frame % 90 < 4
      if (!blinkB) {
        px(147, 58 + bobB, OUTLINE)
        px(148, 58 + bobB, OUTLINE)
        px(155, 58 + bobB, OUTLINE)
        px(156, 58 + bobB, OUTLINE)
      } else {
        rect(147, 58 + bobB, 2, 1, OUTLINE)
        rect(155, 58 + bobB, 2, 1, OUTLINE)
      }
      // Mouth — slight frown
      px(149, 63 + bobB, OUTLINE)
      px(150, 64 + bobB, OUTLINE)
      px(151, 64 + bobB, OUTLINE)
      px(152, 64 + bobB, OUTLINE)
      px(153, 63 + bobB, OUTLINE)
      // Antenna
      rect(150, 48 + bobB, 2, 5, GRAY)
      px(150, 46 + bobB, LIME)
      px(151, 46 + bobB, LIME)
      // Legs
      rect(145, 96, 3, 8, GRAY)
      rect(155, 96, 3, 8, GRAY)

      // Speech bubble from Robot A
      rect(35, 25, 100, 20, '#FFFFFF')
      outline(34, 24, 102, 1)
      outline(34, 45, 102, 1)
      outline(34, 24, 1, 22)
      outline(136, 24, 1, 22)
      // Bubble tail
      px(95, 46, '#FFFFFF')
      px(96, 46, '#FFFFFF')
      px(94, 47, '#FFFFFF')
      px(95, 47, '#FFFFFF')
      outline(93, 48, 1, 1)
      outline(96, 46, 1, 1)
      outline(97, 45, 1, 1)
      outline(94, 48, 1, 1)

      // Caption at bottom
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 3}px monospace`
      ctx.textAlign = 'center'

      // Speech text
      ctx.font = `${PX * 2.2}px monospace`
      ctx.fillStyle = OUTLINE
      ctx.fillText('"i was trained', 85 * PX, 33 * PX)
      ctx.fillText('on your data."', 85 * PX, 38 * PX)

      // Caption
      ctx.font = `${PX * 2.5}px monospace`
      ctx.fillStyle = OUTLINE
      ctx.fillText('"i was trained on your data."', W / 2 * PX, 170 * PX)

      requestAnimationFrame(draw)
    }

    draw()
  }, [])

  return (
    <div style={{ background: CREAM, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <canvas
        ref={ref}
        style={{
          maxWidth: '100%',
          maxHeight: '80vh',
          imageRendering: 'pixelated' as const,
        }}
      />
    </div>
  )
}
