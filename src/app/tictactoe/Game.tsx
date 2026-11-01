'use client'

import { useCallback, useEffect, useState } from 'react'
import { EMPTY, computerMove, isFull, place, winningLine, type Board, type Mark } from './game'

const COMPUTER: Mark = 'O'
const THINK_MS = 450

type Mode = 'computer' | 'friend'

// Drawn rather than typed: this serif's capital O reads as a zero.
function MarkIcon({ mark, dim }: { mark: Mark; dim: boolean }) {
  return (
    <svg className={`ttt-mark${dim ? ' ttt-dim' : ''}`} viewBox="0 0 100 100" aria-hidden="true">
      {mark === 'X' ? <path d="M30 30 70 70M70 30 30 70" /> : <circle cx="50" cy="50" r="22" />}
    </svg>
  )
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('computer')
  const [board, setBoard] = useState<Board>(EMPTY)
  const [turn, setTurn] = useState<Mark>('X')
  const [starter, setStarter] = useState<Mark>('X')
  const [wins, setWins] = useState({ X: 0, O: 0, draws: 0 })

  const line = winningLine(board)
  const winner = line ? board[line[0]] : null
  const over = Boolean(winner) || isFull(board)
  const computerTurn = mode === 'computer' && turn === COMPUTER && !over

  const play = useCallback((i: number) => {
    const next = place(board, i, turn)
    const nextLine = winningLine(next)
    setBoard(next)
    setTurn(turn === 'X' ? 'O' : 'X')
    if (nextLine) setWins((w) => ({ ...w, [turn]: w[turn] + 1 }))
    else if (isFull(next)) setWins((w) => ({ ...w, draws: w.draws + 1 }))
  }, [board, turn])

  useEffect(() => {
    if (!computerTurn) return
    const t = setTimeout(() => play(computerMove(board, COMPUTER)), THINK_MS)
    return () => clearTimeout(t)
  }, [computerTurn, board, play])

  // The first move alternates, so nobody keeps the advantage.
  const newGame = () => {
    const first = starter === 'X' ? 'O' : 'X'
    setStarter(first)
    setTurn(first)
    setBoard(EMPTY)
  }

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setBoard(EMPTY)
    setTurn('X')
    setStarter('X')
    setWins({ X: 0, O: 0, draws: 0 })
  }

  const names = mode === 'computer' ? { X: 'You', O: 'Computer' } : { X: 'X', O: 'O' }
  const status = winner
    ? mode === 'computer'
      ? winner === 'X' ? 'You win' : 'The computer wins'
      : `${winner} wins`
    : over
      ? 'A draw'
      : mode === 'computer'
        ? turn === 'X' ? 'Your move' : 'Thinking'
        : `${turn} to move`

  return (
    <div className="ttt-game">
      <p className="ttt-status" role="status">{status}</p>

      <div className="ttt-board" role="grid" aria-label="Tic tac toe board">
        {board.map((mark, i) => (
          <button
            key={i}
            type="button"
            className="ttt-cell"
            data-mark={mark ?? ''}
            aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${mark ?? 'empty'}`}
            disabled={Boolean(mark) || over || computerTurn}
            onClick={() => play(i)}
          >
            {mark && <MarkIcon mark={mark} dim={Boolean(line && !line.includes(i))} />}
          </button>
        ))}
      </div>

      <p className="ttt-score">
        {names.X} {wins.X} · Draws {wins.draws} · {names.O} {wins.O}
      </p>

      <div className="ttt-actions">
        <button type="button" onClick={newGame} disabled={!over}>New game</button>
        <button type="button" onClick={() => switchMode(mode === 'computer' ? 'friend' : 'computer')}>
          {mode === 'computer' ? 'Two players' : 'Play the computer'}
        </button>
      </div>
    </div>
  )
}
