import type { BoardData } from '@/lib/venture/board'
import { href } from '../Shell'
import { Health } from '../health'
import { inline } from '../inline'
import { ago, clock, dayShort, pday, shiftDay, since } from '../time'
import { LearningFigures, sweepStats } from './Learning'

// Home (app.kochitolabs.com/): what needs Bart and the state of things, on one screen at 1440 x 900.
// Top to bottom: Needs you; Now (counts that open the tracker filtered, and Kit's latest "Now");
// Health (the one reading) and This week in the plan beside Learning (the two headline figures
// and the latest daily sweep in a line; the rest is on the Learning page). No issue list
// other than Needs you: every issue is listed in the Issue Tracker only.

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const firstSentence = (s: string) => plain(s).split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? ''
const LEAD_STALE = 3 * 3600e3

export default function Home({ d, base }: { d: BoardData; base: string }) {
  const now = d.now
  const today = d.today
  const issues = d.issues ?? []
  const T = (qs: string) => `${href(base, '/issues')}?${qs}`
  const waiting = issues.filter((i) => i.status === 'waiting').sort((a, b) => a.priority.localeCompare(b.priority))
  const toDecide = d.journal.toDecide
  const checkin = d.journal.checkin.filter((x) => !/^nothing/i.test(x))
  const needs = waiting.length + toDecide.length + checkin.length
  const count = {
    doing: issues.filter((i) => i.status === 'in_progress').length,
    next: issues.filter((i) => i.status === 'open').length,
    waiting: waiting.length,
    doneToday: issues.filter((i) => i.status === 'done' && i.day === today).length,
    openedToday: issues.filter((i) => pday(i.opened_at) === today).length,
  }
  const nowText = plain(d.journal.now.replace(/^\*([^*]+)\*\s*/, ''))
  const leadStale = !d.journal.at || Date.parse(now) - Date.parse(d.journal.at) > LEAD_STALE

  // the plan's current week
  const plan = d.plan
  const week = plan?.weeks.find((w) => today <= shiftDay(w.to, 2)) ?? plan?.weeks[plan.weeks.length - 1]
  const daysLeft = week ? Math.max(0, Math.round((Date.parse(`${week.to}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400e3) + 1) : 0
  const tagged = week ? issues.filter((i) => i.week === week.n) : []
  const taggedDone = tagged.filter((i) => i.status === 'done').length

  // learning: the two headline figures and the latest sweep in a line
  const sweep = sweepStats(d.sweeps, today)

  return (
    <>
      <div className="bd-head">
        <h1>Home</h1>
        <p className="m">{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}, {clock(now)}</p>
      </div>

      <section className="bd-sec" style={{ marginTop: 0 }} aria-labelledby="needs-h">
        <h2 id="needs-h">
          Needs you <span className={`bd-n${needs ? ' red' : ''}`}>{needs}</span>
        </h2>
        {needs === 0 ? (
          <p className="bd-empty">Nothing needs you.</p>
        ) : (
          <ol className="bd-rows bd-needs">
            {waiting.map((i) => (
              <li key={i.id}>
                <a href={`${href(base, '/issues')}/${i.id}`}>
                  <span className="kind">{i.id}</span>
                  <span className="bd-cut" title={`${i.title}${i.what ? ` — ${i.what}` : ''}`}>
                    {i.title}
                    {i.what && <span className="do">{firstSentence(i.what)}</span>}
                  </span>
                  <span className="since">{since(i.updated_at ?? i.opened_at, now)}</span>
                </a>
              </li>
            ))}
            {toDecide.map((x, n) => (
              <li key={`d${n}`}>
                <div className="row">
                  <span className="kind">decide</span>
                  <span className="bd-cut" title={plain(x.text)}>
                    {inline(x.text)}
                    <span className="do">settle it on a call or by text</span>
                  </span>
                  <span className="since">{/\d/.test(x.tag) ? `since ${x.tag}` : x.tag.replace(/:$/, '')}</span>
                </div>
              </li>
            ))}
            {checkin.map((x, n) => (
              <li key={`c${n}`}>
                <div className="row">
                  <span className="kind">check-in</span>
                  <span className="bd-cut" title={plain(x)}>
                    {inline(x)}
                    <span className="do">for the next call</span>
                  </span>
                  <span className="since" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="bd-sec" aria-labelledby="now-h">
        <h2 id="now-h">Now</h2>
        {d.issues === null ? (
          <p className="bd-empty">The tracker is not set up yet.</p>
        ) : (
          <nav className="bd-now" aria-label="Work by status">
            <a href={T('tab=doing')}>
              Doing <b>{count.doing}</b>
            </a>
            <a href={T('tab=next')}>
              Next up <b>{count.next}</b>
            </a>
            <a href={T('tab=waiting')} className={count.waiting ? 'hot' : ''}>
              Waiting on you <b>{count.waiting}</b>
            </a>
            <a href={T('tab=done&day=today')}>
              Done today <b>{count.doneToday}</b>
            </a>
            <a href={T('tab=all&opened=today')}>
              Opened today <b>{count.openedToday}</b>
            </a>
          </nav>
        )}
        {nowText && (
          <p className={`bd-lead${leadStale ? ' stale' : ''}`} title={nowText}>
            <span className="m">Kit, {d.journal.at ? (pday(d.journal.at) === today ? clock(d.journal.at) : ago(d.journal.at, now)) : 'never'}</span>
            {nowText}
          </p>
        )}
      </section>

      <div className="bd-home-grid">
        <div>
          <section className="bd-sec" id="health" aria-labelledby="health-h">
            <h2 id="health-h">Health</h2>
            <Health s={d.status} now={now} />
          </section>
          <section className="bd-sec" aria-labelledby="week-h">
            <h2 id="week-h">This week in the plan</h2>
            {plan && week ? (
              <a className="bd-week-line" href={href(base, '/plan')}>
                <span className="bd-cut">
                  Week {week.n} of {plan.weeks.length}: {week.title}, {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                </span>
                <span className="m faint">
                  {taggedDone} of {tagged.length} done
                </span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: tagged.length ? `${Math.round((taggedDone / tagged.length) * 100)}%` : 0 }} />
                </span>
              </a>
            ) : (
              <p className="bd-empty">No plan found.</p>
            )}
          </section>
        </div>
        <section className="bd-sec" aria-labelledby="learn-h">
          <h2 id="learn-h">
            Learning <a href={href(base, '/learning')}>All learning</a>
          </h2>
          <LearningFigures l={d.learning} now={now} />
          {sweep.latest ? (
            <a className={`bd-sweep-line${sweep.missed.length ? ' owed' : ''}`} href={`${href(base, '/learning')}#d-${sweep.latest.day}`} title={plain(sweep.latest.summary)}>
              <span className="m">Sweep, {sweep.latest.day === today ? 'today' : dayShort(sweep.latest.day)}</span>
              <span className="bd-cut">{plain(sweep.latest.summary)}</span>
              <span className="m faint">
                {sweep.latest.kit.length + sweep.latest.ola.length} {sweep.latest.kit.length + sweep.latest.ola.length === 1 ? 'change' : 'changes'}
              </span>
            </a>
          ) : (
            <p className="bd-learn-foot">
              <span className="m">The daily sweep has not run yet.</span>
            </p>
          )}
        </section>
      </div>
    </>
  )
}
