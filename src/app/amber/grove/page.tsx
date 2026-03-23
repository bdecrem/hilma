'use client'

import { useEffect, useRef } from 'react'

// GROVE — a citrus grove in Unicode. touch a tree to shake fruit loose.

const BG = '#FFF8E7'
const TRUNK = '#8B5E3C'
const LEAF_COLORS = ['#B4E33D', '#7CB342', '#9CCC65', '#8BC34A']
const FRUIT_COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#FF6B81']
const GROUND = '#E8DCC8'

const LEAF_CHARS = '∧∨<>/\\{}()⌂♣♠✦'.split('')
const TRUNK_CHARS = '│║┃█▌▐'.split('')
const FRUIT_CHARS = '●◉◎⊙○'.split('')
const GRASS_CHARS = '∴∵·.,:;\'`'.split('')

interface FallingFruit {
  x: number; y: number
  vy: number
  char: string
  color: string
  bounce: number
  settled: boolean
}

interface Tree {
  x: number
  baseY: number
  height: number
  width: number
  shakeAmount: number
  shakeDecay: number
}

export default function Grove() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, t = 0, frame: number
    const CELL = 13
    let cols = 0, rows = 0
    const trees: Tree[] = []
    const fruits: FallingFruit[] = []
    let wind = 0

    const buildTrees = () => {
      trees.length = 0
      const treeCount = Math.max(3, Math.floor(w / 180))
      const spacing = w / (treeCount + 1)
      for (let i = 0; i < treeCount; i++) {
        trees.push({
          x: spacing * (i + 1) + (Math.random() - 0.5) * spacing * 0.3,
          baseY: h * 0.72 + Math.random() * h * 0.05,
          height: 8 + Math.floor(Math.random() * 5),
          width: 5 + Math.floor(Math.random() * 4),
          shakeAmount: 0,
          shakeDecay: 0.92,
        })
      }
    }

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      cols = Math.floor(w / CELL)
      rows = Math.floor(h / CELL)
      buildTrees()
    }
    resize()
    window.addEventListener('resize', resize)

    // Touch to shake nearest tree
    const shake = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect()
      const px = ex - rect.left
      let closest: Tree | null = null, closestDist = Infinity
      for (const tree of trees) {
        const d = Math.abs(tree.x - px)
        if (d < closestDist) { closestDist = d; closest = tree }
      }
      if (closest && closestDist < 100) {
        closest.shakeAmount = 6
        // Drop fruit
        const count = 2 + Math.floor(Math.random() * 4)
        for (let i = 0; i < count; i++) {
          const fx = closest.x + (Math.random() - 0.5) * closest.width * CELL
          const fy = closest.baseY - closest.height * CELL * (0.3 + Math.random() * 0.5)
          fruits.push({
            x: fx, y: fy,
            vy: 0,
            char: FRUIT_CHARS[Math.floor(Math.random() * FRUIT_CHARS.length)],
            color: FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)],
            bounce: 3,
            settled: false,
          })
        }
        if (fruits.length > 60) fruits.splice(0, fruits.length - 60)
      }
    }

    canvas.addEventListener('click', (e) => shake(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); shake(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false })

    const drawChar = (char: string, col: number, row: number, color: string, offsetX = 0, offsetY = 0) => {
      const x = col * CELL + CELL / 2 + offsetX
      const y = row * CELL + CELL / 2 + offsetY
      if (x < -CELL || x > w + CELL || y < -CELL || y > h + CELL) return
      ctx.fillStyle = color
      ctx.fillText(char, x, y)
    }

    const tick = () => {
      t++
      wind = Math.sin(t * 0.008) * 1.5 + Math.sin(t * 0.023) * 0.5

      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      ctx.font = `${CELL}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Ground
      const groundRow = Math.floor(h * 0.75 / CELL)
      ctx.fillStyle = GROUND
      ctx.fillRect(0, groundRow * CELL, w, h - groundRow * CELL)

      // Ground grass characters
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.3) {
          const char = GRASS_CHARS[Math.floor(Math.random() * GRASS_CHARS.length)]
          drawChar(char, c, groundRow, '#C8BC9E')
        }
        if (Math.random() < 0.15) {
          drawChar(GRASS_CHARS[Math.floor(Math.random() * 3)], c, groundRow + 1, '#D4C8AC')
        }
      }

      // Trees
      for (const tree of trees) {
        tree.shakeAmount *= tree.shakeDecay
        const shakeX = tree.shakeAmount * Math.sin(t * 0.5)
        const treeCol = Math.floor(tree.x / CELL)
        const treeRow = Math.floor(tree.baseY / CELL)

        // Trunk
        for (let r = 0; r < tree.height * 0.4; r++) {
          const row = treeRow - r
          const char = TRUNK_CHARS[Math.floor(Math.random() * TRUNK_CHARS.length)]
          drawChar(char, treeCol, row, TRUNK, shakeX * 0.3)
          if (r > 1) drawChar(char, treeCol + 1, row, '#7A5030', shakeX * 0.3)
        }

        // Canopy — dome of leaf characters
        const canopyBase = treeRow - Math.floor(tree.height * 0.35)
        const canopyTop = treeRow - tree.height
        for (let r = canopyTop; r <= canopyBase; r++) {
          const rowInCanopy = r - canopyTop
          const canopyHeight = canopyBase - canopyTop
          const frac = rowInCanopy / canopyHeight
          const halfWidth = Math.floor(tree.width * Math.sin(frac * Math.PI) * 0.5) + 1

          for (let c = -halfWidth; c <= halfWidth; c++) {
            if (Math.random() < 0.7) {
              const leafChar = LEAF_CHARS[Math.floor(Math.random() * LEAF_CHARS.length)]
              const leafColor = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]
              const sway = wind * (1 - frac) * 0.5 + shakeX
              drawChar(leafChar, treeCol + c, r, leafColor, sway)
            }
          }
        }

        // Fruit in canopy
        for (let i = 0; i < 4; i++) {
          const fr = canopyTop + 1 + Math.floor(Math.random() * (canopyBase - canopyTop - 1))
          const frac = (fr - canopyTop) / (canopyBase - canopyTop)
          const halfW = Math.floor(tree.width * Math.sin(frac * Math.PI) * 0.4)
          const fc = treeCol + Math.floor((Math.random() - 0.5) * halfW * 2)
          const fruitColor = FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)]
          drawChar('●', fc, fr, fruitColor, wind * 0.3 + shakeX)
        }
      }

      // Falling fruit physics
      for (const f of fruits) {
        if (f.settled) {
          // Just draw
          ctx.fillStyle = f.color
          ctx.fillText(f.char, f.x, f.y)
          continue
        }
        f.vy += 0.3
        f.x += wind * 0.2
        f.y += f.vy
        const groundY = h * 0.75
        if (f.y > groundY) {
          f.y = groundY
          f.vy = -f.vy * 0.4
          f.bounce--
          if (f.bounce <= 0) f.settled = true
        }
        ctx.fillStyle = f.color
        ctx.fillText(f.char, f.x, f.y)
      }

      // Ambient floating leaf characters in the air
      if (t % 4 === 0) {
        const lx = (t * 7 + Math.sin(t * 0.1) * 50) % (w + 100) - 50
        const ly = h * 0.2 + Math.sin(t * 0.02) * h * 0.15
        const char = LEAF_CHARS[Math.floor(Math.random() * LEAF_CHARS.length)]
        ctx.fillStyle = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)] + '40'
        ctx.fillText(char, lx, ly)
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ background: BG }} />
}
