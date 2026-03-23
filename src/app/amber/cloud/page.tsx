'use client'

import { useEffect, useRef } from 'react'

// BITMAP CARTOON: cloud at a job interview
// "it says here you have experience being everywhere at once?"

const PX = 3
const W = 240
const H = 180
const CAP_H = 28

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
const PEACH_BG = '#FFECD2'

export default function Cloud() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = W * PX
    canvas.height = (H + CAP_H) * PX
    let t = 0, frame: number

    const px = (x: number, y: number, color: string, w = 1, h = 1) => {
      ctx.fillStyle = color
      ctx.fillRect(x * PX, y * PX, w * PX, h * PX)
    }
    const rect = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x * PX, y * PX, w * PX, h * PX) }
    const box = (x: number, y: number, w: number, h: number, fill: string) => { rect(x, y, w, h, OUTLINE); rect(x + 1, y + 1, w - 2, h - 2, fill) }

    const draw = () => {
      // BG
      rect(0, 0, W, H + CAP_H, CREAM)

      // Office wall
      rect(0, 0, W, 115, PEACH_BG)
      // Baseboard
      rect(0, 113, W, 3, MANGO + '30')
      // Floor
      rect(0, 116, W, H - 116, '#FFE4C4')
      for (let x = 0; x < W; x += 35) rect(x, 116, 1, H - 116, '#FFD8B4')

      // ── MOTIVATIONAL POSTER on wall ──
      box(15, 10, 40, 30, WHITE)
      rect(20, 15, 30, 15, SUNSHINE + '40')
      // Star
      px(33, 20, CORAL, 4, 4)
      // Text lines
      rect(22, 33, 26, 1, LGRAY)
      rect(24, 35, 22, 1, LGRAY)

      // ── WINDOW ──
      box(170, 8, 55, 40, '#D4EFFF')
      rect(196, 8, 2, 40, OUTLINE)
      rect(170, 27, 55, 2, OUTLINE)

      // ── DESK ──
      box(55, 95, 130, 6, MANGO)
      rect(57, 97, 126, 2, '#E89830')
      // Desk legs
      rect(60, 101, 4, 16, MANGO + 'CC')
      rect(178, 101, 4, 16, MANGO + 'CC')
      // Desk front panel
      rect(60, 101, 122, 10, MANGO + '60')

      // ── ITEMS ON DESK ──
      // Coffee mug
      box(65, 88, 7, 8, WHITE)
      rect(67, 90, 3, 4, '#8B6040')
      // Handle
      px(72, 90, OUTLINE, 2, 1)
      px(73, 91, OUTLINE, 1, 2)
      // Steam
      const steamY = Math.sin(t * 0.1) * 1
      px(68, 85 + steamY, LGRAY)
      px(70, 84 + steamY, LGRAY)

      // Resume paper
      rect(80, 89, 16, 7, WHITE)
      rect(82, 90, 12, 1, LGRAY)
      rect(82, 92, 10, 1, LGRAY)
      rect(82, 94, 8, 1, LGRAY)

      // Pen
      px(100, 91, OUTLINE, 1, 5)
      px(100, 90, CORAL)

      // Nameplate
      box(140, 89, 24, 7, SUNSHINE)
      rect(142, 91, 20, 1, OUTLINE + '40')
      rect(142, 93, 16, 1, OUTLINE + '40')

      // ── HR PERSON (left, behind desk) ──
      // Body/blazer
      rect(90, 70, 18, 25, TEAL)
      rect(92, 72, 14, 21, '#35B090')
      // Collar
      px(94, 70, WHITE, 12, 2)
      // Arms on desk
      rect(82, 88, 10, 5, TEAL)
      rect(106, 88, 10, 5, TEAL)
      // Hands
      rect(84, 90, 6, 3, SKIN)
      rect(108, 90, 6, 3, SKIN)
      // Neck
      rect(96, 65, 8, 6, SKIN)
      // Head
      box(92, 45, 16, 21, SKIN)
      rect(94, 47, 12, 17, SKIN)
      // Hair - neat bob
      rect(92, 43, 16, 8, HAIR)
      rect(91, 46, 1, 12, HAIR)
      rect(108, 46, 1, 12, HAIR)
      // Glasses
      box(94, 52, 5, 4, WHITE + '80')
      box(101, 52, 5, 4, WHITE + '80')
      rect(99, 53, 2, 1, OUTLINE)
      // Eyes
      px(96, 54, OUTLINE, 2, 1)
      px(103, 54, OUTLINE, 2, 1)
      // Eyebrows (skeptical - one raised)
      rect(95, 51, 4, 1, HAIR)
      rect(101, 50, 4, 1, HAIR) // raised
      // Mouth - slight smirk
      rect(98, 60, 4, 1, '#CC9080')
      px(102, 59, '#CC9080')

      // ── THE CLOUD (right, sitting in chair) ──
      // Chair
      box(150, 80, 40, 26, CORAL)
      rect(152, 82, 36, 22, GRAPEFRUIT)
      // Chair back
      box(150, 60, 40, 22, CORAL)
      rect(152, 62, 36, 18, GRAPEFRUIT)
      // Chair legs
      rect(154, 106, 3, 10, OUTLINE)
      rect(183, 106, 3, 10, OUTLINE)

      // Cloud body — fluffy blob
      const cx = 170, cy = 72
      const bobble = Math.sin(t * 0.04) * 0.8
      // Main cloud mass (white with outline)
      // Bottom
      rect(155, cy - 2 + bobble, 30, 16, OUTLINE)
      rect(156, cy - 1 + bobble, 28, 14, WHITE)
      // Top bumps
      rect(158, cy - 8 + bobble, 10, 8, OUTLINE)
      rect(159, cy - 7 + bobble, 8, 7, WHITE)
      rect(167, cy - 12 + bobble, 14, 12, OUTLINE)
      rect(168, cy - 11 + bobble, 12, 11, WHITE)
      rect(178, cy - 6 + bobble, 8, 8, OUTLINE)
      rect(179, cy - 5 + bobble, 6, 7, WHITE)
      // Cloud face
      px(164, cy + 3 + bobble, OUTLINE, 2, 2) // left eye
      px(174, cy + 3 + bobble, OUTLINE, 2, 2) // right eye
      rect(168, cy + 8 + bobble, 5, 1, '#AAA') // nervous smile
      // Blushing (it's nervous)
      px(161, cy + 6 + bobble, GRAPEFRUIT + '60', 3, 2)
      px(176, cy + 6 + bobble, GRAPEFRUIT + '60', 3, 2)

      // Server rack visible inside cloud (it's wearing a cloud costume)
      rect(163, cy + bobble, 2, 6, '#667')
      rect(166, cy + bobble, 2, 6, '#667')
      // Blinking server lights
      px(163, cy + 1 + bobble, t % 30 < 15 ? LIME : CORAL)
      px(166, cy + 1 + bobble, t % 40 < 20 ? CORAL : LIME)
      px(163, cy + 3 + bobble, LIME)

      // Cloud's "legs" dangling from chair
      rect(160, 90 + bobble, 6, 12, '#DDD')
      rect(174, 90 + bobble, 6, 12, '#DDD')
      // Shoes
      rect(159, 101 + bobble, 8, 3, '#BBB')
      rect(173, 101 + bobble, 8, 3, '#BBB')

      // ── SPEECH BUBBLE from HR ──
      box(28, 20, 60, 20, WHITE)
      rect(30, 22, 56, 16, WHITE)
      // Tail
      px(80, 40, WHITE, 3, 1)
      px(82, 41, WHITE, 2, 1)
      px(84, 42, WHITE)
      px(80, 40, OUTLINE)
      px(84, 41, OUTLINE)
      px(84, 42, OUTLINE)
      // Text
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 1.6}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText('it says here you have', 58 * PX, 28 * PX)
      ctx.fillText('experience being', 58 * PX, 33 * PX)
      ctx.fillText('everywhere at once?', 58 * PX, 38 * PX)

      // ── CAPTION ──
      rect(0, H, W, CAP_H, CREAM)
      rect(20, H + 2, W - 40, 1, MANGO + '25')
      ctx.fillStyle = OUTLINE
      ctx.font = `${PX * 2.5}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('"it says here you have experience', (W * PX) / 2, (H + 10) * PX)
      ctx.fillText('being everywhere at once?"', (W * PX) / 2, (H + 20) * PX)
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
