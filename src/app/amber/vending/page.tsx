'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const ITEMS = [
  ['patience', 'motivation', 'closure'],
  ['self-worth', 'posture', 'sleep'],
  ['ambition', 'inner peace', 'focus'],
  ['boundaries', 'follow-thru', 'chill'],
]
const PRICES = ['$2.50', '$4.99', '$3.75', '$∞', '$8.99', '$0.00', '$12.00', '$5.50', '$3.25', '$6.00', '$7.50', '$1.00']
const ROWS = 'ABCD'
const DEFAULT_MSG = 'INSERT COIN OR EXISTENTIAL CRISIS'

const STUCK = [
  'STUCK. LIKE YOUR CAREER.',
  'TRY AGAIN. AS USUAL.',
  'SO CLOSE. AND YET.',
  'JAMMED. JUST LIKE YOU.',
  'HAVE YOU TRIED WANTING LESS?',
  'ERROR: INSUFFICIENT EFFORT',
  'ITEM STUCK. AREN\'T WE ALL.',
]
const WRONG: [string, string][] = [
  ['anxiety', 'DISPENSED: ANXIETY (FREE)'],
  ['regret', 'ENJOY YOUR REGRET'],
  ['overthinking', 'WRONG ITEM. OBVIOUSLY.'],
  ['self-doubt', 'SURPRISE: SELF-DOUBT'],
  ['dread', 'HERE\'S DREAD INSTEAD'],
  ['nostalgia', 'DELIVERED: NOSTALGIA'],
  ['imposter syndrome', 'BONUS: IMPOSTER SYNDROME'],
]

interface Anim {
  row: number; col: number
  phase: 'shaking' | 'stuck' | 'result'
  start: number
  isStuck: boolean
  stuckMsg: string
  wrongItem: string; wrongMsg: string
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export default function Vending() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<Anim | null>(null)
  const displayRef = useRef(DEFAULT_MSG)
  const dispensedRef = useRef<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('vending')

    // Layout — machine fills screen with padding
    const p = 12
    const mX = p, mY = p, mW = W - p * 2, mH = H - p * 2

    // Sub-regions (relative fractions of machine height)
    const dispY = mY + 10, dispH = 44, dispX = mX + 10, dispW = mW - 20
    const glassY = dispY + dispH + 8, glassH = mH * 0.48
    const glassX = mX + 10, glassW = mW - 20
    const cellW = glassW / 3, cellH = glassH / 4
    const keyY = glassY + glassH + 12, keyH = mH * 0.22
    const keyX = mX + 30, keyW = mW - 60
    const btnW = keyW / 3, btnH = keyH / 4
    const slotY = keyY + keyH + 10, slotH = 44
    const slotX = mX + mW * 0.2, slotW = mW * 0.6

    let raf: number

    function draw() {
      const now = Date.now()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // BG
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1); grad.addColorStop(1, bg2)
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

      // Machine body
      ctx.fillStyle = '#2A2218'; rr(ctx, mX, mY, mW, mH, 14); ctx.fill()
      ctx.fillStyle = '#332B20'; rr(ctx, mX + 4, mY + 4, mW - 8, mH - 8, 12); ctx.fill()

      // Display
      ctx.fillStyle = '#0a1a0a'; rr(ctx, dispX, dispY, dispW, dispH, 5); ctx.fill()
      const fontSize = Math.min(13, W * 0.03)
      ctx.font = `${fontSize}px monospace`
      ctx.fillStyle = '#B4E33D'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      // Truncate display text to fit
      let msg = displayRef.current
      while (ctx.measureText(msg).width > dispW - 16 && msg.length > 3) msg = msg.slice(0, -1)
      ctx.fillText(msg, dispX + dispW / 2, dispY + dispH / 2)

      // Glass panel
      ctx.fillStyle = 'rgba(255,248,231,0.04)'; rr(ctx, glassX, glassY, glassW, glassH, 6); ctx.fill()
      ctx.strokeStyle = 'rgba(255,248,231,0.08)'; ctx.lineWidth = 1
      rr(ctx, glassX, glassY, glassW, glassH, 6); ctx.stroke()

      // Resolve animation phases
      const a = animRef.current
      if (a) {
        const el = now - a.start
        if (a.phase === 'shaking' && el >= 1500) {
          a.start = now
          if (a.isStuck) {
            a.phase = 'stuck'; displayRef.current = a.stuckMsg
          } else {
            a.phase = 'result'; displayRef.current = a.wrongMsg; dispensedRef.current = a.wrongItem
          }
        } else if (a.phase === 'stuck' && el >= 2500) {
          animRef.current = null; displayRef.current = DEFAULT_MSG
        } else if (a.phase === 'result' && el >= 3500) {
          animRef.current = null; displayRef.current = DEFAULT_MSG; dispensedRef.current = null
        }
      }

      // Items
      const itemFont = Math.min(11, W * 0.025)
      const priceFont = Math.min(9, W * 0.02)
      const codeFont = Math.min(8, W * 0.018)
      for (let r = 0; r < 4; r++) {
        // Shelf
        const sy = glassY + (r + 1) * cellH
        ctx.strokeStyle = 'rgba(255,248,231,0.06)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(glassX + 4, sy); ctx.lineTo(glassX + glassW - 4, sy); ctx.stroke()

        for (let c = 0; c < 3; c++) {
          // Skip if item was dispensed (wrong item came out)
          if (a && a.phase === 'result' && a.row === r && a.col === c) continue

          const ix = glassX + c * cellW + cellW * 0.12
          const iy = glassY + r * cellH + cellH * 0.18
          const iw = cellW * 0.76, ih = cellH * 0.52
          let sx = 0
          if (a && a.phase === 'shaking' && a.row === r && a.col === c) {
            sx = Math.sin((now - a.start) * 0.04) * 3
          }

          // Coil (simple spiral)
          ctx.strokeStyle = 'rgba(255,248,231,0.15)'; ctx.lineWidth = 1.5
          for (let i = 0; i < 3; i++) {
            const cx = ix + sx + 6 + i * (iw / 3)
            ctx.beginPath()
            ctx.arc(cx, iy + ih + 4, 4, 0, Math.PI * 1.5)
            ctx.stroke()
          }

          // Package
          ctx.fillStyle = CITRUS[(r * 3 + c) % CITRUS.length]
          ctx.globalAlpha = 0.88; rr(ctx, ix + sx, iy, iw, ih, 3); ctx.fill(); ctx.globalAlpha = 1

          // Label
          ctx.font = `bold ${itemFont}px monospace`
          ctx.fillStyle = '#FFF8E7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(ITEMS[r][c], ix + sx + iw / 2, iy + ih / 2 - 5)
          // Price
          ctx.font = `${priceFont}px monospace`
          ctx.fillStyle = 'rgba(255,248,231,0.65)'
          ctx.fillText(PRICES[r * 3 + c], ix + sx + iw / 2, iy + ih / 2 + 7)
          // Code
          ctx.font = `${codeFont}px monospace`
          ctx.fillStyle = 'rgba(255,248,231,0.3)'; ctx.textAlign = 'left'
          ctx.fillText(`${ROWS[r]}${c + 1}`, ix + sx + 2, iy + 8)
        }
      }

      // Keypad
      ctx.fillStyle = 'rgba(255,248,231,0.03)'; rr(ctx, mX + 16, keyY - 4, mW - 32, keyH + 8, 6); ctx.fill()
      const kFont = Math.min(13, W * 0.03)
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          const bx = keyX + c * btnW + 3, by = keyY + r * btnH + 2
          const bw = btnW - 6, bh = btnH - 4
          ctx.fillStyle = 'rgba(255,248,231,0.1)'; rr(ctx, bx, by, bw, bh, 5); ctx.fill()
          ctx.strokeStyle = 'rgba(255,248,231,0.06)'; rr(ctx, bx, by, bw, bh, 5); ctx.stroke()
          ctx.font = `bold ${kFont}px monospace`
          ctx.fillStyle = '#FFF8E7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(`${ROWS[r]}${c + 1}`, bx + bw / 2, by + bh / 2)
        }
      }

      // Dispense slot
      ctx.fillStyle = '#0a0a06'; rr(ctx, slotX, slotY, slotW, slotH, 6); ctx.fill()
      ctx.fillStyle = '#161610'; ctx.fillRect(slotX + 8, slotY + slotH - 14, slotW - 16, 10)

      // Wrong item in slot
      if (dispensedRef.current) {
        ctx.fillStyle = '#FF6B81'; ctx.globalAlpha = 0.9
        rr(ctx, slotX + slotW * 0.1, slotY + 6, slotW * 0.8, slotH - 18, 3); ctx.fill()
        ctx.globalAlpha = 1
        ctx.font = `bold ${Math.min(11, W * 0.025)}px monospace`
        ctx.fillStyle = '#FFF8E7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(dispensedRef.current, slotX + slotW / 2, slotY + slotH / 2 - 3)
      }

      raf = requestAnimationFrame(draw)
    }

    function handleTap(cx: number, cy: number) {
      if (animRef.current) return
      if (cx >= keyX && cx <= keyX + keyW && cy >= keyY && cy <= keyY + keyH) {
        const col = Math.floor((cx - keyX) / btnW)
        const row = Math.floor((cy - keyY) / btnH)
        if (row >= 0 && row < 4 && col >= 0 && col < 3) {
          const stuck = Math.random() < 0.65
          animRef.current = {
            row, col, phase: 'shaking', start: Date.now(), isStuck: stuck,
            stuckMsg: STUCK[Math.floor(Math.random() * STUCK.length)],
            wrongItem: WRONG[Math.floor(Math.random() * WRONG.length)][0],
            wrongMsg: WRONG[Math.floor(Math.random() * WRONG.length)][1],
          }
          displayRef.current = `DISPENSING ${ITEMS[row][col].toUpperCase()}...`
          dispensedRef.current = null
        }
      }
    }

    canvas.addEventListener('click', e => handleTap(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', e => {
      e.preventDefault(); handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    window.addEventListener('resize', onResize)
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100dvh',
      cursor: 'pointer', touchAction: 'none',
    }} />
  )
}
