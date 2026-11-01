export type Mark = 'X' | 'O'
export type Board = (Mark | null)[]

export const EMPTY: Board = Array(9).fill(null)

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export function winningLine(b: Board): number[] | null {
  return LINES.find(([x, y, z]) => b[x] && b[x] === b[y] && b[x] === b[z]) ?? null
}

export const isFull = (b: Board) => b.every(Boolean)
export const openCells = (b: Board) => b.flatMap((c, i) => (c ? [] : [i]))
const other = (m: Mark): Mark => (m === 'X' ? 'O' : 'X')

// Minimax score for `turn` to move: +1 they win, 0 draw, -1 they lose.
function score(b: Board, turn: Mark): number {
  const line = winningLine(b)
  if (line) return b[line[0]] === turn ? 1 : -1
  if (isFull(b)) return 0
  return Math.max(...openCells(b).map((i) => -score(place(b, i, turn), other(turn))))
}

export function place(b: Board, i: number, m: Mark): Board {
  const next = [...b]
  next[i] = m
  return next
}

// The best moves for `m`; ties are returned so play doesn't repeat itself.
export function bestMoves(b: Board, m: Mark): number[] {
  const scored = openCells(b).map((i) => ({ i, s: -score(place(b, i, m), other(m)) }))
  const top = Math.max(...scored.map((x) => x.s))
  return scored.filter((x) => x.s === top).map((x) => x.i)
}

const pick = (cells: number[]) => cells[Math.floor(Math.random() * cells.length)]

// Perfect play can't be beaten, so one move in five is a random one.
export const MISTAKE_RATE = 0.2

export function computerMove(b: Board, m: Mark): number {
  return pick(Math.random() < MISTAKE_RATE ? openCells(b) : bestMoves(b, m))
}
