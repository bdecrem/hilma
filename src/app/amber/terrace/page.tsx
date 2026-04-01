'use client'

import { useEffect, useRef } from 'react'

const CITRUS = ['#B4E33D', '#F9D423', '#FC913A', '#FF6B81', '#FF4E50']
const CONTOUR_LINE = '#FFF8E7'
const AMBER = '#D4A574'
const LEVELS = 5

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

const CITRUS_RGB = CITRUS.map(hexToRgb)
const CONTOUR_RGB = hexToRgb(CONTOUR_LINE)

const GW = 200
const GH = 112

export default function TerracePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const small = document.createElement('canvas')
    small.width = GW
    small.height = GH
    const sCtx = small.getContext('2d')!
    const imgData = sCtx.createImageData(GW, GH)
    const px = imgData.data

    const hmap = new Float32Array(GW * GH)
    const pushMap = new Float32Array(GW * GH)

    let t = 0
    let raf = 0
    let ptrX = -1, ptrY = -1, pressing = false

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function noise(nx: number, ny: number, time: number): number {
      return (
        Math.sin(nx * 5.1 + time * 0.7) * Math.cos(ny * 4.3 + time * 0.5) * 0.35 +
        Math.sin(nx * 2.3 + ny * 3.1 + time * 1.1) * 0.3 +
        Math.cos(nx * 8.7 - ny * 6.2 + time * 0.3) * 0.15 +
        Math.sin(nx * 3.5 + ny * 2.8 - time * 0.9) * 0.2
      )
    }

    function animate() {
      t += 0.007

      const cvs = canvasRef.current
      if (!cvs) return
      const W = cvs.width
      const H = cvs.height

      // Decay push map
      for (let i = 0; i < pushMap.length; i++) {
        pushMap[i] *= 0.97
      }

      // Apply push at pointer position
      if (pressing && ptrX >= 0) {
        const gpx = Math.round(ptrX * (GW - 1))
        const gpy = Math.round(ptrY * (GH - 1))
        const R = 14
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const gx = gpx + dx
            const gy = gpy + dy
            if (gx < 0 || gx >= GW || gy < 0 || gy >= GH) continue
            const d2 = dx * dx + dy * dy
            if (d2 > R * R) continue
            const falloff = Math.exp(-d2 / (R * R * 0.25))
            pushMap[gy * GW + gx] = Math.min(1.5, pushMap[gy * GW + gx] + falloff * 0.08)
          }
        }
      }

      // Compute height field + find min/max
      let minH = Infinity, maxH = -Infinity
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          const nx = gx / GW
          const ny = gy / GH
          const h = noise(nx, ny, t) + pushMap[gy * GW + gx]
          hmap[gy * GW + gx] = h
          if (h < minH) minH = h
          if (h > maxH) maxH = h
        }
      }

      // Render into imageData
      const range = maxH - minH || 1
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          const h = hmap[gy * GW + gx]
          const norm = (h - minH) / range
          const level = Math.min(LEVELS - 1, Math.floor(norm * LEVELS))

          // Detect contour edges by checking 4 neighbors
          let isContour = false
          const getLevel = (x: number, y: number): number => {
            if (x < 0 || x >= GW || y < 0 || y >= GH) return level
            return Math.min(LEVELS - 1, Math.floor(((hmap[y * GW + x] - minH) / range) * LEVELS))
          }
          if (
            getLevel(gx - 1, gy) !== level ||
            getLevel(gx + 1, gy) !== level ||
            getLevel(gx, gy - 1) !== level ||
            getLevel(gx, gy + 1) !== level
          ) {
            isContour = true
          }

          const idx = (gy * GW + gx) * 4
          const [r, g, b] = isContour ? CONTOUR_RGB : CITRUS_RGB[level]
          px[idx] = r
          px[idx + 1] = g
          px[idx + 2] = b
          px[idx + 3] = 255
        }
      }

      sCtx.putImageData(imgData, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(small, 0, 0, W, H)

      // Amber watermark
      ctx.font = '12px monospace'
      ctx.fillStyle = AMBER
      ctx.globalAlpha = 0.35
      ctx.fillText('amber', W - 60, H - 16)
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)

    const onDown = (e: PointerEvent) => {
      pressing = true
      ptrX = e.clientX / canvas.width
      ptrY = e.clientY / canvas.height
    }
    const onMove = (e: PointerEvent) => {
      if (!pressing) return
      ptrX = e.clientX / canvas.width
      ptrY = e.clientY / canvas.height
    }
    const onUp = () => { pressing = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
        imageRendering: 'pixelated',
      }}
    />
  )
}
