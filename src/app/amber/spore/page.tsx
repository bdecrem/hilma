'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const AMBER = '#D4A574'

interface Branch {
  x: number
  y: number
  angle: number
  length: number
  maxLength: number
  thickness: number
  color: string
  colonyId: number
  alive: boolean
  children: Branch[]
  grown: number
  speed: number
}

interface Colony {
  id: number
  x: number
  y: number
  color: string
  branches: Branch[]
  age: number
}

function makeColony(id: number, x: number, y: number, colorIdx: number): Colony {
  const color = CITRUS[colorIdx % CITRUS.length]
  const numSeed = 6 + Math.floor(Math.random() * 6)
  const branches: Branch[] = []
  for (let i = 0; i < numSeed; i++) {
    const angle = (Math.PI * 2 * i) / numSeed + (Math.random() - 0.5) * 0.5
    branches.push({
      x,
      y,
      angle,
      length: 0,
      maxLength: 40 + Math.random() * 60,
      thickness: 2 + Math.random() * 1.5,
      color,
      colonyId: id,
      alive: true,
      children: [],
      grown: 0,
      speed: 0.8 + Math.random() * 1.2,
    })
  }
  return { id, x, y, color, branches, age: 0 }
}

function spawnChild(parent: Branch): Branch {
  const spread = (Math.random() - 0.5) * 0.8
  return {
    x: parent.x + Math.cos(parent.angle) * parent.maxLength,
    y: parent.y + Math.sin(parent.angle) * parent.maxLength,
    angle: parent.angle + spread,
    length: 0,
    maxLength: parent.maxLength * (0.55 + Math.random() * 0.2),
    thickness: parent.thickness * 0.6,
    color: parent.color,
    colonyId: parent.colonyId,
    alive: parent.maxLength * 0.6 > 6,
    children: [],
    grown: 0,
    speed: parent.speed * (0.9 + Math.random() * 0.2),
  }
}

export default function SporePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{
    colonies: Colony[]
    nextId: number
    colorIdx: number
    bgCanvas: HTMLCanvasElement | null
    bgCtx: CanvasRenderingContext2D | null
    frame: number
    raf: number
  }>({
    colonies: [],
    nextId: 0,
    colorIdx: 0,
    bgCanvas: null,
    bgCtx: null,
    frame: 0,
    raf: 0,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    if (!ctx) return

    // Off-screen persistent canvas for grown filaments
    const bg = document.createElement('canvas')
    stateRef.current.bgCanvas = bg
    const bgCtx = bg.getContext('2d')!
    stateRef.current.bgCtx = bgCtx

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w
      canvas.height = h
      bg.width = w
      bg.height = h

      // Draw gradient background on persistent canvas
      const [c1, c2] = pickGradientColors('spore')
      const grad = bgCtx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, c1)
      grad.addColorStop(1, c2)
      bgCtx.fillStyle = grad
      bgCtx.fillRect(0, 0, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    // Seed initial colonies
    const w = () => canvas.width
    const h = () => canvas.height
    const addColony = (x: number, y: number) => {
      const s = stateRef.current
      const colony = makeColony(s.nextId++, x, y, s.colorIdx++)
      s.colonies.push(colony)
    }

    // Plant 3 initial colonies
    setTimeout(() => addColony(w() * 0.3, h() * 0.4), 100)
    setTimeout(() => addColony(w() * 0.7, h() * 0.35), 600)
    setTimeout(() => addColony(w() * 0.5, h() * 0.7), 1200)

    // Auto-plant colonies occasionally
    const autoPlantInterval = setInterval(() => {
      if (stateRef.current.colonies.length < 12) {
        addColony(
          w() * (0.1 + Math.random() * 0.8),
          h() * (0.1 + Math.random() * 0.8)
        )
      }
    }, 4000)

    function drawBranch(
      ctx: CanvasRenderingContext2D,
      branch: Branch,
      progress: number
    ) {
      const len = branch.maxLength * progress
      const ex = branch.x + Math.cos(branch.angle) * len
      const ey = branch.y + Math.sin(branch.angle) * len

      ctx.beginPath()
      ctx.moveTo(branch.x, branch.y)
      ctx.lineTo(ex, ey)
      ctx.strokeStyle = branch.color
      ctx.lineWidth = Math.max(0.3, branch.thickness * (1 - progress * 0.4))
      ctx.globalAlpha = 0.75
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.globalAlpha = 1

      // Tip glow when growing
      if (progress < 0.99) {
        ctx.beginPath()
        ctx.arc(ex, ey, branch.thickness * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = branch.color
        ctx.globalAlpha = 0.5
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    function updateBranch(branch: Branch, bgCtx: CanvasRenderingContext2D) {
      if (!branch.alive) return

      const prevGrown = branch.grown
      branch.grown = Math.min(1, branch.grown + branch.speed / (branch.maxLength * 1.5))

      // Draw the newly grown segment onto persistent canvas
      if (branch.grown > 0) {
        const prevLen = branch.maxLength * prevGrown
        const newLen = branch.maxLength * branch.grown
        const px = branch.x + Math.cos(branch.angle) * prevLen
        const py = branch.y + Math.sin(branch.angle) * prevLen
        const nx = branch.x + Math.cos(branch.angle) * newLen
        const ny = branch.y + Math.sin(branch.angle) * newLen

        bgCtx.beginPath()
        bgCtx.moveTo(px, py)
        bgCtx.lineTo(nx, ny)
        bgCtx.strokeStyle = branch.color
        bgCtx.lineWidth = Math.max(0.3, branch.thickness * (1 - branch.grown * 0.3))
        bgCtx.globalAlpha = 0.72
        bgCtx.lineCap = 'round'
        bgCtx.stroke()
        bgCtx.globalAlpha = 1
      }

      if (branch.grown >= 1 && branch.children.length === 0 && branch.alive) {
        branch.alive = false
        if (branch.maxLength > 8) {
          // Spawn 1-3 children
          const numChildren = 1 + Math.floor(Math.random() * 2)
          for (let i = 0; i < numChildren; i++) {
            const child = spawnChild(branch)
            branch.children.push(child)
          }

          // Draw a node dot where branching happens
          const ex = branch.x + Math.cos(branch.angle) * branch.maxLength
          const ey = branch.y + Math.sin(branch.angle) * branch.maxLength
          bgCtx.beginPath()
          bgCtx.arc(ex, ey, branch.thickness * 1.2, 0, Math.PI * 2)
          bgCtx.fillStyle = branch.color
          bgCtx.globalAlpha = 0.6
          bgCtx.fill()
          bgCtx.globalAlpha = 1
        }
      }

      for (const child of branch.children) {
        updateBranch(child, bgCtx)
      }
    }

    function countActiveBranches(branches: Branch[]): number {
      let count = 0
      for (const b of branches) {
        if (b.grown < 1) count++
        if (b.children.length > 0) count += countActiveBranches(b.children)
      }
      return count
    }

    function collectActiveTips(
      branches: Branch[],
      tips: Array<{ x: number; y: number; color: string }>
    ) {
      for (const b of branches) {
        if (b.grown < 1) {
          const len = b.maxLength * b.grown
          tips.push({
            x: b.x + Math.cos(b.angle) * len,
            y: b.y + Math.sin(b.angle) * len,
            color: b.color,
          })
        }
        collectActiveTips(b.children, tips)
      }
    }

    function animate() {
      const s = stateRef.current
      s.frame++

      const bgC = s.bgCanvas!
      const bgCx = s.bgCtx!
      const cvs = canvasRef.current
      if (!cvs) return
      const W = cvs.width
      const H = cvs.height

      // Update all colonies
      for (const colony of s.colonies) {
        colony.age++
        for (const branch of colony.branches) {
          updateBranch(branch, bgCx)
        }
      }

      // Render
      ctx.clearRect(0, 0, W, H)
      // Persistent layer
      ctx.drawImage(bgC, 0, 0)

      // Draw active tips with glow on main canvas
      const tips: Array<{ x: number; y: number; color: string }> = []
      for (const colony of s.colonies) {
        collectActiveTips(colony.branches, tips)
      }

      for (const tip of tips) {
        const r = 3 + Math.sin(s.frame * 0.15) * 1.5
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2)
        ctx.fillStyle = tip.color
        ctx.globalAlpha = 0.8
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Draw colony origin dots (persistent, small)
      for (const colony of s.colonies) {
        ctx.beginPath()
        ctx.arc(colony.x, colony.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = colony.color
        ctx.globalAlpha = 0.9
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Amber watermark
      ctx.font = '12px monospace'
      ctx.fillStyle = AMBER
      ctx.globalAlpha = 0.4
      ctx.fillText('amber', W - 60, H - 16)
      ctx.globalAlpha = 1

      s.raf = requestAnimationFrame(animate)
    }

    stateRef.current.raf = requestAnimationFrame(animate)

    const handleTap = (x: number, y: number) => {
      addColony(x, y)

      // Flash
      const canvas2 = canvasRef.current
      if (!canvas2) return
      const ctx2 = canvas2.getContext('2d')
      if (!ctx2) return
      ctx2.beginPath()
      ctx2.arc(x, y, 24, 0, Math.PI * 2)
      ctx2.fillStyle = '#FFFFFF'
      ctx2.globalAlpha = 0.5
      ctx2.fill()
      ctx2.globalAlpha = 1
    }

    const onPointerDown = (e: PointerEvent) => {
      handleTap(e.clientX, e.clientY)
    }

    canvas.addEventListener('pointerdown', onPointerDown)

    return () => {
      cancelAnimationFrame(stateRef.current.raf)
      clearInterval(autoPlantInterval)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100vh',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
