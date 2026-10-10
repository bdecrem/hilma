'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DodoGallery, Jellies } from './Dodo'
import { Parrot, type Mood } from './Parrot'
import { LOOKS, LOOP, MOTION, ORDER, PALETTE, SCREENS, TYPE, WORKING_NAME, type MapState, type ScreenId } from './content'
import { ThemeProvider } from '../_walk/Mascot'
import { Screen as WalkScreen } from '../_walk/Walk'
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
          <div className="hf-eyebrow">Design artifact · v2 · October 9, 2026</div>
          <h1 className="hf-h1">Daily call, in color</h1>
          <p className="hf-dek">
            Talk for three minutes, say three things back, play ten cards. The map keeps the streak. Working name:{' '}
            {WORKING_NAME}.
          </p>
          <div className="hf-meta">
            <a href="#screens">Screens</a>
            <a href="#look">Look and feel</a>
            <a href="#dodo">Dodo, for reference</a>
            <a href="/design/daily-call">v1 spec →</a>
          </div>
        </header>

        <section className="hf-looks-bar" id="looks" aria-label="Three looks">
          <div className="hf-cap">Three looks · tap one to play it</div>
          <div className="hf-looks">
            {LOOKS.map((l) => (
              <a key={l.slug} className="hf-look" href={`/design/daily-call-${l.slug}`} title={l.blurb}>
                <ThemeProvider value={l.slug}>
                  <span className={`theme-${l.slug} hf-look-stage`} aria-hidden>
                    <span className="hf-look-ph">
                      <span className="w" inert>
                        <WalkScreen id="map" state="morning" go={() => {}} still />
                      </span>
                    </span>
                    <span className="hf-look-ph second">
                      <span className="w" inert>
                        <WalkScreen id="things" go={() => {}} still />
                      </span>
                    </span>
                  </span>
                </ThemeProvider>
                <span className="hf-look-name">
                  {l.name} <span aria-hidden>↗</span>
                </span>
              </a>
            ))}
          </div>
        </section>

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
                      {pos.id === 'talk'
                        ? 'Plays at 9×'
                        : pos.id === 'things'
                          ? 'Tap the mic when it turns red'
                          : 'One pick, one type. × keeps your place'}
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
              <div className="hf-strip">
                {LOOP.map((st, i) => (
                  <div key={`${st.id}-${i}`} className="hf-step">
                    {i > 0 ? (
                      <span className="hf-arrow" aria-hidden>
                        →
                      </span>
                    ) : null}
                    <Thumb id={st.id} state={st.state} label={st.label} on={isOn(st.id, st.state)} onClick={() => show(st.id, st.state)} />
                  </div>
                ))}
              </div>
            </section>

            <section className="hf-section" id="screens">
              <h2 className="hf-h2">Screens</h2>
              <div className="hf-screens">
                {SCREENS.map((sc) => (
                  <article key={sc.id} className={`hf-note hf-note-tight ${pos.id === sc.id ? 'on' : ''}`}>
                    <div>
                      <h3>
                        <button className="hf-note-title" onClick={() => show(sc.id)}>
                          {sc.name}
                        </button>
                      </h3>
                      <p className="hf-purpose">{sc.purpose}</p>
                      <ul>
                        {sc.notes.map((n) => (
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
              <div className="hf-swatches">
                {PALETTE.map((pl) => (
                  <div key={pl.name} className="hf-swatch">
                    <i style={{ background: pl.value, borderBottom: pl.value === '#FFF4E3' || pl.value === '#FFFDF8' ? '1px solid #ddd9d0' : undefined }} />
                    <div>
                      <b>{pl.name}</b>
                      <code>{pl.value}</code>
                      {pl.role}
                    </div>
                  </div>
                ))}
              </div>

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

              <div className="hf-moods">
                {(
                  [
                    ['idle', 'Idle'],
                    ['talking', 'Talking'],
                    ['listening', 'Listening'],
                    ['happy', 'Happy'],
                  ] as [Mood, string][]
                ).map(([m, label]) => (
                  <div key={m} className="hf-mood">
                    <Parrot size={96} mood={m} />
                    <b>{label}</b>
                  </div>
                ))}
              </div>

              <ul className="hf-motion">
                {MOTION.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>

            <section className="hf-section" id="dodo">
              <h2 className="hf-h2">Dodo, for reference</h2>
              <p className="hf-p">The team&rsquo;s other app. Borrow the craft, not the cast.</p>
              <div className="hf-dodo">
                <DodoGallery />
                <aside className="hf-jar">
                  <div className="hf-jar-head">
                    <b>The jellies</b>
                    <span>Every Dodo avatar. Poke one.</span>
                  </div>
                  <Jellies />
                </aside>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
