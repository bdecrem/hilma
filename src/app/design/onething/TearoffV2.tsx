import Doodle from './Doodle'
import { OCTOBER, TODAY, type Moment } from './data'

/* Tear-off v2 — the signed-in main view, mid-October. The pad holds the days
 * still to come, so today is the top sheet: blank in the morning, written by
 * evening. The days already lived are torn off and kept in a pile below,
 * newest first. */

const WD: Record<string, string> = { Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY', Thu: 'THURSDAY', Fri: 'FRIDAY', Sat: 'SATURDAY', Sun: 'SUNDAY' }
const tone = (dow: string) => (dow === 'Sun' ? 'sun' : dow === 'Sat' ? 'sat' : '')

/** A ragged top edge: the sheet came off the pad by hand. Seeded per day. */
function torn(seed: number) {
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const pts: string[] = []
  for (let i = 0; i <= 20; i++) pts.push(`${i * 5}% ${(1 + rnd() * 6).toFixed(1)}px`)
  return `polygon(${pts.join(', ')}, 100% 100%, 0% 100%)`
}

export default function TearoffV2({ moment }: { moment: Moment }) {
  const written = moment === 'evening'
  const streak = written ? 7 : 6
  const pile = [...OCTOBER].reverse()
  const kept = OCTOBER.filter((d) => d.text).length + (written ? 1 : 0)
  return (
    <div className="to tv">
      <div className="to-col">
        <header className="to-head">
          <span className="to-mark">onething<i>.</i></span>
          <span className="tv-me"><b>{streak}</b> day streak<i>B</i></span>
        </header>

        <div className="tv-pad">
          <span className="to-binding" aria-hidden><i /><i /></span>
          <div className="tv-sheet">
            <div className="to-sheet-top"><span>OCTOBER 2026</span><span>{WD[TODAY.dow]}</span></div>
            <div className="to-num tv-num">{TODAY.d}</div>
            {written ? (
              <>
                {TODAY.svg && <Doodle svg={TODAY.svg} className="to-dd" />}
                <p className="to-text">{TODAY.text}</p>
                <div className="tv-acts"><span>Edit</span><span>+ Thought</span><span>+ Picture</span></div>
              </>
            ) : (
              <div className="tv-write">
                <p className="tv-q">What was the one thing today?</p>
                <textarea className="tv-lines" rows={3} aria-label="Today’s sentence" />
                <div className="tv-row">
                  <span className="tv-or">or reply to the 10:00 text</span>
                  <button type="button" className="tv-keep">Keep it</button>
                </div>
              </div>
            )}
          </div>
          <span className="tv-stack" aria-hidden />
          <span className="tv-left">76 pages left in 2026</span>
        </div>

        <section className="tv-pile-sec">
          <h2 className="tv-h2"><span>The pile</span><span className="tv-sub">October · {kept} kept</span></h2>
          <div className="tv-pile">
            {pile.map((d, k) => (
              <article key={d.iso} className={`tv-torn ${tone(d.dow)} ${d.text ? '' : 'blank'}`} style={{ clipPath: torn(d.d), transform: `rotate(${(k % 3 - 1) * 1.4}deg)` }}>
                <div className="tv-torn-top"><b>{d.d}</b><span>{d.dow.toUpperCase()}</span></div>
                {d.text ? (
                  <>
                    {d.svg && <Doodle svg={d.svg} className="tv-torn-dd" />}
                    <p>{d.text}</p>
                  </>
                ) : <p className="tv-none">no page</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="tv-month">
          <div className="tv-bar" aria-label={`October: day 16 of 31`}>
            {Array.from({ length: 31 }, (_, i) => {
              const d = i + 1
              const day = OCTOBER.find((x) => x.d === d)
              const cls = d === 16 ? (written ? 'on today' : 'today') : d > 16 ? 'fut' : day?.text ? 'on' : 'off'
              return <i key={d} className={cls} />
            })}
          </div>
          <div className="tv-bar-l"><span>Oct 1</span><span>today</span><span>Oct 31</span></div>
          <p className="tv-stats"><b>{written ? 211 : 210}</b> pages this year · <b>Sapling</b>, {written ? 22 : 23} days to Young tree</p>
        </section>

        <footer className="to-foot">Texts come at ten in the morning, and at ten at night if the day is still empty.</footer>
      </div>
    </div>
  )
}
