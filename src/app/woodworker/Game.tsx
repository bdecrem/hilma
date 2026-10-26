'use client'
// The Woodworker: ten rooms Cyriel rebuilt, in two chapters. The shell keeps
// the moves (every state, for Undo), the par, the hint, the hammers, the best
// scores and the story: a scene before some rooms the first time you open
// them, and in the rooms where Cyriel is away, a hint is a phone call and they
// only pick up so many times. Each room's board draws it and turns gestures
// into moves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { solve } from './lib/engine'
import { CHAPTERS, LEVELS } from './lib/levels'
import { rulesFor } from './lib/rules'
import { SCENES } from './lib/story'
import { chime, ring, setSound, unlock } from './sfx'
import { duck, setRoom, startMusic, stopMusic } from './music'
import SlideBoard from './boards/SlideBoard'
import SwingBoard from './boards/SwingBoard'
import TiltBoard from './boards/TiltBoard'
import LinkedBoard from './boards/LinkedBoard'
import BoxBoard from './boards/BoxBoard'
import Cyriel from './boards/Cyriel'
import { Hammer } from './boards/parts'
import SceneCard from './SceneCard'

const STORE = 'woodworker-best-v2'
const MUSIC = 'woodworker-music'
const SEEN = 'woodworker-story-v1'

function load<T>(key: string, empty: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? empty
  } catch {
    return empty
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {}
}
const loadBest = () => load<Record<string, number>>(STORE, {})

export const hammers = (moves: number, par: number) => (moves <= par ? 3 : moves <= par + 5 ? 2 : 1)

/** The scene that tells the story up to room i: its own, or the last one before it. */
function sceneFor(i: number) {
  for (let k = i; k >= 0; k--) if (SCENES[LEVELS[k].id]) return LEVELS[k].id
  return null
}

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
  /** Calls to Cyriel used in this room, the one ringing now, and what they said. */
  const [called, setCalled] = useState(0)
  const [ringing, setRinging] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [scene, setScene] = useState<{ id: string; then?: () => void } | null>(null)

  /** Play a room's scene, unless it has been seen already (or always, when asked). */
  const tell = useCallback((id: string | null, always = false, then?: () => void) => {
    if (!id || !SCENES[id]) return then?.()
    const seen = load<string[]>(SEEN, [])
    if (!always && seen.includes(id)) return then?.()
    if (!seen.includes(id)) save(SEEN, [...seen, id])
    setScene({ id, then })
  }, [])

  useEffect(() => {
    setBest(loadBest())
    tell(LEVELS[0].id)
  }, [tell])

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

  const enter = useCallback(
    (i: number) => {
      timers.current.forEach(clearTimeout)
      timers.current = []
      clearTimeout(hintTimer.current)
      setLv(i)
      setHist([LEVELS[i].start])
      setWon(false)
      setCard(null)
      setHint(null)
      setCalled(0)
      setRinging(false)
      setSaid(null)
      setRound((r) => r + 1)
      tell(LEVELS[i].id)
    },
    [tell],
  )

  const finish = (n: number) => {
    setWon(true)
    setHint(null)
    setSaid(null)
    const b = loadBest()
    const prev = b[L.id]
    const better = prev == null || n < prev
    if (better) b[L.id] = n
    save(STORE, b)
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
  const point = () => {
    const h = histRef.current
    const path = solve(rules, h[h.length - 1])
    if (!path?.length) return
    setHint(path[0])
    clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => (setHint(null), setSaid(null)), 2600)
  }
  const calls = L.away?.calls ?? []
  const left = calls.length - called
  const showHint = () => {
    if (won || ringing) return
    unlock()
    if (!L.away) return point()
    if (left <= 0) return
    // Away: it rings twice, then they pick up, say their line and point.
    ring()
    setRinging(true)
    timers.current.push(
      window.setTimeout(() => {
        setRinging(false)
        setCalled(called + 1)
        setSaid(calls[called])
        point()
        clearTimeout(hintTimer.current)
        hintTimer.current = window.setTimeout(() => (setHint(null), setSaid(null)), 3400)
      }, 1100),
    )
  }
  const toggleSound = () => {
    setSound(!sound)
    setSoundOn(!sound)
  }

  const props = { room: lv, skin: L.skin, item: L.item, state, hint, won, move } as const
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
  const away = L.away
  const hintLabel = !away ? 'Hint' : ringing ? 'Ringing…' : left > 0 ? `Call Cyriel (${left})` : away.out

  return (
    <div className="wrap">
      <header>
        <div className="kicker">A house puzzle in ten rooms</div>
        <h1>
          <span className="the">The</span>W<span className="tilt">o</span>odworker
        </h1>
      </header>

      <nav className="levels" aria-label="Rooms">
        {CHAPTERS.map((C, ci) => (
          <div key={C.title} className="chapter-row">
            <span className="ch">{C.title}</span>
            <div className="lvls">
              {LEVELS.slice(C.from, CHAPTERS[ci + 1]?.from).map((R, k) => {
                const i = C.from + k
                return (
                  <button key={R.id} type="button" className={`lvl${R.away ? ' away' : ''}`} aria-current={i === lv} onClick={() => enter(i)}>
                    {i + 1}. {R.name}
                    {best[R.id] != null && <span className="done">✓{best[R.id]}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`note${away ? ` ${away.kind}` : ''}`} aria-live="polite">
        {away?.kind === 'postcard' && <span className="stamp" aria-hidden />}
        {away?.kind === 'voicemail' && (
          <span className="wave" aria-hidden>
            {Array.from({ length: 28 }, (_, k) => (
              <i key={k} style={{ '--h': `${20 + ((k * 37) % 70)}%` } as React.CSSProperties} />
            ))}
          </span>
        )}
        {away?.kind === 'texts' ? (
          <div className="bubbles">
            {L.note.split('\n').map((t, k) => (
              <p key={k}>{t}</p>
            ))}
          </div>
        ) : (
          <p>{L.note}</p>
        )}
        <span className="sig">{away ? away.sig : '— Cyriel, woodworker'}</span>
        <button type="button" className="badge" aria-label="Replay Cyriel's story" onClick={() => tell(sceneFor(lv), true)}>
          <Cyriel pose="hello" head />
        </button>
      </div>

      <div className="stats" aria-live="polite">
        <div><b>{moves}</b>Moves</div>
        <div><b>{L.par}</b>Par</div>
        <div><b>{best[L.id] ?? '–'}</b>Best</div>
      </div>

      <div className="stage-wrap">
        {said && (
          <div className="call" role="status">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M4.5 1.8 6.6 4.4 5.3 6.2c.8 1.8 2.3 3.3 4.1 4.1l1.8-1.3 2.6 2.1-1.2 2.4C7.4 13.6 2.4 8.6 2.1 3z" /></svg>
            <span>{said}</span>
          </div>
        )}
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
              <p className="quip">“{card.moves <= L.par ? L.quips[0] : L.quips[1]}”</p>
              <div className="row">
                <button type="button" onClick={() => enter(lv)}>Again</button>
                <button
                  type="button"
                  className="primary"
                  autoFocus
                  onClick={() => (last ? tell('ending', true, () => enter(0)) : enter(lv + 1))}
                >
                  {last ? 'One more thing' : 'Next room'}
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
        <button className={`btn${away ? ' phone' : ''}${ringing ? ' ringing' : ''}`} type="button" onClick={showHint} disabled={won || (!!away && left <= 0)}>
          {away ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M4.5 1.8 6.6 4.4 5.3 6.2c.8 1.8 2.3 3.3 4.1 4.1l1.8-1.3 2.6 2.1-1.2 2.4C7.4 13.6 2.4 8.6 2.1 3z" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13h4M6.5 15h3" /><path d="M8 1.5a4.5 4.5 0 0 0-2.5 8.2V11h5V9.7A4.5 4.5 0 0 0 8 1.5Z" /></svg>
          )}
          {hintLabel}
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

      {scene && (
        <SceneCard
          key={scene.id}
          scene={SCENES[scene.id]}
          title={scene.id === 'ending' ? 'The end' : `Room ${lv + 1} · ${L.name}`}
          done={scene.id === 'ending' ? 'Back to coffee' : "Let's go"}
          onDone={() => {
            const then = scene.then
            setScene(null)
            then?.()
          }}
        />
      )}
    </div>
  )
}
