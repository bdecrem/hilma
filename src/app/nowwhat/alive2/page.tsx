'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const COLS = 26
const ROWS = 10
type Fill = 'solid' | 'checker' | 'stripe_h' | 'stripe_v' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
function randomFill(): Fill { return FILLS[Math.floor(Math.random() * FILLS.length)] }

interface Cell {
  fill: Fill; brightness: number
  flipping: boolean; flipPhase: number; flipSpeed: number; flipTimer: number
  nextFill: Fill; nextBrightness: number
  locked: boolean; lockedAt: number; isTarget: boolean
  energy: number; agitation: number
}

interface ShapeResult {
  id: string; concept: string; name: string
  grid: number[][]; fillPercent: number
}

type Phase = 'cycling' | 'resolving' | 'entropy' | 'frozen_fail' | 'failing' | 'dark' | 'blink' | 'won' | 'fading'

function makeCell(): Cell {
  const active = Math.random() < 0.4
  return {
    fill: randomFill(), brightness: 0.15 + Math.random() * 0.4,
    flipping: active, flipPhase: active ? Math.random() : 0,
    flipSpeed: 0.013 + Math.random() * 0.02,
    flipTimer: active ? 0 : 15 + Math.floor(Math.random() * 50),
    nextFill: randomFill(), nextBrightness: 0.15 + Math.random() * 0.4,
    locked: false, lockedAt: 0, isTarget: false,
    energy: 0, agitation: 0,
  }
}

function makeCells(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => makeCell()))
}

function n4(cells: Cell[][], r: number, c: number): number {
  let n = 0
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r+dr, nc = c+dc
    if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&cells[nr][nc].isTarget&&cells[nr][nc].locked) n++
  }
  return n
}

function lockedCount(cells: Cell[][]): number {
  let n = 0
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (cells[r][c].isTarget&&cells[r][c].locked) n++
  return n
}

function randomFailPoint(): number {
  const r = Math.random()
  if (r < 0.25) return 0.2 + Math.random() * 0.1
  if (r < 0.55) return 0.4 + Math.random() * 0.15
  if (r < 0.8) return 0.6 + Math.random() * 0.15
  return 0.8 + Math.random() * 0.1
}

export default function Alive2Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellsRef = useRef<Cell[][]>(makeCells())
  const phaseRef = useRef<Phase>('cycling')
  const phaseStartRef = useRef(performance.now())
  const currentShapeRef = useRef<ShapeResult | null>(null)
  const resolveOrderRef = useRef<[number, number][]>([])
  const resolveIndexRef = useRef(0)
  const nextResolveRef = useRef(0)
  const willSucceedRef = useRef(false)
  const failPointRef = useRef(0.5)
  const totalTargetRef = useRef(0)
  const entropyStartRef = useRef(0)
  const wonPulseRef = useRef(0)

  // Win sequencer: 1 in 3 wins, shuffled in blocks
  const seqRef = useRef<boolean[]>([])
  function nextWillSucceed(): boolean {
    if (seqRef.current.length === 0) {
      for (let i = 0; i < 6; i++) {
        const b = [true, false, false]
        for (let j = 2; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [b[j], b[k]] = [b[k], b[j]]
        }
        seqRef.current.push(...b)
      }
    }
    return seqRef.current.shift()!
  }

  const [log, setLog] = useState<{ concept: string; name: string; status: string; time: string }[]>([])
  const [currentConcept, setConcept] = useState<string>('starting up...')
  const [stats, setStats] = useState({ generated: 0, won: 0, failed: 0 })

  const requestShape = useCallback(async () => {
    try {
      const res = await fetch('/api/nowwhat/gen2', { method: 'POST' })
      const data = await res.json()
      if (data.candidate) return data.candidate as ShapeResult
      setLog(prev => [{
        concept: data.concept || '?', name: '-',
        status: `rejected: ${data.error || 'unknown'}`,
        time: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 40))
      return null
    } catch { return null }
  }, [])

  const startNewShape = useCallback(async () => {
    setConcept('thinking...')
    phaseRef.current = 'cycling'
    phaseStartRef.current = performance.now()

    const cells = cellsRef.current
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cell = cells[r][c]
        cell.locked = false; cell.isTarget = false
        cell.flipping = Math.random() < 0.4
        cell.flipPhase = cell.flipping ? Math.random() : 0
        cell.flipTimer = cell.flipping ? 0 : 15 + Math.floor(Math.random() * 50)
        cell.brightness = 0.15 + Math.random() * 0.4
        cell.energy = 0; cell.agitation = 0
      }

    const shape = await requestShape()
    if (!shape) {
      setTimeout(startNewShape, 2000)
      return
    }

    currentShapeRef.current = shape
    setConcept(shape.concept)
    setStats(s => ({ ...s, generated: s.generated + 1 }))

    // Decide fate
    const willSucceed = nextWillSucceed()
    willSucceedRef.current = willSucceed
    failPointRef.current = willSucceed ? 1 : randomFailPoint()
    wonPulseRef.current = Math.random() * Math.PI * 2

    // Mark target cells
    let totalTarget = 0
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        cells[r][c].isTarget = shape.grid[r][c] === 1
        if (shape.grid[r][c]) totalTarget++
      }
    totalTargetRef.current = totalTarget

    // BFS resolve order
    const targetCells: [number, number][] = []
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (shape.grid[r][c]) targetCells.push([c, r])

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
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && shape.grid[ny][nx] && !visited.has(key)) {
          visited.add(key)
          queue.push([nx, ny])
        }
      }
    }

    resolveOrderRef.current = order
    resolveIndexRef.current = 0

    setTimeout(() => {
      phaseRef.current = 'resolving'
      phaseStartRef.current = performance.now()
      nextResolveRef.current = performance.now() + 300
    }, 1800)
  }, [requestShape])

  useEffect(() => { startNewShape() }, [startNewShape])

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const SCALE = Math.max(2, Math.min(3, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)))
    let W = 0, H = 0

    const resize = () => {
      W = Math.floor(window.innerWidth / SCALE)
      H = Math.floor(window.innerHeight / SCALE)
      canvas.width = W; canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

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

    let frame = 0
    const tick = () => {
      const now = performance.now()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      const maxCW = Math.floor(W * 0.94 / COLS)
      const maxCH = Math.floor(H * 0.45 / ROWS)
      const CELL = Math.max(4, Math.min(9, Math.min(maxCW, maxCH)))
      const stripW = COLS * CELL
      const stripH = ROWS * CELL
      const bx = Math.floor((W - stripW) / 2)
      const by = Math.floor(H * 0.18)

      const cells = cellsRef.current
      const phase = phaseRef.current

      // Update cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = cells[r][c]
          if (cell.locked) continue
          if (cell.flipping) {
            cell.flipPhase += cell.flipSpeed
            if (cell.flipPhase >= 1) {
              cell.fill = cell.nextFill; cell.brightness = cell.nextBrightness; cell.flipPhase = 0
              if (Math.random() < 0.5) {
                cell.flipping = false
                cell.flipTimer = 10 + Math.floor(Math.random() * 40)
              } else {
                cell.nextFill = randomFill()
                cell.nextBrightness = 0.15 + Math.random() * 0.4
              }
            }
          } else {
            cell.flipTimer--
            if (cell.flipTimer <= 0) {
              cell.flipping = true; cell.nextFill = randomFill()
              cell.nextBrightness = 0.15 + Math.random() * 0.4
              cell.flipSpeed = 0.016 + Math.random() * 0.03
            }
          }
        }
      }

      // --- Phase machine ---

      // Resolving: lock cells progressively via BFS
      if (phase === 'resolving' && now > nextResolveRef.current) {
        const order = resolveOrderRef.current
        const idx = resolveIndexRef.current
        const progress = totalTargetRef.current > 0 ? lockedCount(cells) / totalTargetRef.current : 0

        // Check fail point
        if (!willSucceedRef.current && progress >= failPointRef.current) {
          phaseRef.current = 'entropy'
          phaseStartRef.current = now
          entropyStartRef.current = now
        } else if (idx < order.length) {
          const [cx, cy] = order[idx]
          const cell = cells[cy][cx]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)]
          cell.brightness = 0.55 + Math.random() * 0.45
          cell.flipping = false; cell.flipPhase = 0
          resolveIndexRef.current = idx + 1

          const p = (idx + 1) / order.length
          const interval = 80 + (1 - p * p) * 180
          nextResolveRef.current = now + interval + Math.random() * interval * 0.3
        }

        // Success: all locked
        if (willSucceedRef.current && resolveIndexRef.current >= order.length) {
          for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++) {
              if (cells[r][c].isTarget && !cells[r][c].locked) {
                cells[r][c].locked = true; cells[r][c].lockedAt = now
                cells[r][c].brightness = 0.65 + Math.random() * 0.35; cells[r][c].flipping = false
              }
              if (!cells[r][c].isTarget) {
                cells[r][c].locked = false; cells[r][c].flipping = false
                cells[r][c].flipTimer = 99999; cells[r][c].brightness = 0.02
              }
            }
          phaseRef.current = 'blink'; phaseStartRef.current = now
        }
      }

      // Entropy: locked cells dissolve back into noise
      if (phase === 'entropy') {
        const eE = (now - entropyStartRef.current) / 1000
        const rate = 0.004 + eE * 0.012
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            const cell = cells[r][c]
            if (!cell.locked || !cell.isTarget) continue
            const nn = n4(cells, r, c)
            const v = Math.max(0.15, 1 - nn * 0.25)
            if (Math.random() < rate * v) {
              cell.locked = false; cell.flipping = true; cell.flipPhase = 0
              cell.flipSpeed = 0.04 + Math.random() * 0.04
              cell.brightness = 0.25 + Math.random() * 0.2; cell.energy = 0
            }
          }
        // Flicker remaining locked cells
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            const cell = cells[r][c]
            if (cell.locked && cell.isTarget)
              cell.brightness = Math.max(0.15, cell.brightness - 0.002 + Math.sin(now * 0.018 + r * 2 + c * 3) * 0.012)
          }
        if (lockedCount(cells) < totalTargetRef.current * 0.12 || eE > 3.5) {
          phaseRef.current = 'frozen_fail'; phaseStartRef.current = now
        }
      }

      // Frozen fail: brief hold
      if (phase === 'frozen_fail' && now - phaseStartRef.current > 1200) {
        phaseRef.current = 'failing'; phaseStartRef.current = now
      }

      // Failing: fade out
      if (phase === 'failing' && now - phaseStartRef.current > 900) {
        phaseRef.current = 'dark'; phaseStartRef.current = now
        const shape = currentShapeRef.current
        if (shape) {
          setLog(prev => [{
            concept: shape.concept, name: shape.name,
            status: 'entropy won',
            time: new Date().toLocaleTimeString(),
          }, ...prev].slice(0, 40))
          setStats(s => ({ ...s, failed: s.failed + 1 }))
        }
      }

      // Dark: pause then restart
      if (phase === 'dark' && now - phaseStartRef.current > 600) {
        startNewShape()
      }

      // Blink
      if (phase === 'blink' && now - phaseStartRef.current > 700) {
        phaseRef.current = 'won'; phaseStartRef.current = now
        const shape = currentShapeRef.current
        if (shape) {
          setLog(prev => [{
            concept: shape.concept, name: shape.name,
            status: 'landed',
            time: new Date().toLocaleTimeString(),
          }, ...prev].slice(0, 40))
          setStats(s => ({ ...s, won: s.won + 1 }))
          // Save winner to dashboard
          fetch('/api/nowwhat/gen2', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate: shape }),
          }).catch(() => {})
        }
      }

      // Won: hold then start next
      if (phase === 'won' && now - phaseStartRef.current > 4500) {
        phaseRef.current = 'fading'; phaseStartRef.current = now
      }

      if (phase === 'fading' && now - phaseStartRef.current > 1000) {
        startNewShape()
      }

      // --- Draw ---
      const fadeAlpha = phase === 'fading' ? Math.max(0, 1 - (now - phaseStartRef.current) / 1000) : 1
      const failAlpha = phase === 'failing' ? Math.max(0, 1 - (now - phaseStartRef.current) / 800) : 1

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = cells[r][c]
          const px = bx + c * CELL
          const py = by + r * CELL

          if ((phase === 'won' || phase === 'blink' || phase === 'fading') && !cell.isTarget) continue
          if (phase === 'dark') continue

          if (cell.locked) {
            const age = (now - cell.lockedAt) / 1000
            const flash = age < 0.08 ? 0.4 : 0
            let blinkMod = 1
            if (phase === 'blink') {
              blinkMod = (Math.floor((now - phaseStartRef.current) / 130) % 2 === 0) ? 1 : 0.06
            }
            let pulse = 0
            if (phase === 'won' || phase === 'fading') {
              pulse = 0.12 * Math.sin(now * 0.0015 + c * 0.35 + r * 0.5 + wonPulseRef.current)
            }
            // Entropy flicker
            let eF = 0
            if (phase === 'entropy') {
              const nn = n4(cells, r, c)
              eF = Math.max(0.15, 1 - nn * 0.25) * 0.15 * Math.sin(now * 0.015 + c * 1.1 + r * 0.8)
            }
            let fF = 0
            if (phase === 'frozen_fail') {
              fF = 0.1 * Math.sin((now - phaseStartRef.current) * 0.012 + c * 0.7 + r)
            }
            const br = Math.min(1, Math.max(0.03, cell.brightness + flash + pulse - eF - fF))
            drawPixelBlock(px, py, CELL, cell.fill, br * blinkMod, 0.9 * fadeAlpha * failAlpha)
          } else if (cell.flipping && cell.flipPhase > 0) {
            if (phase === 'blink') continue
            const ph = cell.flipPhase
            if (ph < 0.5) {
              drawFlap(px, py, CELL, cell.fill, cell.brightness, 0.35, 'bottom', 0)
              drawFlap(px, py, CELL, cell.fill, cell.brightness, 0.35, 'top', ph * 2)
            } else {
              drawFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, 0.35, 'top', 0)
              drawFlap(px, py, CELL, cell.nextFill, cell.nextBrightness, 0.35, 'bottom', 1 - (ph - 0.5) * 2)
            }
          } else if (cell.flipTimer < 99999) {
            if (phase === 'blink') continue
            drawPixelBlock(px, py, CELL, cell.fill, cell.brightness, 0.2)
          }

          ctx.fillStyle = 'rgba(255,255,255,0.01)'
          ctx.fillRect(px + CELL - 1, py, 1, CELL)
          ctx.fillRect(px, py + CELL - 1, CELL, 1)
        }
      }

      // Scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [startNewShape])

  return (
    <div className="min-h-dvh bg-black overflow-hidden relative" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <canvas ref={canvasRef} className="fixed inset-0" style={{ imageRendering: 'pixelated' }} />

      <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="mb-3 text-center">
            <span className="text-white/50 text-xs tracking-wide">concept: </span>
            <span className="text-white/80 text-sm font-light tracking-wider">{currentConcept}</span>
          </div>

          <div className="flex justify-between text-white/30 text-[10px] tracking-wider mb-2 px-1">
            <span>generated: {stats.generated}</span>
            <span className="text-green-400/50">landed: {stats.won}</span>
            <span className="text-red-400/40">entropy: {stats.failed}</span>
          </div>

          <div className="bg-white/[0.03] backdrop-blur-sm rounded-lg border border-white/[0.05] p-3 max-h-[140px] overflow-y-auto">
            {log.length === 0 && (
              <div className="text-white/20 text-xs text-center">waiting for first shape...</div>
            )}
            {log.map((entry, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs leading-relaxed">
                <span className="text-white/20 shrink-0">{entry.time}</span>
                <span className="text-white/40">{entry.concept}</span>
                <span className="text-white/15">&rarr;</span>
                <span className={entry.status === 'landed' ? 'text-green-400/60' : 'text-red-400/40'}>
                  {entry.status === 'landed' ? entry.name : entry.status}
                </span>
              </div>
            ))}
          </div>

          <div className="text-center mt-2">
            <a href="/nowwhat/dashboard" className="text-white/20 text-[10px] hover:text-white/40 transition-colors pointer-events-auto">
              open dashboard &rarr;
            </a>
          </div>
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');`}</style>
    </div>
  )
}
