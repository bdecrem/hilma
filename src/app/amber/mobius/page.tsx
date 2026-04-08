'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Ant {
  t: number // position along the strip (0 to 2*PI for full loop)
  speed: number
  color: string
  size: number
}

export default function Mobius() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const antsRef = useRef<Ant[]>([{ t: 0, speed: 0.008, color: '#2A2218', size: 6 }])
  const rotRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('mobius')
    let raf: number

    // Möbius strip parametric equations
    // x(t, s) = (R + s * cos(t/2)) * cos(t)
    // y(t, s) = (R + s * cos(t/2)) * sin(t)
    // z(t, s) = s * sin(t/2)
    // where t goes 0 to 2π, s goes -w/2 to w/2

    function mobiusPoint(t: number, s: number, R: number, rotY: number): [number, number, number] {
      const halfT = t / 2
      const x = (R + s * Math.cos(halfT)) * Math.cos(t)
      const y = (R + s * Math.cos(halfT)) * Math.sin(t)
      const z = s * Math.sin(halfT)

      // Rotate around Y axis
      const rx = x * Math.cos(rotY) - z * Math.sin(rotY)
      const rz = x * Math.sin(rotY) + z * Math.cos(rotY)

      // Tilt forward slightly
      const tilt = 0.4
      const ry = y * Math.cos(tilt) - rz * Math.sin(tilt)
      const rz2 = y * Math.sin(tilt) + rz * Math.cos(tilt)

      return [rx, ry, rz2]
    }

    function project(x: number, y: number, z: number): [number, number] {
      const fov = 400
      const d = fov + z
      return [W / 2 + (x * fov) / d, H / 2 + (y * fov) / d]
    }

    const draw = () => {
      rotRef.current += 0.004
      const rot = rotRef.current

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      const R = Math.min(W, H) * 0.22
      const stripW = R * 0.35
      const SEGS_T = 80
      const SEGS_S = 6

      // Collect quads for depth sorting
      const quads: { pts: [number, number][]; z: number; color: string; alpha: number }[] = []

      for (let i = 0; i < SEGS_T; i++) {
        const t0 = (i / SEGS_T) * Math.PI * 2
        const t1 = ((i + 1) / SEGS_T) * Math.PI * 2

        for (let j = 0; j < SEGS_S; j++) {
          const s0 = -stripW / 2 + (j / SEGS_S) * stripW
          const s1 = -stripW / 2 + ((j + 1) / SEGS_S) * stripW

          const [x0, y0, z0] = mobiusPoint(t0, s0, R, rot)
          const [x1, y1, z1] = mobiusPoint(t1, s0, R, rot)
          const [x2, y2, z2] = mobiusPoint(t1, s1, R, rot)
          const [x3, y3, z3] = mobiusPoint(t0, s1, R, rot)

          const [px0, py0] = project(x0, y0, z0)
          const [px1, py1] = project(x1, y1, z1)
          const [px2, py2] = project(x2, y2, z2)
          const [px3, py3] = project(x3, y3, z3)

          const avgZ = (z0 + z1 + z2 + z3) / 4
          const colorIdx = Math.floor((i / SEGS_T) * CITRUS.length) % CITRUS.length
          // Normal-based shading (approximate)
          const shade = 0.4 + (avgZ / (R * 0.5) + 1) * 0.3

          quads.push({
            pts: [[px0, py0], [px1, py1], [px2, py2], [px3, py3]],
            z: avgZ,
            color: CITRUS[colorIdx],
            alpha: Math.min(0.85, shade),
          })
        }
      }

      // Sort back to front
      quads.sort((a, b) => a.z - b.z)

      // Draw quads
      for (const q of quads) {
        ctx.beginPath()
        ctx.moveTo(q.pts[0][0], q.pts[0][1])
        for (let i = 1; i < q.pts.length; i++) ctx.lineTo(q.pts[i][0], q.pts[i][1])
        ctx.closePath()
        ctx.fillStyle = q.color
        ctx.globalAlpha = q.alpha
        ctx.fill()
        ctx.strokeStyle = q.color
        ctx.lineWidth = 0.5
        ctx.globalAlpha = q.alpha * 0.4
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Draw ants
      for (const ant of antsRef.current) {
        ant.t += ant.speed
        if (ant.t > Math.PI * 4) ant.t -= Math.PI * 4 // full loop is 4π on a Möbius strip

        // Ant walks along center of strip (s=0), but on Möbius it traverses both "sides"
        const [ax, ay, az] = mobiusPoint(ant.t, 0, R, rot)
        const [px, py] = project(ax, ay, az)

        ctx.beginPath()
        ctx.arc(px, py, ant.size, 0, Math.PI * 2)
        ctx.fillStyle = ant.color
        ctx.globalAlpha = 0.9
        ctx.fill()

        // Small direction indicator
        const [ax2, ay2, az2] = mobiusPoint(ant.t + 0.05, 0, R, rot)
        const [px2, py2] = project(ax2, ay2, az2)
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px2, py2)
        ctx.strokeStyle = ant.color
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.globalAlpha = 1
      }

      // Hint
      ctx.globalAlpha = 0.2
      ctx.textAlign = 'center'
      ctx.font = '13px monospace'
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillText('one surface. no edges. tap to add an ant.', W / 2, H - 25)
      ctx.textAlign = 'start'
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(draw)
    }

    const handleTap = () => {
      antsRef.current.push({
        t: Math.random() * Math.PI * 4,
        speed: 0.006 + Math.random() * 0.006,
        color: CITRUS[antsRef.current.length % CITRUS.length],
        size: 5 + Math.random() * 3,
      })
      if (antsRef.current.length > 12) antsRef.current.shift()
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap()
    }, { passive: false })
    canvas.addEventListener('click', handleTap)

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'pointer',
        touchAction: 'none',
      }}
    />
  )
}
