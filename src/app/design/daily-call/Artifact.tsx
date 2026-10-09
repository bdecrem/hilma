'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ACCENTS,
  COLOR_TOKENS,
  FLOWS,
  HANDOFF,
  ORDER,
  PRINCIPLES,
  SCREENS,
  TYPE_SCALE,
  WORKING_NAME,
  type ScreenId,
  type TodayState,
} from './content'
import { Screen, type Go } from './screens'

type Pos = { id: ScreenId; today: TodayState; key: number }

const noop: Go = () => {}

function nameOf(id: ScreenId) {
  return SCREENS.find((s) => s.id === id)?.name ?? id
}

/* The phone: a fixed 375x812 screen in a dark bezel, scaled to fit its column
   and the viewport. Scale is computed, not eyeballed, so the frame never
   clips on a laptop or a phone. */
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
    <div className="dc-phone-slot" ref={slot} style={{ height: Math.round(832 * scale) }}>
      <div className="dc-phone" style={{ transform: `scale(${scale})` }}>
        <div className="ph">{children}</div>
      </div>
    </div>
  )
}

function Thumb({
  id,
  state,
  label,
  on,
  onClick,
}: {
  id: ScreenId
  state?: TodayState
  label: string
  on: boolean
  onClick: () => void
}) {
  // Not a <button>: the thumbnail holds a real screen, buttons and all, and a
  // button inside a button is invalid HTML (and a hydration error).
  return (
    <div
      className={`dc-thumb ${on ? 'on' : ''}`}
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
      <span className="dc-thumb-ph" aria-hidden>
        <span className="ph thumb" inert>
          <Screen id={id} go={noop} state={state} still />
        </span>
      </span>
      <span className="dc-thumb-label">{label}</span>
    </div>
  )
}

export default function Artifact() {
  const [pos, setPos] = useState<Pos>({ id: 'today', today: 'before', key: 0 })
  const [accent, setAccent] = useState(ACCENTS[0].value)

  const go: Go = useCallback((id, state) => {
    setPos((p) => ({ id, today: state ?? p.today, key: p.key + 1 }))
  }, [])

  const show = useCallback(
    (id: ScreenId, state?: TodayState) => {
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
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const isOn = (id: ScreenId, state?: TodayState) => pos.id === id && (id !== 'today' || !state || pos.today === state)
  const style = { '--dc-accent': accent } as CSSProperties

  return (
    <div className="dc" style={style}>
      <div className="dc-wrap">
        <header className="dc-head">
          <div className="dc-eyebrow">Design artifact · v1 · October 9, 2026</div>
          <h1 className="dc-h1">Daily call</h1>
          <p className="dc-dek">
            A three-minute spoken conversation in the language you are learning, once a day, started from a text. This
            prototype is unbranded on purpose: the structure, flows and copy are set; the name, color, type and mascot are
            the brand designer&rsquo;s. Working name in the screens: {WORKING_NAME}.
          </p>
          <div className="dc-meta">
            <span>11 screens</span>
            <span>3 flows</span>
            <span>Tap anything in the phone</span>
            <span>← → moves through the screens</span>
          </div>
        </header>

        <section className="dc-principles" aria-label="Principles">
          {PRINCIPLES.map((p, i) => (
            <div key={p.title} className="dc-principle">
              <span className="dc-num">{i + 1}</span>
              <b>{p.title}</b>
              <span>{p.body}</span>
            </div>
          ))}
        </section>

        <div className="dc-main">
          <aside className="dc-left">
            <Phone>
              <Screen key={pos.key} id={pos.id} go={go} state={pos.today} />
            </Phone>
            <div className="dc-controls">
              <button className="dc-nav" onClick={prev} aria-label="Previous screen">
                ←
              </button>
              <div className="dc-current">
                <b>{nameOf(pos.id)}</b>
                {pos.id === 'today' ? (
                  <div className="dc-pills" role="radiogroup" aria-label="Today state">
                    {(['before', 'after', 'missed'] as TodayState[]).map((s) => (
                      <button key={s} className={`dc-pill ${pos.today === s ? 'on' : ''}`} onClick={() => go('today', s)} role="radio" aria-checked={pos.today === s}>
                        {s === 'before' ? 'Before the call' : s === 'after' ? 'After' : 'Missed yesterday'}
                      </button>
                    ))}
                  </div>
                ) : pos.id === 'call' ? (
                  <div className="dc-pills">
                    <button className="dc-pill" onClick={() => go('call')}>
                      Replay
                    </button>
                    <span className="dc-hint">Plays itself at about 9× speed</span>
                  </div>
                ) : (
                  <span className="dc-hint">{SCREENS.find((s) => s.id === pos.id)?.purpose}</span>
                )}
              </div>
              <button className="dc-nav" onClick={next} aria-label="Next screen">
                →
              </button>
            </div>
          </aside>

          <main className="dc-right">
            <section className="dc-section" id="flows">
              <h2 className="dc-h2">Flows</h2>
              {FLOWS.map((f) => (
                <div key={f.name} className="dc-flow">
                  <div className="dc-flow-head">
                    <b>{f.name}</b>
                    <span>{f.blurb}</span>
                  </div>
                  <div className="dc-strip">
                    {f.steps.map((s, i) => (
                      <div key={`${s.id}-${s.state ?? ''}-${i}`} className="dc-step">
                        {i > 0 ? (
                          <span className="dc-arrow" aria-hidden>
                            →
                          </span>
                        ) : null}
                        <Thumb id={s.id} state={s.state} label={s.label ?? nameOf(s.id)} on={isOn(s.id, s.state)} onClick={() => show(s.id, s.state)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="dc-section" id="screens">
              <h2 className="dc-h2">Screens</h2>
              <div className="dc-screens">
                {SCREENS.map((s) => (
                  <article key={s.id} className={`dc-screen-note ${pos.id === s.id ? 'on' : ''}`}>
                    <Thumb id={s.id} state={s.id === 'today' ? pos.today : undefined} label={s.name} on={pos.id === s.id} onClick={() => show(s.id)} />
                    <div className="dc-note-body">
                      <h3>
                        <button className="dc-note-title" onClick={() => show(s.id)}>
                          {s.name}
                        </button>
                      </h3>
                      <p className="dc-purpose">{s.purpose}</p>
                      <ul>
                        {s.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                      {s.open ? (
                        <div className="dc-open">
                          <span className="dc-cap">Open</span>
                          <ul>
                            {s.open.map((o) => (
                              <li key={o}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="dc-section" id="tokens">
              <h2 className="dc-h2">Tokens</h2>
              <p className="dc-p">
                Everything tinted inks from one accent token. Try one below; the whole prototype follows. The default is
                near-black so the structure reads without a brand on it.
              </p>
              <div className="dc-swatches" role="radiogroup" aria-label="Preview accent">
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    className={`dc-swatch ${accent === a.value ? 'on' : ''}`}
                    style={{ background: a.value }}
                    onClick={() => setAccent(a.value)}
                    role="radio"
                    aria-checked={accent === a.value}
                    aria-label={a.name}
                  >
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>

              <div className="dc-tokens">
                <table className="dc-table">
                  <caption>Color</caption>
                  <tbody>
                    {COLOR_TOKENS.map((t) => (
                      <tr key={t.name}>
                        <td>
                          <i className="dc-dot" style={{ background: t.name === '--dc-accent' ? accent : t.value }} />
                        </td>
                        <td>
                          <code>{t.name}</code>
                        </td>
                        <td>
                          <code>{t.name === '--dc-accent' ? accent : t.value}</code>
                        </td>
                        <td>{t.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table className="dc-table">
                  <caption>Type (Inter as the stand-in)</caption>
                  <tbody>
                    {TYPE_SCALE.map((t) => (
                      <tr key={t.name}>
                        <td>
                          <b>{t.name}</b>
                        </td>
                        <td>
                          <code>{t.spec}</code>
                        </td>
                        <td>{t.use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table className="dc-table">
                  <caption>Spacing and shape</caption>
                  <tbody>
                    <tr>
                      <td>
                        <b>Grid</b>
                      </td>
                      <td>
                        <code>4 pt</code>
                      </td>
                      <td>Screen padding 20, card padding 16, gap between cards 12.</td>
                    </tr>
                    <tr>
                      <td>
                        <b>Radius</b>
                      </td>
                      <td>
                        <code>14 / 10 / 999</code>
                      </td>
                      <td>Cards, buttons and fields, chips.</td>
                    </tr>
                    <tr>
                      <td>
                        <b>Controls</b>
                      </td>
                      <td>
                        <code>52 / 56</code>
                      </td>
                      <td>Button height, row height. Full-width buttons, one primary per screen.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dc-section" id="handoff">
              <h2 className="dc-h2">Handoff</h2>
              <div className="dc-handoff">
                <div>
                  <h3 className="dc-h3">The brand designer owns</h3>
                  <ul>
                    {HANDOFF.brand.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="dc-h3">Fixed</h3>
                  <ul>
                    {HANDOFF.fixed.map((h) => (
                      <li key={h}>{h}</li>
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
