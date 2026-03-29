'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// BITMAP CARTOON: houseplant presenting "GROWTH" at a meeting
// "nobody had the heart to tell him it was about revenue."

const PX = 3
const W = 240
const H = 180
const CAP_H = 22

const [BG1, BG2] = pickGradientColors('growth')
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
const POT_TERRACOTTA = '#C06030'
const POT_DARK = '#904820'
const LEAF_GREEN = '#4CAF50'
const LEAF_DARK = '#2D7A32'
const SOIL = '#5A3A20'

export default function Growth() {
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

      // ── WHITEBOARD on wall (left side, behind plant) ──
      box(20, 10, 80, 55, WHITE)
      rect(22, 12, 76, 51, WHITE)

      // "GROWTH" title
      ctx.fillStyle = OUTLINE
      ctx.font = `bold ${PX * 2.8}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText('GROWTH', 60 * PX, 24 * PX)

      // Big upward arrow
      // Arrow shaft
      rect(55, 30, 10, 25, LIME)
      rect(57, 32, 6, 21, '#8ED060')
      // Arrow head
      rect(48, 30, 24, 3, LIME)
      rect(52, 27, 16, 3, LIME)
      rect(56, 24, 8, 3, LIME)
      rect(58, 22, 4, 2, LIME)

      // Little chart bars at bottom of whiteboard
      rect(30, 52, 6, 8, CORAL + '80')
      rect(38, 48, 6, 12, MANGO + '80')
      rect(46, 44, 6, 16, SUNSHINE + '80')
      rect(54, 38, 6, 22, LIME + '80')

      // ── THE PLANT (standing next to whiteboard, "presenting") ──
      // Terracotta pot
      const plantX = 60
      const plantBaseY = 100

      // Pot body
      rect(plantX - 8, plantBaseY, 16, 14, OUTLINE)
      rect(plantX - 7, plantBaseY + 1, 14, 12, POT_TERRACOTTA)
      rect(plantX - 6, plantBaseY + 2, 12, 10, '#D07040')
      // Pot rim
      rect(plantX - 9, plantBaseY - 1, 18, 3, OUTLINE)
      rect(plantX - 8, plantBaseY, 16, 1, POT_DARK)
      // Soil
      rect(plantX - 6, plantBaseY + 1, 12, 2, SOIL)

      // Stem
      rect(plantX - 1, plantBaseY - 20, 2, 20, LEAF_DARK)

      // Leaves — animate gentle sway
      const sway = Math.sin(t * 0.04) * 1.2

      // Left leaves
      rect(plantX - 10 + sway, plantBaseY - 28, 8, 3, OUTLINE)
      rect(plantX - 9 + sway, plantBaseY - 27, 6, 1, LEAF_GREEN)
      rect(plantX - 12 + sway, plantBaseY - 22, 9, 3, OUTLINE)
      rect(plantX - 11 + sway, plantBaseY - 21, 7, 1, LEAF_GREEN)
      rect(plantX - 8 + sway, plantBaseY - 16, 7, 3, OUTLINE)
      rect(plantX - 7 + sway, plantBaseY - 15, 5, 1, LIME)

      // Right leaves
      rect(plantX + 2 - sway, plantBaseY - 30, 9, 3, OUTLINE)
      rect(plantX + 3 - sway, plantBaseY - 29, 7, 1, LEAF_GREEN)
      rect(plantX + 4 - sway, plantBaseY - 24, 8, 3, OUTLINE)
      rect(plantX + 5 - sway, plantBaseY - 23, 6, 1, LEAF_GREEN)
      rect(plantX + 3 - sway, plantBaseY - 18, 7, 3, OUTLINE)
      rect(plantX + 4 - sway, plantBaseY - 17, 5, 1, LIME)

      // Top leaf
      rect(plantX - 3 + sway * 0.5, plantBaseY - 34, 6, 3, OUTLINE)
      rect(plantX - 2 + sway * 0.5, plantBaseY - 33, 4, 1, '#5CBF60')

      // "Pointer" — a tiny stick the plant is somehow holding, pointing at chart
      // Stick from plant to whiteboard
      rect(plantX + 10, plantBaseY - 15, 18, 2, OUTLINE)
      rect(plantX + 10, plantBaseY - 14, 17, 1, MANGO)
      // Pointer tip
      px(plantX + 28, plantBaseY - 16, CORAL, 2, 3)

      // Pot legs (tiny stand)
      rect(plantX - 7, plantBaseY + 13, 3, 8, OUTLINE)
      rect(plantX + 4, plantBaseY + 13, 3, 8, OUTLINE)
      rect(plantX - 6, plantBaseY + 14, 1, 6, POT_DARK)
      rect(plantX + 5, plantBaseY + 14, 1, 6, POT_DARK)

      // ── PERSON 1 (right side, sitting at small desk) — teal blazer ──
      // Small desk/table in front
      box(140, 100, 60, 6, MANGO)
      rect(142, 102, 56, 2, '#E89830')
      // Table legs
      rect(148, 106, 3, 14, MANGO + 'BB')
      rect(190, 106, 3, 14, MANGO + 'BB')

      // Chair
      box(145, 78, 26, 18, TEAL + '60')
      // Body
      rect(151, 70, 14, 28, TEAL)
      rect(153, 72, 10, 24, '#35B090')
      // Arms on desk
      rect(147, 94, 8, 5, TEAL)
      rect(163, 94, 8, 5, TEAL)
      // Hands
      rect(149, 96, 5, 3, SKIN)
      rect(164, 96, 5, 3, SKIN)
      // Neck
      rect(155, 66, 6, 5, SKIN)
      // Head
      box(152, 48, 12, 19, SKIN)
      rect(154, 50, 8, 15, SKIN)
      // Hair
      rect(152, 46, 12, 6, HAIR)
      // Eyes — looking sideways at plant, awkward
      px(155, 56, OUTLINE, 2, 1)
      px(160, 56, OUTLINE, 2, 1)
      // Eyebrows — slightly raised
      rect(155, 54, 3, 1, HAIR)
      rect(160, 54, 3, 1, HAIR)
      // Mouth — tight-lipped smile
      rect(157, 62, 3, 1, '#CC9080')
      // Legs
      rect(154, 106, 4, 14, '#3A3A50')
      rect(160, 106, 4, 14, '#3A3A50')

      // Coffee cup
      box(170, 94, 5, 6, WHITE)
      rect(171, 95, 3, 4, '#8B6040')
      // Steam — animated
      const steam1 = Math.sin(t * 0.1) * 0.8
      const steam2 = Math.sin(t * 0.1 + 1.5) * 0.8
      px(171 + steam1, 91, LGRAY + '80', 1, 2)
      px(173 + steam2, 90, LGRAY + '60', 1, 2)

      // ── PERSON 2 (far right, coral blazer) ──
      // Chair
      box(185, 78, 26, 18, GRAPEFRUIT + '60')
      // Body
      rect(191, 70, 14, 28, CORAL)
      rect(193, 72, 10, 24, GRAPEFRUIT)
      // Arms folded
      rect(189, 92, 20, 5, CORAL)
      rect(191, 93, 16, 3, GRAPEFRUIT)
      // Hands
      rect(190, 94, 4, 3, SKIN2)
      rect(204, 94, 4, 3, SKIN2)
      // Neck
      rect(195, 66, 6, 5, SKIN2)
      // Head
      box(192, 48, 12, 19, SKIN2)
      rect(194, 50, 8, 15, SKIN2)
      // Hair
      rect(192, 46, 12, 5, '#1A1A1A')
      rect(191, 48, 1, 8, '#1A1A1A')
      rect(204, 48, 1, 8, '#1A1A1A')
      // Eyes — glancing at person 1
      px(195, 56, OUTLINE, 2, 1)
      px(200, 56, OUTLINE, 2, 1)
      // Eyebrows — one raised
      rect(195, 54, 3, 1, '#1A1A1A')
      rect(201, 53, 3, 1, '#1A1A1A')
      // Mouth — closed, polite
      rect(197, 62, 4, 1, '#996060')
      // Legs
      rect(194, 106, 4, 14, '#3A3A50')
      rect(200, 106, 4, 14, '#3A3A50')

      // ── NOTEPAD on table ──
      rect(178, 95, 10, 5, WHITE)
      rect(179, 96, 7, 1, LGRAY)
      rect(179, 98, 5, 1, LGRAY)

      // ── CAPTION ──
      rect(0, H, W, CAP_H, CREAM)
      rect(20, H + 2, W - 40, 1, MANGO + '25')
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 2.2}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        '\u201Cnobody had the heart to tell him',
        (W * PX) / 2,
        (H + 9) * PX
      )
      ctx.fillText(
        'it was about revenue.\u201D',
        (W * PX) / 2,
        (H + 16) * PX
      )
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
