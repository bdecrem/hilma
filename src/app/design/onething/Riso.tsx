import Doodle from './Doodle'
import { DAYS, TODAY, STREAK, LEVEL, yearSoFar } from './data'

/* Concept 2 — Riso. A two- and three-colour risograph zine: flat ink on
 * cream, colours overprinting each other slightly off register, halftone dots
 * and grain instead of light. Loud, but printed, never lit. */

const TINT = ['sun', 'blue', 'red', 'lime'] as const

/** Text printed twice, a second drum slightly off register. */
function Over({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rz-over ${className}`}>
      <span className="rz-over-a" aria-hidden>{children}</span>
      <span className="rz-over-b">{children}</span>
    </span>
  )
}

/** A doodle printed on two drums: the line in one ink, the misprint in another. */
function Print({ svg, className = '' }: { svg: string; className?: string }) {
  return (
    <span className={`rz-print ${className}`}>
      <Doodle svg={svg} className="rz-dd a" />
      <Doodle svg={svg} className="rz-dd b" />
    </span>
  )
}

function Card({ day, i }: { day: (typeof DAYS)[number]; i: number }) {
  if (!day.text) {
    return (
      <li className="rz-card missed">
        <span className="rz-date">{day.dow.toUpperCase()} {day.d}</span>
        <p className="rz-gap">— blank page —</p>
      </li>
    )
  }
  return (
    <li className={`rz-card t-${TINT[i % TINT.length]}`}>
      <span className="rz-date">{day.dow.toUpperCase()} {day.d}</span>
      {day.svg && <Print svg={day.svg} />}
      <p className="rz-text">{day.text}</p>
    </li>
  )
}

function Masthead({ right }: { right: React.ReactNode }) {
  return (
    <header className="rz-mast">
      <span className="rz-mark">onething</span>
      <span className="rz-issue">{right}</span>
    </header>
  )
}

export function RisoLanding() {
  return (
    <div className="rz">
      <Masthead right={<>Nº 289 · Fri 16 Oct</>} />

      <section className="rz-hero">
        <span className="rz-sun" aria-hidden />
        <span className="rz-one" aria-hidden>1</span>
        <h1 className="rz-h1">
          <span>One sentence</span> <span>a day.</span>
          <Over className="rz-h1-b">A doodle for every one.</Over>
        </h1>
      </section>

      <div className="rz-body">
        <p className="rz-lede">A journal that lives in your texts. One question at ten. One line back. Opus draws it.</p>
        <a className="rz-btn" href="#rz-start"><span>Start your year →</span></a>

        <section className="rz-how">
          {[
            ['10:00', 'A text asks what the one thing was.'],
            ['YOU', 'Answer in a sentence. That’s the whole job.'],
            ['INK', 'It comes back as a doodle on your page.'],
          ].map(([k, v], i) => (
            <div key={k} className={`rz-step t-${TINT[(i + 1) % 4]}`}>
              <span className="rz-step-k">{k}</span>
              <p>{v}</p>
            </div>
          ))}
        </section>

        <h2 className="rz-h2">From last week&rsquo;s issue</h2>
        <ul className="rz-cards">
          {DAYS.slice(1, 5).map((d, i) => <Card key={d.iso} day={d} i={i} />)}
        </ul>

        <section className="rz-start" id="rz-start">
          <h2 className="rz-h2 big">Start your year.</h2>
          <input className="rz-input" inputMode="tel" placeholder="Phone number" />
          <button className="rz-btn ink" type="button"><span>Text me a code</span></button>
          <p className="rz-fine">iMessage only. No password, nothing to install.</p>
        </section>
      </div>
      <footer className="rz-foot">printed with care by Bart</footer>
    </div>
  )
}

export function RisoJournal() {
  const year = yearSoFar()
  const kept = year.flatMap((m) => m.days).filter(Boolean).length
  return (
    <div className="rz">
      <Masthead right={<>Bart&rsquo;s year · {LEVEL}</>} />

      <section className="rz-streak">
        <Over className="rz-big">{STREAK}</Over>
        <span className="rz-streak-l">days<br />running</span>
        <span className="rz-streak-r"><b>{kept}</b> kept<br />this year</span>
      </section>

      <section className="rz-today">
        <span className="rz-date">TODAY · FRI 16 OCT</span>
        <p className="rz-today-text">{TODAY.text}</p>
        {TODAY.svg && <Print svg={TODAY.svg} className="big" />}
        <div className="rz-actions"><span>Edit</span><span>+ Thought</span><span>+ Picture</span></div>
      </section>

      <div className="rz-body">
        <h2 className="rz-h2">This week</h2>
        <ul className="rz-cards">
          {DAYS.slice(1).map((d, i) => <Card key={d.iso} day={d} i={i} />)}
        </ul>

        <h2 className="rz-h2">The year so far</h2>
        <div className="rz-year">
          {year.slice(0, 10).map((m, mi) => (
            <div key={m.month} className="rz-yrow">
              <span>{m.month.toUpperCase()}</span>
              <span className="rz-ycells">
                {m.days.map((k, i) => <i key={i} className={k === null ? 'fut' : k ? `on t-${TINT[(mi + i) % 4]}` : 'off'} />)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <footer className="rz-foot">Texts come at ten in the morning, and at ten at night if the day is still empty.</footer>
    </div>
  )
}
