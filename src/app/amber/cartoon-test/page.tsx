'use client'

import { useEffect, useRef } from 'react'

// Bitmap cartoon — @1041uuu style. Higher res, more detail.
// 240x180 grid, 3x pixel scale. Citrus palette on cream.

const PX = 3
const W = 240
const H = 180
const CAP_H = 30

const CREAM = '#FFF8E7'
const PEACH = '#FFECD2'
const OUTLINE = '#2A2218'
const CORAL = '#FF4E50'
const MANGO = '#FC913A'
const SUNSHINE = '#F9D423'
const LIME = '#B4E33D'
const GRAPEFRUIT = '#FF6B81'
const TEAL = '#2D9A7E'
const SKIN = '#FFDAB9'
const SKIN_SHADOW = '#F0C8A0'
const HAIR = '#8B5E3C'
const WHITE = '#FFFFFF'
const LIGHT_GRAY = '#E8E0D4'

export default function CartoonTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = W * PX
    canvas.height = (H + CAP_H) * PX

    const px = (x: number, y: number, color: string, w = 1, h = 1) => {
      ctx.fillStyle = color
      ctx.fillRect(x * PX, y * PX, w * PX, h * PX)
    }

    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x * PX, y * PX, w * PX, h * PX)
    }

    const outlineRect = (x: number, y: number, w: number, h: number, fill: string) => {
      rect(x, y, w, h, OUTLINE)
      rect(x + 1, y + 1, w - 2, h - 2, fill)
    }

    // ── BACKGROUND ──
    rect(0, 0, W, H + CAP_H, CREAM)

    // Wall — subtle warm tone
    rect(0, 0, W, 110, PEACH)
    // Baseboard
    rect(0, 108, W, 4, MANGO + '40')
    // Floor
    rect(0, 112, W, H - 112, '#FFE4C4')
    // Floor boards (subtle)
    for (let x = 0; x < W; x += 30) {
      rect(x, 112, 1, H - 112, '#FFD8B0')
    }

    // ── WINDOW (background detail) ──
    outlineRect(90, 8, 60, 45, '#D4EFFF')
    // Window frame cross
    rect(119, 8, 2, 45, OUTLINE)
    rect(90, 29, 60, 2, OUTLINE)
    // Curtains
    rect(82, 6, 10, 52, GRAPEFRUIT + '60')
    rect(148, 6, 10, 52, GRAPEFRUIT + '60')
    // Curtain folds
    rect(84, 6, 2, 52, GRAPEFRUIT + '40')
    rect(152, 6, 2, 52, GRAPEFRUIT + '40')

    // ── BOOKSHELF (far right) ──
    outlineRect(190, 20, 40, 70, MANGO + '80')
    // Shelves
    rect(192, 38, 36, 2, OUTLINE)
    rect(192, 56, 36, 2, OUTLINE)
    rect(192, 74, 36, 2, OUTLINE)
    // Books (colorful spines)
    const bookColors = [CORAL, TEAL, SUNSHINE, LIME, GRAPEFRUIT, MANGO, CORAL, TEAL]
    for (let i = 0; i < 8; i++) {
      const bx = 194 + i * 4 + (i > 3 ? 2 : 0)
      rect(bx, 22, 3, 15, bookColors[i])
      rect(bx, 40, 3, 15, bookColors[(i + 3) % 8])
      rect(bx, 58, 3, 15, bookColors[(i + 5) % 8])
    }
    // One book leaning
    rect(196, 76, 8, 12, TEAL)
    rect(208, 78, 6, 10, CORAL)

    // ── WALL ART (left) ──
    outlineRect(15, 15, 30, 24, CREAM)
    // Abstract citrus art inside frame
    px(20, 20, CORAL, 8, 8)
    px(26, 24, SUNSHINE, 10, 6)
    px(22, 28, LIME, 6, 6)
    // Frame shadow
    rect(16, 40, 30, 1, OUTLINE + '20')

    // ── COUCH ──
    // Back
    outlineRect(14, 62, 80, 28, CORAL)
    // Back cushion texture
    rect(18, 66, 72, 20, GRAPEFRUIT)
    rect(18, 66, 24, 20, CORAL + 'CC')
    rect(42, 66, 2, 20, CORAL + '80')
    rect(66, 66, 24, 20, CORAL + 'CC')
    // Seat
    outlineRect(14, 88, 80, 14, GRAPEFRUIT)
    rect(16, 90, 76, 10, CORAL + 'DD')
    // Arms
    outlineRect(6, 62, 10, 44, CORAL)
    rect(8, 64, 6, 40, GRAPEFRUIT + 'CC')
    outlineRect(92, 62, 10, 44, CORAL)
    rect(94, 64, 6, 40, GRAPEFRUIT + 'CC')
    // Legs
    rect(18, 104, 4, 8, OUTLINE)
    rect(86, 104, 4, 8, OUTLINE)
    // Couch shadow on floor
    rect(10, 112, 96, 3, OUTLINE + '10')

    // ── THROW PILLOW ──
    outlineRect(20, 68, 18, 14, SUNSHINE)
    rect(22, 70, 14, 10, '#FFE066')
    // Pillow pattern
    px(26, 73, MANGO, 4, 4)

    // ── PHONE ON COUCH ── (clearly a phone this time — portrait orientation, bigger)
    outlineRect(52, 72, 16, 24, '#222222')
    // Screen
    rect(54, 75, 12, 17, '#448899')
    rect(55, 76, 10, 15, '#55AABB')
    // App icons on screen
    px(56, 77, CORAL, 3, 3)
    px(60, 77, LIME, 3, 3)
    px(56, 81, SUNSHINE, 3, 3)
    px(60, 81, TEAL, 3, 3)
    px(56, 85, GRAPEFRUIT, 3, 3)
    px(60, 85, MANGO, 3, 3)
    // Notification badge
    px(62, 76, '#FF0054', 2, 2)
    // Home bar
    rect(57, 93, 6, 1, '#666')
    // Camera dot
    px(59, 73, '#333', 2, 1)
    // Phone shadow on couch
    rect(53, 96, 14, 2, CORAL + '40')

    // ── SPEECH BUBBLE from phone ──
    outlineRect(68, 54, 34, 16, WHITE)
    rect(70, 56, 30, 12, WHITE)
    // Tail pointing down-left to phone
    px(70, 70, WHITE, 3, 1)
    px(71, 71, WHITE, 2, 1)
    px(72, 72, WHITE)
    px(70, 70, OUTLINE, 1, 1)
    px(73, 71, OUTLINE)
    px(72, 72, OUTLINE)
    // Text in bubble: "..."
    px(74, 61, OUTLINE, 2, 2)
    px(79, 61, OUTLINE, 2, 2)
    px(84, 61, OUTLINE, 2, 2)

    // ── THERAPIST CHAIR ──
    outlineRect(130, 68, 44, 36, MANGO)
    rect(132, 70, 40, 32, '#E89830')
    // Chair back
    outlineRect(130, 48, 44, 22, MANGO)
    rect(132, 50, 40, 18, '#E89830')
    // Chair back detail
    rect(134, 52, 36, 2, MANGO + '80')
    rect(134, 58, 36, 2, MANGO + '80')
    // Armrests
    outlineRect(126, 68, 6, 24, MANGO)
    outlineRect(172, 68, 6, 24, MANGO)
    // Legs
    rect(134, 104, 4, 8, OUTLINE)
    rect(166, 104, 4, 8, OUTLINE)

    // ── THERAPIST ──
    // Torso
    rect(146, 72, 16, 22, TEAL)
    rect(148, 74, 12, 18, '#35B090')
    // Collar
    px(149, 72, WHITE, 10, 2)
    // Neck
    rect(150, 66, 8, 7, SKIN)
    rect(152, 68, 4, 3, SKIN_SHADOW)
    // Head
    outlineRect(146, 44, 16, 23, SKIN)
    rect(148, 46, 12, 19, SKIN)
    // Hair
    rect(146, 42, 16, 8, HAIR)
    rect(145, 45, 1, 14, HAIR)
    rect(162, 45, 1, 14, HAIR)
    rect(146, 42, 2, 4, HAIR)
    rect(160, 42, 2, 4, HAIR)
    // Glasses — round frames
    outlineRect(148, 52, 6, 5, '#FFFFFF80')
    outlineRect(156, 52, 6, 5, '#FFFFFF80')
    rect(154, 54, 2, 1, OUTLINE) // bridge
    rect(147, 54, 1, 1, OUTLINE) // arm left
    rect(162, 54, 1, 1, OUTLINE) // arm right
    // Eyes
    px(150, 54, OUTLINE, 2, 2)
    px(158, 54, OUTLINE, 2, 2)
    // Eyebrows
    rect(149, 51, 4, 1, HAIR)
    rect(157, 51, 4, 1, HAIR)
    // Nose
    px(153, 58, SKIN_SHADOW, 2, 2)
    // Mouth — slight interested expression
    rect(152, 62, 4, 1, '#CC9080')
    px(151, 62, '#CC9080')
    // Legs
    rect(148, 94, 6, 14, OUTLINE)
    rect(156, 94, 6, 14, OUTLINE)
    // Pants detail
    rect(149, 94, 4, 12, '#222')
    rect(157, 94, 4, 12, '#222')
    // Shoes
    outlineRect(147, 107, 8, 4, CORAL)
    outlineRect(155, 107, 8, 4, CORAL)

    // ── NOTEPAD ──
    outlineRect(168, 74, 12, 18, WHITE)
    rect(170, 76, 8, 14, WHITE)
    // Lines
    for (let y = 78; y < 88; y += 2) {
      rect(170, y, 7, 1, LIGHT_GRAY)
    }
    // Pen
    rect(170, 73, 1, 6, OUTLINE)
    px(170, 72, CORAL)
    // Hand on notepad
    rect(166, 76, 4, 5, SKIN)

    // ── SIDE TABLE ──
    outlineRect(180, 88, 16, 4, '#C07830')
    rect(184, 92, 4, 18, '#C07830')
    // Cup of coffee
    outlineRect(183, 82, 8, 7, WHITE)
    rect(185, 84, 4, 3, '#8B6040')
    // Steam
    px(186, 79, LIGHT_GRAY, 1, 2)
    px(188, 78, LIGHT_GRAY, 1, 2)

    // ── RUG ──
    rect(20, 114, 160, 12, SUNSHINE + '30')
    rect(22, 116, 156, 8, SUNSHINE + '20')
    // Rug pattern
    for (let x = 30; x < 170; x += 12) {
      px(x, 118, MANGO + '30', 4, 4)
    }

    // ── CAPTION ──
    rect(0, H, W, CAP_H, CREAM)
    rect(20, H + 3, W - 40, 1, MANGO + '30')

    ctx.fillStyle = OUTLINE
    ctx.font = `${PX * 2.8}px Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('"and when did you first feel', (W * PX) / 2, (H + 12) * PX)
    ctx.fillText('the need to be held?"', (W * PX) / 2, (H + 22) * PX)
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
