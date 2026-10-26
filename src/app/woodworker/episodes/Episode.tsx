'use client'
// An interruption: the alert slams in over the room (a stamp, Cyriel, one
// line), then the minigame, then how it went and Cyriel's line, and back to
// the room exactly as you left it.
import { useEffect, useState } from 'react'
import Cyriel from '../boards/Cyriel'
import { outroFor, type EpisodeDef, type Result } from '../lib/episodes'
import { chime, ring, thunk } from '../sfx'
import Taxi from './Taxi'
import CatchKrul from './CatchKrul'
import Achoo from './Achoo'
import Court from './Court'

const GAMES = { taxi: Taxi, krul: CatchKrul, achoo: Achoo, court: Court }

export default function Episode({ ep, back, onDone }: { ep: EpisodeDef; back: string; onDone(r: Result | null): void }) {
  const [phase, setPhase] = useState<'alert' | 'play' | 'done'>('alert')
  const [result, setResult] = useState<Result | null>(null)
  /** The best of this visit's tries: that one is kept. */
  const [best, setBest] = useState<Result | null>(null)
  const [round, setRound] = useState(0)
  const Game = GAMES[ep.id]

  useEffect(() => {
    ring()
    const t = setTimeout(thunk, 380)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={`episode ${phase}`} role="dialog" aria-modal="true" aria-label={ep.stamp} onKeyDown={(e) => e.key === 'Escape' && phase !== 'play' && onDone(best)}>
      <div className={`ep-card ep-${ep.id}`}>
        {phase === 'alert' && (
          <>
            <div className="stamp-in">{ep.stamp}</div>
            <div className="ep-art">
              <Cyriel pose={ep.pose} krul={ep.krul} />
            </div>
            <p className="say">{ep.say}</p>
            <div className="row">
              <button type="button" className="skip" onClick={() => onDone(null)}>Not now</button>
              <button type="button" className="primary" autoFocus onClick={() => setPhase('play')}>Go!</button>
            </div>
          </>
        )}
        {phase === 'play' && (
          <>
            <p className="how">{ep.how}</p>
            <Game
              key={round}
              onDone={(r) => {
                setResult(r)
                setBest((b) => (!b || r.score / r.max > b.score / b.max ? r : b))
                setPhase('done')
                chime()
              }}
            />
          </>
        )}
        {phase === 'done' && result && (
          <>
            <div className="ep-score">
              <b>{result.score}</b>
              <span>/ {result.max}</span>
            </div>
            <p className="label">{result.label}</p>
            <div className="ep-art small">
              <Cyriel pose={ep.pose} krul={ep.krul} />
            </div>
            <p className="say">“{outroFor(ep, result)}”</p>
            <div className="row">
              <button type="button" className="skip" onClick={() => (setRound(round + 1), setPhase('play'))}>Again</button>
              <button type="button" className="primary" autoFocus onClick={() => onDone(best)}>{back}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
