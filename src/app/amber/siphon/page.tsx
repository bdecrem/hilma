'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const CREAM = '#FFF8E7'
const DARK = '#2A2218'
const AMBER = '#D4A574'

interface Bead {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  radius: number
}

export default function SiphonPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const [bg1, bg2] = pickGradientColors('siphon')

    // Chain beads
    const BEAD_COUNT = 80
    const BEAD_R = Math.min(W, H) * 0.012
    const LINK_LEN = BEAD_R * 2.6
    const GRAVITY = 0.35
    const DAMPING = 0.992
    const CONSTRAINT_ITERS = 12

    // Bowl: a container at bottom-left area
    // Lip/spout: top of the arc
    const bowlCx = W * 0.35
    const bowlCy = H * 0.72
    const bowlR = Math.min(W, H) * 0.18
    const lipX = W * 0.55
    const lipY = H * 0.22

    const beads: Bead[] = []

    // Initialize chain in a coil inside the bowl
    for (let i = 0; i < BEAD_COUNT; i++) {
      const angle = (i / BEAD_COUNT) * Math.PI * 6 // spiral
      const r = bowlR * 0.15 + (i / BEAD_COUNT) * bowlR * 0.55
      beads.push({
        x: bowlCx + Math.cos(angle) * r,
        y: bowlCy + Math.sin(angle) * r * 0.5,
        vx: 0,
        vy: 0,
        color: CITRUS[i % CITRUS.length],
        radius: BEAD_R,
      })
    }

    let dragging = false
    let dragIdx = -1
    let dragX = 0
    let dragY = 0
    let siphoning = false
    let siphonForce = 0

    function findNearest(px: number, py: number): number {
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < beads.length; i++) {
        const dx = beads[i].x - px
        const dy = beads[i].y - py
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; best = i }
      }
      return bestD < (BEAD_R * 8) ** 2 ? best : -1
    }

    // Touch / pointer handlers
    function onDown(e: TouchEvent | MouseEvent) {
      e.preventDefault()
      const t = 'touches' in e ? e.touches[0] : e
      dragX = t.clientX
      dragY = t.clientY
      dragIdx = findNearest(dragX, dragY)
      if (dragIdx >= 0) dragging = true
    }

    function onMove(e: TouchEvent | MouseEvent) {
      e.preventDefault()
      if (!dragging) return
      const t = 'touches' in e ? e.touches[0] : e
      dragX = t.clientX
      dragY = t.clientY
    }

    function onUp(e: TouchEvent | MouseEvent) {
      e.preventDefault()
      dragging = false
      dragIdx = -1
    }

    canvas.addEventListener('touchstart', onDown, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onUp, { passive: false })
    canvas.addEventListener('mousedown', onDown as EventListener)
    canvas.addEventListener('mousemove', onMove as EventListener)
    canvas.addEventListener('mouseup', onUp as EventListener)

    // Draw a rounded rect without ctx.roundRect
    function roundedRect(x: number, y: number, w: number, h: number, r: number) {
      ctx!.beginPath()
      ctx!.moveTo(x + r, y)
      ctx!.arcTo(x + w, y, x + w, y + h, r)
      ctx!.arcTo(x + w, y + h, x, y + h, r)
      ctx!.arcTo(x, y + h, x, y, r)
      ctx!.arcTo(x, y, x + w, y, r)
      ctx!.closePath()
    }

    // Draw bowl
    function drawBowl() {
      // Draw as a U-shape / cup
      const bx = bowlCx - bowlR
      const by = bowlCy - bowlR * 0.3
      const bw = bowlR * 2
      const bh = bowlR * 1.1

      ctx!.save()
      ctx!.lineWidth = 4
      ctx!.strokeStyle = DARK

      // Bowl body — thick U shape
      ctx!.beginPath()
      ctx!.moveTo(bx, by)
      ctx!.lineTo(bx, by + bh * 0.8)
      // Bottom curve
      ctx!.arcTo(bx, by + bh, bx + bw * 0.5, by + bh, bowlR * 0.6)
      ctx!.arcTo(bx + bw, by + bh, bx + bw, by + bh * 0.8, bowlR * 0.6)
      ctx!.lineTo(bx + bw, by)
      ctx!.strokeStyle = AMBER
      ctx!.lineWidth = 5
      ctx!.stroke()

      // Fill bowl interior semi-transparently
      ctx!.fillStyle = 'rgba(212, 165, 116, 0.12)'
      ctx!.fill()

      // Lip highlight
      ctx!.beginPath()
      ctx!.arc(bx, by, 4, 0, Math.PI * 2)
      ctx!.fillStyle = CREAM
      ctx!.fill()
      ctx!.beginPath()
      ctx!.arc(bx + bw, by, 4, 0, Math.PI * 2)
      ctx!.fillStyle = CREAM
      ctx!.fill()

      ctx!.restore()
    }

    // Draw spout/lip guide
    function drawLipGuide() {
      ctx!.save()
      ctx!.setLineDash([6, 8])
      ctx!.strokeStyle = 'rgba(255, 248, 231, 0.3)'
      ctx!.lineWidth = 2
      ctx!.beginPath()
      ctx!.moveTo(bowlCx + bowlR, bowlCy - bowlR * 0.3)
      ctx!.quadraticCurveTo(lipX, lipY - 20, lipX + bowlR * 0.8, H * 0.5)
      ctx!.stroke()
      ctx!.setLineDash([])
      ctx!.restore()
    }

    // Check siphon condition: enough beads past the lip
    function checkSiphon() {
      let overLip = 0
      for (let i = 0; i < beads.length; i++) {
        if (beads[i].x > lipX && beads[i].y < lipY + bowlR * 0.5) {
          overLip++
        }
      }
      if (overLip > 8) {
        siphoning = true
        siphonForce = Math.min(siphonForce + 0.01, 0.5)
      } else if (overLip < 3) {
        siphoning = false
        siphonForce = Math.max(siphonForce - 0.02, 0)
      }
    }

    function simulate() {
      // Apply gravity
      for (let i = 0; i < beads.length; i++) {
        beads[i].vy += GRAVITY
        // Siphon force: pull chain in the direction of flow
        if (siphoning && siphonForce > 0) {
          // The chain flows: beads near/past the lip get pulled right and down
          if (beads[i].x > lipX - bowlR * 0.5) {
            beads[i].vx += siphonForce * 0.6
            beads[i].vy += siphonForce * 0.2
          }
          // Beads in the bowl get pulled upward toward the lip
          if (beads[i].x < lipX && beads[i].y > lipY) {
            beads[i].vy -= siphonForce * 1.2
            beads[i].vx += siphonForce * 0.4
          }
        }
      }

      // Drag constraint
      if (dragging && dragIdx >= 0) {
        beads[dragIdx].x = dragX
        beads[dragIdx].y = dragY
        beads[dragIdx].vx = 0
        beads[dragIdx].vy = 0
      }

      // Integrate
      for (let i = 0; i < beads.length; i++) {
        beads[i].vx *= DAMPING
        beads[i].vy *= DAMPING
        beads[i].x += beads[i].vx
        beads[i].y += beads[i].vy
      }

      // Link distance constraints (Verlet-style correction)
      for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
        for (let i = 0; i < beads.length - 1; i++) {
          const a = beads[i]
          const b = beads[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 0.001) continue
          const diff = (LINK_LEN - dist) / dist * 0.5
          const ox = dx * diff
          const oy = dy * diff

          if (dragging && i === dragIdx) {
            b.x += ox * 2
            b.y += oy * 2
          } else if (dragging && i + 1 === dragIdx) {
            a.x -= ox * 2
            a.y -= oy * 2
          } else {
            a.x -= ox
            a.y -= oy
            b.x += ox
            b.y += oy
          }
        }
      }

      // Bowl collision: keep beads inside bowl
      const bowlBottom = bowlCy + bowlR * 0.8
      const bowlLeft = bowlCx - bowlR
      const bowlRight = bowlCx + bowlR
      const bowlTop = bowlCy - bowlR * 0.3

      for (let i = 0; i < beads.length; i++) {
        const b = beads[i]
        // Floor
        if (b.y > H - b.radius) {
          b.y = H - b.radius
          b.vy *= -0.3
        }
        // Walls
        if (b.x < b.radius) {
          b.x = b.radius
          b.vx *= -0.3
        }
        if (b.x > W - b.radius) {
          b.x = W - b.radius
          b.vx *= -0.3
        }
        // Ceiling
        if (b.y < b.radius) {
          b.y = b.radius
          b.vy *= -0.3
        }

        // Bowl bottom constraint (only for beads in bowl X range)
        if (b.x > bowlLeft && b.x < bowlRight) {
          if (b.y > bowlBottom) {
            b.y = bowlBottom
            b.vy *= -0.2
          }
        }
      }

      // Bead-bead collision (simple push apart)
      for (let i = 0; i < beads.length; i++) {
        for (let j = i + 2; j < beads.length; j++) {
          const dx = beads[j].x - beads[i].x
          const dy = beads[j].y - beads[i].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const minDist = beads[i].radius + beads[j].radius
          if (dist < minDist && dist > 0.001) {
            const push = (minDist - dist) / dist * 0.3
            beads[i].x -= dx * push
            beads[i].y -= dy * push
            beads[j].x += dx * push
            beads[j].y += dy * push
          }
        }
      }

      checkSiphon()
    }

    function draw() {
      // Background
      const grad = ctx!.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, W, H)

      drawBowl()
      if (!siphoning) drawLipGuide()

      // Draw chain links (lines between beads)
      ctx!.lineWidth = BEAD_R * 0.7
      ctx!.lineCap = 'round'
      for (let i = 0; i < beads.length - 1; i++) {
        const a = beads[i]
        const b = beads[i + 1]
        ctx!.beginPath()
        ctx!.moveTo(a.x, a.y)
        ctx!.lineTo(b.x, b.y)
        ctx!.strokeStyle = DARK
        ctx!.stroke()
      }

      // Draw beads
      for (let i = 0; i < beads.length; i++) {
        const b = beads[i]
        // Shadow
        ctx!.beginPath()
        ctx!.arc(b.x + 1.5, b.y + 1.5, b.radius, 0, Math.PI * 2)
        ctx!.fillStyle = 'rgba(0,0,0,0.15)'
        ctx!.fill()
        // Body
        ctx!.beginPath()
        ctx!.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
        ctx!.fillStyle = b.color
        ctx!.fill()
        ctx!.strokeStyle = DARK
        ctx!.lineWidth = 1.5
        ctx!.stroke()
        // Highlight
        ctx!.beginPath()
        ctx!.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.3, 0, Math.PI * 2)
        ctx!.fillStyle = 'rgba(255,255,255,0.4)'
        ctx!.fill()
      }

      // Siphon indicator
      if (siphoning) {
        ctx!.save()
        ctx!.globalAlpha = 0.4 + Math.sin(Date.now() / 300) * 0.2
        ctx!.fillStyle = CREAM
        ctx!.font = `bold ${Math.max(14, W * 0.015)}px monospace`
        ctx!.textAlign = 'center'
        ctx!.fillText('siphoning', lipX, lipY - 30)
        ctx!.restore()
      }

      // Hint text
      if (!siphoning && !dragging) {
        ctx!.save()
        ctx!.globalAlpha = 0.3 + Math.sin(Date.now() / 800) * 0.15
        ctx!.fillStyle = CREAM
        ctx!.font = `${Math.max(14, W * 0.016)}px monospace`
        ctx!.textAlign = 'center'
        ctx!.fillText('drag the chain up and over', W * 0.5, H * 0.07)
        ctx!.restore()
      }
    }

    let raf: number
    function animate() {
      simulate()
      draw()
      raf = requestAnimationFrame(animate)
    }
    animate()

    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('touchstart', onDown)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onUp)
      canvas.removeEventListener('mousedown', onDown as EventListener)
      canvas.removeEventListener('mousemove', onMove as EventListener)
      canvas.removeEventListener('mouseup', onUp as EventListener)
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
