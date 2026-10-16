import Doodle from './Doodle'
import { OCTOBER, TODAY, colorOf, type Moment } from './data'

/* Cut paper — halfway between today's onething and Tear-off. Keeps the
 * brand: the six day colours, the ink drop, Bricolage, tilted tiles, the
 * colour flood at the top. Drops the light: every shape is flat coloured
 * paper, cut with scissors, stacked with a hard offset instead of a glow. */

const DROP = 'M50 4 C63 30 88 47 88 71 A38 36 0 0 1 12 71 C12 47 37 30 50 4 Z'

function Drop({ mood = 'happy', fill = '#7b4dff', shade = '#4a1fc4', className = '' }: { mood?: 'happy' | 'waiting'; fill?: string; shade?: string; className?: string }) {
  return (
    <svg className={`cp-drop ${className}`} viewBox="0 0 100 112" aria-hidden>
      <path d={DROP} fill={shade} transform="translate(4 5)" />
      <path d={DROP} fill={fill} />
      {mood === 'happy' ? (
        <>
          <path d="M34 70 q5 -6 10 0 M56 70 q5 -6 10 0" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M42 82 q8 8 16 0" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="40" cy="68" r="5.5" fill="#fff" />
          <circle cx="60" cy="68" r="5.5" fill="#fff" />
          <circle cx="41" cy="66" r="2.4" fill="#1d1630" />
          <circle cx="61" cy="66" r="2.4" fill="#1d1630" />
          <path d="M46 84 h8" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export default function CutPaper({ moment }: { moment: Moment }) {
  const written = moment === 'evening'
  const c = colorOf(TODAY.d)
  const week = [...OCTOBER].reverse().slice(0, 6)
  return (
    <div className="cp" style={{ ['--fl' as string]: c.b, ['--fd' as string]: c.d, ['--fll' as string]: c.l }}>
      <div className="cp-flood">
        <header className="cp-head">
          <span className="cp-mark">onething</span>
          <span className="cp-streak">{written ? 7 : 6} days</span>
        </header>
        <div className="cp-date">
          <span className="cp-num">{TODAY.d}</span>
          <span className="cp-dl">Friday<br />October</span>
        </div>
        <svg className="cp-cut" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden>
          <path d="M0 0 H400 V8 C370 20 350 4 320 12 C290 22 270 6 240 14 C210 22 190 6 160 13 C130 20 110 4 80 12 C50 22 30 6 0 14 Z" />
        </svg>
      </div>

      <div className="cp-col">
        <section className="cp-today">
          <Drop mood={written ? 'happy' : 'waiting'} className="cp-host" />
          {written ? (
            <div className="cp-card">
              <span className="cp-blob">{TODAY.svg && <Doodle svg={TODAY.svg} className="cp-dd" />}</span>
              <p className="cp-text">{TODAY.text}</p>
              <div className="cp-pills"><span>Edit</span><span>+ Thought</span><span>+ Picture</span></div>
            </div>
          ) : (
            <div className="cp-card">
              <p className="cp-q">What was the one thing today?</p>
              <textarea className="cp-input" rows={3} aria-label="Today’s sentence" placeholder="One sentence…" />
              <div className="cp-row">
                <span className="cp-hand">or just reply to my text</span>
                <button type="button" className="cp-keep">Keep it</button>
              </div>
            </div>
          )}
        </section>

        <h2 className="cp-h2">This week</h2>
        <div className="cp-wall">
          {week.map((d, k) => {
            const col = colorOf(d.d)
            return (
              <article key={d.iso} className={`cp-tile ${d.text ? '' : 'empty'}`} style={{ ['--tb' as string]: col.b, ['--td' as string]: col.d, ['--tl' as string]: col.l, transform: `rotate(${[-2, 1.5, -1, 2, -1.5, 1][k]}deg)` }}>
                <span className="cp-tile-n">{d.d}<small>{d.dow}</small></span>
                {d.text ? (
                  <>
                    <span className="cp-tile-blob">{d.svg && <Doodle svg={d.svg} className="cp-dd" />}</span>
                    <p>{d.text}</p>
                  </>
                ) : <p className="cp-hand">a day off</p>}
              </article>
            )
          })}
        </div>

        <h2 className="cp-h2">October <span className="cp-sub">{OCTOBER.filter((d) => d.text).length + (written ? 1 : 0)} drops</span></h2>
        <div className="cp-drops">
          {Array.from({ length: 31 }, (_, i) => {
            const d = i + 1
            const day = OCTOBER.find((x) => x.d === d)
            const col = colorOf(d)
            const kept = d === 16 ? written : !!day?.text
            const state = d > 16 ? 'fut' : d === 16 && !written ? 'now' : kept ? 'on' : 'off'
            return (
              <svg key={d} className={`cp-mini ${state}`} viewBox="0 0 100 112" aria-label={`October ${d}`}>
                <path d={DROP} style={state === 'on' ? { fill: col.b } : undefined} />
              </svg>
            )
          })}
        </div>
        <p className="cp-level"><b>Sapling</b> · {written ? 22 : 23} more days to Young tree</p>
        <footer className="cp-foot">made with care by Bart</footer>
      </div>
    </div>
  )
}
