import Doodle from './Doodle'
import { OCTOBER, TODAY, colorOf, type Moment, type Day } from './data'

/* Stamps — the other halfway point. Every day you keep is a postage stamp
 * in an album: perforated edge, the day's colour behind the doodle, the
 * date as the denomination. Writing today prints today's stamp, and the
 * streak is the postmark that cancels it. */

function Stamp({ day, big = false }: { day: Day; big?: boolean }) {
  const c = colorOf(day.d)
  return (
    <div className={`st-stamp${big ? ' big' : ''}`} style={{ ['--sl' as string]: c.l, ['--sb' as string]: c.b, ['--sd' as string]: c.d }}>
      <div className="st-face">
        <span className="st-den">{day.d}</span>
        {day.svg && <Doodle svg={day.svg} className="st-dd" />}
        <span className="st-cap">{big ? `${day.dow.toUpperCase()} · OCT 2026` : day.dow.toUpperCase()}</span>
      </div>
    </div>
  )
}

function Postmark({ n }: { n: number }) {
  return (
    <svg className="st-post" viewBox="0 0 240 120" aria-label={`${n} days running`}>
      <defs><path id="st-ring" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" /></defs>
      <circle cx="60" cy="60" r="54" />
      <circle cx="60" cy="60" r="34" />
      <text className="st-ring"><textPath href="#st-ring" startOffset="0">ONETHING · DAYS RUNNING · ONETHING ·</textPath></text>
      <text x="60" y="70" textAnchor="middle" className="st-post-n">{n}</text>
      <path d="M118 36 q15 -8 30 0 t30 0 t30 0 t30 0 M118 60 q15 -8 30 0 t30 0 t30 0 t30 0 M118 84 q15 -8 30 0 t30 0 t30 0 t30 0" />
    </svg>
  )
}

export default function Stamps({ moment }: { moment: Moment }) {
  const written = moment === 'evening'
  const slots = Array.from({ length: 20 }, (_, i) => i + 1) // through the end of the row; the rest of the month is a line
  const count = OCTOBER.filter((d) => d.text).length + (written ? 1 : 0)
  return (
    <div className="st">
      <div className="st-col">
        <header className="st-head">
          <span className="st-mark">onething</span>
          <span className="st-who">Bart&rsquo;s album · 2026</span>
        </header>

        <section className="st-today">
          {written ? (
            <>
              <div className="st-big-wrap">
                <div className="st-cell"><Stamp day={TODAY} big /></div>
                <Postmark n={7} />
              </div>
              <p className="st-text">{TODAY.text}</p>
              <div className="st-acts"><span>Edit</span><span>+ Thought</span><span>+ Picture</span></div>
            </>
          ) : (
            <>
              <div className="st-big-wrap">
                <div className="st-slot big"><span>16</span><small>today&rsquo;s stamp goes here</small></div>
              </div>
              <p className="st-q">What was the one thing today?</p>
              <textarea className="st-input" rows={2} aria-label="Today’s sentence" placeholder="One sentence…" />
              <div className="st-row">
                <span className="st-or">or reply to the 10:00 text</span>
                <button type="button" className="st-keep">Print my stamp</button>
              </div>
            </>
          )}
        </section>

        <section className="st-album">
          <h2 className="st-h2"><span>October</span><span>{count} of 31</span></h2>
          <div className="st-grid">
            {slots.map((d) => {
              const day = d === 16 ? (written ? TODAY : null) : OCTOBER.find((x) => x.d === d) || null
              if (day?.text) return <div key={d} className="st-cell"><Stamp day={day} /></div>
              return <div key={d} className="st-cell"><div className={`st-slot ${d > 16 ? 'fut' : d === 16 ? 'now' : 'miss'}`}><span>{d}</span></div></div>
            })}
          </div>
          <p className="st-more">21 – 31 · eleven empty spaces still to fill</p>
          <p className="st-foot-l"><b>{written ? 211 : 210}</b> stamps this year · <b>Sapling</b> · {written ? 22 : 23} to Young tree</p>
        </section>
        <footer className="st-foot">Texts come at ten in the morning, and at ten at night if the day is still empty.</footer>
      </div>
    </div>
  )
}
