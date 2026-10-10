'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LOOP, type MapState, type ScreenId } from '../daily-call-v2/content'
import { ThemeProvider, type Theme } from './Mascot'
import { Screen, resetGame, type Go } from './Walk'

type Pos = { id: ScreenId; map: MapState; key: number }
export type Other = { href: string; label: string }

function slideOf(pos: Pos) {
  if (pos.id === 'map') return pos.map === 'done' ? 5 : 0
  return { talk: 1, things: 2, cards: 3, done: 4 }[pos.id]
}
function labelOf(pos: Pos) {
  if (pos.id === 'map') return pos.map === 'morning' ? 'Map, morning' : pos.map === 'done' ? 'Map, done' : 'Map'
  return LOOP[slideOf(pos)].label
}

/* A styled walkthrough as slides: the phone on a stage, one slide per step
   of the day, the phone itself fully tappable. The theme is a class on the
   root plus a mascot; everything else is the shared engine. */
export function Slides({ theme, title, blurb, others }: { theme: Theme; title: string; blurb: string; others: Other[] }) {
  const [pos, setPos] = useState<Pos>({ id: 'map', map: 'morning', key: 0 })
  const go: Go = useCallback((id, state) => setPos((p) => ({ id, map: state ?? p.map, key: p.key + 1 })), [])
  const slide = slideOf(pos)
  const jump = useCallback(
    (n: number) => {
      const s = LOOP[((n % LOOP.length) + LOOP.length) % LOOP.length]
      if (s.id === 'cards') resetGame()
      go(s.id, s.state)
    },
    [go],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') jump(slide - 1)
      if (e.key === 'ArrowRight') jump(slide + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slide, jump])

  // Scale the 395x832 phone to the stage: never wider than the stage, never
  // taller than the stage minus a little air, never above 1.
  const stage = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const update = () => setScale(Math.max(0.35, Math.min(1, (el.clientWidth - 32) / 395, (el.clientHeight - 16) / 832)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <ThemeProvider value={theme}>
      <div className={`sl theme-${theme}`}>
        <header className="sl-head">
          <div className="sl-title">
            {title}
            <small>{blurb}</small>
          </div>
          <nav className="sl-nav" aria-label="Other styles">
            {others.map((o) => (
              <a key={o.href} href={o.href}>
                {o.label}
              </a>
            ))}
          </nav>
        </header>
        <div className="sl-stage" ref={stage}>
          <div className="sl-phone-slot" style={{ height: Math.round(832 * scale) }}>
            <div className="sl-phone" style={{ transform: `scale(${scale})` }}>
              <div className="w">
                <Screen key={pos.key} id={pos.id} go={go} state={pos.map} />
              </div>
            </div>
          </div>
        </div>
        <footer className="sl-foot">
          <div className="sl-row">
            <button className="sl-arrow" onClick={() => jump(slide - 1)} aria-label="Previous slide">
              ←
            </button>
            <div className="sl-label">
              {labelOf(pos)}
              <small>
                {slide + 1} of {LOOP.length}
              </small>
            </div>
            <button className="sl-arrow" onClick={() => jump(slide + 1)} aria-label="Next slide">
              →
            </button>
          </div>
          <div className="sl-dots" role="tablist" aria-label="Slides">
            {LOOP.map((s, i) => (
              <button key={i} className={i === slide ? 'on' : ''} onClick={() => jump(i)} role="tab" aria-selected={i === slide} aria-label={s.label} />
            ))}
          </div>
          <div className="sl-hint">Tap anything in the phone. The walkthrough plays the whole call, one of the three things, two of the ten cards.</div>
        </footer>
      </div>
    </ThemeProvider>
  )
}
