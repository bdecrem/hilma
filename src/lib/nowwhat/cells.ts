import { COLS, ROWS } from './shapes'

export type Fill = 'solid' | 'checker' | 'stripe_h' | 'stripe_v' | 'dots'
export const FILLS: Fill[] = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
export function randomFill(): Fill { return FILLS[Math.floor(Math.random() * FILLS.length)] }

export interface Cell {
  fill: Fill; brightness: number
  flipping: boolean; flipPhase: number; flipSpeed: number; flipTimer: number
  nextFill: Fill; nextBrightness: number
  locked: boolean; lockedAt: number; isTarget: boolean
  energy: number; agitation: number; stability: number; probing: boolean
}

export function makeCell(): Cell {
  const active = Math.random() < 0.45
  return {
    fill: randomFill(), brightness: 0.15 + Math.random() * 0.45,
    flipping: active, flipPhase: active ? Math.random() : 0,
    flipSpeed: 0.013 + Math.random() * 0.025,
    flipTimer: active ? 0 : 10 + Math.floor(Math.random() * 50),
    nextFill: randomFill(), nextBrightness: 0.15 + Math.random() * 0.45,
    locked: false, lockedAt: 0, isTarget: false,
    energy: 0, agitation: 0, stability: 0, probing: false,
  }
}

// Count locked non-probing target neighbors (4-connected)
export function n4(cells: Cell[][], r: number, c: number): number {
  let n = 0
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r+dr, nc = c+dc
    if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&cells[nr][nc].isTarget&&cells[nr][nc].locked&&!cells[nr][nc].probing) n++
  }
  return n
}

// Count locked non-probing target neighbors (8-connected)
export function n8(cells: Cell[][], r: number, c: number): number {
  let n = 0
  for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
    if (!dr&&!dc) continue
    const nr = r+dr, nc = c+dc
    if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&cells[nr][nc].isTarget&&cells[nr][nc].locked&&!cells[nr][nc].probing) n++
  }
  return n
}

// Total locked non-probing target cells
export function lockedCount(cells: Cell[][]): number {
  let n = 0
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
    if (cells[r][c].isTarget&&cells[r][c].locked&&!cells[r][c].probing) n++
  return n
}

// Unlocked target cells adjacent to at least one locked target cell
export function getFrontier(cells: Cell[][]): { r: number; c: number; n: number }[] {
  const f: { r: number; c: number; n: number }[] = []
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    if (cells[r][c].isTarget&&!cells[r][c].locked) {
      const nn = n4(cells,r,c)
      if (nn>0) f.push({r,c,n:nn})
    }
  }
  return f
}
