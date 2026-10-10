'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Parrot, type Mood } from './Parrot'
import { CHANGES, LOOP, MOTION, ORDER, PALETTE, SCREENS, TYPE, WORKING_NAME, type MapState, type ScreenId } from './content'
import { Screen, resetGame, type Go } from './screens'

type Pos = { id: ScreenId; map: MapState; key: number }
const noop: Go = () => {}
const nameOf = (id: ScreenId) => SCREENS.find((s) => s.id === id)?.name ?? id

function Phone({ children }: { children: React.ReactNode }) {
  const slot = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = slot.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const wide = window.innerWidth >= 980
      const h = window.innerHeight - (wide ? 170 : 72)
      setScale(Math.max(0.4, Math.min(1, w / 395, h / 832)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  return (
    <div className="hf-phone-slot" ref={slot} style={{ height: Math.round(832 * scale) }}>
      <div className="hf-phone" style={{ transform: `scale(${scale})` }}>
        <div className="p2">{children}</div>
      </div>
    </div>
  )
}

function Thumb({ id, state, label, on, onClick }: { id: ScreenId; state?: MapState; label: string; on: boolean; onClick: () => void }) {
  return (
    <div
      className={`hf-thumb ${on ? 'on' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`Show ${label} on the phone`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <span className="hf-thumb-ph" aria-hidden>
        <span className="p2 thumb" inert>
          <Screen id={id} go={noop} state={state} still />
        </span>
      </span>
      <span className="hf-thumb-label">{label}</span>
    </div>
  )
}

const MAP_STATES: { s: MapState; label: string }[] = [
  { s: 'morning', label: 'Morning' },
  { s: 'after-talk', label: 'After the talk' },
  { s: 'after-things', label: 'After three things' },
  { s: 'paused', label: 'Cards paused' },
  { s: 'done', label: 'Done' },
]

export default function Artifact() {
  const [pos, setPos] = useState<Pos>({ id: 'map', map: 'morning', key: 0 })

  const go: Go = useCallback((id, state) => {
    setPos((p) => ({ id, map: state ?? p.map, key: p.key + 1 }))
  }, [])
  const show = useCallback(
    (id: ScreenId, state?: MapState) => {
      go(id, state)
      if (window.innerWidth < 980) window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [go],
  )

  const idx = ORDER.indexOf(pos.id)
  const prev = () => show(ORDER[(idx - 1 + ORDER.length) % ORDER.length])
  const next = () => show(ORDER[(idx + 1) % ORDER.length])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const isOn = (id: ScreenId, state?: MapState) => pos.id === id && (id !== 'map' || !state || pos.map === state)
  const current = SCREENS.find((s) => s.id === pos.id)

  return (
    <div className="hf">
      <div className="hf-wrap">
        <header className="hf-head">
          <div className="hf-eyebrow">Design artifact · v2 · high fidelity · October 9, 2026</div>
          <h1 className="hf-h1">Daily call, in color</h1>
          <p className="hf-dek">
            Three minutes of conversation a day, then three things to say back, then ten flash cards. The day is done
            when all three are, and the map keeps the streak. This pass sets a visual direction to react to: paper, ink and
            a riso palette, a parrot for a mascot, the language set in an italic serif. Working name: {WORKING_NAME}.
          </p>
          <div className="hf-meta">
            <span>5 screens</span>
            <span>1 loop</span>
            <span>Tap anything in the phone</span>
            <span>← → moves through the screens</span>
            <a href="/design/daily-call">v1, the unbranded spec →</a>
          </div>
        </header>

        <div className="hf-main">
          <aside className="hf-left">
            <Phone>
              <Screen key={pos.key} id={pos.id} go={go} state={pos.map} />
            </Phone>
            <div className="hf-controls">
              <button className="hf-nav" onClick={prev} aria-label="Previous screen">
                ←
              </button>
              <div className="hf-current">
                <b>{nameOf(pos.id)}</b>
                {pos.id === 'map' ? (
                  <div className="hf-pills" role="radiogroup" aria-label="Map state">
                    {MAP_STATES.map((m) => (
                      <button key={m.s} className={`hf-pill ${pos.map === m.s ? 'on' : ''}`} onClick={() => go('map', m.s)} role="radio" aria-checked={pos.map === m.s}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : pos.id === 'done' ? (
                  <span className="hf-hint">{current?.purpose}</span>
                ) : (
                  <div className="hf-pills">
                    <button
                      className="hf-pill"
                      onClick={() => {
                        if (pos.id === 'cards') resetGame()
                        go(pos.id)
                      }}
                    >
                      Replay
                    </button>
                    <span className="hf-hint">
                      {pos.id === 'talk' ? 'Plays itself at about 9× speed' : pos.id === 'things' ? 'Tap the mic when it turns red' : 'Pick or type. × leaves and keeps your place.'}
                    </span>
                  </div>
                )}
              </div>
              <button className="hf-nav" onClick={next} aria-label="Next screen">
                →
              </button>
            </div>
          </aside>

          <main className="hf-right">
            <section className="hf-section" id="loop">
              <h2 className="hf-h2">The loop</h2>
              <p className="hf-p">One day, start to finish. Each thumbnail is the real screen; tap one to put it on the phone.</p>
              <div className="hf-strip" style={{ marginTop: 14 }}>
                {LOOP.map((s, i) => (
                  <div key={`${s.id}-${i}`} className="hf-step">
                    {i > 0 ? (
                      <span className="hf-arrow" aria-hidden>
                        →
                      </span>
                    ) : null}
                    <Thumb id={s.id} state={s.state} label={s.label} on={isOn(s.id, s.state)} onClick={() => show(s.id, s.state)} />
                  </div>
                ))}
              </div>
            </section>

            <section className="hf-section" id="screens">
              <h2 className="hf-h2">Screens</h2>
              <div className="hf-screens">
                {SCREENS.map((s) => (
                  <article key={s.id} className={`hf-note ${pos.id === s.id ? 'on' : ''}`}>
                    <Thumb id={s.id} state={s.id === 'map' ? pos.map : undefined} label={s.name} on={pos.id === s.id} onClick={() => show(s.id)} />
                    <div>
                      <h3>
                        <button className="hf-note-title" onClick={() => show(s.id)}>
                          {s.name}
                        </button>
                      </h3>
                      <p className="hf-purpose">{s.purpose}</p>
                      <ul>
                        {s.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="hf-section" id="look">
              <h2 className="hf-h2">Look and feel</h2>
              <h3 className="hf-h3">Palette</h3>
              <div className="hf-swatches">
                {PALETTE.map((p) => (
                  <div key={p.name} className="hf-swatch">
                    <i style={{ background: p.value, borderBottom: p.value === '#FFF4E3' || p.value === '#FFFDF8' ? '1px solid #ddd9d0' : undefined }} />
                    <div>
                      <b>{p.name}</b>
                      <code>{p.value}</code>
                      {p.role}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="hf-h3">Type</h3>
              <div className="hf-type">
                {TYPE.map((t, i) => (
                  <div key={t.name} className="hf-specimen">
                    <span className={`hf-sample ${i === 0 ? 'display' : i === 1 ? 'serif' : 'ui'}`}>{t.sample}</span>
                    <div>
                      <b>{t.name}</b>
                      {t.role}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="hf-h3">The mascot and its four states</h3>
              <div className="hf-moods">
                {(
                  [
                    ['idle', 'Idle', 'Breathes, blinks. On the map and while calling.'],
                    ['talking', 'Talking', 'Beak flaps, body bobs. Whenever Polly speaks.'],
                    ['listening', 'Listening', 'Head tilts toward you. Whenever it is your turn.'],
                    ['happy', 'Happy', 'Hops. "You got it" and day complete.'],
                  ] as [Mood, string, string][]
                ).map(([m, label, body]) => (
                  <div key={m} className="hf-mood">
                    <Parrot size={96} mood={m} />
                    <b>{label}</b>
                    <span>{body}</span>
                  </div>
                ))}
              </div>

              <div className="hf-two">
                <div>
                  <h3 className="hf-h3">Motion and sound</h3>
                  <ul>
                    {MOTION.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="hf-h3">What changed from v1</h3>
                  <ul>
                    {CHANGES.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
