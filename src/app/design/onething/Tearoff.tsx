'use client'

import { useState } from 'react'
import Doodle from './Doodle'
import { DAYS, STREAK, LEVEL, octoberCell, yearSoFar } from './data'

/* Concept 3 — Tear-off. A Japanese tear-off day calendar (himekuri) on a
 * warm wall: one sheet per day, a giant numeral, Sundays in red, Saturdays in
 * blue, a perforated edge. The play is physical: tap the sheet and it tears
 * away to the day before. */

const WD: Record<string, string> = { Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY', Thu: 'THURSDAY', Fri: 'FRIDAY', Sat: 'SATURDAY', Sun: 'SUNDAY' }
const tone = (dow: string) => (dow === 'Sun' ? 'sun' : dow === 'Sat' ? 'sat' : '')

function Sheet({ day, className = '', onEnd }: { day: (typeof DAYS)[number]; className?: string; onEnd?: () => void }) {
  return (
    <div className={`to-sheet ${tone(day.dow)} ${className}`} onAnimationEnd={onEnd}>
      <div className="to-sheet-top"><span>OCTOBER 2026</span><span>{WD[day.dow]}</span></div>
      <div className="to-num">{day.d}</div>
      {day.text ? (
        <>
          {day.svg && <Doodle svg={day.svg} className="to-dd" />}
          <p className="to-text">{day.text}</p>
        </>
      ) : (
        <p className="to-text empty">Nothing written. The page stays.</p>
      )}
    </div>
  )
}

/** The pad: binding, the sheet on top, the stack showing underneath. Tap to tear. */
function Pad({ from = 0, hint = true }: { from?: number; hint?: boolean }) {
  const [i, setI] = useState(from)
  const [tearing, setTearing] = useState(false)
  const n = DAYS.length
  const cur = DAYS[i % n]
  const next = DAYS[(i + 1) % n]
  const tear = () => { if (!tearing) setTearing(true) }
  return (
    <div className="to-pad-wrap">
      <div role="button" tabIndex={0} className="to-pad" onClick={tear} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tear() } }} aria-label={`Tear off ${cur.dow} ${cur.d} to see the day before`}>
        <span className="to-binding" aria-hidden><i /><i /></span>
        <span className="to-stack" aria-hidden />
        <Sheet day={next} className="under" />
        <Sheet
          key={cur.iso}
          day={cur}
          className={tearing ? 'tearing' : ''}
          onEnd={() => { setTearing(false); setI((x) => x + 1) }}
        />
      </div>
      {hint && <p className="to-hint">tap the page to tear back a day</p>}
    </div>
  )
}

export function TearoffLanding() {
  return (
    <div className="to">
      <div className="to-col">
        <header className="to-head">
          <span className="to-mark">onething<i>.</i></span>
          <a className="to-link" href="#to-start">Sign in</a>
        </header>

        <Pad />

        <h1 className="to-h1">One sentence a day. A doodle for every one.</h1>
        <p className="to-lede">A journal that lives in your texts. A question at ten, a line back from you, and the day gets its page.</p>
        <a className="to-btn" href="#to-start">Start your year</a>

        <section className="to-how">
          {[
            ['10:00', 'A text asks what the one thing was.'],
            ['10:02', 'You answer in one sentence.'],
            ['10:03', 'Opus doodles it onto the day.'],
          ].map(([t, v]) => (
            <div key={t} className="to-how-row"><span className="to-how-t">{t}</span><p>{v}</p></div>
          ))}
        </section>

        <section className="to-start" id="to-start">
          <h2 className="to-h2">Start your year.</h2>
          <input className="to-input" inputMode="tel" placeholder="Phone number" />
          <button className="to-btn full" type="button">Text me a code</button>
          <p className="to-fine">iMessage only. No password, nothing to install.</p>
        </section>

        <footer className="to-foot">made with care by Bart</footer>
      </div>
    </div>
  )
}

export function TearoffJournal() {
  const year = yearSoFar()
  const kept = year.flatMap((m) => m.days).filter(Boolean).length
  // October 2026 starts on a Thursday; Sunday-first grid → 4 blanks.
  const cells: (number | null)[] = [...Array(4).fill(null), ...Array.from({ length: 31 }, (_, k) => k + 1)]
  while (cells.length % 7) cells.push(null)
  return (
    <div className="to">
      <div className="to-col">
        <header className="to-head">
          <span className="to-mark">onething<i>.</i></span>
          <span className="to-link muted">Bart&rsquo;s year</span>
        </header>

        <Pad hint={false} />
        <div className="to-today-bar"><span>Edit</span><span>+ Thought</span><span>+ Picture</span></div>

        <section className="to-stats">
          <div><b>{STREAK}</b><span>days running</span></div>
          <div><b>{kept}</b><span>pages kept</span></div>
          <div><b className="word">{LEVEL}</b><span>23 days to the next</span></div>
        </section>

        <section className="to-month">
          <h2 className="to-h2 row"><span>October</span><span className="to-yr">2026</span></h2>
          <div className="to-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, k) => <span key={k} className={`to-wd ${k === 0 ? 'sun' : k === 6 ? 'sat' : ''}`}>{w}</span>)}
            {cells.map((d, k) => {
              if (d === null) return <span key={k} className="to-cell blank" />
              const day = octoberCell(d)
              const col = k % 7
              const cls = `to-cell ${col === 0 ? 'sun' : col === 6 ? 'sat' : ''} ${!day ? 'future' : !day.text ? 'missed' : ''} ${d === 16 ? 'today' : ''}`
              return (
                <span key={k} className={cls}>
                  <span className="to-cell-n">{d}</span>
                  {day?.svg && <Doodle svg={day.svg} className="to-cell-dd" />}
                </span>
              )
            })}
          </div>
        </section>

        <footer className="to-foot">Texts come at ten in the morning, and at ten at night if the day is still empty.</footer>
      </div>
    </div>
  )
}
