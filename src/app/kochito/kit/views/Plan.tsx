import type { BoardData } from '@/lib/venture/board'
import { href } from '../Shell'
import { inline } from '../inline'
import { dayShort, shiftDay } from '../time'

// Plan (app.kochitolabs.com/plan): the 30-day plan. The road (one cell a day from the start to the
// review, filled by how much was done that day, today outlined), then each week: its title, what it
// delivers, the Friday demo, and how many issues are tagged to it (a number that opens the tracker
// filtered by that week, never a list). The plan itself is the private note the board reads
// (PLAN_SLUG in src/lib/venture/board.ts).
export default function Plan({ d, base }: { d: BoardData; base: string }) {
  const plan = d.plan
  const today = d.today
  const issues = d.issues ?? []
  if (!plan)
    return (
      <>
        <div className="bd-head">
          <h1>Plan</h1>
        </div>
        <p className="bd-empty">No plan found.</p>
      </>
    )
  const len = Math.round((Date.parse(`${plan.end}T12:00:00Z`) - Date.parse(`${plan.start}T12:00:00Z`)) / 86400e3) + 1
  const done = (day: string) => issues.filter((i) => i.status === 'done' && i.day === day).length
  const road = Array.from({ length: len }, (_, n) => {
    const day = shiftDay(plan.start, n)
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
    return { day, n: done(day), off: dow === 0 || dow === 6, future: day > today, today: day === today, review: day === plan.end, monday: dow === 1 }
  })
  const top = Math.max(8, ...road.map((r) => r.n))
  const dayNo = Math.min(len, Math.max(1, road.findIndex((r) => r.day === today) + 1 || (today > plan.end ? len : 1)))
  const cur = plan.weeks.find((w) => today <= shiftDay(w.to, 2))
  return (
    <>
      <div className="bd-head">
        <h1>Plan</h1>
        <p>
          {plan.title}: day {dayNo} of {len}, from {dayShort(plan.start)} to the review on {dayShort(plan.end)}. <a href={`${href(base, '/notes')}/${plan.slug}`}>The whole plan</a>
        </p>
      </div>
      <section className="bd-sec" style={{ marginTop: 0 }} aria-labelledby="road-h">
        <h2 id="road-h">
          The road <span className="m faint">issues done each day</span>
        </h2>
        <ol className="bd-road" style={{ gridTemplateColumns: `repeat(${len}, minmax(0, 1fr))` }} aria-label={`Day ${dayNo} of ${len}`}>
          {road.map((r) => (
            <li key={r.day} className={`${r.future ? 'future' : ''}${r.off && !r.n ? ' off' : ''}${r.today ? ' today' : ''}${r.review ? ' review' : ''}`} title={`${dayShort(r.day)}: ${r.n} done${r.review ? ' (the review)' : ''}`}>
              <span className="cell">{r.n > 0 && <i style={{ height: `${Math.max(10, Math.round((r.n / top) * 100))}%` }} />}</span>
              <span className="d">{r.today ? 'today' : r.review ? 'review' : r.monday || r.day === plan.start ? Number(r.day.slice(8)) : ''}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="bd-sec" aria-labelledby="weeks-h">
        <h2 id="weeks-h">The weeks</h2>
        <ol className="bd-weeks">
          {plan.weeks.map((w) => {
            const tagged = issues.filter((i) => i.week === w.n)
            const dn = tagged.filter((i) => i.status === 'done').length
            return (
              <li key={w.n} className={cur?.n === w.n ? 'cur' : ''}>
                <div>
                  <h3>Week {w.n}</h3>
                  <p className="when">
                    {dayShort(w.from)} to {dayShort(w.to)}
                  </p>
                </div>
                <div>
                  <h3>{w.title}</h3>
                  {w.items.length > 0 && (
                    <ul style={{ marginTop: 4 }}>
                      {w.items.map((x, n) => (
                        <li key={n}>{inline(x)}</li>
                      ))}
                    </ul>
                  )}
                  {w.demo && (
                    <p className="demo">
                      <b>Friday demo:</b> {inline(w.demo)}
                    </p>
                  )}
                </div>
                <div className="tally">
                  <a href={`${href(base, '/issues')}?tab=all&week=${w.n}`}>
                    <b>{tagged.length}</b> {tagged.length === 1 ? 'issue' : 'issues'}
                  </a>
                  <p className="faint m">{dn} done</p>
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
