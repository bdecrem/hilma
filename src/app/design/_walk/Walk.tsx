'use client'

// The walkthrough engine shared by the styled artifacts (arcade, candy,
// sticker): the same five screens as daily-call-v2, every color, font, radius
// and shadow read from --w-* tokens that each theme's stylesheet sets.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Mascot, type Mood } from './Mascot'
import {
  CALL_STILL_MS,
  CALL_TOTAL_MS,
  COMING_BACK,
  CONNECT_MS,
  DAILY_TIME,
  DAY,
  QUESTIONS,
  KIND_LABEL,
  MAP_DAYS,
  BONUS_EVERY,
  SCRIPT,
  STREAK,
  THINGS,
  TOMORROW,
  TOPIC,
  WALK,
  WORKING_NAME,
  type MapState,
  type ScreenId,
} from '../daily-call-v2/content'

export type Go = (id: ScreenId, state?: MapState) => void
type P = { go: Go; state?: MapState; still?: boolean }

/* ---------- bits ---------- */

function StatusBar({ light = false }: { light?: boolean }) {
  return (
    <div className={`w-status ${light ? 'light' : ''}`} aria-hidden>
      <span>9:41</span>
      <span className="w-status-right">
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
    <div className={`w-screen ${className}`}>
      <StatusBar light={light} />
      <div className="w-body">{children}</div>
      <div className={`w-home ${light ? 'light' : ''}`}>
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
        fill="var(--w-reward)"
        stroke="var(--w-stroke)"
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

function Bars({ color = 'var(--w-good)' }: { color?: string }) {
  return (
    <span className="w-bars" style={{ color }} aria-hidden>
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
    <button className={`w-btn ${ghost ? 'ghost' : ''} ${light ? 'light' : ''}`} onClick={onClick}>
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
  const paused = state === 'paused'
  const stepDone = state === 'morning' ? 0 : state === 'after-talk' ? 1 : state === 'after-things' || paused ? 2 : 3
  const answered = GAME.results.length || 1
  const steps: { label: string; sub: string; id: ScreenId }[] = [
    { label: 'Talk', sub: '3 min with Polly', id: 'talk' },
    { label: 'Three things', sub: 'say them back', id: 'things' },
    { label: 'Cards', sub: paused ? `${answered} of ${QUESTIONS.length} · paused` : `${QUESTIONS.length} questions`, id: 'cards' },
  ]
  const next = steps[stepDone]
  const todayIdx = MAP_DAYS.indexOf(DAY)
  const dayDone = state === 'done'
  const streak = dayDone ? STREAK : STREAK - 1

  return (
    <Frame className="w-map">
      <div className="w-top">
        <span className="w-wordmark">
          <Mascot size={30} mood="idle" />
          {WORKING_NAME}
        </span>
        <span className="w-streak">
          <Flame /> {streak}
        </span>
      </div>

      <div className="w-day">
        <span className="w-day-n">Day {DAY}</span>
        <span className="w-day-sub">{dayDone ? 'Done for today' : `Thursday · ${stepDone} of 3 done`}</span>
      </div>

      <div className={`w-today ${dayDone ? 'done' : ''}`}>
        {steps.map((s, i) => {
          const done = i < stepDone
          const cur = i === stepDone
          return (
            <div key={s.label} className={`w-step ${done ? 'done' : cur ? 'cur' : 'later'}`}>
              <span className="w-step-n">{done ? <Check size={13} color="var(--w-on-good)" /> : i + 1}</span>
              <span className="w-step-label">{s.label}</span>
              <span className="w-step-sub">{s.sub}</span>
            </div>
          )
        })}
        {dayDone ? (
          <div className="w-tomorrow">
            <span className="w-cap">Tomorrow {DAILY_TIME}</span>
            <b>{TOMORROW}</b>
          </div>
        ) : (
          <Button
            onClick={() => {
              if (next.id === 'cards' && !paused) resetGame()
              go(next.id)
            }}
          >
            {paused ? 'Resume cards' : stepDone === 0 ? 'Start today' : `Next: ${next.label}`}
          </Button>
        )}
      </div>

      <svg className="w-trail" width={MAP_W} height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-label="Trail of days">
        <path d={trail(0, MAP_DAYS.length - 1)} fill="none" stroke="var(--w-trail-next)" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
        <path d={trail(0, dayDone ? todayIdx : todayIdx)} fill="none" stroke="var(--w-trail)" strokeWidth="4" strokeLinecap="round" />
        {MAP_DAYS.map((d, i) => {
          const x = xOf(i)
          const y = yOf(i)
          const bonus = d % BONUS_EVERY === 0
          if (d < DAY || (d === DAY && dayDone)) {
            return (
              <g key={d}>
                <circle cx={x} cy={y} r="15" fill="var(--w-primary)" stroke="var(--w-stroke)" strokeWidth="2" />
                <path d={`M${x - 5} ${y + 0.5}l3.5 3.5L${x + 6} ${y - 4}`} fill="none" stroke="var(--w-primary-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          }
          if (d === DAY) {
            return (
              <g key={d}>
                <circle className="w-pulse" cx={x} cy={y} r="19" fill="none" stroke="var(--w-reward)" strokeWidth="3" />
                <circle cx={x} cy={y} r="19" fill="var(--w-reward)" stroke="var(--w-stroke)" strokeWidth="2.4" />
                <text x={x} y={y + 5} textAnchor="middle" className="w-node-n">
                  {d}
                </text>
                <text x={x + 28} y={y + 5} className="w-node-label">
                  Today
                </text>
              </g>
            )
          }
          return (
            <g key={d}>
              <circle cx={x} cy={y} r="15" fill="var(--w-bg)" stroke={bonus ? 'var(--w-reward)' : 'var(--w-trail-next)'} strokeWidth="2" strokeDasharray={bonus ? '0' : '3 4'} />
              {bonus ? (
                <path
                  d={`M${x} ${y - 8}l2.5 5.3 5.8.6-4.3 4 1.2 5.7L${x} ${y + 9.8}l-5.2 2.8 1.2-5.7-4.3-4 5.8-.6z`}
                  fill="var(--w-reward)"
                  stroke="var(--w-stroke)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              ) : (
                <text x={x} y={y + 4.5} textAnchor="middle" className="w-node-n later">
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
    <Frame className="w-talk" light>
      <div className="w-talk-head">
        <span className="w-talk-topic">{TOPIC}</span>
        <span className="w-timer">{connecting ? 'Calling…' : fmt(remaining)}</span>
      </div>
      <div className="w-talk-stage">
        <div className={`w-stage-rings ${mood === 'talking' ? 'on' : ''}`}>
          <Mascot size={170} mood={mood} />
        </div>
        <div className="w-talk-who">
          {connecting ? (
            <span>Calling {WORKING_NAME}</span>
          ) : wrapping ? (
            <span>Wrapping up</span>
          ) : who === 'tutor' ? (
            <span>{WORKING_NAME} is talking</span>
          ) : (
            <span className="w-yourturn">
              <Bars color="var(--w-good)" /> Your turn
            </span>
          )}
        </div>
      </div>

      <div className="w-transcript" aria-live="polite">
        {last.map((t) => (
          <div key={t.i} className="w-turn">
            <div className={`w-bubble ${t.who}`}>{t.text}</div>
            {t.fix && live > t.i ? (
              <span className="w-fixchip">
                <b>fix</b> {t.fix}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="w-talk-foot">
        <button className="w-pill" onClick={() => go('things')}>
          End
        </button>
      </div>
    </Frame>
  )
}

/* ---------- part 2: three things ---------- */

type ThingPhase = 'listen' | 'repeat' | 'hearing' | 'got'

export function ThingsScreen({ go, still = false }: P) {
  const [step, setStep] = useState(0)
  const i = WALK.things[step]
  const [phase, setPhase] = useState<ThingPhase>(still ? 'repeat' : 'listen')

  useEffect(() => {
    if (still) return
    let t: ReturnType<typeof setTimeout> | undefined
    if (phase === 'listen') t = setTimeout(() => setPhase('repeat'), 1700)
    if (phase === 'hearing') t = setTimeout(() => setPhase('got'), 1100)
    if (phase === 'got')
      t = setTimeout(() => {
        if (step + 1 < WALK.things.length) {
          setStep(step + 1)
          setPhase('listen')
        } else {
          go('cards')
        }
      }, 1400)
    return () => clearTimeout(t)
  }, [phase, step, still, go])

  const th = THINGS[i]
  const mood: Mood = phase === 'listen' ? 'talking' : phase === 'got' ? 'happy' : 'listening'
  const line = phase === 'listen' ? 'Listen.' : phase === 'repeat' ? 'Your turn. Say it.' : phase === 'hearing' ? 'Listening…' : 'You got it!'

  return (
    <Frame className="w-things">
      <div className="w-sec-head">
        <button className="w-close" onClick={() => go('map', 'after-talk')} aria-label="Leave three things">
          ×
        </button>
        <span className="w-sec-title">Three things from today</span>
        <span className="w-segs" aria-label={`${i + 1} of 3`}>
          {THINGS.map((_, k) => (
            <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} />
          ))}
        </span>
      </div>

      <div key={i} className={`w-card w-thing ${phase === 'got' ? 'got' : ''}`}>
        <span className={`w-tag ${th.kind}`}>{KIND_LABEL[th.kind]}</span>
        <span className="w-es">{th.es}</span>
        <span className="w-en">{th.en}</span>
        <span className="w-from">{th.from}</span>
        {phase === 'got' ? (
          <span className="w-gotmark">
            <Check size={16} color="var(--w-on-good)" />
          </span>
        ) : null}
      </div>

      <div className="w-coach">
        <Mascot size={84} mood={mood} />
        <span className={`w-speech ${phase}`}>{line}</span>
      </div>

      <div className="w-things-foot">
        {phase === 'listen' ? (
          <span className="w-mic off">
            <SpeakerIcon />
          </span>
        ) : phase === 'repeat' ? (
          <button className="w-mic" onClick={() => setPhase('hearing')} aria-label="Say it">
            <MicIcon />
          </button>
        ) : phase === 'hearing' ? (
          <span className="w-mic hearing">
            <Bars color="var(--w-primary-ink)" />
          </span>
        ) : (
          <span className="w-mic got">
            <Check size={30} color="var(--w-on-good)" />
          </span>
        )}
        <span className="w-foot-hint">{phase === 'repeat' ? 'Tap, then say it' : phase === 'listen' ? `${WORKING_NAME} says it first` : ' '}</span>
      </div>
    </Frame>
  )
}

/* ---------- part 3: cards ---------- */

type Res = { q: number; ok: boolean }
// Progress lives outside the screen so leaving and resuming keeps the place.
export const GAME: { results: Res[] } = { results: [] }
export function resetGame() {
  GAME.results = []
}

// What you type is compared loosely: case, accents and a leading article are ignored.
function norm(v: string) {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(el|la|los|las) /, '')
}

export function CardsScreen({ go, still = false }: P) {
  // Opening the game after a finished round starts a fresh one.
  const [results, setResults] = useState<Res[]>(() => (still ? [] : GAME.results.length === WALK.questions.length ? [] : GAME.results))
  const [pick, setPick] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState<boolean | null>(null)
  const qi = WALK.questions[results.length]
  const i = qi ?? QUESTIONS.length
  const q = qi === undefined ? undefined : QUESTIONS[qi]
  const answered = pick !== null || checked !== null
  const ok = q ? (q.kind === 'pick' ? pick !== null && q.options[pick] === q.es : checked === true) : false

  useEffect(() => {
    if (!still) GAME.results = results
  }, [results, still])

  useEffect(() => {
    if (!still && results.length === WALK.questions.length) go('done')
  }, [results.length, still, go])

  useEffect(() => {
    if (still || !answered || !q) return
    const t = setTimeout(
      () => {
        setResults((r) => [...r, { q: i, ok }])
        setPick(null)
        setTyped('')
        setChecked(null)
      },
      q.kind === 'pick' ? 1200 : 1500,
    )
    return () => clearTimeout(t)
  }, [answered, ok, i, q, still])

  if (!q) return <Frame className="w-cards" />

  const right = results.filter((r) => r.ok).length
  const check = () => {
    if (!typed.trim()) return
    setChecked(norm(typed) === norm(q.es))
  }

  return (
    <Frame className="w-cards">
      <div className="w-sec-head">
        <button className="w-close" onClick={() => go('map', results.length ? 'paused' : 'after-things')} aria-label="Leave the cards, keep your place">
          ×
        </button>
        <span className="w-sec-title">Cards</span>
        <span className="w-count">
          {right} / {QUESTIONS.length}
        </span>
      </div>
      <span className="w-segs wide" aria-label={`${results.length} of ${QUESTIONS.length} answered`}>
        {QUESTIONS.map((_, k) => {
          const r = results.find((x) => x.q === k)
          return <i key={k} className={r ? (r.ok ? 'ok' : 'miss') : k === i ? 'cur' : ''} />
        })}
      </span>

      <div key={i} className={`w-card w-flash ${answered ? (ok ? 'ok' : 'miss') : ''}`}>
        <div className="w-flash-top">
          <span className={`w-tag ${q.from === 'new' ? 'new' : 'old'}`}>{q.from === 'new' ? 'New today' : `Day ${q.from}`}</span>
          <span className="w-mode">
            {i + 1} · {q.kind === 'pick' ? 'Pick it' : 'Type it'}
          </span>
        </div>
        <span className="w-prompt">{q.en}</span>

        {q.kind === 'pick' ? (
          <div className="w-options" role="group" aria-label="Options">
            {q.options.map((o, k) => {
              const cls = pick === null ? '' : o === q.es ? 'right' : k === pick ? 'wrong' : 'dim'
              return (
                <button key={o} className={`w-option ${cls}`} disabled={pick !== null} onClick={() => setPick(k)}>
                  {o}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="w-typeit">
            <input
              className="w-input"
              value={typed}
              placeholder="Type it in Spanish"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={checked !== null}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') check()
              }}
              aria-label="Your answer"
            />
            {checked === null ? (
              <div className="w-typeit-row">
                <button className="w-check" onClick={check} disabled={!typed.trim()}>
                  Check
                </button>
                <button className="w-link" onClick={() => setChecked(false)}>
                  Skip
                </button>
              </div>
            ) : (
              <div className="w-band inline">
                <span className="w-es sm">{q.es}</span>
                <span className="w-verdict">{checked ? <>Nice <Check size={14} color="var(--w-on-good)" /></> : 'Not yet'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="w-cards-hint">{q.kind === 'pick' ? 'Tap the one that matches.' : 'Accents and el/la are optional.'}</span>
    </Frame>
  )
}

/* ---------- day complete ---------- */

export function DoneScreen({ go }: P) {
  const played = GAME.results.length === WALK.questions.length ? GAME.results : null
  const skipped = QUESTIONS.length - WALK.questions.length
  const right = played ? played.filter((r) => r.ok).length + skipped : 9
  const back = played
    ? Array.from(new Set([...THINGS.map((t) => t.es), ...played.filter((r) => !r.ok).map((r) => QUESTIONS[r.q].es)])).slice(0, 4)
    : COMING_BACK
  return (
    <Frame className="w-done">
      <div className="w-sun">
        <i />
        <Mascot size={150} mood="happy" />
      </div>
      <span className="w-done-title">Day {DAY} complete</span>
      <span className="w-done-streak">
        <Flame size={22} /> {STREAK} day streak
      </span>
      <div className="w-totals">
        <div>
          <b>3:00</b>
          <span>talk</span>
        </div>
        <div>
          <b>3</b>
          <span>things</span>
        </div>
        <div>
          <b>
            {right} / {QUESTIONS.length}
          </b>
          <span>cards</span>
        </div>
      </div>
      <div className="w-card w-back">
        <span className="w-cap">Coming back tomorrow</span>
        <span className="w-chips">
          {back.map((w) => (
            <span key={w} className="w-chip">
              {w}
            </span>
          ))}
        </span>
        <span className="w-back-line">{WORKING_NAME} will work these into tomorrow&rsquo;s call.</span>
      </div>
      <div className="w-done-foot">
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
