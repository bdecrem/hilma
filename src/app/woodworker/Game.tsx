'use client'
// The Woodworker: five rooms Gerrit rebuilt, five ways in. The shell keeps the
// moves (every state, for Undo), the par, the hint, the hammers and the best
// scores; each room's board draws it and turns gestures into moves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { solve } from './lib/engine'
import { LEVELS } from './lib/levels'
import { rulesFor } from './lib/rules'
import { chime, setSound, unlock } from './sfx'
import { duck, setRoom, startMusic, stopMusic } from './music'
import SlideBoard from './boards/SlideBoard'
import SwingBoard from './boards/SwingBoard'
import TiltBoard from './boards/TiltBoard'
import LinkedBoard from './boards/LinkedBoard'
import BoxBoard from './boards/BoxBoard'
import { Hammer } from './boards/parts'

const STORE = 'woodworker-best-v2'
const MUSIC = 'woodworker-music'

function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}')
  } catch {
    return {}
  }
}
function saveBest(b: Record<string, number>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(b))
  } catch {}
}

export const hammers = (moves: number, par: number) => (moves <= par ? 3 : moves <= par + 5 ? 2 : 1)

export default function Game() {
  const [lv, setLv] = useState(0)
  const L = LEVELS[lv]
  const rules = useMemo(() => rulesFor(L), [L])
  const [hist, setHist] = useState<unknown[]>([L.start])
  const histRef = useRef(hist)
  histRef.current = hist
  const state = hist[hist.length - 1]
  const moves = hist.length - 1
  const [won, setWon] = useState(false)
  const [card, setCard] = useState<{ moves: number; best: boolean } | null>(null)
  const [hint, setHint] = useState<unknown>(null)
  const hintTimer = useRef(0)
  const [best, setBest] = useState<Record<string, number>>({})
  const [sound, setSoundOn] = useState(true)
  const [round, setRound] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => setBest(loadBest()), [])

  // Music: on unless the player turned it off before. Browsers only allow
  // audio after a gesture, so it starts on the first tap or key anywhere,
  // and it rests while the tab is hidden.
  const [music, setMusic] = useState(true)
  const musicRef = useRef(true)
  useEffect(() => {
    let pref = true
    try {
      pref = localStorage.getItem(MUSIC) !== 'off'
    } catch {}
    setMusic(pref)
    musicRef.current = pref
    const first = () => {
      if (musicRef.current && !document.hidden) startMusic()
    }
    const vis = () => (document.hidden ? stopMusic() : musicRef.current && startMusic())
    window.addEventListener('pointerdown', first, { once: true })
    window.addEventListener('keydown', first, { once: true })
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('pointerdown', first)
      window.removeEventListener('keydown', first)
      document.removeEventListener('visibilitychange', vis)
      stopMusic()
    }
  }, [])
  useEffect(() => setRoom(lv), [lv])
  const toggleMusic = () => {
    const on = !music
    setMusic(on)
    musicRef.current = on
    try {
      localStorage.setItem(MUSIC, on ? 'on' : 'off')
    } catch {}
    if (on) startMusic()
    else stopMusic()
  }

  const enter = useCallback((i: number) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    clearTimeout(hintTimer.current)
    setLv(i)
    setHist([LEVELS[i].start])
    setWon(false)
    setCard(null)
    setHint(null)
    setRound((r) => r + 1)
  }, [])

  const finish = (n: number) => {
    setWon(true)
    setHint(null)
    const b = loadBest()
    const prev = b[L.id]
    const better = prev == null || n < prev
    if (better) b[L.id] = n
    saveBest(b)
    setBest(b)
    timers.current.push(window.setTimeout(() => (duck(), chime()), 450))
    timers.current.push(window.setTimeout(() => setCard({ moves: n, best: better && prev != null }), 1900))
  }

  const move = (m: unknown) => {
    if (won) return false
    const h = histRef.current
    const n = rules.apply(h[h.length - 1], m)
    if (!n) return false
    const next = [...h, n]
    histRef.current = next
    setHist(next)
    setHint(null)
    if (rules.solved(n)) finish(next.length - 1)
    return true
  }

  const undo = () => {
    if (won || hist.length < 2) return
    setHist(hist.slice(0, -1))
    setHint(null)
  }
  const showHint = () => {
    if (won) return
    unlock()
    const path = solve(rules, state)
    if (!path?.length) return
    setHint(path[0])
    clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 2600)
  }
  const toggleSound = () => {
    setSound(!sound)
    setSoundOn(!sound)
  }

  const props = { room: lv, state, hint, won, move } as const
  const board = (() => {
    switch (L.mech) {
      case 'slide': return <SlideBoard key={round} {...props} data={L.data} state={state as number[]} hint={hint as never} move={move} />
      case 'swing': return <SwingBoard key={round} {...props} data={L.data} state={state as never} hint={hint as never} move={move} />
      case 'tilt': return <TiltBoard key={round} {...props} data={L.data} state={state as number[]} hint={hint as never} move={move} />
      case 'linked': return <LinkedBoard key={round} {...props} data={L.data} state={state as number[]} hint={hint as never} move={move} />
      case 'box': return <BoxBoard key={round} {...props} data={L.data} state={state as number[]} hint={hint as never} move={move} />
    }
  })()

  const last = lv === LEVELS.length - 1
  const ham = card ? hammers(card.moves, L.par) : 0

  return (
    <div className="wrap">
      <header>
        <div className="kicker">A house puzzle in five rooms</div>
        <h1>
          <span className="the">The</span>W<span className="tilt">o</span>odworker
        </h1>
      </header>

      <nav className="levels" aria-label="Rooms">
        {LEVELS.map((R, i) => (
          <button key={R.id} type="button" className="lvl" aria-current={i === lv} onClick={() => enter(i)}>
            {i + 1}. {R.name}
            {best[R.id] != null && <span className="done">✓{best[R.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="note" aria-live="polite">
        <p>{L.note}</p>
        <span className="sig">— Gerrit, woodworker</span>
      </div>

      <div className="stats" aria-live="polite">
        <div><b>{moves}</b>Moves</div>
        <div><b>{L.par}</b>Par</div>
        <div><b>{best[L.id] ?? '–'}</b>Best</div>
      </div>

      <div className="stage-wrap">
        {board}
        {card && (
          <div className="win">
            <div className="win-card" role="dialog" aria-label={L.win}>
              <h2>{L.win}.</h2>
              <div className="hammers">
                {[0, 1, 2].map((k) => <Hammer key={k} on={k < ham} />)}
              </div>
              <p className="line">
                {card.moves} moves · par {L.par}
                {card.best ? ' · new best' : ''}
              </p>
              <p className="quip">“{card.moves <= L.par ? L.quips[0] : L.quips[1]}{last ? ' Thanks for living here.' : ''}”</p>
              <div className="row">
                <button type="button" onClick={() => enter(lv)}>Again</button>
                <button type="button" className="primary" autoFocus onClick={() => enter(last ? 0 : lv + 1)}>
                  {last ? 'Back to coffee' : 'Next room'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <button className="btn" type="button" onClick={undo} disabled={won || moves === 0}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3 2 6l3 3" /><path d="M2 6h7.5a4 4 0 0 1 0 8H7" /></svg>
          Undo
        </button>
        <button className="btn" type="button" onClick={() => enter(lv)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" /><path d="M2 2v3.5h3.5" /></svg>
          Restart
        </button>
        <button className="btn" type="button" onClick={showHint} disabled={won}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13h4M6.5 15h3" /><path d="M8 1.5a4.5 4.5 0 0 0-2.5 8.2V11h5V9.7A4.5 4.5 0 0 0 8 1.5Z" /></svg>
          Hint
        </button>
        <button className="btn" type="button" aria-pressed={sound} onClick={toggleSound}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6v4h3l4 3V3L5 6H2Z" />{sound && <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" />}</svg>
          {sound ? 'Sound on' : 'Sound off'}
        </button>
        <button className="btn" type="button" aria-pressed={music} onClick={toggleMusic}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5V3.5l7-1.5v9" /><circle cx="4.2" cy="12.5" r="1.9" /><circle cx="11.2" cy="11" r="1.9" />{!music && <path d="M2 2l12 12" />}</svg>
          {music ? 'Music on' : 'Music off'}
        </button>
      </div>

      <p className="how">{L.how}</p>
    </div>
  )
}
