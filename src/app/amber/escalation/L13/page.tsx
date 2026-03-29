'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
}

export default function L13Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const [bg1, bg2] = pickGradientColors('L13')
    const blobs: Blob[] = []
    const GRAVITY = 0.15
    const BOUNCE = 0.6
    const FRICTION = 0.995

    // Seed a few blobs
    for (let i = 0; i < 5; i++) {
      blobs.push({
        x: W * 0.2 + Math.random() * W * 0.6,
        y: H * 0.2 + Math.random() * H * 0.3,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 2,
        r: 30 + Math.random() * 25,
        color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
      })
    }

    // Metaball rendering using threshold
    const scale = 4 // render at 1/4 resolution for performance
    const mW = Math.ceil(W / scale)
    const mH = Math.ceil(H / scale)
    const metaCanvas = document.createElement('canvas')
    metaCanvas.width = mW
    metaCanvas.height = mH
    const mCtx = metaCanvas.getContext('2d')!

    function addBlob(x: number, y: number) {
      const count = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        blobs.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 6,
          vy: -2 - Math.random() * 4,
          r: 20 + Math.random() * 20,
          color: CITRUS[Math.floor(Math.random() * CITRUS.length)],
        })
      }
    }

    canvas.addEventListener('pointerdown', (e) => addBlob(e.clientX, e.clientY))
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons > 0) addBlob(e.clientX, e.clientY)
    })

    let raf: number
    function animate() {
      // Physics
      for (const b of blobs) {
        b.vy += GRAVITY
        b.x += b.vx
        b.y += b.vy
        b.vx *= FRICTION
        b.vy *= FRICTION

        // Walls
        if (b.y + b.r > H) { b.y = H - b.r; b.vy *= -BOUNCE }
        if (b.y - b.r < 0) { b.y = b.r; b.vy *= -BOUNCE }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx *= -BOUNCE }
        if (b.x - b.r < 0) { b.x = b.r; b.vx *= -BOUNCE }
      }

      // Blob-blob soft collision
      for (let i = 0; i < blobs.length; i++) {
        for (let j = i + 1; j < blobs.length; j++) {
          const a = blobs[i], b = blobs[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const minDist = (a.r + b.r) * 0.7
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) * 0.02
            const nx = dx / dist, ny = dy / dist
            a.vx -= nx * push
            a.vy -= ny * push
            b.vx += nx * push
            b.vy += ny * push
          }
        }
      }

      // Cap blob count
      while (blobs.length > 80) blobs.shift()

      // Background
      const grad = ctx!.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, W, H)

      // Render metaballs at low res
      const imageData = mCtx.createImageData(mW, mH)
      const data = imageData.data

      for (let py = 0; py < mH; py++) {
        for (let px = 0; px < mW; px++) {
          const wx = px * scale
          const wy = py * scale
          let sum = 0
          let cr = 0, cg = 0, cb = 0, cw = 0

          for (const b of blobs) {
            const dx = wx - b.x
            const dy = wy - b.y
            const d2 = dx * dx + dy * dy
            const influence = (b.r * b.r) / d2
            sum += influence

            if (influence > 0.1) {
              // Parse color for blending
              const r = parseInt(b.color.slice(1, 3), 16)
              const g = parseInt(b.color.slice(3, 5), 16)
              const bl = parseInt(b.color.slice(5, 7), 16)
              cr += r * influence
              cg += g * influence
              cb += bl * influence
              cw += influence
            }
          }

          const idx = (py * mW + px) * 4
          if (sum > 1.0) {
            // Inside metaball
            const alpha = Math.min(1, (sum - 1.0) * 2)
            if (cw > 0) {
              data[idx] = Math.min(255, cr / cw)
              data[idx + 1] = Math.min(255, cg / cw)
              data[idx + 2] = Math.min(255, cb / cw)
            }
            data[idx + 3] = Math.floor(alpha * 230)
          } else if (sum > 0.8) {
            // Edge glow
            const edge = (sum - 0.8) / 0.2
            if (cw > 0) {
              data[idx] = Math.min(255, cr / cw)
              data[idx + 1] = Math.min(255, cg / cw)
              data[idx + 2] = Math.min(255, cb / cw)
            }
            data[idx + 3] = Math.floor(edge * 100)
          }
        }
      }

      mCtx.putImageData(imageData, 0, 0)

      // Draw metaballs scaled up
      ctx!.save()
      ctx!.imageSmoothingEnabled = true
      ctx!.drawImage(metaCanvas, 0, 0, W, H)
      ctx!.restore()

      // Hint
      if (blobs.length < 8) {
        ctx!.save()
        ctx!.globalAlpha = 0.3 + Math.sin(Date.now() / 700) * 0.1
        ctx!.fillStyle = '#2A2218'
        ctx!.font = `${Math.max(14, W * 0.018)}px system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.fillText('tap to drop', W / 2, H - 40)
        ctx!.restore()
      }

      raf = requestAnimationFrame(animate)
    }

    animate()

    function onResize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    />
  )
}
