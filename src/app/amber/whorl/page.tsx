'use client'

import { useEffect, useRef } from 'react'

// Citrus palette RGB
const PALETTE: [number, number, number][] = [
  [255, 78, 80],    // blood orange
  [252, 145, 58],   // tangerine
  [249, 212, 35],   // mango
  [180, 227, 61],   // lime zest
  [255, 107, 129],  // grapefruit
]

// Warm cream background
const BG: [number, number, number] = [255, 248, 231]

type CenterType = 'whorl' | 'loop' | 'arch'

interface Center {
  xr: number        // x ratio 0-1
  yr: number        // y ratio 0-1
  colorIdx: number
  type: CenterType
  loopAngle: number // direction of loop opening (radians)
}

function ridgeDist(px: number, py: number, c: Center, W: number, H: number): number {
  const cx = c.xr * W
  const cy = c.yr * H
  const dx = px - cx
  const dy = py - cy
  const r = Math.sqrt(dx * dx + dy * dy)

  if (c.type === 'whorl') {
    return r
  } else if (c.type === 'loop') {
    // Elongated oval opening in loopAngle direction
    const angle = Math.atan2(dy, dx)
    const diff = angle - c.loopAngle
    return r * (1 + 0.38 * Math.cos(diff))
  } else {
    // Arch: gently arching parallel ridges
    const angle = Math.atan2(dy, dx)
    return r * (1 + 0.22 * Math.cos(2 * angle))
  }
}

const INITIAL: Center[] = [
  { xr: 0.33, yr: 0.43, colorIdx: 0, type: 'whorl',  loopAngle: 0 },
  { xr: 0.70, yr: 0.28, colorIdx: 1, type: 'loop',   loopAngle: 0.4 },
  { xr: 0.52, yr: 0.70, colorIdx: 2, type: 'whorl',  loopAngle: 0 },
  { xr: 0.16, yr: 0.62, colorIdx: 3, type: 'arch',   loopAngle: -0.7 },
  { xr: 0.82, yr: 0.60, colorIdx: 4, type: 'loop',   loopAngle: 2.6 },
]

const TYPES: CenterType[] = ['whorl', 'loop', 'arch', 'whorl', 'loop']

export default function Whorl() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const centersRef = useRef<Center[]>(INITIAL.map(c => ({ ...c })))
  const phaseRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const SCALE = 4   // render at 1/4 resolution, CSS bilinear-upscales
    const FREQ = 1.7  // radians per render-pixel → period ≈ 3.7 render-px → ~15 screen-px

    const resize = () => {
      canvas.width  = Math.floor(window.innerWidth  / SCALE)
      canvas.height = Math.floor(window.innerHeight / SCALE)
      canvas.style.width  = window.innerWidth  + 'px'
      canvas.style.height = window.innerHeight + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      const centers = centersRef.current
      const phase = phaseRef.current
      const img = ctx.createImageData(W, H)
      const buf = img.data

      // Weight falloff: sigma² = (W * 0.28)²
      const sigma2 = W * W * 0.078

      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          let rAcc = 0, gAcc = 0, bAcc = 0
          let wSum = 0

          for (let k = 0; k < centers.length; k++) {
            const c = centers[k]
            const d = ridgeDist(px, py, c, W, H)
            // Gaussian weight: strong near center, fades at ~28% of canvas width
            const wt = Math.exp(-d * d / sigma2)
            // Ridge crest = 1.0, valley = 0.0
            const ridge = (Math.sin(d * FREQ + phase) + 1) * 0.5
            const [r, g, b] = PALETTE[c.colorIdx]
            // Lerp valley (cream) → crest (full citrus)
            const cr = BG[0] + (r - BG[0]) * ridge
            const cg = BG[1] + (g - BG[1]) * ridge
            const cb = BG[2] + (b - BG[2]) * ridge

            rAcc += cr * wt
            gAcc += cg * wt
            bAcc += cb * wt
            wSum += wt
          }

          // Add background "phantom center" so far-field → cream
          const BG_WT = 0.45
          rAcc += BG[0] * BG_WT
          gAcc += BG[1] * BG_WT
          bAcc += BG[2] * BG_WT
          wSum += BG_WT

          const i = (py * W + px) << 2
          buf[i]   = (rAcc / wSum) | 0
          buf[i+1] = (gAcc / wSum) | 0
          buf[i+2] = (bAcc / wSum) | 0
          buf[i+3] = 255
        }
      }

      ctx.putImageData(img, 0, 0)

      // Amber accent — tiny dot at each center position
      ctx.save()
      for (const c of centers) {
        const cx = c.xr * W
        const cy = c.yr * H
        ctx.beginPath()
        ctx.arc(cx, cy, 1.2, 0, Math.PI * 2)
        ctx.fillStyle = '#D4A574'
        ctx.fill()
      }
      ctx.restore()
    }

    const animate = () => {
      phaseRef.current += 0.045
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }
    animate()

    const handleTap = (clientX: number, clientY: number) => {
      const centers = centersRef.current
      if (centers.length >= 8) centers.splice(0, 1)
      const idx = centers.length
      centers.push({
        xr: clientX / window.innerWidth,
        yr: clientY / window.innerHeight,
        colorIdx: idx % PALETTE.length,
        type: TYPES[idx % TYPES.length],
        loopAngle: Math.random() * Math.PI * 2,
      })
    }

    const onClick = (e: MouseEvent) => handleTap(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }

    canvas.addEventListener('click', onClick)
    canvas.addEventListener('touchstart', onTouch, { passive: false })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('touchstart', onTouch)
    }
  }, [])

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      overflow: 'hidden',
      background: '#FFF8E7',
    }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', imageRendering: 'auto' }}
      />
    </div>
  )
}
