'use client'

import { useEffect, useRef } from 'react'

const COLS = 26
const ROWS = 10

const ICON_SHAPES = [
  { name: 'person', grid: [
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0],
  ]},
  { name: 'house', grid: [
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[1,1,0,0,1,1,0,0,1,1],[1,1,0,0,1,1,0,0,1,1],
    [1,1,1,1,0,0,1,1,1,1],[1,1,1,1,0,0,1,1,1,1],
  ]},
  { name: 'heart', grid: [
    [0,0,0,0,0,0,0,0,0,0],[0,1,1,1,0,0,1,1,1,0],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],
  ]},
  { name: 'question', grid: [
    [0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,0,0,0,0,1,1,1,0],[0,0,0,0,0,0,1,1,1,0],
    [0,0,0,0,1,1,1,0,0,0],[0,0,0,1,1,1,0,0,0,0],[0,0,0,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,0,0,0],[0,0,0,1,1,0,0,0,0,0],
  ]},
  { name: 'star', grid: [
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0],
    [1,1,0,0,0,0,0,0,1,1],[0,0,0,0,0,0,0,0,0,0],
  ]},
  { name: 'arrow', grid: [
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,0,1,1,0,1,1,0],
    [1,1,0,0,1,1,0,0,1,1],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ]},
  { name: 'tree', grid: [
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ]},
  { name: 'circle', grid: [
    [0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,0,0,1,1,1,0],[1,1,1,0,0,0,0,1,1,1],
    [1,1,0,0,0,0,0,0,1,1],[1,1,0,0,0,0,0,0,1,1],[1,1,1,0,0,0,0,1,1,1],[0,1,1,1,0,0,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],
  ]},
  { name: 'exclamation', grid: [
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ]},
]

type Fill = 'solid' | 'checker' | 'stripe_h' | 'stripe_v' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
function randomFill(): Fill { return FILLS[Math.floor(Math.random() * FILLS.length)] }

function embedIcon(icon: { name: string; grid: number[][] }) {
  const iR = icon.grid.length, iC = icon.grid[0].length
  const oC = Math.floor((COLS - iC) / 2)
  const oR = Math.floor((ROWS - iR) / 2)
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  for (let r = 0; r < iR; r++)
    for (let c = 0; c < iC; c++)
      grid[r + oR][c + oC] = icon.grid[r][c]
  return { name: icon.name, grid }
}

const TARGETS = ICON_SHAPES.map(embedIcon)

interface Cell {
  fill: Fill; brightness: number
  flipping: boolean; flipPhase: number; flipSpeed: number; flipTimer: number
  nextFill: Fill; nextBrightness: number
  locked: boolean; lockedAt: number; isTarget: boolean
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

type Phase = 'cycling' | 'resolving' | 'frozen_fail' | 'failing' | 'dark' | 'blink' | 'won'

interface Box {
  cells: Cell[][]; phase: Phase; phaseStart: number
  targetGrid: number[][]; willSucceed: boolean; failPoint: number
  resolveOrder: [number, number][]; resolveIndex: number; nextResolveAt: number
  wonPulse: number
}

export default function NowWhatHome() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const SCALE = Math.max(2, Math.min(3, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)))
    let W = 0, H = 0

    const resize = () => {
      W = Math.floor(window.innerWidth / SCALE)
      H = Math.floor(window.innerHeight / SCALE)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const particles: Particle[] = []

    function emitParticles(cx: number, cy: number, count: number, speed: number, life: number) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.4
        const sp = speed * (0.4 + Math.random())
        particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.15, life: 0, maxLife: life + Math.random() * life * 0.5, size: 1 })
      }
    }

    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        if (p.life > p.maxLife) { particles.splice(i, 1); continue }
        p.x += p.vx; p.y += p.vy; p.vy += 0.008
        const a = (1 - p.life / p.maxLife) * 0.55
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
      }
    }

    function drawPixelBlock(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number) {
      const v = Math.floor(brightness * 255)
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`
      switch (fill) {
        case 'solid': ctx.fillRect(x+1,y+1,size-2,size-2); break
        case 'checker':
          for (let px=0;px<size-2;px++) for (let py=0;py<size-2;py++)
            if ((px+py)%2===0) ctx.fillRect(x+1+px,y+1+py,1,1)
          break
        case 'stripe_h':
          for (let py=0;py<size-2;py++) if (py%2===0) ctx.fillRect(x+1,y+1+py,size-2,1)
          break
        case 'stripe_v':
          for (let px=0;px<size-2;px++) if (px%2===0) ctx.fillRect(x+1+px,y+1,1,size-2)
          break
        case 'dots':
          ctx.fillRect(x+2,y+2,1,1)
          if(size>5){ctx.fillRect(x+size-3,y+2,1,1);ctx.fillRect(x+2,y+size-3,1,1);ctx.fillRect(x+size-3,y+size-3,1,1)}
          break
      }
      ctx.fillStyle = `rgba(255,255,255,${alpha*0.16})`
      ctx.fillRect(x,y,size,1); ctx.fillRect(x,y,1,size)
      ctx.fillStyle = `rgba(0,0,0,${alpha*0.28})`
      ctx.fillRect(x,y+size-1,size,1); ctx.fillRect(x+size-1,y,1,size)
    }

    function drawFlap(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number, half: 'top'|'bottom', squeeze: number) {
      ctx.save()
      const mid = Math.floor(size/2)
      if (half==='top') { ctx.beginPath();ctx.rect(x,y,size,mid);ctx.clip() }
      else { ctx.beginPath();ctx.rect(x,y+mid,size,size-mid);ctx.clip() }
      drawPixelBlock(x,y,size,fill,brightness,alpha*(1-squeeze*0.3))
      ctx.restore()
    }

    function makeCell(): Cell {
      const active = Math.random() < 0.45
      return {
        fill: randomFill(), brightness: 0.15 + Math.random() * 0.45,
        flipping: active, flipPhase: active ? Math.random() : 0,
        flipSpeed: 0.013 + Math.random() * 0.025,
        flipTimer: active ? 0 : 10 + Math.floor(Math.random() * 50),
        nextFill: randomFill(), nextBrightness: 0.15 + Math.random() * 0.45,
        locked: false, lockedAt: 0, isTarget: false,
      }
    }

    // Sequencer
    let lastTargetIdx = -1
    const sequence: boolean[] = []
    function refillSequence() {
      for (let i = 0; i < 6; i++) {
        const block = [true, false, false]
        for (let j = block.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [block[j], block[k]] = [block[k], block[j]]
        }
        sequence.push(...block)
      }
    }
    refillSequence()
    function nextWillSucceed() { if (sequence.length === 0) refillSequence(); return sequence.shift()! }

    function randomFailPoint() {
      const r = Math.random()
      if (r < 0.25) return 0.2 + Math.random() * 0.1
      if (r < 0.55) return 0.4 + Math.random() * 0.15
      if (r < 0.8) return 0.6 + Math.random() * 0.15
      return 0.8 + Math.random() * 0.1
    }

    function planBox(now: number, delay: number): Box {
      let idx: number
      do { idx = Math.floor(Math.random() * TARGETS.length) } while (idx === lastTargetIdx)
      lastTargetIdx = idx
      const target = TARGETS[idx]

      const cells: Cell[][] = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => makeCell())
      )
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          cells[r][c].isTarget = target.grid[r][c] === 1

      const targetCells: [number, number][] = []
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (target.grid[r][c]) targetCells.push([c, r])

      const seed = targetCells[Math.floor(Math.random() * targetCells.length)]
      const visited = new Set<string>()
      const order: [number, number][] = []
      const queue: [number, number][] = [seed]
      visited.add(`${seed[0]},${seed[1]}`)

      while (queue.length > 0) {
        const i = Math.random() < 0.55 ? 0 : Math.min(Math.floor(Math.random() * 4), queue.length - 1)
        const [cx, cy] = queue.splice(i, 1)[0]
        order.push([cx, cy])
        for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]] as [number,number][]) {
          const key = `${nx},${ny}`
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && target.grid[ny][nx] && !visited.has(key)) {
            visited.add(key)
            queue.push([nx, ny])
          }
        }
      }

      const willSucceed = nextWillSucceed()

      return {
        cells, phase: 'cycling', phaseStart: now + delay,
        targetGrid: target.grid, willSucceed,
        failPoint: willSucceed ? 1 : randomFailPoint(),
        resolveOrder: order, resolveIndex: 0, nextResolveAt: 0,
        wonPulse: Math.random() * Math.PI * 2,
      }
    }

    const now0 = performance.now()
    let box = planBox(now0, 0)

    let textFadedIn = false, textStart = 0

    function drawScanlines() {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
    }

    let frame = 0
    const tick = () => {
      const now = performance.now()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      const maxCellW = Math.floor(W * 0.94 / COLS)
      const maxCellH = Math.floor(H * 0.32 / ROWS)
      const CELL = Math.max(4, Math.min(9, Math.min(maxCellW, maxCellH)))
      const stripW = COLS * CELL
      const stripH = ROWS * CELL
      const bx = Math.floor((W - stripW) / 2)
      const by = H - stripH - Math.floor(H * 0.05)

      const elapsed = now - box.phaseStart

      // Waiting
      if (elapsed < 0) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            ctx.fillStyle = 'rgba(255,255,255,0.012)'
            ctx.fillRect(bx + c * CELL, by + r * CELL, CELL - 1, CELL - 1)
          }
        updateParticles(); drawScanlines()
        if (!textFadedIn && now - now0 > 1500) { textFadedIn = true; textStart = now }
        if (textFadedIn) {
          const age = (now - textStart) / 1000
          const fadeIn = Math.min(1, age / 2.5)
          const breath = 0.76 + 0.24 * Math.sin(now * 0.0006)
          if (titleRef.current) titleRef.current.style.opacity = String(fadeIn * breath * 0.9)
          if (subtitleRef.current) subtitleRef.current.style.opacity = String(fadeIn * breath * 0.35)
        }
        frame = requestAnimationFrame(tick); return
      }

      // Update cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          if (cell.locked) continue
          if (cell.flipping) {
            cell.flipPhase += cell.flipSpeed
            if (cell.flipPhase >= 1) {
              cell.fill = cell.nextFill
              cell.brightness = cell.nextBrightness
              cell.flipPhase = 0
              if (Math.random() < 0.5) {
                cell.flipping = false
                cell.flipTimer = 10 + Math.floor(Math.random() * 40)
              } else {
                cell.nextFill = randomFill()
                cell.nextBrightness = 0.15 + Math.random() * 0.45
              }
            }
          } else {
            cell.flipTimer--
            if (cell.flipTimer <= 0) {
              cell.flipping = true
              cell.nextFill = randomFill()
              cell.nextBrightness = 0.15 + Math.random() * 0.45
              cell.flipSpeed = 0.016 + Math.random() * 0.035
            }
          }
        }
      }

      // Phase machine
      if (box.phase === 'cycling' && elapsed > 2400) {
        box.phase = 'resolving'
        box.phaseStart = now
        box.nextResolveAt = now + 300
      }

      if (box.phase === 'resolving') {
        const failIndex = Math.floor(box.resolveOrder.length * box.failPoint)
        if (now > box.nextResolveAt && box.resolveIndex < box.resolveOrder.length) {
          if (!box.willSucceed && box.resolveIndex >= failIndex) {
            box.phase = 'frozen_fail'
            box.phaseStart = now
          } else {
            const [cx, cy] = box.resolveOrder[box.resolveIndex]
            const cell = box.cells[cy][cx]
            cell.locked = true
            cell.lockedAt = now
            cell.fill = FILLS[Math.floor(Math.random() * 3)]
            cell.brightness = 0.55 + Math.random() * 0.45
            cell.flipping = false
            cell.flipPhase = 0
            box.resolveIndex++
            const progress = box.resolveIndex / box.resolveOrder.length
            const interval = 90 + (1 - progress * progress) * 200
            box.nextResolveAt = now + interval + Math.random() * interval * 0.3
          }
        }
        if (box.willSucceed && box.resolveIndex >= box.resolveOrder.length) {
          for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++) {
              if (box.cells[r][c].isTarget && !box.cells[r][c].locked) {
                box.cells[r][c].locked = true; box.cells[r][c].lockedAt = now
                box.cells[r][c].brightness = 0.65 + Math.random() * 0.35; box.cells[r][c].flipping = false
              }
              if (!box.cells[r][c].isTarget) {
                box.cells[r][c].locked = false; box.cells[r][c].flipping = false
                box.cells[r][c].flipTimer = 99999; box.cells[r][c].brightness = 0.02
              }
            }
          emitParticles(bx + stripW / 2, by + stripH / 2, 18, 0.6, 32)
          box.phase = 'blink'; box.phaseStart = now
        }
      }

      if (box.phase === 'blink' && now - box.phaseStart > 700) {
        box.phase = 'won'; box.phaseStart = now
      }

      if (box.phase === 'frozen_fail') {
        const holdTime = 800 + box.failPoint * 1200
        if (now - box.phaseStart > holdTime) {
          emitParticles(bx + stripW / 2, by + stripH / 2, 8, 0.3, 16)
          box.phase = 'failing'; box.phaseStart = now
        }
      }

      if (box.phase === 'failing' && now - box.phaseStart > 900) {
        box.phase = 'dark'; box.phaseStart = now
      }

      if (box.phase === 'dark' && now - box.phaseStart > 600) {
        box = planBox(now, 200)
      }

      if (box.phase === 'won' && now - box.phaseStart > 4500 + Math.random() * 2000) {
        box = planBox(now, 400)
      }

      // Draw cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          const px = bx + c * CELL
          const py = by + r * CELL

          if ((box.phase === 'won' || box.phase === 'blink') && !cell.isTarget) continue
          if (box.phase === 'dark') continue

          if (cell.locked) {
            const age = (now - cell.lockedAt) / 1000
            const lockFlash = age < 0.08 ? 0.4 : 0
            let pulse = 0
            let blinkMod = 1

            if (box.phase === 'blink') {
              const bt = now - box.phaseStart
              const blinkCycle = Math.floor(bt / 140)
              blinkMod = (blinkCycle % 2 === 0) ? 1 : 0.08
            }

            if (box.phase === 'won') {
              pulse = 0.12 * Math.sin(now * 0.0015 + c * 0.35 + r * 0.5 + box.wonPulse)
            }

            let failFlicker = 0
            if (box.phase === 'frozen_fail') {
              const agitation = 0.008 + box.failPoint * 0.01
              failFlicker = 0.12 * Math.sin((now - box.phaseStart) * agitation + c * 0.7 + r)
            }

            let failAlpha = 1
            if (box.phase === 'failing') {
              failAlpha = Math.max(0, 1 - (now - box.phaseStart) / 800)
            }

            const br = Math.min(1, Math.max(0.03, cell.brightness + lockFlash + pulse - failFlicker))
            drawPixelBlock(px, py, CELL, cell.fill, br * blinkMod, 0.9 * failAlpha)

          } else if (cell.flipping && cell.flipPhase > 0) {
            if (box.phase === 'blink') continue
            const phase = cell.flipPhase
            if (phase < 0.5) {
              drawFlap(px, py, CELL, cell.fill, cell.brightness, 0.38, 'bottom', 0)
              drawFlap(px, py, CELL, cell.fill, cell.brightness, 0.38, 'top', phase * 2)
            } else {
              drawFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, 0.38, 'top', 0)
              drawFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, 0.38, 'bottom', 1 - (phase - 0.5) * 2)
            }
          } else if (cell.flipTimer < 99999) {
            if (box.phase === 'blink') continue
            drawPixelBlock(px, py, CELL, cell.fill, cell.brightness, 0.22)
          }

          ctx.fillStyle = 'rgba(255,255,255,0.01)'
          ctx.fillRect(px + CELL - 1, py, 1, CELL)
          ctx.fillRect(px, py + CELL - 1, CELL, 1)
        }
      }

      updateParticles()
      drawScanlines()

      // Text
      if (!textFadedIn && now - now0 > 1500) { textFadedIn = true; textStart = now }
      if (textFadedIn) {
        const age = (now - textStart) / 1000
        const fadeIn = Math.min(1, age / 2.5)
        const breath = 0.76 + 0.24 * Math.sin(now * 0.0006)
        if (titleRef.current) titleRef.current.style.opacity = String(fadeIn * breath * 0.9)
        if (subtitleRef.current) subtitleRef.current.style.opacity = String(fadeIn * breath * 0.35)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="min-h-dvh bg-black overflow-hidden relative">
      <canvas
        ref={canvasRef}
        className="fixed inset-0"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ marginTop: '-14vh' }}>
          <div
            ref={titleRef}
            className="font-light tracking-[0.14em] text-white"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 'clamp(30px, 7.5vw, 62px)',
              opacity: 0,
            }}
          >
            Now what?
          </div>
          <div
            ref={subtitleRef}
            className="font-light tracking-[0.08em]"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 'clamp(9px, 2vw, 13px)',
              color: 'rgba(255,255,255,0.3)',
              marginTop: '1.4vh',
              opacity: 0,
            }}
          >
            a research project
          </div>
        </div>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');
      `}</style>
    </div>
  )
}
