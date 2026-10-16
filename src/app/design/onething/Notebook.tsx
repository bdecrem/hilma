import Doodle from './Doodle'
import { DAYS, TODAY, STREAK, LEVEL, NEXT_LEVEL, yearSoFar } from './data'

/* Concept 1 — Notebook. A pocket notebook on a desk: blue rules, a red margin,
 * one ballpoint for everything you wrote and everything drawn, a yellow
 * highlighter, and pencil notes in the margin. No gradients, no shadows but
 * the paper's own. */

const MON = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' } as Record<string, string>

function Tally({ n }: { n: number }) {
  // Groups of five: four uprights and a slash, drawn as one ballpoint path each.
  const groups = []
  for (let g = 0; g < Math.ceil(n / 5); g++) {
    const k = Math.min(5, n - g * 5)
    const ups = Array.from({ length: Math.min(k, 4) }, (_, i) => `M${4 + i * 8} ${3 + (i % 2)} L${3 + i * 8} 31`).join(' ')
    groups.push(
      <svg key={g} className="nb-tally" viewBox="0 0 34 34" aria-hidden>
        <path d={ups} />
        {k === 5 && <path d="M-1 24 L33 9" />}
      </svg>,
    )
  }
  return <span className="nb-tallies" aria-label={`${n} days`}>{groups}</span>
}

function Arrow({ d = 'M4 26 C 20 6, 44 4, 60 14', className = '' }: { d?: string; className?: string }) {
  return (
    <svg className={`nb-arrow ${className}`} viewBox="0 0 64 32" aria-hidden>
      <path d={d} />
      <path d="M50 8 L60 14 L49 20" />
    </svg>
  )
}

function Entry({ day, big = false }: { day: (typeof DAYS)[number]; big?: boolean }) {
  if (!day.text) {
    return (
      <li className="nb-entry missed">
        <span className="nb-date">{day.dow}<b>{day.d}</b></span>
        <p className="nb-gap">nothing — and that&rsquo;s fine</p>
      </li>
    )
  }
  return (
    <li className={`nb-entry${big ? ' big' : ''}`}>
      <span className="nb-date">{day.dow}<b>{day.d}</b></span>
      <p className="nb-text">{day.text}</p>
      {day.svg && <Doodle svg={day.svg} className="nb-dd" />}
    </li>
  )
}

export function NotebookLanding() {
  return (
    <div className="nb">
      <div className="nb-page">
        <header className="nb-head">
          <span className="nb-mark">onething</span>
          <a className="nb-link" href="#nb-start">Sign in</a>
        </header>

        <h1 className="nb-h1">
          One sentence a day. <mark>A doodle</mark> for every one.
        </h1>
        <p className="nb-lede">A journal that lives in your texts. Every morning at ten, one question. You answer in a line, and it comes back drawn.</p>

        <div className="nb-cta-row">
          <a className="nb-stamp" href="#nb-start">Start your year</a>
          <span className="nb-note nb-note-cta"><Arrow d="M60 22 C 44 30, 18 28, 6 12" className="flip" />ten seconds a day</span>
        </div>

        <section className="nb-how">
          <h2 className="nb-h2">How a day goes</h2>
          <div className="nb-chat">
            <span className="nb-time">10:00</span>
            <p className="nb-bubble them">What was the one thing today?</p>
            <p className="nb-bubble me">{DAYS[2].text}</p>
            <p className="nb-bubble them small">Kept. 3 days running.</p>
          </div>
          <div className="nb-result">
            <span className="nb-note nb-note-result">and on your page:<Arrow d="M6 6 C 10 20, 26 28, 52 26" /></span>
            <ul className="nb-list"><Entry day={DAYS[2]} /></ul>
          </div>
        </section>

        <section className="nb-week">
          <h2 className="nb-h2">A week of it</h2>
          <ul className="nb-list">
            {DAYS.slice(3, 7).map((d) => <Entry key={d.iso} day={d} />)}
          </ul>
          <p className="nb-note nb-note-end">by December, you have a year</p>
        </section>

        <section className="nb-start" id="nb-start">
          <h2 className="nb-h1 small">Start your year.</h2>
          <label className="nb-field">
            <span className="nb-note">your phone number</span>
            <input inputMode="tel" placeholder="(555) 555-0101" />
          </label>
          <button className="nb-stamp" type="button">Text me a code</button>
          <p className="nb-fine">iMessage only. No password, nothing to install.</p>
        </section>

        <footer className="nb-foot">made with care by Bart</footer>
      </div>
    </div>
  )
}

export function NotebookJournal() {
  const year = yearSoFar()
  const kept = year.flatMap((m) => m.days).filter(Boolean).length
  return (
    <div className="nb">
      <div className="nb-page">
        <header className="nb-head">
          <span className="nb-mark">onething</span>
          <span className="nb-link muted">Bart&rsquo;s year</span>
        </header>

        <div className="nb-streak">
          <Tally n={STREAK} />
          <span className="nb-streak-n"><b>{STREAK}</b> days running</span>
          <span className="nb-note nb-note-streak">missed the 9th — streak&rsquo;s back</span>
        </div>

        <section className="nb-today">
          <h1 className="nb-day"><mark>{MON[TODAY.dow]}, October {TODAY.d}</mark></h1>
          <p className="nb-today-text">{TODAY.text}</p>
          {TODAY.svg && <Doodle svg={TODAY.svg} className="nb-dd big" />}
          <p className="nb-actions"><a>edit</a> · <a>add a thought</a> · <a>tape in a picture</a></p>
        </section>

        <section>
          <h2 className="nb-h2">Earlier</h2>
          <ul className="nb-list">
            {DAYS.slice(1).map((d) => <Entry key={d.iso} day={d} />)}
          </ul>
        </section>

        <section className="nb-year">
          <h2 className="nb-h2">2026 so far <span className="nb-count">{kept} days</span></h2>
          <div className="nb-grid">
            {year.slice(0, 10).map((m) => (
              <div key={m.month} className="nb-month">
                <span className="nb-m">{m.month}</span>
                <span className="nb-dots">
                  {m.days.map((k, i) => <i key={i} className={k === null ? 'fut' : k ? 'on' : 'off'} />)}
                </span>
              </div>
            ))}
          </div>
          <p className="nb-level"><span className="nb-note">you&rsquo;re a</span> <b>{LEVEL}</b> <span className="nb-note">— 23 more days to {NEXT_LEVEL}</span></p>
        </section>

        <footer className="nb-foot">Texts come at ten in the morning, and at ten at night if the day is still empty.</footer>
      </div>
    </div>
  )
}
