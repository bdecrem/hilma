'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// BITMAP CARTOON: pigeon at a corporate meeting
// "let's circle back on that."

const PX = 3
const W = 240
const H = 180
const CAP_H = 22

const [BG1, BG2] = pickGradientColors('pigeon')
const CREAM = '#FFF8E7'
const OUTLINE = '#2A2218'
const CORAL = '#FF4E50'
const MANGO = '#FC913A'
const SUNSHINE = '#F9D423'
const LIME = '#B4E33D'
const GRAPEFRUIT = '#FF6B81'
const TEAL = '#2D9A7E'
const SKIN = '#FFDAB9'
const SKIN2 = '#D4A57B'
const HAIR = '#5A3A1E'
const WHITE = '#FFFFFF'
const LGRAY = '#E0D8CC'
const PIGEON_BODY = '#9E9E9E'
const PIGEON_DARK = '#6E6E6E'
const PIGEON_NECK = '#6B8E6B'

export default function Pigeon() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = W * PX
    canvas.height = (H + CAP_H) * PX
    let t = 0
    let frame: number

    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c
      ctx.fillRect(x * PX, y * PX, w * PX, h * PX)
    }
    const px = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c
      ctx.fillRect(x * PX, y * PX, w * PX, h * PX)
    }
    const box = (x: number, y: number, w: number, h: number, fill: string) => {
      rect(x, y, w, h, OUTLINE)
      rect(x + 1, y + 1, w - 2, h - 2, fill)
    }

    const draw = () => {
      // BG gradient
      const grad = ctx.createLinearGradient(0, 0, W * PX, H * PX)
      grad.addColorStop(0, BG1)
      grad.addColorStop(1, BG2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W * PX, (H + CAP_H) * PX)

      // Office wall
      rect(0, 0, W, 120, BG1)
      // Baseboard
      rect(0, 118, W, 3, MANGO + '25')
      // Floor
      rect(0, 121, W, H - 121, '#FFE4C4')
      for (let x = 0; x < W; x += 30) rect(x, 121, 1, H - 121, '#FFD8B4')

      // ── WHITEBOARD on wall ──
      box(85, 8, 70, 40, WHITE)
      // Squiggly chart lines
      rect(95, 18, 20, 2, CORAL)
      rect(110, 15, 15, 2, LIME)
      rect(100, 25, 25, 2, MANGO)
      // Axis
      rect(92, 14, 1, 20, LGRAY)
      rect(92, 33, 40, 1, LGRAY)
      // "Q3" text
      ctx.fillStyle = OUTLINE + '60'
      ctx.font = `${PX * 1.5}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText('Q3', 115 * PX, 42 * PX)

      // ── CONFERENCE TABLE ──
      box(20, 98, 200, 8, MANGO)
      rect(22, 100, 196, 4, '#E89830')
      // Table legs
      rect(30, 106, 4, 16, MANGO + 'BB')
      rect(206, 106, 4, 16, MANGO + 'BB')

      // ── PERSON 1 (left, facing right) — suit ──
      // Chair
      box(25, 80, 28, 18, TEAL + '80')
      // Body
      rect(32, 72, 14, 26, TEAL)
      rect(34, 74, 10, 22, '#35B090')
      // Arms on table
      rect(28, 92, 8, 5, TEAL)
      rect(44, 92, 8, 5, TEAL)
      // Hands
      rect(30, 94, 5, 3, SKIN)
      rect(45, 94, 5, 3, SKIN)
      // Neck
      rect(36, 68, 6, 5, SKIN)
      // Head
      box(33, 50, 12, 19, SKIN)
      rect(35, 52, 8, 15, SKIN)
      // Hair
      rect(33, 48, 12, 6, HAIR)
      // Eyes
      px(36, 57, OUTLINE, 2, 1)
      px(41, 57, OUTLINE, 2, 1)
      // Mouth
      rect(38, 62, 3, 1, '#CC9080')
      // Legs
      rect(35, 106, 4, 14, '#3A3A50')
      rect(41, 106, 4, 14, '#3A3A50')

      // ── PERSON 2 (center-left) — coral blazer ──
      // Chair
      box(70, 80, 28, 18, GRAPEFRUIT + '60')
      // Body
      rect(77, 72, 14, 26, CORAL)
      rect(79, 74, 10, 22, GRAPEFRUIT)
      // Arms
      rect(73, 92, 8, 5, CORAL)
      rect(89, 92, 8, 5, CORAL)
      // Hands
      rect(75, 94, 5, 3, SKIN2)
      rect(90, 94, 5, 3, SKIN2)
      // Neck
      rect(81, 68, 6, 5, SKIN2)
      // Head
      box(78, 50, 12, 19, SKIN2)
      rect(80, 52, 8, 15, SKIN2)
      // Hair
      rect(78, 48, 12, 5, '#1A1A1A')
      rect(77, 50, 1, 8, '#1A1A1A')
      rect(90, 50, 1, 8, '#1A1A1A')
      // Eyes
      px(81, 57, OUTLINE, 2, 1)
      px(86, 57, OUTLINE, 2, 1)
      // Eyebrows — raised, skeptical
      rect(81, 55, 3, 1, '#1A1A1A')
      rect(86, 55, 3, 1, '#1A1A1A')
      // Mouth — slight frown
      rect(83, 63, 3, 1, '#996060')
      // Legs
      rect(80, 106, 4, 14, '#3A3A50')
      rect(86, 106, 4, 14, '#3A3A50')

      // ── THE PIGEON (center-right, in a chair, at the table) ──
      const bobY = Math.sin(t * 0.06) * 0.6
      // Chair
      box(130, 80, 28, 18, SUNSHINE + '80')

      // Pigeon body — round, sitting in chair
      // Body
      rect(136, 74 + bobY, 16, 18, OUTLINE)
      rect(137, 75 + bobY, 14, 16, PIGEON_BODY)
      // Chest — lighter
      rect(139, 78 + bobY, 10, 10, '#B0B0B0')
      // Iridescent neck patch
      rect(140, 76 + bobY, 8, 4, PIGEON_NECK)
      // Wing tuck
      rect(149, 78 + bobY, 3, 10, PIGEON_DARK)

      // Head — classic pigeon head bob
      const headBob = Math.sin(t * 0.08) * 1.2
      const hx = 140 + headBob
      const hy = 58 + bobY
      // Neck
      rect(141, 69 + bobY, 6, 7, PIGEON_BODY)
      rect(142, 70 + bobY, 4, 5, PIGEON_NECK)
      // Head
      rect(hx, hy, 10, 10, OUTLINE)
      rect(hx + 1, hy + 1, 8, 8, PIGEON_BODY)
      // Eye — orange ring (pigeon eyes!)
      px(hx + 5, hy + 3, MANGO, 3, 3)
      px(hx + 6, hy + 4, OUTLINE)
      // Beak
      px(hx + 9, hy + 5, OUTLINE, 4, 2)
      px(hx + 9, hy + 6, MANGO, 3, 1)
      // Beak tip
      px(hx + 11, hy + 5, SUNSHINE)

      // Tiny tie (it's a business pigeon)
      rect(143, 80 + bobY, 2, 1, CORAL)
      rect(142, 81 + bobY, 4, 2, CORAL)
      rect(143, 83 + bobY, 2, 5, CORAL)

      // Pigeon feet on chair
      rect(139, 92 + bobY, 3, 4, MANGO)
      rect(146, 92 + bobY, 3, 4, MANGO)
      // Toes
      px(138, 96 + bobY, MANGO, 2, 1)
      px(141, 96 + bobY, MANGO, 2, 1)
      px(145, 96 + bobY, MANGO, 2, 1)
      px(148, 96 + bobY, MANGO, 2, 1)

      // ── PERSON 3 (far right) — lime shirt ──
      // Chair
      box(175, 80, 28, 18, LIME + '60')
      // Body
      rect(182, 72, 14, 26, LIME)
      rect(184, 74, 10, 22, '#C5F04E')
      // Arms
      rect(178, 92, 8, 5, LIME)
      rect(194, 92, 8, 5, LIME)
      // Hands
      rect(180, 94, 5, 3, SKIN)
      rect(195, 94, 5, 3, SKIN)
      // Neck
      rect(186, 68, 6, 5, SKIN)
      // Head
      box(183, 50, 12, 19, SKIN)
      rect(185, 52, 8, 15, SKIN)
      // Hair — bald/short
      rect(183, 48, 12, 5, '#8B7355')
      // Glasses
      box(185, 55, 4, 3, WHITE + '80')
      box(191, 55, 4, 3, WHITE + '80')
      rect(189, 56, 2, 1, OUTLINE)
      // Eyes
      px(186, 56, OUTLINE)
      px(192, 56, OUTLINE)
      // Mouth — open, mid-speech
      rect(188, 62, 4, 2, '#CC9080')
      rect(189, 62, 2, 1, '#8B4040')
      // Legs
      rect(185, 106, 4, 14, '#5A5A40')
      rect(191, 106, 4, 14, '#5A5A40')

      // ── SPEECH BUBBLE from person 3 ──
      box(155, 15, 75, 18, WHITE)
      rect(157, 17, 71, 14, WHITE)
      // Tail pointing down-left to person 3
      px(185, 33, WHITE, 3, 1)
      px(186, 34, WHITE, 2, 1)
      px(187, 35, WHITE)
      px(185, 33, OUTLINE)
      px(189, 33, OUTLINE)
      px(187, 35, OUTLINE)
      // Text in bubble
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 1.8}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText("let's circle back", 192 * PX, 25 * PX)
      ctx.fillText('on that', 192 * PX, 30 * PX)

      // ── COFFEE CUPS on table ──
      // Cup near person 1
      box(52, 92, 5, 6, WHITE)
      rect(53, 93, 3, 4, '#8B6040')
      // Cup near pigeon — untouched, pigeon can't hold it
      box(128, 92, 5, 6, WHITE)
      rect(129, 93, 3, 4, '#8B6040')
      // Papers
      rect(105, 93, 12, 5, WHITE)
      rect(107, 94, 8, 1, LGRAY)
      rect(107, 96, 6, 1, LGRAY)

      // ── CAPTION ──
      rect(0, H, W, CAP_H, CREAM)
      rect(20, H + 2, W - 40, 1, MANGO + '25')
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 2.5}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u201Clet\u2019s circle back on that.\u201D', (W * PX) / 2, (H + 12) * PX)
    }

    const tick = () => {
      t++
      draw()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: CREAM }}>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          width: `min(95vw, ${W * PX * 2}px)`,
          height: `min(calc(95vw * ${(H + CAP_H) / W}), ${(H + CAP_H) * PX * 2}px)`,
        }}
      />
    </div>
  )
}
