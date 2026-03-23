'use client'

import { useEffect, useRef } from 'react'

// 8-BIT NEW YORKER: phone at a therapist
// "and when did you first feel the need to be held?"

const W = 320, H = 240
const CAPTION_H = 40

// 6-color palette
const BG = '#1a1714'
const WALL = '#2a2420'
const FLOOR = '#221e1a'
const AMBER = '#D4A574'
const GOLD = '#B8860B'
const TEAL = '#2D9596'
const WHITE = '#e8ddd0'

export default function Held() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = W
    canvas.height = H + CAPTION_H

    ctx.imageSmoothingEnabled = false

    const px = (x: number, y: number, color: string, size = 1) => {
      ctx.fillStyle = color
      ctx.fillRect(x, y, size, size)
    }

    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x, y, w, h)
    }

    // Draw scene
    const draw = () => {
      // Background
      rect(0, 0, W, H + CAPTION_H, BG)

      // Wall
      rect(0, 0, W, 160, WALL)
      // Baseboard
      rect(0, 158, W, 4, '#332e28')
      // Floor
      rect(0, 162, W, H - 162, FLOOR)

      // Rug (subtle)
      rect(80, 175, 160, 50, '#2e2520')
      // Rug fringe
      for (let x = 80; x < 240; x += 4) {
        px(x, 175, '#3a3228', 2)
        px(x, 223, '#3a3228', 2)
      }

      // ── Diploma on wall ──
      rect(200, 40, 30, 22, '#3a3228')
      rect(201, 41, 28, 20, '#2e2820')
      // Tiny text lines
      for (let y = 45; y < 57; y += 3) {
        rect(205, y, 20, 1, '#4a4238')
      }

      // ── Therapist's chair (right side) ──
      // Chair back
      rect(220, 100, 40, 50, '#3a2e22')
      rect(222, 102, 36, 46, '#4a3e30')
      // Chair legs
      rect(222, 150, 3, 20, '#3a2e22')
      rect(255, 150, 3, 20, '#3a2e22')
      // Armrest
      rect(218, 120, 6, 4, '#3a2e22')
      rect(258, 120, 6, 4, '#3a2e22')
      // Seat cushion
      rect(220, 140, 40, 12, '#4a3e30')

      // ── Therapist (sitting) ──
      // Body (torso)
      rect(232, 115, 16, 25, AMBER)
      // Neck
      rect(237, 111, 6, 5, WHITE)
      // Head
      rect(234, 96, 12, 16, WHITE)
      // Hair
      rect(234, 94, 12, 6, '#5a4a38')
      rect(233, 96, 1, 8, '#5a4a38')
      rect(246, 96, 1, 8, '#5a4a38')
      // Glasses
      rect(235, 101, 4, 3, GOLD)
      rect(241, 101, 4, 3, GOLD)
      rect(239, 102, 2, 1, GOLD)
      // Eyes behind glasses
      px(236, 102, BG)
      px(242, 102, BG)
      // Mouth (slight)
      rect(238, 107, 4, 1, '#c4a494')
      // Legs
      rect(234, 140, 6, 18, '#3a3228')
      rect(242, 140, 6, 18, '#3a3228')
      // Shoes
      rect(233, 157, 8, 3, '#2a2218')
      rect(241, 157, 8, 3, '#2a2218')

      // ── Notepad in hand ──
      rect(254, 120, 10, 14, WHITE)
      // Lines on notepad
      for (let y = 123; y < 132; y += 2) {
        rect(255, y, 8, 1, '#c4b4a4')
      }
      // Hand/arm holding notepad
      rect(248, 118, 8, 4, WHITE)
      rect(250, 122, 4, 8, AMBER)

      // ── Couch (left side) ──
      // Back
      rect(50, 105, 110, 40, TEAL)
      rect(52, 107, 106, 36, '#348888')
      // Seat
      rect(50, 143, 110, 14, TEAL)
      rect(52, 143, 106, 12, '#2a8080')
      // Arm left
      rect(44, 105, 10, 55, TEAL)
      rect(46, 107, 6, 51, '#348888')
      // Arm right
      rect(156, 105, 10, 55, TEAL)
      rect(158, 107, 6, 51, '#348888')
      // Legs
      rect(52, 158, 4, 10, '#1a6060')
      rect(154, 158, 4, 10, '#1a6060')
      // Pillow
      rect(58, 115, 20, 16, '#3aaa9a')
      rect(60, 117, 16, 12, '#40b4a4')

      // ── Phone on couch (lying down) ──
      // Phone body
      rect(90, 130, 30, 16, '#1a1a1a')
      rect(91, 131, 28, 14, '#222')
      // Screen
      rect(93, 132, 24, 10, '#334455')
      // Screen glow
      rect(94, 133, 22, 8, '#3a5060')
      // Notification dots on screen
      px(97, 135, '#e85050', 2)
      px(102, 135, '#e85050', 2)
      px(107, 135, '#e85050', 2)
      px(112, 135, '#e85050', 2)
      // Home button
      rect(103, 143, 4, 2, '#333')
      // Phone shadow on couch
      rect(90, 146, 30, 2, '#1a6868')

      // ── Side table with plant ──
      rect(10, 130, 24, 4, '#3a2e22')
      rect(12, 134, 4, 24, '#3a2e22')
      rect(26, 134, 4, 24, '#3a2e22')
      // Pot
      rect(16, 120, 12, 12, '#6a4a2a')
      // Plant
      px(20, 116, '#4a8a4a', 3)
      px(18, 112, '#5a9a5a', 3)
      px(22, 110, '#4a8a4a', 2)
      px(17, 114, '#5a9a5a', 2)

      // ── Caption area ──
      rect(0, H, W, CAPTION_H, BG)
      // Line separator
      rect(40, H + 4, W - 80, 1, '#2a2420')

      // Caption text — pixel font
      ctx.fillStyle = WHITE
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('"and when did you first feel', W / 2, H + 17)
      ctx.fillText('the need to be held?"', W / 2, H + 30)
    }

    draw()

    // Subtle animation — notification dots blink, screen flickers
    let t = 0
    const animate = () => {
      t++

      // Redraw just the phone screen area for animation
      // Screen flicker
      const flicker = Math.sin(t * 0.05) > 0.3 ? '#3a5060' : '#354858'
      rect(94, 133, 22, 8, flicker)

      // Notification dots pulse
      const dotAlpha = Math.sin(t * 0.08) > 0 ? '#e85050' : '#c04040'
      if (t % 60 < 40) {
        px(97, 135, dotAlpha, 2)
        px(102, 135, dotAlpha, 2)
        px(107, 135, dotAlpha, 2)
        px(112, 135, dotAlpha, 2)
      } else {
        rect(97, 135, 2, 2, flicker)
        rect(102, 135, 2, 2, flicker)
        rect(107, 135, 2, 2, flicker)
        rect(112, 135, 2, 2, flicker)
      }

      // Therapist pen taps (every ~3 sec)
      if (t % 180 < 10) {
        px(260, 134, BG, 2) // Pen dot
      }

      frame = requestAnimationFrame(animate)
    }
    let frame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0A0908' }}>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          width: `min(90vw, ${W * 3}px)`,
          height: `min(calc(90vw * ${(H + CAPTION_H) / W}), ${(H + CAPTION_H) * 3}px)`,
        }}
      />
    </div>
  )
}
