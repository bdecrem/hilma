'use client'

import { useEffect, useRef } from 'react'

const SCALE = 5
const GW = 96
const GH = 72
const CANVAS_W = GW * SCALE
const CANVAS_H = GH * SCALE

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
const GREY = '#888888'

export default function Wifi() {
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
    let raf: number

    function px(x: number, y: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x * SCALE * dpr, y * SCALE * dpr, SCALE * dpr, SCALE * dpr)
    }

    function rect(x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = color
      ctx.fillRect(x * SCALE * dpr, y * SCALE * dpr, w * SCALE * dpr, h * SCALE * dpr)
    }

    function draw() {
      frame++

      // Background
      rect(0, 0, GW, GH, CREAM)

      // Wall
      rect(0, 0, GW, 35, '#F5E6CC')
      // Shelf
      rect(10, 35, 76, 2, TANGERINE)
      rect(10, 37, 76, 1, '#D4883A')

      // === ROUTER on shelf center ===
      const rx = 38, ry = 27
      // Router body
      rect(rx, ry, 20, 7, DARK)
      rect(rx, ry, 20, 1, '#444')
      // Antennas
      rect(rx + 3, ry - 6, 1, 6, DARK)
      rect(rx + 16, ry - 6, 1, 6, DARK)
      // Antenna tips
      px(rx + 3, ry - 7, GREY)
      px(rx + 16, ry - 7, GREY)
      // LED lights (animated)
      px(rx + 6, ry + 2, frame % 20 < 10 ? LIME : '#335')
      px(rx + 8, ry + 2, LIME)
      px(rx + 10, ry + 2, frame % 30 < 15 ? TANGERINE : '#335')
      px(rx + 12, ry + 2, frame % 40 < 20 ? CORAL : '#335')
      // Router "face" — smug smile
      px(rx + 7, ry + 4, '#555')
      px(rx + 12, ry + 4, '#555')
      px(rx + 8, ry + 5, '#555')
      px(rx + 9, ry + 5, '#555')
      px(rx + 10, ry + 5, '#555')
      px(rx + 11, ry + 5, '#555')

      // WiFi signal arcs (animated)
      if (frame % 60 < 40) {
        px(rx + 10, ry - 10, TEAL)
        px(rx + 9, ry - 9, TEAL)
        px(rx + 11, ry - 9, TEAL)
      }
      if (frame % 60 < 30) {
        px(rx + 8, ry - 12, TEAL)
        px(rx + 12, ry - 12, TEAL)
        px(rx + 7, ry - 11, TEAL)
        px(rx + 13, ry - 11, TEAL)
      }
      if (frame % 60 < 20) {
        px(rx + 6, ry - 14, TEAL)
        px(rx + 14, ry - 14, TEAL)
        px(rx + 5, ry - 13, TEAL)
        px(rx + 15, ry - 13, TEAL)
      }

      // === LAPTOP on left desk ===
      // Desk
      rect(2, 52, 28, 2, AMBER)
      rect(4, 54, 3, 6, AMBER)
      rect(23, 54, 3, 6, AMBER)

      // Laptop screen
      rect(6, 42, 20, 10, TEAL)
      rect(7, 43, 18, 8, '#1a3a3a')
      // Loading spinner (animated)
      const spinPhase = Math.floor(frame / 8) % 4
      const spinChars = [[14, 46], [16, 46], [16, 48], [14, 48]]
      px(spinChars[spinPhase][0], spinChars[spinPhase][1], WHITE)
      px(15, 47, GREY) // center dot
      // Laptop base
      rect(5, 52, 22, 1, '#444')

      // Signal bars on laptop (full but crossed out)
      px(8, 44, LIME)
      px(9, 44, LIME)
      px(9, 43, LIME)
      px(10, 44, LIME)
      px(10, 43, LIME)
      px(10, 42 + 1, LIME)
      // X over it
      px(8, 43, CORAL)
      px(10, 42 + 1, CORAL)

      // === PHONE on right ===
      rect(70, 43, 10, 16, DARK)
      rect(71, 44, 8, 13, '#333')
      // Screen content — "no internet" with full bars
      rect(72, 45, 6, 1, LIME) // signal bar
      // Text "no"
      px(73, 48, WHITE)
      px(74, 48, WHITE)
      px(73, 50, WHITE)
      px(74, 50, WHITE)
      px(75, 50, WHITE)
      // Sad face
      px(74, 53, WHITE)
      px(76, 53, WHITE)
      px(73, 55, WHITE)
      px(74, 54, WHITE)
      px(75, 54, WHITE)
      px(76, 55, WHITE)

      // === SMART FRIDGE far right ===
      rect(82, 25, 12, 27, WHITE)
      rect(82, 25, 12, 1, '#ddd')
      rect(82, 38, 12, 1, '#ddd')
      // Handle
      rect(83, 30, 1, 6, GREY)
      rect(83, 42, 1, 6, GREY)
      // Screen on fridge
      rect(86, 28, 6, 6, '#333')
      // "buy milk" notification
      px(87, 29, MANGO)
      px(88, 29, MANGO)
      px(89, 29, MANGO)
      px(90, 29, MANGO)
      px(87, 31, WHITE)
      px(88, 31, WHITE)
      px(89, 31, WHITE)
      // Notification badge
      px(91, 27, CORAL)

      // === FLOOR ===
      rect(0, 60, GW, 12, '#E8D5B7')

      // === Little plant on shelf ===
      rect(14, 32, 3, 3, CORAL)
      px(15, 31, LIME)
      px(14, 30, LIME)
      px(16, 30, LIME)

      // === Framed photo on wall ===
      rect(60, 10, 10, 8, WHITE)
      rect(60, 10, 10, 1, MANGO)
      rect(60, 17, 10, 1, MANGO)

      // Amber watermark
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
        &ldquo;everything is connected. nothing is working.&rdquo;
      </div>
    </div>
  )
}
