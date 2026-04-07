'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  COLS, ROWS,
  type Box, type Sequencer, type EvaluationResult, type Grid,
  type Fill,
  FILLS, randomFill,
  makeCell, n4, n8, lockedCount, getFrontier,
  planEmergentBox,
  snapshotGrid,
  computeLayout, drawPixelBlock, drawFlap, drawScanlines, drawBox,
} from '@/lib/nowwhat'
import { generateGrid, gridToText } from '@/lib/nowwhat/generators'

interface Winner {
  id: string; name: string; reason: string; grid: number[][]; createdAt: string; fillPercent: number
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

// The alive page: emergent art + AI judge + winner pool
export default function NowWhatAlive() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)

  const winnersRef = useRef<Winner[]>([])
  const statsDataRef = useRef({ evaluated: 0, accepted: 0 })

  // Fetch winners on mount
  useEffect(() => {
    fetch('/api/nowwhat/winners')
      .then(r => r.json())
      .then(data => {
        winnersRef.current = data.winners || []
        statsDataRef.current = { evaluated: data.totalEvaluated || 0, accepted: data.totalAccepted || 0 }
      })
      .catch(() => {})
  }, [])

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

    // --- Decide next box: 50% winner replay, 50% emergent ---
    function nextBox(now: number, delay: number): Box {
      const winners = winnersRef.current
      if (winners.length > 0 && Math.random() < 0.5) {
        // Replay a winner — always succeeds
        const w = winners[Math.floor(Math.random() * winners.length)]
        const box = planEmergentBox(now, delay, w.grid, true)
        box.winnerName = w.name
        return box
      }
      // New emergent shape — judge will decide
      const grid = generateGrid()
      return planEmergentBox(now, delay, grid)
    }

    // --- Judge API call ---
    let judgeInFlight = false
    function callJudge(box: Box) {
      if (judgeInFlight) return
      judgeInFlight = true
      const grid = snapshotGrid(box.cells)
      fetch('/api/nowwhat/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid }),
      })
        .then(r => r.json())
        .then(result => {
          box.evaluationResult = {
            accept: result.accept,
            name: result.name || '',
            reason: result.reason || '',
          }
          if (result.stats) {
            statsDataRef.current = result.stats
          }
          if (result.accept && result.name) {
            // Add to local winner pool
            winnersRef.current.push({
              id: `w-${Date.now()}`,
              name: result.name,
              reason: result.reason || '',
              grid,
              createdAt: new Date().toISOString(),
              fillPercent: Math.round(grid.flat().filter(c => c === 1).length / (COLS * ROWS) * 100),
            })
          }
          judgeInFlight = false
        })
        .catch(() => {
          box.evaluationResult = { accept: false, name: '', reason: 'network error' }
          judgeInFlight = false
        })
    }

    const now0 = performance.now()
    let box = nextBox(now0, 0)

    let textFadedIn = false, textStart = 0
    let showName = '', showNameStart = 0

    function updateText(now: number) {
      if (!textFadedIn && now - now0 > 1500) { textFadedIn = true; textStart = now }
      if (textFadedIn) {
        const age = (now - textStart) / 1000
        const fadeIn = Math.min(1, age / 2.5)
        const breath = 0.76 + 0.24 * Math.sin(now * 0.0006)
        if (titleRef.current) titleRef.current.style.opacity = String(fadeIn * breath * 0.9)
        if (subtitleRef.current) subtitleRef.current.style.opacity = String(fadeIn * breath * 0.35)
      }
      // Winner name display
      if (nameRef.current) {
        if (showName && now - showNameStart < 3000) {
          const age = (now - showNameStart) / 1000
          const fade = age < 0.5 ? age / 0.5 : age > 2.5 ? 1 - (age - 2.5) / 0.5 : 1
          nameRef.current.style.opacity = String(fade * 0.7)
          nameRef.current.textContent = showName
        } else {
          nameRef.current.style.opacity = '0'
        }
      }
      // Stats
      if (statsRef.current) {
        const s = statsDataRef.current
        if (s.evaluated > 0) {
          statsRef.current.textContent = `${s.accepted} of ${s.evaluated} accepted`
          statsRef.current.style.opacity = '0.2'
        }
      }
    }

    // --- Simulation step (inlined from stepBox to handle phase transitions with particles) ---
    function step(now: number): Box {
      const elapsed = now - box.phaseStart
      if (elapsed < 0) return box

      const layout = computeLayout(W, H)

      // Evaluating phase
      if (box.phase === 'evaluating') {
        const eElapsed = now - box.phaseStart
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          if (cell.locked && cell.isTarget)
            cell.brightness = 0.4 + 0.2 * Math.sin(now * 0.003 + c * 0.5 + r * 0.7)
        }
        if (eElapsed > 5000 && !box.evaluationResult)
          box.evaluationResult = { accept: false, name: '', reason: 'timeout' }
        if (box.evaluationResult) {
          if (box.evaluationResult.accept) {
            box.willSucceed = true
            box.winnerName = box.evaluationResult.name
            showName = box.evaluationResult.name
            showNameStart = now
            box.phase = 'cascade'; box.phaseStart = now
          } else {
            box.willSucceed = false
            box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now
          }
        }
        return box
      }

      // Attention
      const adx = box.attTX - box.attX, ady = box.attTY - box.attY
      box.attX += adx * box.attSpeed; box.attY += ady * box.attSpeed
      if (Math.abs(adx) < 0.8 && Math.abs(ady) < 0.8) {
        const frontier = getFrontier(box.cells)
        if (frontier.length > 0) {
          const w = frontier.flatMap(f => Array(f.n * 2 + 1).fill(f))
          const p = w[Math.floor(Math.random() * w.length)]
          box.attTX = p.c + (Math.random() - 0.5) * 3
          box.attTY = p.r + (Math.random() - 0.5) * 2
        } else if (box.tCells.length > 0) {
          const p = box.tCells[Math.floor(Math.random() * box.tCells.length)]
          box.attTX = p[1] + (Math.random() - 0.5) * 4
          box.attTY = p[0] + (Math.random() - 0.5) * 3
        }
        box.attSpeed = 0.012 + Math.random() * 0.025
      }

      // Update cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          const dA = Math.sqrt((c - box.attX) ** 2 + (r - box.attY) ** 2)
          const aI = Math.max(0, 1 - dA / 7)

          if (cell.isTarget && !cell.locked) {
            const nn = n4(box.cells, r, c)
            cell.agitation += (0.08 + aI * 0.5 + nn * 0.3 - cell.agitation) * 0.1
          } else if (!cell.isTarget && !cell.locked) {
            cell.agitation += (aI * 0.12 - cell.agitation) * 0.06
          }

          if (!cell.locked) {
            if (cell.flipping) {
              cell.flipPhase += cell.flipSpeed * (1 + cell.agitation * 2.5)
              if (cell.flipPhase >= 1) {
                cell.fill = cell.nextFill; cell.brightness = cell.nextBrightness; cell.flipPhase = 0
                if (Math.random() < 0.4 - cell.agitation * 0.2) {
                  cell.flipping = false
                  cell.flipTimer = Math.floor((8 + Math.random() * 35) * (1 - cell.agitation * 0.5))
                } else {
                  cell.nextFill = randomFill()
                  cell.nextBrightness = 0.15 + Math.random() * 0.45 + cell.agitation * 0.2
                }
              }
            } else {
              cell.flipTimer--
              if (cell.flipTimer <= 0) {
                cell.flipping = true; cell.nextFill = randomFill()
                cell.nextBrightness = 0.15 + Math.random() * 0.45 + cell.agitation * 0.2
                cell.flipSpeed = 0.016 + Math.random() * 0.035
              }
            }
          }

          if (cell.locked && cell.probing) {
            cell.stability++
            const nn = n4(box.cells, r, c)
            if (nn >= 2) cell.probing = false
            else if (cell.stability > 30 + Math.random() * 20) {
              cell.locked = false; cell.probing = false
              cell.flipping = true; cell.flipPhase = 0
              cell.flipSpeed = 0.03 + Math.random() * 0.03
              cell.brightness *= 0.5; cell.energy *= 0.3; cell.stability = 0
            }
          }
        }
      }

      // Phase transitions
      if (box.phase === 'cycling' && elapsed > 1600) {
        box.phase = 'searching'; box.phaseStart = now; box.searchStart = now
      }

      if (box.phase === 'searching') {
        const sE = (now - box.searchStart) / 1000

        if (!box.seeded && sE > 0.6) {
          box.seeded = true
          const seed = box.tCells[Math.floor(Math.random() * box.tCells.length)]
          const cell = box.cells[seed[0]][seed[1]]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
          cell.brightness = 0.55 + Math.random() * 0.4
          cell.flipping = false; cell.flipPhase = 0; cell.energy = 0
          if (Math.random() < 0.5) {
            for (const [dr, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
              const nr = seed[0]+dr, nc = seed[1]+dc
              if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&box.cells[nr][nc].isTarget&&!box.cells[nr][nc].locked) {
                const c2 = box.cells[nr][nc]
                c2.locked = true; c2.lockedAt = now
                c2.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
                c2.brightness = 0.55 + Math.random() * 0.4
                c2.flipping = false; c2.flipPhase = 0; c2.energy = 0
                break
              }
            }
          }
        }

        const drive = Math.min(3, 0.3 + sE * 0.35)
        const frontier = getFrontier(box.cells)
        for (const f of frontier) {
          const cell = box.cells[f.r][f.c]
          const dA = Math.sqrt((f.c - box.attX) ** 2 + (f.r - box.attY) ** 2)
          const aB = Math.max(0, 1 - dA / 5) * 0.006
          cell.energy += 0.001 * drive + f.n * 0.006 * drive + aB * drive
          const th = 0.04 / (drive * 0.5 + 0.5)
          if (cell.energy > th || Math.random() < cell.energy * 0.8) {
            cell.locked = true; cell.lockedAt = now
            cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
            cell.brightness = 0.55 + Math.random() * 0.45
            cell.flipping = false; cell.flipPhase = 0
            cell.energy = 0; cell.stability = 0; cell.probing = false
          }
        }

        if (sE < 4 && Math.random() < 0.015 * drive) {
          const cands: [number,number][] = []
          for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
            if (box.cells[r][c].isTarget&&!box.cells[r][c].locked&&n4(box.cells,r,c)===0) cands.push([r,c])
          if (cands.length > 0) {
            cands.sort((a,b) => Math.sqrt((a[1]-box.attX)**2+(a[0]-box.attY)**2) - Math.sqrt((b[1]-box.attX)**2+(b[0]-box.attY)**2))
            const pick = cands[Math.floor(Math.random() * Math.min(5, cands.length))]
            const cell = box.cells[pick[0]][pick[1]]
            cell.locked = true; cell.lockedAt = now
            cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
            cell.brightness = 0.45 + Math.random() * 0.35
            cell.flipping = false; cell.flipPhase = 0
            cell.energy = 0; cell.stability = 0; cell.probing = true
          }
        }

        const nP = lockedCount(box.cells) / box.totalTarget

        // Emergent: send to judge when stabilized
        if (box.emergent && !box.evaluationSent && nP >= 0.85) {
          box.evaluationSent = true
          box.phase = 'evaluating'; box.phaseStart = now
          callJudge(box)
          return box
        }
        if (box.emergent && !box.evaluationSent && sE > 10) {
          box.evaluationSent = true
          box.phase = 'evaluating'; box.phaseStart = now
          callJudge(box)
          return box
        }

        // Non-emergent (winner replay): always cascade
        if (!box.emergent) {
          if (box.willSucceed && nP >= 0.7) { box.phase = 'cascade'; box.phaseStart = now }
          if (!box.willSucceed && nP >= box.failPoint) { box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now }
          if (box.willSucceed && sE > 12) { box.phase = 'cascade'; box.phaseStart = now }
          if (!box.willSucceed && sE > 10) { box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now }
        }
      }

      if (box.phase === 'cascade') {
        const cE = now - box.phaseStart
        let rem: [number,number][] = []
        for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
          if (box.cells[r][c].isTarget&&!box.cells[r][c].locked) rem.push([r,c])
        const rate = Math.max(1, Math.floor(1 + cE / 60))
        for (let i = 0; i < Math.min(rate, rem.length); i++) {
          let best = rem[0], bestN = -1
          for (const [r,c] of rem) {
            const nn = n8(box.cells, r, c)
            if (nn > bestN || (nn === bestN && Math.random() < 0.4)) { bestN = nn; best = [r,c] }
          }
          const [br, bc] = best
          const cell = box.cells[br][bc]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
          cell.brightness = 0.65 + Math.random() * 0.35
          cell.flipping = false; cell.flipPhase = 0; cell.probing = false
          rem = rem.filter(([r,c]) => r !== br || c !== bc)
        }
        if (rem.length === 0) {
          for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
            if (!box.cells[r][c].isTarget) {
              box.cells[r][c].locked = false; box.cells[r][c].flipping = false
              box.cells[r][c].flipTimer = 99999; box.cells[r][c].brightness = 0.02
            }
          }
          // Show winner name on cascade complete
          if (box.winnerName && !showName) {
            showName = box.winnerName
            showNameStart = now
          }
          box.phase = 'blink'; box.phaseStart = now
        }
      }

      if (box.phase === 'entropy') {
        const eE = (now - (box.entropyStart ?? box.phaseStart)) / 1000
        const rate = 0.004 + eE * 0.012
        for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
          const cell = box.cells[r][c]
          if (!cell.locked || !cell.isTarget) continue
          const nn = n4(box.cells, r, c)
          const v = Math.max(0.15, 1 - nn * 0.25)
          if (Math.random() < rate * v) {
            cell.locked = false; cell.probing = false
            cell.flipping = true; cell.flipPhase = 0
            cell.flipSpeed = 0.04 + Math.random() * 0.04
            cell.brightness = 0.25 + Math.random() * 0.2; cell.energy = 0
          }
        }
        for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
          const cell = box.cells[r][c]
          if (cell.locked && cell.isTarget)
            cell.brightness = Math.max(0.15, cell.brightness - 0.002 + Math.sin(now * 0.018 + r * 2 + c * 3) * 0.012)
        }
        if (lockedCount(box.cells) < box.totalTarget * 0.12 || eE > 3.5) {
          box.phase = 'frozen_fail'; box.phaseStart = now
        }
      }

      if (box.phase === 'blink' && now - box.phaseStart > 700) {
        box.phase = 'won'; box.phaseStart = now
      }

      if (box.phase === 'frozen_fail' && now - box.phaseStart > 1200) {
        box.phase = 'failing'; box.phaseStart = now
      }

      if (box.phase === 'failing' && now - box.phaseStart > 900) {
        box.phase = 'dark'; box.phaseStart = now
      }

      if (box.phase === 'dark' && now - box.phaseStart > 600) {
        showName = ''
        return nextBox(now, 200)
      }

      if (box.phase === 'won' && now - box.phaseStart > 4500 + Math.random() * 2000) {
        showName = ''
        return nextBox(now, 400)
      }

      return box
    }

    let frame = 0
    const tick = () => {
      const now = performance.now()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      const layout = computeLayout(W, H)
      const { CELL, stripW, stripH, bx, by } = layout

      const elapsed = now - box.phaseStart

      // Waiting
      if (elapsed < 0) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            ctx.fillStyle = 'rgba(255,255,255,0.012)'
            ctx.fillRect(bx + c * CELL, by + r * CELL, CELL - 1, CELL - 1)
          }
        updateParticles(); drawScanlines(ctx, W, H); updateText(now)
        frame = requestAnimationFrame(tick); return
      }

      // Step simulation
      box = step(now)

      // Draw
      drawBox(ctx, box, now, layout)
      updateParticles()
      drawScanlines(ctx, W, H)
      updateText(now)

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
      {/* Winner name overlay */}
      <div
        ref={nameRef}
        className="fixed z-20 pointer-events-none font-light tracking-[0.1em]"
        style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 'clamp(8px, 1.8vw, 12px)',
          color: 'rgba(255,255,255,0.7)',
          bottom: '8vh',
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: 0,
          transition: 'opacity 0.3s',
        }}
      />
      {/* Stats counter */}
      <div
        ref={statsRef}
        className="fixed z-20 pointer-events-none font-light"
        style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 'clamp(7px, 1.2vw, 9px)',
          color: 'rgba(255,255,255,0.2)',
          bottom: '2vh',
          left: '2vw',
          opacity: 0,
        }}
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');
      `}</style>
    </div>
  )
}
