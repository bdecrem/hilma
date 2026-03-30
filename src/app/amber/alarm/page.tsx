'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// BITMAP CARTOON: alarm clock on therapist's couch
// "every morning I scream and they hate me for it."

const PX = 3
const W = 240
const H = 180
const CAP_H = 22

const [BG1, BG2] = pickGradientColors('alarm')
const CREAM = '#FFF8E7'
const OUTLINE = '#2A2218'
const CORAL = '#FF4E50'
const MANGO = '#FC913A'
const SUNSHINE = '#F9D423'
const LIME = '#B4E33D'
const GRAPEFRUIT = '#FF6B81'
const TEAL = '#2D9A7E'
const SKIN = '#FFDAB9'
const HAIR = '#5A3A1E'
const WHITE = '#FFFFFF'
const LGRAY = '#E0D8CC'

export default function Alarm() {
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

      // ── DIPLOMA on wall ──
      box(30, 12, 30, 20, CREAM)
      rect(32, 14, 26, 16, WHITE)
      // tiny text lines
      rect(36, 18, 18, 1, LGRAY)
      rect(38, 21, 14, 1, LGRAY)
      rect(36, 24, 18, 1, LGRAY)

      // ── SMALL PLANT on wall shelf ──
      rect(190, 30, 16, 2, MANGO + '80')
      // pot
      rect(194, 22, 8, 8, OUTLINE)
      rect(195, 23, 6, 6, '#C06030')
      // leaves
      rect(196, 18, 4, 4, OUTLINE)
      rect(197, 19, 2, 2, LIME)
      rect(193, 16, 4, 4, OUTLINE)
      rect(194, 17, 2, 2, '#4CAF50')
      rect(199, 15, 4, 4, OUTLINE)
      rect(200, 16, 2, 2, LIME)

      // ── COUCH (teal, left side) ──
      // Couch back
      box(20, 68, 100, 28, TEAL)
      rect(22, 70, 96, 24, '#35B090')
      // Couch seat
      box(20, 96, 100, 14, TEAL)
      rect(22, 98, 96, 10, '#2A8A70')
      // Couch arm left
      box(16, 72, 8, 38, TEAL)
      rect(18, 74, 4, 34, '#35B090')
      // Couch arm right
      box(116, 72, 8, 38, TEAL)
      rect(118, 74, 4, 34, '#35B090')
      // Couch legs
      rect(24, 110, 4, 10, OUTLINE)
      rect(112, 110, 4, 10, OUTLINE)
      // Cushion lines
      rect(52, 98, 1, 10, TEAL + '60')
      rect(86, 98, 1, 10, TEAL + '60')

      // ── ALARM CLOCK on couch (the patient) ──
      // Clock body — rounded rectangle, ~18x16 px
      const cx = 60
      const cy = 80

      // Tiny legs dangling off couch edge
      rect(cx - 4, 104, 3, 8, OUTLINE)
      rect(cx + 8, 104, 3, 8, OUTLINE)
      rect(cx - 3, 105, 1, 6, MANGO)
      rect(cx + 9, 105, 1, 6, MANGO)
      // Tiny feet
      rect(cx - 5, 111, 4, 2, OUTLINE)
      rect(cx + 7, 111, 4, 2, OUTLINE)

      // Alarm bells on top
      rect(cx - 3, cy - 14, 6, 4, OUTLINE)
      rect(cx - 2, cy - 13, 4, 2, SUNSHINE)
      rect(cx + 5, cy - 14, 6, 4, OUTLINE)
      rect(cx + 6, cy - 13, 4, 2, SUNSHINE)
      // Bell connector
      rect(cx + 1, cy - 16, 6, 3, OUTLINE)
      rect(cx + 2, cy - 15, 4, 1, CORAL)

      // Clock body
      box(cx - 5, cy - 10, 18, 20, SUNSHINE)
      rect(cx - 3, cy - 8, 14, 16, MANGO)

      // Clock face (cream circle area)
      rect(cx - 2, cy - 6, 12, 12, OUTLINE)
      rect(cx - 1, cy - 5, 10, 10, CREAM)

      // Clock hands
      // Hour hand (short)
      rect(cx + 3, cy - 3, 1, 4, OUTLINE)
      // Minute hand (pointing right)
      rect(cx + 3, cy, 4, 1, OUTLINE)
      // Center dot
      px(cx + 3, cy, CORAL)

      // Clock eyes — tired, droopy
      // Left eye
      px(cx, cy - 3, OUTLINE, 2, 2)
      px(cx, cy - 3, OUTLINE, 2, 1) // heavy lid
      px(cx + 1, cy - 2, '#443322') // pupil looking down
      // Right eye
      px(cx + 6, cy - 3, OUTLINE, 2, 2)
      px(cx + 6, cy - 3, OUTLINE, 2, 1) // heavy lid
      px(cx + 7, cy - 2, '#443322') // pupil looking down

      // Tired mouth — small frown
      px(cx + 2, cy + 3, OUTLINE, 4, 1)
      px(cx + 1, cy + 2, OUTLINE)
      px(cx + 6, cy + 2, OUTLINE)

      // Arms — one resting on couch, one on "belly"
      rect(cx - 7, cy + 2, 3, 2, MANGO)
      rect(cx + 12, cy + 4, 3, 2, MANGO)

      // ── THERAPIST (right side, in chair) ──
      // Armchair
      box(160, 72, 50, 38, CORAL)
      rect(162, 74, 46, 34, GRAPEFRUIT + 'CC')
      // Chair legs
      rect(164, 110, 4, 10, OUTLINE)
      rect(200, 110, 4, 10, OUTLINE)

      // Therapist body (sitting in chair)
      // Torso — mango cardigan
      rect(173, 78, 18, 26, MANGO)
      rect(175, 80, 14, 22, '#E8A040')
      // Arms
      rect(169, 86, 5, 12, MANGO)
      rect(190, 86, 5, 12, MANGO)
      // Hands
      rect(170, 96, 4, 3, SKIN)
      rect(190, 96, 4, 3, SKIN)

      // Neck
      rect(179, 74, 6, 5, SKIN)

      // Head
      box(176, 54, 12, 20, SKIN)
      rect(178, 56, 8, 16, SKIN)

      // Hair — neat, parted
      rect(176, 52, 12, 6, HAIR)
      rect(175, 54, 1, 6, HAIR)
      rect(188, 54, 1, 6, HAIR)

      // Glasses — two circles with bridge
      rect(178, 60, 4, 4, OUTLINE)
      rect(179, 61, 2, 2, '#DDCCBB')
      rect(184, 60, 4, 4, OUTLINE)
      rect(185, 61, 2, 2, '#DDCCBB')
      rect(182, 61, 2, 1, OUTLINE) // bridge

      // Eyes behind glasses
      px(180, 62, OUTLINE)
      px(185, 62, OUTLINE)

      // Slight knowing smile
      rect(181, 67, 4, 1, '#CC9080')
      px(180, 66, '#CC9080')
      px(185, 66, '#CC9080')

      // Legs
      rect(178, 104, 5, 16, '#3A3A50')
      rect(185, 104, 5, 16, '#3A3A50')
      // Shoes
      rect(177, 118, 6, 3, OUTLINE)
      rect(185, 118, 6, 3, OUTLINE)

      // ── NOTEPAD in therapist's lap ──
      rect(173, 96, 10, 7, WHITE)
      rect(174, 97, 7, 1, LGRAY)
      rect(174, 99, 5, 1, LGRAY)
      rect(174, 101, 6, 1, LGRAY)

      // ── TINY PEN in hand ──
      rect(191, 94, 1, 5, OUTLINE)
      px(191, 93, CORAL)

      // ── SIDE TABLE between them ──
      box(130, 96, 20, 6, MANGO)
      rect(132, 98, 16, 2, '#E89830')
      // Table legs
      rect(134, 102, 3, 18, MANGO + 'BB')
      rect(143, 102, 3, 18, MANGO + 'BB')

      // ── TISSUE BOX on side table ──
      box(134, 90, 10, 6, CREAM)
      rect(136, 92, 6, 2, WHITE)
      // Tissue sticking out
      rect(138, 87, 3, 4, WHITE)
      rect(138, 86, 1, 2, LGRAY + '80')

      // ── Subtle animated bits ──
      // Alarm clock vibrates slightly
      const vib = Math.sin(t * 0.3) * 0.3

      // Bell hammer oscillation (tiny)
      const hammerX = cx + 3 + Math.sin(t * 0.15) * 0.5
      px(Math.round(hammerX), cy - 17, OUTLINE, 2, 1)

      // Therapist occasionally nods (subtle head bob)
      const nod = Math.sin(t * 0.03) * 0.4

      // ── CAPTION ──
      rect(0, H, W, CAP_H, CREAM)
      rect(20, H + 2, W - 40, 1, MANGO + '25')
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 2.2}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        '\u201Cevery morning I scream and',
        (W * PX) / 2,
        (H + 9) * PX
      )
      ctx.fillText(
        'they hate me for it.\u201D',
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
