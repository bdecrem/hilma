'use client'

import { useEffect, useRef } from 'react'

// v3 SIGNAL palette
const NIGHT = '#0A0A0A'
const LIME = '#C6FF3C'

// Wave number — fringe spacing ≈ 2π/K ≈ 114px
const K = 0.055

export default function Interference() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!

    // Off-screen buffer for interference field — rendered at 1/SCALE resolution
    const SCALE = 3
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')!
    off.width = Math.ceil(W / SCALE)
    off.height = Math.ceil(H / SCALE)

    // Two wave sources, normalized [0,1]
    const src = [
      { x: 0.33, y: 0.46 },
      { x: 0.67, y: 0.54 },
    ]

    let phase = 0
    let drag = -1 // -1 = none, 0 or 1 = source index
    let raf = 0

    function drawField() {
      const ow = off.width
      const oh = off.height
      const img = offCtx.createImageData(ow, oh)
      const data = img.data

      const s0x = src[0].x * W
      const s0y = src[0].y * H
      const s1x = src[1].x * W
      const s1y = src[1].y * H

      for (let py = 0; py < oh; py++) {
        for (let qx = 0; qx < ow; qx++) {
          const wx = (qx + 0.5) * SCALE
          const wy = (py + 0.5) * SCALE
          const d0 = Math.sqrt((wx - s0x) ** 2 + (wy - s0y) ** 2)
          const d1 = Math.sqrt((wx - s1x) ** 2 + (wy - s1y) ** 2)

          // Coherent interference: sum of two outward cosine waves
          const wave = (Math.cos(K * d0 - phase) + Math.cos(K * d1 - phase)) * 0.5
          // wave ∈ [-1, 1] → intensity ∈ [0, 1], gamma for crispness
          const t = (wave + 1) * 0.5
          const c = Math.round(10 + 222 * Math.pow(t, 1.4))

          const i = (py * ow + qx) * 4
          data[i] = c
          data[i + 1] = c
          data[i + 2] = c
          data[i + 3] = 255
        }
      }

      offCtx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      ctx.drawImage(off, 0, 0, W, H)
    }

    function drawSrc(s: { x: number; y: number }, active: boolean) {
      const sx = s.x * W
      const sy = s.y * H
      const glowR = active ? 32 : 22

      // Lime glow
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR)
      grd.addColorStop(0, `rgba(198,255,60,${active ? 0.45 : 0.28})`)
      grd.addColorStop(1, 'rgba(198,255,60,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Solid lime dot
      ctx.fillStyle = LIME
      ctx.beginPath()
      ctx.arc(sx, sy, active ? 5 : 4, 0, Math.PI * 2)
      ctx.fill()
    }

    function drawLabel() {
      const lx = Math.max(20, W * 0.055)
      const ly = H - Math.max(14, H * 0.025)
      const tsz = Math.min(28, W * 0.05)
      const ssz = Math.min(11, W * 0.02)

      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'

      // Title — Fraunces italic light
      ctx.font = `300 italic ${tsz}px "Fraunces", Georgia, serif`
      ctx.fillStyle = 'rgba(232,232,232,0.9)'
      ctx.fillText('interference', lx, ly - tsz * 0.4)

      // Subtitle — Courier Prime Bold
      ctx.font = `700 ${ssz}px "Courier Prime", "Courier New", monospace`
      ctx.fillStyle = 'rgba(232,232,232,0.44)'
      ctx.fillText('two signals meeting', lx, ly + 6)

      // Bottom-right spec
      ctx.textAlign = 'right'
      ctx.font = '700 10px "Courier Prime", "Courier New", monospace'
      ctx.fillStyle = 'rgba(232,232,232,0.28)'
      ctx.fillText('signal · spec 003 · 04.16.26', W - lx, H - 14)
    }

    function loop() {
      phase += 0.014
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawField()
      drawSrc(src[0], drag === 0)
      drawSrc(src[1], drag === 1)
      drawLabel()
      raf = requestAnimationFrame(loop)
    }

    function hitSrc(cx: number, cy: number): number {
      const THRESH = 44
      const d0 = Math.hypot(cx - src[0].x * W, cy - src[0].y * H)
      const d1 = Math.hypot(cx - src[1].x * W, cy - src[1].y * H)
      if (d0 < THRESH && d0 <= d1) return 0
      if (d1 < THRESH) return 1
      return -1
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      drag = hitSrc(e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => {
      if (drag < 0) return
      e.preventDefault()
      src[drag].x = Math.max(0.02, Math.min(0.98, e.clientX / W))
      src[drag].y = Math.max(0.02, Math.min(0.98, e.clientY / H))
    }
    const onUp = () => { drag = -1 }

    const onResize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      off.width = Math.ceil(W / SCALE)
      off.height = Math.ceil(H / SCALE)
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('resize', onResize)

    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100dvh',
          cursor: 'crosshair',
          touchAction: 'none',
          background: NIGHT,
        }}
      />
    </>
  )
}
