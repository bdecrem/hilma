'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// L12: GROW — tap to plant seeds. branches fork and reach upward.
// Composition tier. Organic growth, fractal branching, accumulation.
// Each tap starts a new tree. Colors cycle through citrus.

const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Branch {
  x: number; y: number
  angle: number
  length: number
  width: number
  color: string
  progress: number  // 0 to 1
  speed: number
  children: Branch[]
  depth: number
  maxDepth: number
  spawned: boolean
}

function makeBranch(x: number, y: number, angle: number, depth: number, maxDepth: number, color: string): Branch {
  return {
    x, y, angle,
    length: 40 + Math.random() * 30 - depth * 4,
    width: Math.max(1.5, 8 - depth * 1.2),
    color,
    progress: 0,
    speed: 0.015 + Math.random() * 0.01,
    children: [],
    depth,
    maxDepth,
    spawned: false,
  }
}

function makeTree(x: number, y: number): Branch {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const maxDepth = 5 + Math.floor(Math.random() * 3)
  return makeBranch(x, y, -Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, maxDepth, color)
}

function spawnChildren(b: Branch) {
  if (b.depth >= b.maxDepth) return
  const count = b.depth < 2 ? 2 + Math.floor(Math.random() * 2) : 2
  const endX = b.x + Math.cos(b.angle) * b.length
  const endY = b.y + Math.sin(b.angle) * b.length
  for (let i = 0; i < count; i++) {
    const spread = 0.4 + Math.random() * 0.4
    const offset = (i - (count - 1) / 2) * spread
    const childColor = Math.random() < 0.3
      ? COLORS[Math.floor(Math.random() * COLORS.length)]
      : b.color
    b.children.push(makeBranch(endX, endY, b.angle + offset, b.depth + 1, b.maxDepth, childColor))
  }
}

function updateBranch(b: Branch): boolean {
  let active = false
  if (b.progress < 1) {
    b.progress = Math.min(1, b.progress + b.speed)
    active = true
  }
  if (b.progress > 0.95 && !b.spawned) {
    b.spawned = true
    spawnChildren(b)
  }
  for (const c of b.children) {
    if (updateBranch(c)) active = true
  }
  return active
}

function drawBranch(ctx: CanvasRenderingContext2D, b: Branch) {
  if (b.progress <= 0) return
  const p = b.progress
  const endX = b.x + Math.cos(b.angle) * b.length * p
  const endY = b.y + Math.sin(b.angle) * b.length * p

  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(endX, endY)
  ctx.strokeStyle = b.color
  ctx.lineWidth = b.width * (0.5 + p * 0.5)
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.7 + p * 0.3
  ctx.stroke()
  ctx.globalAlpha = 1

  // Bud at the tip if still growing or leaf-level
  if (b.depth >= b.maxDepth - 1 && p > 0.5) {
    ctx.beginPath()
    ctx.arc(endX, endY, 2 + (b.maxDepth - b.depth) * 1.5, 0, Math.PI * 2)
    ctx.fillStyle = b.color
    ctx.globalAlpha = p * 0.8
    ctx.fill()
    ctx.globalAlpha = 1
  }

  for (const c of b.children) {
    drawBranch(ctx, c)
  }
}

export default function L12() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let w = c.width = innerWidth, h = c.height = innerHeight
    const [bg1, bg2] = pickGradientColors('L12-grow')
    const trees: Branch[] = []

    // Start with one tree from center bottom
    trees.push(makeTree(w / 2, h * 0.85))

    const fillBg = () => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, bg1); g.addColorStop(1, bg2)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    c.addEventListener('pointerdown', (e) => {
      trees.push(makeTree(e.clientX, e.clientY))
    })

    addEventListener('resize', () => {
      w = c.width = innerWidth; h = c.height = innerHeight
    })

    const draw = () => {
      fillBg()

      // Update and draw all trees
      for (const t of trees) {
        updateBranch(t)
        drawBranch(ctx, t)
      }

      requestAnimationFrame(draw)
    }

    fillBg()
    draw()
  }, [])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', touchAction: 'none', cursor: 'crosshair' }} />
}
