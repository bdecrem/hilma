'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Parrot, type Mood } from './Parrot'
import {
  CALL_STILL_MS,
  CALL_TOTAL_MS,
  COMING_BACK,
  CONNECT_MS,
  DAILY_TIME,
  DAY,
  DECK,
  KIND_LABEL,
  MAP_DAYS,
  BONUS_EVERY,
  SCRIPT,
  STREAK,
  THINGS,
  TOMORROW,
  TOPIC,
  WORKING_NAME,
  type MapState,
  type ScreenId,
} from './content'

export type Go = (id: ScreenId, state?: MapState) => void
type P = { go: Go; state?: MapState; still?: boolean }

/* ---------- bits ---------- */

function StatusBar({ light = false }: { light?: boolean }) {
  return (
    <div className={`p2-status ${light ? 'light' : ''}`} aria-hidden>
      <span>9:41</span>
      <span className="p2-status-right">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.8" />
          <rect x="4.5" y="5" width="3" height="6" rx="0.8" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.8" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.8" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M1.5 4.3a9.6 9.6 0 0 1 13 0" />
          <path d="M4.2 7a6 6 0 0 1 7.6 0" />
          <path d="M6.8 9.6a2.4 2.4 0 0 1 2.4 0" />
        </svg>
        <svg width="27" height="12" viewBox="0 0 27 12">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor" />
          <rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </span>
    </div>
  )
}

function Frame({ children, className = '', light = false }: { children?: ReactNode; className?: string; light?: boolean }) {
  return (
    <div className={`p2-screen ${className}`}>
      <StatusBar light={light} />
      <div className="p2-body">{children}</div>
      <div className={`p2-home ${light ? 'light' : ''}`}>
        <i />
      </div>
    </div>
  )
}

function Flame({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-10z"
        fill="var(--p-yellow)"
        stroke="var(--p-ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Check({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MicIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function SpeakerIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" stroke="none" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  )
}

function Bars({ color = 'var(--p-lime)' }: { color?: string }) {
  return (
    <span className="p2-bars" style={{ color }} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

function Button({ children, onClick, ghost = false, light = false }: { children: ReactNode; onClick?: () => void; ghost?: boolean; light?: boolean }) {
  return (
    <button className={`p2-btn ${ghost ? 'ghost' : ''} ${light ? 'light' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

/* ---------- the map ---------- */

const MAP_W = 335
const MAP_H = 300
const XS = [70, 160, 250, 292, 236, 142, 68, 112]
const yOf = (i: number) => 282 - i * 38
const xOf = (i: number) => XS[i]

function trail(from: number, to: number) {
  let d = `M${xOf(from)} ${yOf(from)}`
  for (let i = from + 1; i <= to; i++) {
    const x0 = xOf(i - 1)
    const y0 = yOf(i - 1)
    const x1 = xOf(i)
    const y1 = yOf(i)
    d += ` C${x0} ${y0 - 22}, ${x1} ${y1 + 22}, ${x1} ${y1}`
  }
  return d
}

export function MapScreen({ go, state = 'morning' }: P) {
  const stepDone = state === 'morning' ? 0 : state === 'after-talk' ? 1 : state === 'after-things' ? 2 : 3
  const steps: { label: string; sub: string; id: ScreenId }[] = [
    { label: 'Talk', sub: '3 min with Polly', id: 'talk' },
    { label: 'Three things', sub: 'say them back', id: 'things' },
    { label: 'Cards', sub: '8 to clear', id: 'cards' },
  ]
  const next = steps[stepDone]
  const todayIdx = MAP_DAYS.indexOf(DAY)
  const dayDone = state === 'done'
  const streak = dayDone ? STREAK : STREAK - 1

  return (
    <Frame className="p2-map">
      <div className="p2-top">
        <span className="p2-wordmark">
          <Parrot size={30} mood="idle" />
          {WORKING_NAME}
        </span>
        <span className="p2-streak">
          <Flame /> {streak}
        </span>
      </div>

      <div className="p2-day">
        <span className="p2-day-n">Day {DAY}</span>
        <span className="p2-day-sub">{dayDone ? 'Done for today' : `Thursday · ${stepDone} of 3 done`}</span>
      </div>

      <div className={`p2-today ${dayDone ? 'done' : ''}`}>
        {steps.map((s, i) => {
          const done = i < stepDone
          const cur = i === stepDone
          return (
            <div key={s.label} className={`p2-step ${done ? 'done' : cur ? 'cur' : 'later'}`}>
              <span className="p2-step-n">{done ? <Check size={13} color="var(--p-ink)" /> : i + 1}</span>
              <span className="p2-step-label">{s.label}</span>
              <span className="p2-step-sub">{s.sub}</span>
            </div>
          )
        })}
        {dayDone ? (
          <div className="p2-tomorrow">
            <span className="p2-cap">Tomorrow {DAILY_TIME}</span>
            <b>{TOMORROW}</b>
          </div>
        ) : (
          <Button onClick={() => go(next.id)}>{stepDone === 0 ? 'Start today' : `Next: ${next.label}`}</Button>
        )}
      </div>

      <svg className="p2-trail" width={MAP_W} height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-label="Trail of days">
        <path d={trail(0, MAP_DAYS.length - 1)} fill="none" stroke="var(--p-line)" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
        <path d={trail(0, dayDone ? todayIdx : todayIdx)} fill="none" stroke="var(--p-ink)" strokeWidth="4" strokeLinecap="round" />
        {MAP_DAYS.map((d, i) => {
          const x = xOf(i)
          const y = yOf(i)
          const bonus = d % BONUS_EVERY === 0
          if (d < DAY || (d === DAY && dayDone)) {
            return (
              <g key={d}>
                <circle cx={x} cy={y} r="15" fill="var(--p-red)" stroke="var(--p-ink)" strokeWidth="2" />
                <path d={`M${x - 5} ${y + 0.5}l3.5 3.5L${x + 6} ${y - 4}`} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          }
          if (d === DAY) {
            return (
              <g key={d}>
                <circle className="p2-pulse" cx={x} cy={y} r="19" fill="none" stroke="var(--p-yellow)" strokeWidth="3" />
                <circle cx={x} cy={y} r="19" fill="var(--p-yellow)" stroke="var(--p-ink)" strokeWidth="2.4" />
                <text x={x} y={y + 5} textAnchor="middle" className="p2-node-n">
                  {d}
                </text>
                <text x={x + 28} y={y + 5} className="p2-node-label">
                  Today
                </text>
              </g>
            )
          }
          return (
            <g key={d}>
              <circle cx={x} cy={y} r="15" fill="var(--p-paper)" stroke={bonus ? 'var(--p-yellow)' : 'var(--p-ink-3)'} strokeWidth="2" strokeDasharray={bonus ? '0' : '3 4'} />
              {bonus ? (
                <path
                  d={`M${x} ${y - 8}l2.5 5.3 5.8.6-4.3 4 1.2 5.7L${x} ${y + 9.8}l-5.2 2.8 1.2-5.7-4.3-4 5.8-.6z`}
                  fill="var(--p-yellow)"
                  stroke="var(--p-ink)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              ) : (
                <text x={x} y={y + 4.5} textAnchor="middle" className="p2-node-n later">
                  {d}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </Frame>
  )
}

/* ---------- part 1: talk ---------- */

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TalkScreen({ go, still = false }: P) {
  const [elapsed, setElapsed] = useState(still ? CALL_STILL_MS : 0)
  const start = useRef<number | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (still) return
    let raf = 0
    const tick = (now: number) => {
      if (start.current === null) start.current = now
      const e = now - start.current
      setElapsed(e)
      if (e >= CALL_TOTAL_MS) {
        if (!done.current) {
          done.current = true
          go('things')
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [still, go])

  let acc = CONNECT_MS
  let live = -1
  const starts: number[] = []
  for (let i = 0; i < SCRIPT.length; i++) {
    starts.push(acc)
    if (elapsed >= acc && elapsed < acc + SCRIPT[i].ms) live = i
    acc += SCRIPT[i].ms
  }
  const connecting = elapsed < CONNECT_MS
  const wrapping = elapsed >= acc
  const shown = SCRIPT.map((t, i) => ({ ...t, i })).filter((t) => elapsed >= starts[t.i])
  const last = shown.slice(-3)
  const who = wrapping ? 'tutor' : live >= 0 ? SCRIPT[live].who : 'tutor'
  const mood: Mood = connecting ? 'idle' : who === 'tutor' ? 'talking' : 'listening'
  const remaining = 180_000 * (1 - Math.min(1, elapsed / CALL_TOTAL_MS))

  return (
    <Frame className="p2-talk" light>
      <div className="p2-talk-head">
        <span className="p2-talk-topic">{TOPIC}</span>
        <span className="p2-timer">{connecting ? 'Calling…' : fmt(remaining)}</span>
      </div>
      <div className="p2-talk-stage">
        <div className={`p2-stage-rings ${mood === 'talking' ? 'on' : ''}`}>
          <Parrot size={170} mood={mood} />
        </div>
        <div className="p2-talk-who">
          {connecting ? (
            <span>Calling {WORKING_NAME}</span>
          ) : wrapping ? (
            <span>Wrapping up</span>
          ) : who === 'tutor' ? (
            <span>{WORKING_NAME} is talking</span>
          ) : (
            <span className="p2-yourturn">
              <Bars /> Your turn
            </span>
          )}
        </div>
      </div>

      <div className="p2-transcript" aria-live="polite">
        {last.map((t) => (
          <div key={t.i} className="p2-turn">
            <div className={`p2-bubble ${t.who}`}>{t.text}</div>
            {t.fix && live > t.i ? (
              <span className="p2-fixchip">
                <b>fix</b> {t.fix}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="p2-talk-foot">
        <button className="p2-pill" onClick={() => go('things')}>
          End
        </button>
      </div>
    </Frame>
  )
}

/* ---------- part 2: three things ---------- */

type ThingPhase = 'listen' | 'repeat' | 'hearing' | 'got'

export function ThingsScreen({ go, still = false }: P) {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<ThingPhase>(still ? 'repeat' : 'listen')

  useEffect(() => {
    if (still) return
    let t: ReturnType<typeof setTimeout> | undefined
    if (phase === 'listen') t = setTimeout(() => setPhase('repeat'), 1700)
    if (phase === 'hearing') t = setTimeout(() => setPhase('got'), 1100)
    if (phase === 'got')
      t = setTimeout(() => {
        if (i + 1 < THINGS.length) {
          setI(i + 1)
          setPhase('listen')
        } else {
          go('cards')
        }
      }, 1400)
    return () => clearTimeout(t)
  }, [phase, i, still, go])

  const th = THINGS[i]
  const mood: Mood = phase === 'listen' ? 'talking' : phase === 'got' ? 'happy' : 'listening'
  const line = phase === 'listen' ? 'Listen.' : phase === 'repeat' ? 'Your turn. Say it.' : phase === 'hearing' ? 'Listening…' : 'You got it!'

  return (
    <Frame className="p2-things">
      <div className="p2-sec-head">
        <span className="p2-sec-title">Three things from today</span>
        <span className="p2-segs" aria-label={`${i + 1} of 3`}>
          {THINGS.map((_, k) => (
            <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} />
          ))}
        </span>
      </div>

      <div key={i} className={`p2-card p2-thing ${phase === 'got' ? 'got' : ''}`}>
        <span className={`p2-tag ${th.kind}`}>{KIND_LABEL[th.kind]}</span>
        <span className="p2-es">{th.es}</span>
        <span className="p2-en">{th.en}</span>
        <span className="p2-from">{th.from}</span>
        {phase === 'got' ? (
          <span className="p2-gotmark">
            <Check size={16} color="var(--p-ink)" />
          </span>
        ) : null}
      </div>

      <div className="p2-coach">
        <Parrot size={84} mood={mood} />
        <span className={`p2-speech ${phase}`}>{line}</span>
      </div>

      <div className="p2-things-foot">
        {phase === 'listen' ? (
          <span className="p2-mic off">
            <SpeakerIcon />
          </span>
        ) : phase === 'repeat' ? (
          <button className="p2-mic" onClick={() => setPhase('hearing')} aria-label="Say it">
            <MicIcon />
          </button>
        ) : phase === 'hearing' ? (
          <span className="p2-mic hearing">
            <Bars color="#fff" />
          </span>
        ) : (
          <span className="p2-mic got">
            <Check size={30} color="var(--p-ink)" />
          </span>
        )}
        <span className="p2-foot-hint">{phase === 'repeat' ? 'Tap, then say it' : phase === 'listen' ? `${WORKING_NAME} says it first` : ' '}</span>
      </div>
    </Frame>
  )
}

/* ---------- part 3: cards ---------- */

type CardPhase = 'ask' | 'hearing' | 'result'
type Res = { idx: number; ok: boolean }

export function CardsScreen({ go, still = false }: P) {
  const [queue, setQueue] = useState<number[]>(() => DECK.map((_, k) => k))
  const [results, setResults] = useState<Res[]>(still ? [{ idx: 0, ok: true }] : [])
  const [phase, setPhase] = useState<CardPhase>('ask')
  const [forced, setForced] = useState<boolean | null>(null)
  const pos = still ? 1 : 0
  const cur = queue[pos]
  const card = cur === undefined ? null : DECK[cur]
  // A card missed once comes back at the end and is answered right the second time.
  const retried = cur !== undefined && results.some((r) => r.idx === cur)
  const ok = forced ?? (card ? card.ok || retried : true)
  const total = DECK.length + results.filter((r) => !r.ok).length

  useEffect(() => {
    if (still) return
    let t: ReturnType<typeof setTimeout> | undefined
    if (phase === 'hearing') t = setTimeout(() => setPhase('result'), 1000)
    if (phase === 'result')
      t = setTimeout(() => {
        if (cur === undefined) return
        setResults((r) => [...r, { idx: cur, ok }])
        setQueue((q) => (ok ? q.slice(1) : [...q.slice(1), cur]))
        setForced(null)
        setPhase('ask')
      }, 1400)
    return () => clearTimeout(t)
  }, [phase, cur, ok, still])

  useEffect(() => {
    if (!still && queue.length === 0) go('done')
  }, [queue.length, still, go])

  if (!card) return <Frame className="p2-cards" />

  const seen = results.length
  return (
    <Frame className="p2-cards">
      <div className="p2-sec-head">
        <span className="p2-sec-title">Cards</span>
        <span className="p2-count">
          {Math.min(seen + 1, total)} / {total}
        </span>
      </div>
      <span className="p2-segs wide" aria-label={`${seen} of ${total} answered`}>
        {Array.from({ length: total }, (_, k) => {
          const r = results[k]
          return <i key={k} className={r ? (r.ok ? 'ok' : 'miss') : k === seen ? 'cur' : ''} />
        })}
      </span>

      <div key={`${cur}-${seen}`} className={`p2-card p2-flash ${phase === 'result' ? (ok ? 'ok' : 'miss') : ''}`}>
        <span className={`p2-tag ${card.from === 'new' ? 'new' : 'old'}`}>{card.from === 'new' ? 'New today' : `Day ${card.from}`}</span>
        <span className="p2-prompt">{card.en}</span>
        <span className="p2-ask">Say it in Spanish</span>
        <div className="p2-band">
          {phase === 'result' ? (
            <>
              <span className="p2-es sm">{card.es}</span>
              <span className="p2-verdict">{ok ? <>Nice <Check size={14} color="var(--p-ink)" /></> : 'Not yet, it comes back'}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="p2-things-foot">
        {phase === 'ask' ? (
          <button className="p2-mic" onClick={() => setPhase('hearing')} aria-label="Say it">
            <MicIcon />
          </button>
        ) : phase === 'hearing' ? (
          <span className="p2-mic hearing">
            <Bars color="#fff" />
          </span>
        ) : (
          <span className={`p2-mic ${ok ? 'got' : 'missed'}`}>{ok ? <Check size={30} color="var(--p-ink)" /> : <SpeakerIcon />}</span>
        )}
        {phase === 'ask' ? (
          <button
            className="p2-link"
            onClick={() => {
              setForced(false)
              setPhase('result')
            }}
          >
            Show me
          </button>
        ) : (
          <span className="p2-foot-hint"> </span>
        )}
      </div>
    </Frame>
  )
}

/* ---------- day complete ---------- */

export function DoneScreen({ go }: P) {
  return (
    <Frame className="p2-done">
      <div className="p2-sun">
        <i />
        <Parrot size={150} mood="happy" />
      </div>
      <span className="p2-done-title">Day {DAY} complete</span>
      <span className="p2-done-streak">
        <Flame size={22} /> {STREAK} day streak
      </span>
      <div className="p2-totals">
        <div>
          <b>3:00</b>
          <span>talk</span>
        </div>
        <div>
          <b>3</b>
          <span>things</span>
        </div>
        <div>
          <b>8 / 9</b>
          <span>cards</span>
        </div>
      </div>
      <div className="p2-card p2-back">
        <span className="p2-cap">Coming back tomorrow</span>
        <span className="p2-chips">
          {COMING_BACK.map((w) => (
            <span key={w} className="p2-chip">
              {w}
            </span>
          ))}
        </span>
        <span className="p2-back-line">{WORKING_NAME} will work these into tomorrow&rsquo;s call.</span>
      </div>
      <div className="p2-done-foot">
        <Button onClick={() => go('map', 'done')}>Back to the map</Button>
      </div>
    </Frame>
  )
}

/* ---------- registry ---------- */

export function Screen({ id, go, state, still }: { id: ScreenId; go: Go; state?: MapState; still?: boolean }) {
  switch (id) {
    case 'map':
      return <MapScreen go={go} state={state} />
    case 'talk':
      return <TalkScreen go={go} still={still} />
    case 'things':
      return <ThingsScreen go={go} still={still} />
    case 'cards':
      return <CardsScreen go={go} still={still} />
    case 'done':
      return <DoneScreen go={go} />
  }
}
