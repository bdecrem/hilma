import { closedOn, openCounts, type BoardData } from '@/lib/venture/board'
import { href } from '../Shell'
import { Health, StudioLine } from '../health'
import { firstLink, inline } from '../inline'
import { clock, dayShort, pday, shiftDay, since } from '../time'
import { LearningFigures, sweepStats } from './Learning'

// Home (app.kochitolabs.com/): what needs Bart and the state of things, on one screen at 1440 x 900.
// Top to bottom: Check-in agenda (the journal's "Check-in list": what the next daily check-in goes
// through, each item with a link to read up on it during the call; Bart, Nov 19, 2026: "the agenda
// for the check-in list should be on the app homepage, and it should have a link to each item");
// Needs you (everything else that waits on him, nothing that is already on the agenda, every line
// with something to click); Issues (the open count beside yesterday's, every ticket blocking on him
// as a link, and who is working or since when no one is: OLA-211, OLA-212);
// Health (the one reading) and This week in the plan beside Learning (the two headline figures
// and the latest daily sweep in a line; the rest is on the Learning page). No issue list other
// than Needs you and the tickets blocking on him: every issue is listed in the Issue Tracker only.

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const firstSentence = (s: string) => plain(s).split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? ''

export default function Home({ d, base }: { d: BoardData; base: string }) {
  const now = d.now
  const today = d.today
  const issues = d.issues ?? []
  const T = (qs: string) => `${href(base, '/issues')}?${qs}`
  const issueHref = (id: string) => `${href(base, '/issues')}/${id}`
  const L = (text: string) => inline(text, issueHref)
  const ids = (text: string) => text.match(/\bOLA-\d+\b/g) ?? []
  const agenda = d.journal.checkin.filter((x) => !/^nothing/i.test(x))
  const onAgenda = new Set(agenda.flatMap(ids))
  // Needs you: what waits on him and is not already on the agenda (no item is shown twice)
  const waiting = issues.filter((i) => i.status === 'waiting' && !onAgenda.has(i.id)).sort((a, b) => a.priority.localeCompare(b.priority))
  const toDecide = d.journal.toDecide.filter((x) => !/^nothing/i.test(x.text) && !ids(x.text).some((id) => onAgenda.has(id)))
  const needs = waiting.length + toDecide.length
  // Issues (Bart, Nov 19, OLA-212: "rename it from Now to Issues and just list them as bullets ...
  // the layout is passive and discourages me from engaging"): the open count and yesterday's, both
  // from the tracker's records; every ticket waiting on him, each a link; who is working (OLA-211).
  const open = openCounts(issues, Date.parse(now))
  const blocking = issues.filter((i) => i.status === 'waiting').sort((a, b) => a.priority.localeCompare(b.priority) || a.num - b.num)
  const lead = d.lead
  const when = (t: string) => (pday(t) === today ? clock(t) : `${dayShort(pday(t))}, ${clock(t)}`)

  // the plan's current week
  const plan = d.plan
  const week = plan?.weeks.find((w) => today <= shiftDay(w.to, 2)) ?? plan?.weeks[plan.weeks.length - 1]
  const daysLeft = week ? Math.max(0, Math.round((Date.parse(`${week.to}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400e3) + 1) : 0
  const tagged = week ? issues.filter((i) => i.week === week.n) : []
  const taggedDone = tagged.filter((i) => i.status === 'done').length
  // the day's count (OLA-300): tickets closed today and the last seven days, and how many Ola built
  const closedToday = closedOn(issues, today)
  const closedWeek = [0, 1, 2, 3, 4, 5, 6].map((n) => closedOn(issues, shiftDay(today, -n))).reduce((a, b) => ({ closed: a.closed + b.closed, ola: a.ola + b.ola }), { closed: 0, ola: 0 })

  // learning: the two headline figures and the latest sweep in a line
  const sweep = sweepStats(d.sweeps, today)

  return (
    <>
      <div className="bd-head">
        <h1>Home</h1>
        <p className="m">{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}, {clock(now)}</p>
      </div>

      <section className="bd-sec" style={{ marginTop: 0 }} aria-labelledby="agenda-h">
        <h2 id="agenda-h">
          Check-in agenda <span className="bd-n">{agenda.length}</span>
        </h2>
        {agenda.length === 0 ? (
          <p className="bd-empty">Nothing is on the agenda for the next check-in.</p>
        ) : (
          <ol className="bd-rows bd-needs bd-agenda">
            {agenda.map((x, n) => {
              const to = firstLink(x, issueHref)
              return (
                <li key={n}>
                  <div className="row">
                    <span className="kind">{n + 1}</span>
                    <span className="what">{L(x)}</span>
                    <span className="since">{to && <a href={to.href}>{to.label}</a>}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="bd-sec" aria-labelledby="needs-h">
        <h2 id="needs-h">
          Needs you <span className={`bd-n${needs ? ' red' : ''}`}>{needs}</span>
        </h2>
        {needs === 0 ? (
          <p className="bd-empty">{agenda.length ? 'Nothing else needs you.' : 'Nothing needs you.'}</p>
        ) : (
          <ol className="bd-rows bd-needs">
            {waiting.map((i) => (
              <li key={i.id}>
                <a href={issueHref(i.id)}>
                  <span className="kind">{i.id}</span>
                  <span className="bd-cut" title={`${i.title}${i.what ? ` — ${i.what}` : ''}`}>
                    {i.title}
                    {i.what && <span className="do">{firstSentence(i.what)}</span>}
                  </span>
                  <span className="since">{since(i.updated_at ?? i.opened_at, now)}</span>
                </a>
              </li>
            ))}
            {toDecide.map((x, n) => {
              const to = firstLink(x.text, issueHref)
              return (
                <li key={`d${n}`}>
                  <div className="row">
                    <span className="kind">decide</span>
                    <span className="bd-cut" title={plain(x.text)}>
                      {L(x.text)}
                      <span className="do">settle it on a call or by text</span>
                    </span>
                    <span className="since">{to ? <a href={to.href}>{to.label}</a> : /\d/.test(x.tag) ? `since ${x.tag}` : x.tag.replace(/:$/, '')}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="bd-sec" aria-labelledby="issues-h">
        <h2 id="issues-h">Issues</h2>
        {d.issues === null ? (
          <p className="bd-empty">The tracker is not set up yet.</p>
        ) : (
          <ul className="bd-issues">
            <li>
              Open issues:{' '}
              <a href={T('tab=open')} className="num">
                {open.n}
              </a>{' '}
              <span className="faint">(yesterday: {open.yesterday})</span>
            </li>
            <li>
              Blocking on input from you:{' '}
              <a href={T('tab=waiting')} className={`num${blocking.length ? ' red' : ''}`}>
                {blocking.length}
              </a>
              {blocking.length > 0 && (
                <ul>
                  {blocking.map((i) => (
                    <li key={i.id}>
                      <a href={issueHref(i.id)}>
                        <span className="id">{i.id}</span> {i.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
            <li className={lead.idle ? 'idle' : ''}>
              {lead.working ? (
                <>
                  Working on <a href={issueHref(lead.working.id)}>{lead.working.id}</a> since {when(lead.working.since)}
                  {lead.working.who !== 'runner' && <span className="faint"> ({lead.working.who})</span>}
                </>
              ) : (
                <>
                  Idle since {lead.lastActive ? when(lead.lastActive) : 'the start'}, {open.n} open
                </>
              )}
              {lead.paused && <span className="faint"> · {lead.paused.kind === 'error' ? 'paused after a failed start' : 'the plan’s limit was reached'}, starts again {when(lead.paused.until)}</span>}
            </li>
          </ul>
        )}
      </section>

      <div className="bd-home-grid">
        <div>
          <section className="bd-sec" id="health" aria-labelledby="health-h">
            <h2 id="health-h">Health</h2>
            <Health s={d.status} now={now} />
            <StudioLine s={d.studio} now={now} />
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
            <a className="bd-week-line" href={`${href(base, '/issues')}?tab=done`}>
              <span className="bd-cut">
                Closed today: {closedToday.closed}, {closedToday.ola} built by Ola
              </span>
              <span className="m faint">
                last 7 days: {closedWeek.ola} of {closedWeek.closed} by Ola
              </span>
              <span className="bar" aria-hidden="true">
                <i style={{ width: closedWeek.closed ? `${Math.round((closedWeek.ola / closedWeek.closed) * 100)}%` : 0 }} />
              </span>
            </a>
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
