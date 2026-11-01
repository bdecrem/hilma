import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Game from './Game'

const font = localFont({
  src: [
    { path: '../../fonts/instrument-serif/InstrumentSerif-400.woff2', weight: '400' },
    { path: '../../fonts/instrument-serif/InstrumentSerif-400-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tic Tac Toe',
  description: 'Three by three, against the computer or a friend.',
  metadataBase: new URL('https://ola.cx'),
  openGraph: { title: 'Tic Tac Toe', description: 'Three by three, against the computer or a friend.', url: 'https://ola.cx/tictactoe' },
}

export const viewport: Viewport = { themeColor: '#f4efe6' }

// Board size: the page stacks status + board + score + buttons, about 15rem of
// text and gaps, so the board takes what height is left and never more than 84vw.
const css = `
.ttt {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  background: #f4efe6;
  color: #26221d;
  padding: calc(env(safe-area-inset-top) + 1.5rem) calc(env(safe-area-inset-right) + 1rem) calc(env(safe-area-inset-bottom) + 1.5rem) calc(env(safe-area-inset-left) + 1rem);
  font-family: var(--font-instrument-serif), Georgia, serif;
}
.ttt-game {
  --size: min(84vw, calc(100dvh - 15rem), 27rem);
  width: var(--size);
  text-align: center;
}
.ttt-status {
  margin: 0 0 1.5rem;
  font-size: 2.5rem;
  font-style: italic;
  line-height: 1;
}
.ttt-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  height: var(--size);
}
.ttt-cell {
  appearance: none;
  border: 0 solid rgba(38, 34, 29, .28);
  border-radius: 0;
  background: none;
  color: inherit;
  padding: 0;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background-color .2s ease;
}
.ttt-cell:not(:nth-child(3n)) { border-right-width: 1px; }
.ttt-cell:nth-child(-n + 6) { border-bottom-width: 1px; }
.ttt-cell:disabled { cursor: default; color: inherit; opacity: 1; }
.ttt-cell:focus-visible, .ttt-actions button:focus-visible { outline: 1px solid #26221d; outline-offset: -3px; }
.ttt-mark {
  display: block;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  transition: opacity .4s ease;
}
.ttt-dim { opacity: .22; }
@media (hover: hover) {
  .ttt-cell:not(:disabled):hover { background: rgba(38, 34, 29, .05); }
}
.ttt-score {
  margin: 1.5rem 0 1rem;
  font-size: 1.125rem;
  opacity: .62;
  font-variant-numeric: tabular-nums;
}
.ttt-actions {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
}
.ttt-actions button {
  appearance: none;
  border: 0;
  background: none;
  color: inherit;
  padding: .5rem .25rem;
  font: inherit;
  font-size: 1.125rem;
  text-decoration: underline;
  text-underline-offset: .2em;
  text-decoration-thickness: 1px;
  cursor: pointer;
  touch-action: manipulation;
}
.ttt-actions button:disabled { opacity: .3; cursor: default; }
`

export default function TicTacToePage() {
  return (
    <main className={`ttt ${font.variable}`}>
      <style>{css}</style>
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', margin: 0 }}>Tic Tac Toe</h1>
      <Game />
    </main>
  )
}
