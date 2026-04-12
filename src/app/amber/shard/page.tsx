'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Citrus crystal palette
const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'

const [BG1, BG2] = pickGradientColors('shard')

// ─── Arm ────────────────────────────────────────────────────────────────────

interface Arm {
  sx: number
  sy: number
  angle: number      // radians
  maxLen: number
  curLen: number
  baseWidth: number
  depth: number      // 0=primary, 1=secondary, 2=tertiary
  colorIdx: number
  children: Arm[]
  milestones: number[]        // fractions (0-1) along arm to spawn children
  milestoneDone: boolean[]
}

function createArm(
  sx: number, sy: number, angle: number,
  maxLen: number, baseWidth: number,
  depth: number, colorIdx: number,
): Arm {
  // Primary arms spawn 3 sets of perpendicular secondaries
  // Secondary arms spawn 1 set of tertiaries at midpoint
  const milestones =
    depth === 0 ? [0.30, 0.55, 0.78] :
    depth === 1 ? [0.50] :
    []
  return {
    sx, sy, angle, maxLen, curLen: 0,
    baseWidth, depth, colorIdx,
    children: [],
    milestones,
    milestoneDone: milestones.map(() => false),
  }
}

function updateArm(arm: Arm, speed: number): void {
  // Each depth level grows at half the speed of its parent
  const rate = speed / Math.pow(2.0, arm.depth)
  arm.curLen = Math.min(arm.curLen + rate, arm.maxLen)
  const pct = arm.curLen / arm.maxLen

  for (let i = 0; i < arm.milestones.length; i++) {
    if (!arm.milestoneDone[i] && pct >= arm.milestones[i]) {
      arm.milestoneDone[i] = true
      const m = arm.milestones[i]
      const mx = arm.sx + Math.cos(arm.angle) * arm.maxLen * m
      const my = arm.sy + Math.sin(arm.angle) * arm.maxLen * m
      const nextColor = (arm.colorIdx + 1) % CITRUS.length

      if (arm.depth === 0) {
        // Secondary: perpendicular branches, shorter near the tip
        const lenFactor = 0.35 - m * 0.12
        const childLen = arm.maxLen * lenFactor
        const childW = arm.baseWidth * 0.45
        arm.children.push(createArm(mx, my, arm.angle + Math.PI / 2, childLen, childW, 1, nextColor))
        arm.children.push(createArm(mx, my, arm.angle - Math.PI / 2, childLen, childW, 1, nextColor))
      } else if (arm.depth === 1) {
        // Tertiary: perpendicular to secondary, at its midpoint
        const childLen = arm.maxLen * 0.55
        const childW = arm.baseWidth * 0.48
        const nextColor2 = (arm.colorIdx + 2) % CITRUS.length
        arm.children.push(createArm(mx, my, arm.angle + Math.PI / 2, childLen, childW, 2, nextColor2))
        arm.children.push(createArm(mx, my, arm.angle - Math.PI / 2, childLen, childW, 2, nextColor2))
      }
    }
  }

  for (const child of arm.children) updateArm(child, speed)
}

function drawArm(ctx: CanvasRenderingContext2D, arm: Arm): void {
  if (arm.curLen < 0.5) return

  const tipX = arm.sx + Math.cos(arm.angle) * arm.curLen
  const tipY = arm.sy + Math.sin(arm.angle) * arm.curLen
  const perp = arm.angle + Math.PI / 2

  // Taper: wider at root, narrower at tip
  const sw = arm.baseWidth
  const ew = arm.depth === 0 ? arm.baseWidth * 0.15 : 0.5

  const color = CITRUS[arm.colorIdx]
  const grad = ctx.createLinearGradient(arm.sx, arm.sy, tipX, tipY)
  grad.addColorStop(0,    color + 'EE')
  grad.addColorStop(0.65, color + 'BB')
  grad.addColorStop(1,    color + '18')

  ctx.beginPath()
  ctx.moveTo(arm.sx + Math.cos(perp) * sw, arm.sy + Math.sin(perp) * sw)
  ctx.lineTo(arm.sx - Math.cos(perp) * sw, arm.sy - Math.sin(perp) * sw)
  ctx.lineTo(tipX - Math.cos(perp) * ew,   tipY - Math.sin(perp) * ew)
  ctx.lineTo(tipX + Math.cos(perp) * ew,   tipY + Math.sin(perp) * ew)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Specular highlight — bright edge line on one side
  if (arm.depth < 2) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'
    ctx.lineWidth = arm.depth === 0 ? 1.2 : 0.7
    ctx.beginPath()
    ctx.moveTo(arm.sx + Math.cos(perp) * sw * 0.5, arm.sy + Math.sin(perp) * sw * 0.5)
    ctx.lineTo(tipX + Math.cos(perp) * ew * 0.5,   tipY + Math.sin(perp) * ew * 0.5)
    ctx.stroke()
    ctx.restore()
  }

  for (const child of arm.children) drawArm(ctx, child)
}

// ─── Crystal ─────────────────────────────────────────────────────────────────

interface Crystal {
  x: number
  y: number
  arms: Arm[]
}

function createCrystal(x: number, y: number, size: number, colorOffset: number): Crystal {
  const arms: Arm[] = []
  for (let i = 0; i < 6; i++) {
    // Hexagonal: 6 arms at 60° intervals, starting straight up
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2
    const colorIdx = (colorOffset + Math.floor(i / 2)) % CITRUS.length
    arms.push(createArm(x, y, angle, size, size * 0.044, 0, colorIdx))
  }
  return { x, y, arms }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ShardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crystalsRef = useRef<Crystal[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight

    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    function addCrystal(cx: number, cy: number) {
      const size = Math.min(W, H) * (0.14 + Math.random() * 0.07)
      crystalsRef.current.push(createCrystal(cx, cy, size, crystalsRef.current.length * 2))
    }

    // Seed with 3 crystals — center first, then two flanking
    addCrystal(W * 0.50, H * 0.50)
    const t1 = setTimeout(() => addCrystal(W * 0.18, H * 0.73), 1400)
    const t2 = setTimeout(() => addCrystal(W * 0.82, H * 0.27), 2400)

    // Tap to add new crystals
    const onPointer = (e: PointerEvent) => {
      addCrystal(e.clientX, e.clientY)
    }
    canvas.addEventListener('pointerdown', onPointer)

    const loop = () => {
      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, BG1)
      bgGrad.addColorStop(1, BG2)
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      for (const crystal of crystalsRef.current) {
        // Grow and draw all arms
        for (const arm of crystal.arms) {
          updateArm(arm, 2.0)
          drawArm(ctx, arm)
        }

        // Amber jewel at center (the legacy watermark)
        const jewel = ctx.createRadialGradient(crystal.x, crystal.y, 0, crystal.x, crystal.y, 10)
        jewel.addColorStop(0,   '#ffffff')
        jewel.addColorStop(0.3, AMBER)
        jewel.addColorStop(1,   AMBER + '00')
        ctx.fillStyle = jewel
        ctx.beginPath()
        ctx.arc(crystal.x, crystal.y, 10, 0, Math.PI * 2)
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    loop()

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(t1)
      clearTimeout(t2)
      canvas.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <main
      style={{
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        width: '100dvw',
        height: '100dvh',
        background: BG1,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
    </main>
  )
}
