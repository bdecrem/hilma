'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const CREAM = '#FFF8E7'
const DARK = '#2A2218'

interface Gear {
  x: number
  y: number
  radius: number
  teeth: number
  angle: number
  speed: number // relative to drive gear
  color: string
  direction: number // 1 or -1
}

export default function CrankPage() {
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

    const [bg1, bg2] = pickGradientColors('crank')

    // Build gear train
    const cx = W / 2
    const cy = H / 2
    const mainR = Math.min(W, H) * 0.12

    const gears: Gear[] = []

    // Main drive gear (center)
    gears.push({
      x: cx, y: cy,
      radius: mainR, teeth: 20,
      angle: 0, speed: 1, color: CITRUS[1], direction: 1
    })

    // Helper to add meshing gear
    function addMeshing(parentIdx: number, anglePlacement: number, ratio: number, colorIdx: number) {
      const parent = gears[parentIdx]
      const childTeeth = Math.round(parent.teeth * ratio)
      const childR = parent.radius * ratio
      const dist = parent.radius + childR - 2
      const gx = parent.x + Math.cos(anglePlacement) * dist
      const gy = parent.y + Math.sin(anglePlacement) * dist
      const childSpeed = parent.speed * (parent.teeth / childTeeth) * parent.direction * -1
      gears.push({
        x: gx, y: gy,
        radius: childR, teeth: childTeeth,
        angle: 0, speed: Math.abs(childSpeed),
        color: CITRUS[colorIdx % CITRUS.length],
        direction: childSpeed > 0 ? 1 : -1
      })
      return gears.length - 1
    }

    // Build a satisfying chain
    const g1 = addMeshing(0, -Math.PI * 0.3, 0.6, 0)   // upper-right small
    const g2 = addMeshing(0, Math.PI * 0.8, 0.75, 2)    // lower-left medium
    const g3 = addMeshing(g1, -Math.PI * 0.5, 0.5, 3)   // tiny off g1
    const g4 = addMeshing(g2, Math.PI * 0.3, 0.55, 4)   // small off g2
    addMeshing(0, Math.PI * 0.15, 0.45, 0)              // small right
    addMeshing(g2, Math.PI * 1.2, 0.4, 1)               // tiny off g2
    addMeshing(g3, -Math.PI * 0.8, 0.7, 2)              // medium off g3
    addMeshing(g4, Math.PI * 0.6, 0.35, 3)              // tiny off g4

    // Dragging state
    let dragging = false
    let lastAngle = 0
    let driveAngle = 0
    let velocity = 0

    function getAngleToMain(px: number, py: number) {
      return Math.atan2(py - gears[0].y, px - gears[0].x)
    }

    function onDown(e: PointerEvent) {
      const x = e.clientX
      const y = e.clientY
      const dx = x - gears[0].x
      const dy = y - gears[0].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < gears[0].radius * 2.5) {
        dragging = true
        lastAngle = getAngleToMain(x, y)
        velocity = 0
        canvas!.setPointerCapture(e.pointerId)
      }
    }

    function onMove(e: PointerEvent) {
      if (!dragging) return
      const angle = getAngleToMain(e.clientX, e.clientY)
      let delta = angle - lastAngle
      // Handle wrap-around
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      driveAngle += delta
      velocity = delta
      lastAngle = angle
    }

    function onUp() {
      dragging = false
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    function drawGear(g: Gear) {
      ctx!.save()
      ctx!.translate(g.x, g.y)
      ctx!.rotate(g.angle)

      const toothDepth = g.radius * 0.15
      const outerR = g.radius
      const innerR = g.radius - toothDepth
      const toothAngle = (Math.PI * 2) / g.teeth

      // Gear body
      ctx!.beginPath()
      for (let i = 0; i < g.teeth; i++) {
        const a = i * toothAngle
        const tipStart = a - toothAngle * 0.2
        const tipEnd = a + toothAngle * 0.2
        const valleyStart = a + toothAngle * 0.3
        const valleyEnd = a + toothAngle * 0.7

        if (i === 0) {
          ctx!.moveTo(Math.cos(tipStart) * outerR, Math.sin(tipStart) * outerR)
        }
        ctx!.lineTo(Math.cos(tipEnd) * outerR, Math.sin(tipEnd) * outerR)
        ctx!.lineTo(Math.cos(valleyStart) * innerR, Math.sin(valleyStart) * innerR)
        ctx!.lineTo(Math.cos(valleyEnd) * innerR, Math.sin(valleyEnd) * innerR)
        const nextTipStart = (i + 1) * toothAngle - toothAngle * 0.2
        ctx!.lineTo(Math.cos(nextTipStart) * outerR, Math.sin(nextTipStart) * outerR)
      }
      ctx!.closePath()
      ctx!.fillStyle = g.color
      ctx!.fill()
      ctx!.strokeStyle = DARK
      ctx!.lineWidth = 2
      ctx!.stroke()

      // Hub
      ctx!.beginPath()
      ctx!.arc(0, 0, g.radius * 0.2, 0, Math.PI * 2)
      ctx!.fillStyle = CREAM
      ctx!.fill()
      ctx!.strokeStyle = DARK
      ctx!.lineWidth = 2
      ctx!.stroke()

      // Hub dot
      ctx!.beginPath()
      ctx!.arc(0, 0, g.radius * 0.06, 0, Math.PI * 2)
      ctx!.fillStyle = DARK
      ctx!.fill()

      // Spokes
      const spokeCount = Math.max(3, Math.min(6, Math.round(g.teeth / 5)))
      ctx!.strokeStyle = DARK
      ctx!.lineWidth = Math.max(2, g.radius * 0.04)
      for (let i = 0; i < spokeCount; i++) {
        const sa = (i / spokeCount) * Math.PI * 2
        ctx!.beginPath()
        ctx!.moveTo(Math.cos(sa) * g.radius * 0.22, Math.sin(sa) * g.radius * 0.22)
        ctx!.lineTo(Math.cos(sa) * innerR * 0.85, Math.sin(sa) * innerR * 0.85)
        ctx!.stroke()
      }

      ctx!.restore()
    }

    let raf: number
    function animate() {
      // Physics
      if (!dragging) {
        driveAngle += velocity
        velocity *= 0.985 // friction
        if (Math.abs(velocity) < 0.0001) velocity = 0
      }

      // Update all gear angles
      gears[0].angle = driveAngle
      for (let i = 1; i < gears.length; i++) {
        const g = gears[i]
        gears[i].angle = driveAngle * g.speed * g.direction
      }

      // Draw
      const grad = ctx!.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, W, H)

      // Draw gears back to front (smaller first for overlap)
      const sorted = [...gears].sort((a, b) => a.radius - b.radius)
      for (const g of sorted) {
        drawGear(g)
      }

      // Draw drag hint if idle
      if (velocity === 0 && !dragging) {
        ctx!.save()
        ctx!.globalAlpha = 0.3 + Math.sin(Date.now() / 800) * 0.15
        ctx!.fillStyle = DARK
        ctx!.font = `${Math.max(14, W * 0.018)}px system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.fillText('drag the gear', cx, cy + mainR + 40)
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
      canvas!.removeEventListener('pointerdown', onDown)
      canvas!.removeEventListener('pointermove', onMove)
      canvas!.removeEventListener('pointerup', onUp)
      canvas!.removeEventListener('pointercancel', onUp)
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
        cursor: 'grab',
      }}
    />
  )
}
