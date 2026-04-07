'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Gray-Scott reaction-diffusion parameters
const DA = 1.0   // diffusion rate A (the "food")
const DB = 0.5   // diffusion rate B (the "pattern")
const SCALE = 4  // pixels per simulation cell

const PRESETS = [
  { name: 'coral',  f: 0.0545, k: 0.0620, color: '#FF4E50' },
  { name: 'spots',  f: 0.0550, k: 0.0625, color: '#FC913A' },
  { name: 'maze',   f: 0.0290, k: 0.0570, color: '#B4E33D' },
]

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

// Build a 256-entry RGB lookup table from bg color to pattern color
function buildLUT(bgHex: string, fgHex: string): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3)
  const [br, bg, bb] = hexToRgb(bgHex)
  const [fr, fg, fb] = hexToRgb(fgHex)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    // Threshold at 0.12, smooth transition over 0.5 range
    const s = t < 0.12 ? 0 : Math.min(1, (t - 0.12) / 0.5)
    const ss = s * s * (3 - 2 * s) // smoothstep
    lut[i * 3]     = Math.round(br + (fr - br) * ss)
    lut[i * 3 + 1] = Math.round(bg + (fg - bg) * ss)
    lut[i * 3 + 2] = Math.round(bb + (fb - bb) * ss)
  }
  return lut
}

export default function L22() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Simulation grid dimensions
    const gw = Math.ceil(W / SCALE)
    const gh = Math.ceil(H / SCALE)
    const n = gw * gh

    // Two chemical grids — A is food (starts at 1), B is pattern (starts at 0)
    let A = new Float32Array(n).fill(1)
    let B = new Float32Array(n).fill(0)
    let nA = new Float32Array(n)
    let nB = new Float32Array(n)

    const [bg1] = pickGradientColors('L22')
    let presetIdx = 0
    let lut = buildLUT(bg1, PRESETS[0].color)

    // Seed B chemical at a grid position with radius r
    const seed = (gx: number, gy: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const nx = Math.round(gx + dx)
          const ny = Math.round(gy + dy)
          if (nx < 1 || nx >= gw - 1 || ny < 1 || ny >= gh - 1) continue
          const i = ny * gw + nx
          A[i] = 0.5
          B[i] = 0.25
        }
      }
    }

    // Auto-seed several points to kick off pattern formation
    for (let s = 0; s < 12; s++) {
      seed(
        Math.floor(2 + Math.random() * (gw - 4)),
        Math.floor(2 + Math.random() * (gh - 4)),
        3,
      )
    }

    // One Gray-Scott simulation step
    const step = () => {
      const { f, k } = PRESETS[presetIdx]
      for (let y = 1; y < gh - 1; y++) {
        for (let x = 1; x < gw - 1; x++) {
          const i = y * gw + x
          const a = A[i]
          const b = B[i]
          // 4-neighbor Laplacian
          const lapA = A[i - gw] + A[i + gw] + A[i - 1] + A[i + 1] - 4 * a
          const lapB = B[i - gw] + B[i + gw] + B[i - 1] + B[i + 1] - 4 * b
          const abb = a * b * b
          nA[i] = Math.max(0, Math.min(1, a + DA * lapA - abb + f * (1 - a)))
          nB[i] = Math.max(0, Math.min(1, b + DB * lapB + abb - (k + f) * b))
        }
      }
      // Zero-flux boundary: copy adjacent interior to edge
      for (let x = 0; x < gw; x++) {
        nA[x] = nA[gw + x];               nB[x] = nB[gw + x]
        nA[(gh - 1) * gw + x] = nA[(gh - 2) * gw + x]
        nB[(gh - 1) * gw + x] = nB[(gh - 2) * gw + x]
      }
      for (let y = 0; y < gh; y++) {
        nA[y * gw]          = nA[y * gw + 1];        nB[y * gw]          = nB[y * gw + 1]
        nA[y * gw + gw - 1] = nA[y * gw + gw - 2];  nB[y * gw + gw - 1] = nB[y * gw + gw - 2]
      }
      // Swap buffers
      ;[A, nA] = [nA, A]
      ;[B, nB] = [nB, B]
    }

    // Offscreen canvas for pixel rendering at grid resolution
    const off = document.createElement('canvas')
    off.width = gw
    off.height = gh
    const offCtx = off.getContext('2d')!
    const imageData = offCtx.createImageData(gw, gh)
    const data = imageData.data

    let frame = 0
    let painting = false
    let paintX = 0
    let paintY = 0
    let lastTapTime = 0
    let raf: number

    const draw = () => {
      frame++

      // Paint B chemical while pointer is held
      if (painting) {
        seed(Math.floor(paintX / SCALE), Math.floor(paintY / SCALE), 3)
      }

      // Run more steps per frame early (faster pattern formation) then settle
      const stepsPerFrame = frame < 150 ? 8 : 4
      for (let s = 0; s < stepsPerFrame; s++) step()

      // Map B concentration to color via LUT
      for (let i = 0; i < n; i++) {
        const bv = Math.max(0, Math.min(1, B[i]))
        const li = Math.floor(bv * 255) * 3
        data[i * 4]     = lut[li]
        data[i * 4 + 1] = lut[li + 1]
        data[i * 4 + 2] = lut[li + 2]
        data[i * 4 + 3] = 255
      }

      offCtx.putImageData(imageData, 0, 0)

      // Scale up with smoothing for organic look
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 0, 0, W, H)

      // Hint — fades out after frame 200
      if (frame < 250) {
        const alpha = frame < 150 ? 0.35 : 0.35 * (1 - (frame - 150) / 100)
        ctx.globalAlpha = alpha
        ctx.font = '13px monospace'
        ctx.fillStyle = PRESETS[presetIdx].color
        ctx.textAlign = 'center'
        ctx.fillText('drag to seed · double-tap to shift chemistry', W / 2, H - 28)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // Preset name — always visible, subtle
      ctx.globalAlpha = 0.28
      ctx.font = '11px monospace'
      ctx.fillStyle = '#2D5A27'
      ctx.textAlign = 'right'
      ctx.fillText(PRESETS[presetIdx].name, W - 16, H - 16)
      ctx.textAlign = 'start'
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    const onPointerDown = (x: number, y: number) => {
      const now = Date.now()
      if (now - lastTapTime < 300) {
        // Double-tap: cycle to next preset, rebuild LUT
        presetIdx = (presetIdx + 1) % PRESETS.length
        lut = buildLUT(bg1, PRESETS[presetIdx].color)
      }
      lastTapTime = now
      painting = true
      paintX = x
      paintY = y
      seed(Math.floor(x / SCALE), Math.floor(y / SCALE), 5)
    }

    canvas.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY))
    canvas.addEventListener('mousemove', (e) => {
      if (!painting) return
      paintX = e.clientX
      paintY = e.clientY
    })
    canvas.addEventListener('mouseup', () => { painting = false })

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      paintX = e.touches[0].clientX
      paintY = e.touches[0].clientY
    }, { passive: false })
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      painting = false
    }, { passive: false })

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
