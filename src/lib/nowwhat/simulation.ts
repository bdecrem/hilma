import { COLS, ROWS, ACHIEVABLE, IMPOSSIBLE, type Shape, type Grid } from './shapes'
import { type Cell, type Fill, FILLS, makeCell, randomFill, n4, n8, lockedCount, getFrontier } from './cells'

export type Phase = 'cycling' | 'searching' | 'evaluating' | 'cascade' | 'entropy' | 'frozen_fail' | 'failing' | 'dark' | 'blink' | 'won'

export interface EvaluationResult {
  accept: boolean
  name: string
  reason: string
}

export interface Box {
  cells: Cell[][]; phase: Phase; phaseStart: number
  willSucceed: boolean; failPoint: number; totalTarget: number
  tCells: [number, number][]; isImpossible: boolean
  attX: number; attY: number; attTX: number; attTY: number; attSpeed: number
  searchStart: number; seeded: boolean; wonPulse: number
  entropyStart?: number
  // Agentic fields
  emergent?: boolean
  evaluationSent?: boolean
  evaluationResult?: EvaluationResult
  winnerName?: string
}

export interface Sequencer {
  lastIdx: number
  seq: boolean[]
}

export function createSequencer(): Sequencer {
  const s: Sequencer = { lastIdx: -1, seq: [] }
  refillSeq(s)
  return s
}

function refillSeq(s: Sequencer) {
  for (let i = 0; i < 6; i++) {
    const b = [true, false, false]
    for (let j = 2; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [b[j], b[k]] = [b[k], b[j]]
    }
    s.seq.push(...b)
  }
}

function nextWillSucceed(s: Sequencer): boolean {
  if (!s.seq.length) refillSeq(s)
  return s.seq.shift()!
}

function randomFailPoint(): number {
  const r = Math.random()
  if (r < 0.25) return 0.2 + Math.random() * 0.1
  if (r < 0.55) return 0.4 + Math.random() * 0.15
  if (r < 0.8) return 0.6 + Math.random() * 0.15
  return 0.8 + Math.random() * 0.1
}

export function planBox(now: number, delay: number, seq: Sequencer): Box {
  let shape: Shape, willSucceed: boolean, isImpossible = false
  if (Math.random() < 0.3 && IMPOSSIBLE.length > 0) {
    shape = IMPOSSIBLE[Math.floor(Math.random() * IMPOSSIBLE.length)]
    willSucceed = false; isImpossible = true
  } else {
    let idx: number
    do { idx = Math.floor(Math.random() * ACHIEVABLE.length) } while (ACHIEVABLE.length > 1 && idx === seq.lastIdx)
    seq.lastIdx = idx; shape = ACHIEVABLE[idx]
    willSucceed = nextWillSucceed(seq)
  }

  const cells: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => makeCell())
  )
  let totalTarget = 0
  const tCells: [number, number][] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      cells[r][c].isTarget = shape.grid[r][c] === 1
      if (shape.grid[r][c]) { totalTarget++; tCells.push([r, c]) }
    }

  const failPt = willSucceed ? 1 : isImpossible ? (0.5 + Math.random() * 0.4) : randomFailPoint()

  return {
    cells, phase: 'cycling', phaseStart: now + (delay || 0),
    willSucceed, failPoint: failPt, totalTarget, tCells, isImpossible,
    attX: COLS/2, attY: ROWS/2, attTX: COLS/2, attTY: ROWS/2, attSpeed: 0.02,
    searchStart: 0, seeded: false, wonPulse: Math.random() * Math.PI * 2,
  }
}

// Create a box from an arbitrary grid (for emergent shapes or winner replays)
export function planEmergentBox(now: number, delay: number, grid: Grid, willSucceed?: boolean): Box {
  const cells: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => makeCell())
  )
  let totalTarget = 0
  const tCells: [number, number][] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      cells[r][c].isTarget = grid[r][c] === 1
      if (grid[r][c]) { totalTarget++; tCells.push([r, c]) }
    }

  return {
    cells, phase: 'cycling', phaseStart: now + (delay || 0),
    // willSucceed undefined for emergent = decided by judge later
    willSucceed: willSucceed ?? false,
    failPoint: 0.7 + Math.random() * 0.2,
    totalTarget, tCells, isImpossible: false,
    attX: COLS/2, attY: ROWS/2, attTX: COLS/2, attTY: ROWS/2, attSpeed: 0.02,
    searchStart: 0, seeded: false, wonPulse: Math.random() * Math.PI * 2,
    emergent: willSucceed === undefined ? true : undefined,
  }
}

// Snapshot the target grid from a box's cells
export function snapshotGrid(cells: Cell[][]): Grid {
  return cells.map(row => row.map(c => c.isTarget ? 1 : 0))
}

// Advance the simulation one frame. Returns a new box if the current one ended.
export function stepBox(box: Box, now: number, seq: Sequencer): Box {
  const elapsed = now - box.phaseStart
  if (elapsed < 0) return box

  // Evaluating phase: tiles breathe while waiting for AI judge
  if (box.phase === 'evaluating') {
    const eElapsed = now - box.phaseStart
    // Gentle breathing on locked cells
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = box.cells[r][c]
      if (cell.locked && cell.isTarget) {
        cell.brightness = 0.4 + 0.2 * Math.sin(now * 0.003 + c * 0.5 + r * 0.7)
      }
    }
    // Timeout: auto-reject after 5 seconds
    if (eElapsed > 5000 && !box.evaluationResult) {
      box.evaluationResult = { accept: false, name: '', reason: 'timeout' }
    }
    // Result came back
    if (box.evaluationResult) {
      if (box.evaluationResult.accept) {
        box.willSucceed = true
        box.winnerName = box.evaluationResult.name
        box.phase = 'cascade'; box.phaseStart = now
      } else {
        box.willSucceed = false
        box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now
      }
    }
    return box
  }

  // Attention movement
  const adx = box.attTX - box.attX, ady = box.attTY - box.attY
  box.attX += adx * box.attSpeed; box.attY += ady * box.attSpeed
  if (Math.abs(adx) < 0.8 && Math.abs(ady) < 0.8) {
    const frontier = getFrontier(box.cells)
    if (frontier.length > 0) {
      const w = frontier.flatMap(f => Array(f.n * 2 + 1).fill(f))
      const p = w[Math.floor(Math.random() * w.length)]
      box.attTX = p.c + (Math.random() - 0.5) * 3
      box.attTY = p.r + (Math.random() - 0.5) * 2
    } else {
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
        if (nn >= 2) {
          cell.probing = false
        } else if (cell.stability > 30 + Math.random() * 20) {
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

    // Emergent boxes: when pattern stabilizes, enter evaluating phase
    if (box.emergent && !box.evaluationSent && nP >= 0.85) {
      box.evaluationSent = true
      box.phase = 'evaluating'; box.phaseStart = now
      return box // caller triggers the API call
    }
    if (box.emergent && !box.evaluationSent && sE > 10) {
      box.evaluationSent = true
      box.phase = 'evaluating'; box.phaseStart = now
      return box
    }

    // Non-emergent boxes: use original logic
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
      box.phase = 'blink'; box.phaseStart = now
      return box // caller handles particle emission
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
    return box // caller handles particle emission
  }

  if (box.phase === 'failing' && now - box.phaseStart > 900) {
    box.phase = 'dark'; box.phaseStart = now
  }

  if (box.phase === 'dark' && now - box.phaseStart > 600) {
    return planBox(now, 200, seq)
  }

  if (box.phase === 'won' && now - box.phaseStart > 4500 + Math.random() * 2000) {
    return planBox(now, 400, seq)
  }

  return box
}
