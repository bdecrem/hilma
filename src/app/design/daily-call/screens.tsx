'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CALL_STILL_MS,
  CALL_TOTAL_MS,
  CONNECT_MS,
  DAILY_TIME,
  DAY,
  LADDER,
  LANGUAGES,
  MOVED,
  NOTEBOOK,
  SCRIPT,
  STARTS,
  TIMES,
  TODAY,
  TOTALS,
  WORKING_NAME,
  type ScreenId,
  type TodayState,
} from './content'

export type Go = (id: ScreenId, state?: TodayState) => void

type ScreenProps = { go: Go; state?: TodayState; still?: boolean }

/* ---------- shared pieces ---------- */

function StatusBar() {
  return (
    <div className="ph-status" aria-hidden>
      <span>9:41</span>
      <span className="ph-status-right">
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

function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`ph-screen ${className}`}>
      <StatusBar />
      <div className="ph-body">{children}</div>
      <div className="ph-home">
        <i />
      </div>
    </div>
  )
}

function TopBar({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="ph-top">
      {onBack ? (
        <button className="ph-back" onClick={onBack} aria-label="Back to Today">
          <Chevron dir="left" /> Today
        </button>
      ) : (
        <span />
      )}
      {title ? <span className="ph-top-title">{title}</span> : null}
      {right ?? <span />}
    </div>
  )
}

function Chevron({ dir = 'right' }: { dir?: 'left' | 'right' }) {
  return (
    <svg className={`ph-chev ${dir}`} width="10" height="16" viewBox="0 0 10 16" aria-hidden>
      <path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Button({ children, onClick, ghost = false }: { children: ReactNode; onClick?: () => void; ghost?: boolean }) {
  return (
    <button className={`ph-btn ${ghost ? 'ghost' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function Row({ label, value, onClick }: { label: string; value?: string; onClick?: () => void }) {
  return (
    <button className="ph-row" onClick={onClick}>
      <span className="ph-row-label">{label}</span>
      <span className="ph-row-right">
        {value ? <span className="ph-row-value">{value}</span> : null}
        <Chevron />
      </span>
    </button>
  )
}

function Dots({ n, on }: { n: number; on: number }) {
  return (
    <div className="ph-dots" aria-label={`Step ${on + 1} of ${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i === on ? 'on' : ''} />
      ))}
    </div>
  )
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="ph-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

function Gear({ onClick }: { onClick?: () => void }) {
  return (
    <button className="ph-icon" onClick={onClick} aria-label="Settings">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </button>
  )
}

/* ---------- onboarding ---------- */

export function Welcome({ go }: ScreenProps) {
  return (
    <Frame className="ph-ob">
      <div className="ph-ob-art" aria-hidden>
        <span>Brand slot: illustration or mascot</span>
      </div>
      <div className="ph-ob-text">
        <div className="ph-wordmark">{WORKING_NAME}</div>
        <h1 className="ph-display">Three minutes of conversation. Every day.</h1>
        <p className="ph-p">
          We text you at your time. You tap and talk. The tutor keeps it at your level and nudges you up.
        </p>
      </div>
      <div className="ph-foot">
        <Button onClick={() => go('ob-language')}>Get started</Button>
        <button className="ph-link">Already have an account? Sign in</button>
      </div>
    </Frame>
  )
}

export function Language({ go }: ScreenProps) {
  const [pick, setPick] = useState(0)
  return (
    <Frame className="ph-ob">
      <TopBar right={<Dots n={4} on={1} />} />
      <h1 className="ph-display">Which language?</h1>
      <p className="ph-p">One language for now. You can change it later.</p>
      <div className="ph-list">
        {LANGUAGES.map((l, i) => (
          <button key={l} className={`ph-radio ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)} role="radio" aria-checked={i === pick}>
            <span>{l}</span>
            <i />
          </button>
        ))}
      </div>
      <div className="ph-foot">
        <Button onClick={() => go('ob-level')}>Continue</Button>
      </div>
    </Frame>
  )
}

export function Start({ go }: ScreenProps) {
  const [pick, setPick] = useState(1)
  return (
    <Frame className="ph-ob">
      <TopBar right={<Dots n={4} on={2} />} />
      <h1 className="ph-display">Where are you today?</h1>
      <p className="ph-p">Rough is fine. The first call fine-tunes this.</p>
      <div className="ph-list ph-list-cards">
        {STARTS.map((s, i) => (
          <button key={s.title} className={`ph-choice ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)} role="radio" aria-checked={i === pick}>
            <span className="ph-choice-title">{s.title}</span>
            <span className="ph-choice-body">{s.body}</span>
          </button>
        ))}
      </div>
      <div className="ph-foot">
        <Button onClick={() => go('ob-time')}>Continue</Button>
      </div>
    </Frame>
  )
}

export function Time({ go }: ScreenProps) {
  const [t, setT] = useState(1)
  return (
    <Frame className="ph-ob">
      <TopBar right={<Dots n={4} on={3} />} />
      <h1 className="ph-display">When should we text you?</h1>
      <p className="ph-p">Pick the hour you can usually talk for three minutes.</p>
      <div className="ph-chips">
        {TIMES.map((x, i) => (
          <button key={x} className={`ph-chip ${i === t ? 'on' : ''}`} onClick={() => setT(i)}>
            {x}
          </button>
        ))}
        <button className="ph-chip">Other</button>
      </div>
      <label className="ph-field">
        <span className="ph-cap">Phone number</span>
        <span className="ph-input">+1 (415) 555 0123</span>
      </label>
      <p className="ph-small">One text a day, at that hour. Nothing else.</p>
      <div className="ph-foot">
        <Button onClick={() => go('call')}>Start my first call</Button>
      </div>
    </Frame>
  )
}

/* ---------- the daily text ---------- */

export function Message({ go }: ScreenProps) {
  return (
    <Frame className="ph-msgs">
      <div className="ph-msgs-head">
        <span className="ph-msgs-avatar" aria-hidden>
          {WORKING_NAME[0]}
        </span>
        <span className="ph-msgs-name">{WORKING_NAME}</span>
      </div>
      <div className="ph-thread">
        <div className="ph-daystamp">Yesterday 8:00 AM</div>
        <div className="ph-sms">Ready for your three minutes? Today: food you cook. ola.cx/c/7h2q</div>
        <div className="ph-daystamp">Yesterday 8:04 AM</div>
        <div className="ph-sms">
          Day 11 done. Fix: me gusta cocinar. New word: la sartén. Tomorrow at 8:00, your weekend.
        </div>
        <div className="ph-daystamp">Today 8:00 AM</div>
        <div className="ph-sms">
          Ready for your three minutes? Today: your weekend.{' '}
          <button className="ph-sms-link" onClick={() => go('today', 'before')}>
            ola.cx/c/8f3k
          </button>
        </div>
      </div>
      <div className="ph-compose" aria-hidden>
        <span>Text Message</span>
      </div>
    </Frame>
  )
}

/* ---------- today ---------- */

export function Today({ go, state = 'before' }: ScreenProps) {
  const missed = state === 'missed'
  const after = state === 'after'
  return (
    <Frame>
      <TopBar
        right={<Gear onClick={() => go('settings')} />}
        title={undefined}
      />
      <div className="ph-today-head">
        <span className="ph-streak">
          {missed ? (
            <>
              Day 1 <span className="ph-muted">· best {DAY}</span>
            </>
          ) : (
            <>Day {DAY}</>
          )}
        </span>
        <span className="ph-muted">Thursday</span>
      </div>

      <div className="ph-card ph-today-card">
        {after ? (
          <>
            <div className="ph-cap">Today</div>
            <div className="ph-h">Done for today.</div>
            <p className="ph-p">
              Fix: <b>{TODAY.fix.right}</b>. New word: <b>{TODAY.word.word}</b>.
            </p>
            <div className="ph-divider" />
            <div className="ph-next">
              <span className="ph-cap">Tomorrow {DAILY_TIME}</span>
              <span className="ph-next-topic">{TODAY.tomorrow}</span>
            </div>
            <Button ghost onClick={() => go('summary')}>
              See today&rsquo;s summary
            </Button>
          </>
        ) : (
          <>
            <div className="ph-cap">{missed ? 'Yesterday slipped. Today still counts.' : 'Today’s call'}</div>
            <div className="ph-h ph-topic">{TODAY.topic}</div>
            <p className="ph-p">About three minutes. {WORKING_NAME} asks, you talk.</p>
            <Button onClick={() => go('call')}>Start the call</Button>
          </>
        )}
      </div>

      <div className="ph-rows">
        <Row label="Level" value={`${TODAY.level.code} · ${TODAY.level.pct}% to ${TODAY.level.next}`} onClick={() => go('level')} />
        <Row label="Notebook" value={`${DAY} fixes, ${DAY} words`} onClick={() => go('notebook')} />
      </div>
    </Frame>
  )
}

/* ---------- the call ---------- */

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Call({ go, still = false }: ScreenProps) {
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
          go('summary')
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [still, go])

  // Which turn is live, and which have been said.
  let acc = CONNECT_MS
  let live = -1
  for (let i = 0; i < SCRIPT.length; i++) {
    if (elapsed >= acc && elapsed < acc + SCRIPT[i].ms) live = i
    acc += SCRIPT[i].ms
  }
  const connecting = elapsed < CONNECT_MS
  const wrapping = elapsed >= acc
  const shown = SCRIPT.map((t, i) => ({ ...t, i })).filter((t) => {
    let a = CONNECT_MS
    for (let j = 0; j < t.i; j++) a += SCRIPT[j].ms
    return elapsed >= a
  })
  const last = shown.slice(-3)
  const who = wrapping ? 'tutor' : live >= 0 ? SCRIPT[live].who : 'tutor'
  const remaining = 180_000 * (1 - Math.min(1, elapsed / CALL_TOTAL_MS))

  return (
    <Frame className="ph-call">
      <div className="ph-call-head">
        <span className="ph-call-topic">{TODAY.topic}</span>
        <span className="ph-timer">{connecting ? 'Connecting…' : fmt(remaining)}</span>
      </div>

      <div className="ph-disk-wrap">
        <div className={`ph-disk ${!connecting && who === 'tutor' ? 'talking' : ''}`} aria-hidden>
          <span>Mascot slot</span>
        </div>
        <div className="ph-who">
          {connecting ? (
            <span className="ph-muted">Calling {WORKING_NAME}</span>
          ) : wrapping ? (
            <span className="ph-muted">Wrapping up</span>
          ) : who === 'tutor' ? (
            <span className="ph-muted">{WORKING_NAME} is talking</span>
          ) : (
            <span className="ph-listen" aria-label="Your turn">
              <i />
              <i />
              <i />
              <i />
              <i />
              <em>Your turn</em>
            </span>
          )}
        </div>
      </div>

      <div className="ph-transcript" aria-live="polite">
        {last.map((t) => (
          <div key={t.i} className="ph-turn">
            <div className={`ph-bubble ${t.who} ${t.i === live ? 'live' : ''}`}>{t.text}</div>
            {t.fix && live > t.i ? (
              <div className="ph-fix">
                <span className="ph-fix-tag">fix</span>
                <b>{t.fix}</b>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="ph-callbtns">
        <Button ghost>Pause</Button>
        <Button ghost onClick={() => go('summary')}>
          End
        </Button>
      </div>
    </Frame>
  )
}

/* ---------- after the call ---------- */

export function Summary({ go }: ScreenProps) {
  const L = TODAY.level
  return (
    <Frame className="ph-sum">
      <div className="ph-sum-head">
        <h1 className="ph-display">That&rsquo;s day {DAY}.</h1>
        <span className="ph-muted">3:00 · {TODAY.topic}</span>
      </div>

      <div className="ph-card ph-sum-card">
        <div className="ph-cap">One fix</div>
        <div className="ph-fixline">
          <s>{TODAY.fix.wrong}</s>
          <b>{TODAY.fix.right}</b>
        </div>
        <p className="ph-small">{TODAY.fix.why}</p>
      </div>

      <div className="ph-card ph-sum-card">
        <div className="ph-cap">One new word</div>
        <div className="ph-wordline">
          <b>{TODAY.word.word}</b>
          <span className="ph-muted">{TODAY.word.meaning}</span>
        </div>
        <p className="ph-small">Heard in: &ldquo;{TODAY.word.heard}&rdquo;</p>
      </div>

      <div className="ph-card ph-sum-card">
        <div className="ph-cap">Came back today</div>
        <div className="ph-chips tight">
          {TODAY.recycled.map((w) => (
            <span key={w} className="ph-chip sm">
              {w}
            </span>
          ))}
        </div>
      </div>

      <div className="ph-card ph-sum-card">
        <div className="ph-cap">Level</div>
        <div className="ph-levelline">
          <b>{L.code}</b>
          <span className="ph-muted">
            {L.pct}% to {L.next} · +{L.delta} today
          </span>
        </div>
        <Bar pct={L.pct} />
        <p className="ph-small">{L.next} in {L.eta}.</p>
      </div>

      <div className="ph-foot">
        <div className="ph-next center">
          <span className="ph-cap">Tomorrow {DAILY_TIME}</span>
          <span className="ph-next-topic">{TODAY.tomorrow}</span>
        </div>
        <Button onClick={() => go('today', 'after')}>Done</Button>
      </div>
    </Frame>
  )
}

/* ---------- level ---------- */

export function Level({ go }: ScreenProps) {
  const L = TODAY.level
  const cur = LADDER.findIndex((r) => r.code === L.code)
  return (
    <Frame>
      <TopBar onBack={() => go('today')} title="Level" />
      <div className="ph-level-head">
        <span className="ph-level-code">{L.code}</span>
        <span className="ph-level-name">{L.name}</span>
      </div>
      <Bar pct={L.pct} />
      <p className="ph-small">
        {L.pct}% of the way to {L.next}. {L.next} in {L.eta}.
      </p>

      <div className="ph-ladder">
        {LADDER.map((r, i) => (
          <div key={r.code} className={`ph-rung ${i < cur ? 'past' : i === cur ? 'now' : 'next'}`}>
            <span className="ph-rung-code">{r.code}</span>
            <span className="ph-rung-name">{r.name}</span>
            <span className="ph-rung-mark">{i < cur ? '✓' : i === cur ? 'you' : ''}</span>
          </div>
        ))}
      </div>

      <div className="ph-cap">What moved this month</div>
      <ul className="ph-moved">
        {MOVED.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>

      <div className="ph-totals">
        {TOTALS.map((t) => (
          <div key={t.label}>
            <b>{t.n}</b>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/* ---------- notebook ---------- */

export function Notebook({ go }: ScreenProps) {
  return (
    <Frame>
      <TopBar onBack={() => go('today')} title="Notebook" />
      <p className="ph-p ph-nb-intro">One fix and one word a day. Nothing to study; it&rsquo;s just here.</p>
      <div className="ph-nb">
        {NOTEBOOK.map((d) => (
          <div key={d.date} className="ph-nb-day">
            <div className="ph-nb-head">
              <span>{d.date}</span>
              <span className="ph-muted">{d.topic}</span>
            </div>
            <div className="ph-nb-line">
              <span className="ph-fix-tag">fix</span>
              <b>{d.fix}</b>
              <s>{d.wrong}</s>
            </div>
            <div className="ph-nb-line">
              <span className="ph-fix-tag">word</span>
              <b>{d.word}</b>
              <span className="ph-muted">{d.meaning}</span>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/* ---------- settings ---------- */

export function Settings({ go }: ScreenProps) {
  return (
    <Frame>
      <TopBar onBack={() => go('today')} title="Settings" />
      <div className="ph-set">
        <div className="ph-cap">Your call</div>
        <div className="ph-rows">
          <Row label="Time" value={DAILY_TIME} />
          <Row label="Length" value="3 minutes" />
          <Row label="Language" value="Spanish" />
          <Row label="Topics you like" value="Travel, food, work" />
        </div>

        <div className="ph-cap">Texts</div>
        <div className="ph-rows">
          <Row label="Number" value="+1 (415) ••• ••23" />
          <div className="ph-row static">
            <span className="ph-row-label">Also text a recap</span>
            <span className="ph-toggle" aria-label="Off" />
          </div>
        </div>
        <p className="ph-small">One text a day, at call time.</p>

        <div className="ph-cap">Tutor</div>
        <div className="ph-rows">
          <Row label="Speed" value="Normal" />
          <Row label="Voice" value="Default" />
        </div>
      </div>
      <div className="ph-foot">
        <Button ghost>Pause for a week</Button>
        <button className="ph-link muted">Sign out</button>
      </div>
    </Frame>
  )
}

/* ---------- registry ---------- */

export function Screen({ id, go, state, still }: { id: ScreenId; go: Go; state?: TodayState; still?: boolean }) {
  switch (id) {
    case 'ob-welcome':
      return <Welcome go={go} />
    case 'ob-language':
      return <Language go={go} />
    case 'ob-level':
      return <Start go={go} />
    case 'ob-time':
      return <Time go={go} />
    case 'message':
      return <Message go={go} />
    case 'today':
      return <Today go={go} state={state} />
    case 'call':
      return <Call go={go} still={still} />
    case 'summary':
      return <Summary go={go} />
    case 'level':
      return <Level go={go} />
    case 'notebook':
      return <Notebook go={go} />
    case 'settings':
      return <Settings go={go} />
  }
}
