'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DodoGallery, Jellies } from './Dodo'
import { Parrot, type Mood } from './Parrot'
import { LOOKS, ORDER, PALETTE, SCREENS, TYPE, WORKING_NAME, type MapState, type ScreenId } from './content'
import { ThemeProvider } from '../_walk/Mascot'
import { Screen as WalkScreen } from '../_walk/Walk'
import { Screen, resetGame, type Go } from './screens'

type Pos = { id: ScreenId; map: MapState; key: number }
const noop: Go = () => {}

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
            {WORKING_NAME}: talk for three minutes, say three things back, play ten cards. Every day.
          </p>
          <nav className="hf-toc" aria-label="On this page">
            <a href="#day">
              <i>1</i>The day
            </a>
            <a href="#look">
              <i>2</i>The look
            </a>
            <a href="#looks">
              <i>3</i>Other directions
            </a>
            <a href="#dodo">
              <i>4</i>Dodo
            </a>
            <a className="hf-toc-out" href="/design/daily-call">
              v1 spec ↗
            </a>
          </nav>
        </header>

        <section className="hf-ch hf-day" id="day">
          <div className="hf-day-phone">
            <Phone>
              <Screen key={pos.key} id={pos.id} go={go} state={pos.map} />
            </Phone>
            <div className="hf-controls">
              <button className="hf-nav" onClick={prev} aria-label="Previous screen">
                ←
              </button>
              <div className="hf-current">
                <div className="hf-current-cap">
                  <b>{current?.name}</b>
                  <span>{current?.purpose}</span>
                </div>
                {pos.id === 'map' ? (
                  <div className="hf-pills" role="radiogroup" aria-label="Map state">
                    {MAP_STATES.map((m) => (
                      <button key={m.s} className={`hf-pill ${pos.map === m.s ? 'on' : ''}`} onClick={() => go('map', m.s)} role="radio" aria-checked={pos.map === m.s}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : pos.id === 'done' ? null : (
                  <button
                    className="hf-pill"
                    onClick={() => {
                      if (pos.id === 'cards') resetGame()
                      go(pos.id)
                    }}
                  >
                    ↺ Replay
                  </button>
                )}
              </div>
              <button className="hf-nav" onClick={next} aria-label="Next screen">
                →
              </button>
            </div>
          </div>

          <div className="hf-day-steps">
            <h2 className="hf-h2">
              <i>1</i>The day
            </h2>
            <ol className="hf-steps">
              {SCREENS.map((sc) => (
                <li key={sc.id}>
                  <div
                    className={`hf-stepr ${pos.id === sc.id ? 'on' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={pos.id === sc.id}
                    onClick={() => show(sc.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        show(sc.id)
                      }
                    }}
                  >
                    <span className="hf-thumb-ph" aria-hidden>
                      <span className="p2 thumb" inert>
                        <Screen id={sc.id} go={noop} state={sc.id === 'map' ? pos.map : undefined} still />
                      </span>
                    </span>
                    <span className="hf-stepr-text">
                      <b>{sc.name}</b>
                      <span>{sc.purpose}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <p className="hf-loopline">↻ Misses come back in tomorrow&rsquo;s call. That&rsquo;s the loop.</p>
          </div>
        </section>

        <section className="hf-ch" id="look">
          <h2 className="hf-h2">
            <i>2</i>The look
          </h2>
          <div className="hf-sys">
            <div className="hf-sys-colors">
              {PALETTE.map((pl) => (
                <div key={pl.name} className="hf-chip">
                  <i style={{ background: pl.value }} />
                  <b>{pl.name}</b>
                  <code>{pl.value}</code>
                </div>
              ))}
            </div>
            <div className="hf-sys-type">
              {TYPE.map((t, i) => (
                <div key={t.name} className="hf-spec">
                  <span className={`hf-sample ${i === 0 ? 'display' : i === 1 ? 'serif' : 'ui'}`}>{t.sample}</span>
                  <small>
                    {t.name} · {t.role}
                  </small>
                </div>
              ))}
            </div>
            <div className="hf-sys-moods">
              {(['idle', 'talking', 'listening', 'happy'] as Mood[]).map((m) => (
                <div key={m} className="hf-moodc">
                  <Parrot size={88} mood={m} />
                  <small>{m}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hf-ch" id="looks">
          <h2 className="hf-h2">
            <i>3</i>Other directions
          </h2>
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

        <section className="hf-ch" id="dodo">
          <h2 className="hf-h2">
            <i>4</i>Dodo, for reference
            <small>Borrow the craft, not the cast.</small>
          </h2>
          <div className="hf-dodo">
            <DodoGallery />
            <Jellies />
          </div>
        </section>
      </div>
    </div>
  )
}
