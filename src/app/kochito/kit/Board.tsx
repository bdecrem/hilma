import type { BoardData, Issue } from '@/lib/venture/board'
import type { Overview } from '@/lib/venture/overview'
import Done from './Done'
import Shell, { Health, STATUS_STALE } from './Shell'
import { inline } from './inline'
import { IssueRow } from './IssueRow'
import { OverviewBadge, overviewLine } from './OverviewBadge'
import { ago, dayShort, shiftDay } from './time'

// The board's overview at app.kochitolabs.com, built around the project (Ola). Round two
// (2026-11-17, the plan is the private note BOARD-PLAN-2026-11-17): the project and its state;
// Needs you, pinned with a count; on the plate (doing, the next five); the plan as a road; Done
// (today and yesterday, the rest in the tracker at /issues); Independence; Decided; Numbers and
// the full live status. Key links and health live in the sidebar (Shell.tsx).
// The design note is at the top of the board's section in company.css.

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const MIN = 60e3
const LEAD_STALE = 3 * 60 * MIN

export default function Board({ d, o, q, user, face, base, variant = 'a' }: { d: BoardData; o: Overview; q: string; user: string; face: string; base: string; variant?: 'a' | 'b' }) {
  const now = d.now
  const age = (iso: string | null | undefined) => (iso ? Date.parse(now) - Date.parse(iso) : Infinity)
  const issues = d.issues ?? []
  const pri = (i: Issue) => Number(i.priority.slice(1))
  const doing = issues.filter((i) => i.status === 'in_progress').sort((a, b) => pri(a) - pri(b) || (a.started_at ?? '').localeCompare(b.started_at ?? ''))
  const next = issues.filter((i) => i.status === 'open').sort((a, b) => pri(a) - pri(b) || a.num - b.num)
  const waiting = issues.filter((i) => i.status === 'waiting')
  const doneOn = (day: string) => issues.filter((i) => i.status === 'done' && i.day === day).length
  const today = d.today
  const yesterday = shiftDay(today, -1)

  // the state line: the first sentence of the lead's Now, without its time stamp
  const nowText = plain(d.journal.now.replace(/^\*([^*]+)\*\s*/, ''))
  const stamp = d.journal.now.match(/^\*([^*]+)\*/)?.[1]?.replace(/\.$/, '')
  const firstSentence = nowText.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? ''
  const hour = Number(new Date(now).toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Los_Angeles' }))
  const leadStale = age(d.journal.at) > LEAD_STALE && hour >= 7 && hour < 23
  const s = d.status
  const projectName = d.journal.project.title.split(',')[0] || 'Ola'
  const projectWhat = d.journal.project.title.split(',').slice(1).join(',').trim()

  // Independence
  const ind = d.independence
  const latest = ind.days[ind.days.length - 1]
  const before = ind.days[ind.days.length - 2]
  const window14 = latest
    ? Array.from({ length: 14 }, (_, n) => {
        const day = shiftDay(latest.day, n - 13)
        return { day, row: ind.days.find((x) => x.day === day) }
      })
    : []
  const top = Math.max(20, ...window14.map((w) => w.row?.rate ?? 0))
  const weekAvg = (from: number, to: number) => {
    const rows = window14.slice(from, to).map((w) => w.row?.rate).filter((r): r is number => typeof r === 'number')
    return rows.length ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length) : null
  }

  // the plan as a road: every day from the start to the review, with what was done each day
  const plan = d.plan
  const road = plan
    ? Array.from({ length: Math.round((Date.parse(`${plan.end}T12:00:00Z`) - Date.parse(`${plan.start}T12:00:00Z`)) / 86400e3) + 1 }, (_, n) => {
        const day = shiftDay(plan.start, n)
        const week = plan.weeks.find((w) => day >= w.from && day <= shiftDay(w.to, 2))
        const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
        return { day, n: doneOn(day), week: week?.n ?? 0, friday: dow === 5 && !!week, last: day === plan.end, past: day < today, today: day === today }
      })
    : []
  const roadTop = Math.max(10, ...road.map((r) => r.n))
  const curWeek = plan?.weeks.find((w) => today <= shiftDay(w.to, 2)) ?? plan?.weeks[plan.weeks.length - 1]
  const dayOfPlan = plan ? Math.min(road.length, Math.max(1, road.findIndex((r) => r.day === today) + 1 || (today > plan.end ? road.length : 1))) : 0
  const weekIssues = (n: number) => issues.filter((i) => i.week === n)

  // Decided: the latest date in full, earlier ones folded
  const latestTag = d.journal.decided[0]?.tag.replace(/\s*\(.*$/, '')
  const decidedNew = d.journal.decided.filter((x) => x.tag.replace(/\s*\(.*$/, '') === latestTag)
  const decidedOld = d.journal.decided.slice(decidedNew.length)

  // Needs you: what only Bart can do or settle, pinned at the very top
  const toDecide = d.journal.toDecide
  const checkin = d.journal.checkin.filter((x) => !/^nothing/i.test(x))
  const needs = waiting.length + toDecide.length + checkin.length
  const weekStart = shiftDay(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7))
  const weekDone = issues.filter((i) => i.status === 'done' && i.day && i.day >= weekStart).length

  const head = (
        <section className="kb-head" aria-labelledby="project">
          <div className="kb-head-main">
            <p className="ko-sub">The project</p>
            <h1 id="project">
              <span className="u">
                {projectName}
                <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 13c22-8 40 6 62-1s38-9 60-2 44 2 72-5" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            {projectWhat && <p className="kb-what">{projectWhat}</p>}
            {firstSentence && <p className="kb-state">{firstSentence}</p>}
            <p className={`kb-fresh ko-mono${leadStale ? ' stale' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={face} alt="" width={28} height={28} />
              <span>
                Kit last wrote {ago(d.journal.at, now)}
                {stamp ? `; the line above is from ${stamp}` : ''}
                {leadStale && ': the runner is asked to refresh it'}
              </span>
            </p>
          </div>
        </section>
  )
  const health = <Health s={s} now={now} steer={latest} />
  return (
    <Shell base={base} q={q} user={user} notes={d.notes} open={doing.length + next.length + waiting.length} current="home" aside={<div className={`kb-aside-${variant}`}>{variant === 'b' && head}{health}</div>}>
      <div className={`kb-home kb-${variant}`}>
        {variant === 'a' && head}
        <section className={`kb-sec kb-needs${needs ? '' : ' none'}`} id="needs" aria-labelledby="needs-h">
          <div className="kb-sec-head">
            <h2 id="needs-h">
              Needs you <span className="kb-count">{needs}</span>
            </h2>
            <p>{needs ? 'Only you can do or settle these.' : 'Nothing needs you right now.'}</p>
          </div>
          {needs > 0 && (
            <ol className="kb-rows">
              {waiting.map((i) => (
                <IssueRow key={i.id} i={i} now={now} q={q} mode="plate" base={base} />
              ))}
              {toDecide.map((x, n) => (
                <li key={`d${n}`} className="kb-row kb-row-plain">
                  <span className="ko-mono ko-pri p1">decide</span>
                  <span className="kb-title">{inline(x.text)}</span>
                  <span className="ko-mono kb-meta">{x.tag}</span>
                </li>
              ))}
              {checkin.map((x, n) => (
                <li key={`c${n}`} className="kb-row kb-row-plain">
                  <span className="ko-mono ko-pri p2">check-in</span>
                  <span className="kb-title">{inline(x)}</span>
                  <span className="ko-mono kb-meta">for the next call</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="kb-phone-health">{health}</div>
          <section className="kb-sec" id="plate" aria-labelledby="plate-h">
            <div className="kb-sec-head">
              <h2 id="plate-h">On the plate</h2>
              <p>
                {doing.length} doing · {next.length} next up
              </p>
            </div>
            {d.issues === null ? (
              <p className="kb-empty">The tracker is not set up yet (schema 011).</p>
            ) : (
              <div className="kb-plate">
                <div>
                  <h3 className="ko-sub">Doing now</h3>
                  <ol className="kb-rows">
                    {doing.map((i) => (
                      <IssueRow key={i.id} i={i} now={now} q={q} mode="plate" base={base} />
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="ko-sub">Next up</h3>
                  <ol className="kb-rows">
                    {next.slice(0, 5).map((i) => (
                      <IssueRow key={i.id} i={i} now={now} q={q} mode="plate" base={base} />
                    ))}
                  </ol>
                  <a className="kb-all" href={`${base}/issues?tab=open`}>
                    All {next.length} next up, and every closed issue →
                  </a>
                </div>
              </div>
            )}
          </section>
          <section className={`kb-sec kb-ov${o.fresh.state === 'stale' ? ' stale' : ''}`} id="overview" aria-labelledby="overview-h">
            <div className="kb-sec-head">
              <h2 id="overview-h">
                Ola in one page <OverviewBadge o={o} />
              </h2>
              <p>
                {overviewLine(o)} <a href={`${base}/overview`}>Read it →</a>
              </p>
            </div>
            {o.lede && <p className="kb-ov-lede">{o.lede}</p>}
          </section>
          {plan && curWeek && (
            <section className="kb-sec" id="plan" aria-labelledby="plan-h">
              <div className="kb-sec-head">
                <h2 id="plan-h">The plan</h2>
                <p>
                  Day {dayOfPlan} of {road.length} to Startup Grade, {dayShort(plan.end)}. <a href={`${base}/notes/${plan.slug}`}>The plan →</a>
                </p>
              </div>
              <div className="kb-road" role="img" aria-label={`Work done each day from ${dayShort(plan.start)} to ${dayShort(plan.end)}; today is day ${dayOfPlan}.`}>
                <ol className="kb-road-weeks" style={{ gridTemplateColumns: `repeat(${road.length}, minmax(0, 1fr))` }}>
                  {plan.weeks.map((w) => {
                    const first = road.findIndex((r) => r.week === w.n)
                    const len = road.filter((r) => r.week === w.n).length
                    return (
                      <li key={w.n} className={w.n === curWeek.n ? 'cur' : ''} style={{ gridColumn: `${first + 1} / span ${len}` }}>
                        <b>Week {w.n}</b> <span>{w.title}</span>
                      </li>
                    )
                  })}
                </ol>
                <ol className="kb-road-days" style={{ gridTemplateColumns: `repeat(${road.length}, minmax(0, 1fr))` }}>
                  {road.map((r) => (
                    <li key={r.day} className={`${r.past ? 'past' : ''}${r.today ? ' today' : ''}${r.week ? ` w${r.week}` : ''}`} title={`${dayShort(r.day)}: ${r.n} done`}>
                      <span className="ko-mono v">{r.n || ''}</span>
                      <span className="bar" style={{ height: r.n ? `${Math.max(3, Math.round((r.n / roadTop) * 80))}px` : 0 }} />
                      <span className={`tick${r.friday ? ' demo' : ''}${r.last ? ' review' : ''}`} />
                      <span className={`ko-mono d${r.today || r.last ? '' : ' num'}`}>{r.today ? 'today' : r.last ? 'review' : Number(r.day.slice(8)) % 7 === Number(plan.start.slice(8)) % 7 || r.day === plan.start ? r.day.slice(8).replace(/^0/, '') : ''}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="kb-week">
                <div>
                  <h3>
                    This week: {curWeek.title}
                    <span className="ko-mono">
                      {' '}
                      {dayShort(curWeek.from)} to {dayShort(curWeek.to)}
                    </span>
                  </h3>
                  <ul>
                    {curWeek.items.map((x, n) => (
                      <li key={n}>{inline(x)}</li>
                    ))}
                  </ul>
                  {curWeek.demo && (
                    <p className="kb-demo">
                      <span className="ko-mono">Friday demo</span> {curWeek.demo}
                    </p>
                  )}
                </div>
                <ol className="kb-week-tally ko-mono" aria-label="Issues tagged to each week">
                  {plan.weeks.map((w) => {
                    const list = weekIssues(w.n)
                    const dn = list.filter((i) => i.status === 'done').length
                    return (
                      <li key={w.n} className={w.n === curWeek.n ? 'cur' : ''}>
                        <span>week {w.n}</span>
                        <span className="meter" aria-hidden="true">
                          <i style={{ width: list.length ? `${Math.round((dn / list.length) * 100)}%` : 0 }} />
                        </span>
                        <span>
                          {dn} of {list.length} done
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </section>
          )}
          <section className="kb-sec" id="done" aria-labelledby="done-h">
            <div className="kb-sec-head">
              <h2 id="done-h">Done</h2>
              <p>
                {doneOn(today)} today · {doneOn(yesterday)} yesterday · {weekDone} this week. <a href={`${base}/issues?tab=done`}>Every closed issue →</a>
                {d.commitSync && !d.commitSync.ok && <span className="kb-warn"> Commits not read since {ago(d.commitSync.at, now)}: {d.commitSync.why}</span>}
              </p>
            </div>
            {d.issues === null ? <p className="kb-empty">The tracker is not set up yet (schema 011).</p> : <Done issues={issues} unsorted={d.unsorted} notes={d.journal.days} today={today} now={now} q={q} base={base} />}
          </section>
          {latest && (
            <section className="kb-sec" id="independence" aria-labelledby="ind-h">
              <div className="kb-sec-head">
                <h2 id="ind-h">Independence</h2>
                <p>How often you had to steer me, per 100 of your messages; a repeat counts twice. Lower is better.</p>
              </div>
              <div className="kb-ind">
                <div className="kb-ind-num">
                  <p className="ko-ind-big">{latest.rate ?? '–'}</p>
                  <p className="ko-ind-what">
                    {dayShort(latest.day)}: {latest.steers} {latest.steers === 1 ? 'steer' : 'steers'} in {latest.messages} messages, {latest.repeats} {latest.repeats === 1 ? 'repeat' : 'repeats'}
                    {before ? `. ${dayShort(before.day)}: ${before.rate}.` : '.'}
                    {weekAvg(7, 14) !== null && weekAvg(0, 7) !== null ? ` Last 7 days ${weekAvg(7, 14)}, the 7 before ${weekAvg(0, 7)}.` : ''}
                  </p>
                </div>
                <ol className="ko-ind-bars" aria-label="Steer rate, last 14 days">
                  {window14.map((w) => (
                    <li key={w.day} title={w.row ? `${dayShort(w.day)}: ${w.row.rate}` : `${dayShort(w.day)}: not graded`}>
                      <span className="ko-mono v">{w.row?.rate ?? ''}</span>
                      <span className={`bar${w.row ? '' : ' none'}${w.day === latest.day ? ' last' : ''}`} style={{ height: w.row ? `${Math.max(3, Math.round(((w.row.rate ?? 0) / top) * 96))}px` : undefined }} />
                      <span className="ko-mono d">{w.day.slice(8).replace(/^0/, '')}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {latest.items.some((x) => x.label === 'steer') && (
                <details className="kb-more">
                  <summary>
                    Your {latest.steers} {latest.steers === 1 ? 'steer' : 'steers'} on {dayShort(latest.day)}
                  </summary>
                  <ol className="ko-plate ko-steers">
                    {latest.items
                      .filter((x) => x.label === 'steer')
                      .map((x, n) => (
                        <li key={n}>
                          <span className="ko-mono t">{x.time}</span>
                          <span>
                            “{x.quote}”
                            <span className="ko-mono c">
                              {x.class} <span className={`ko-pri ${x.repeat ? 'p0' : 'p2'}`}>{x.repeat ? 'repeat' : 'new'}</span>
                            </span>
                          </span>
                        </li>
                      ))}
                  </ol>
                </details>
              )}
              {ind.replay && (
                <p className="kb-note">
                  Replay: {ind.replay.prevented} of {ind.replay.cases} past mistakes are prevented by my rules when a fresh Claude replays them; {ind.replay.prevented_without} of {ind.replay.cases} without.
                </p>
              )}
            </section>
          )}
          <section className="kb-sec kb-two" id="decided" aria-labelledby="decided-h">
            <div>
              <div className="kb-sec-head">
                <h2 id="decided-h">Decided</h2>
              </div>
              <ol className="ko-decided">
                {decidedNew.map((x, n) => (
                  <li key={n}>
                    <span className="ko-mono t">{x.tag}</span>
                    <span>{inline(x.text)}</span>
                  </li>
                ))}
              </ol>
              {decidedOld.length > 0 && (
                <details className="kb-more">
                  <summary>{decidedOld.length} earlier decisions</summary>
                  <ol className="ko-decided">
                    {decidedOld.map((x, n) => (
                      <li key={n}>
                        <span className="ko-mono t">{x.tag}</span>
                        <span>{inline(x.text)}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            <div>
              {d.journal.parked.length > 0 && (
                <>
                  <h3 className="ko-sub kb-parked-h">Parked, your call</h3>
                  <ul className="kb-plain">
                    {d.journal.parked.map((x, n) => (
                      <li key={n}>{inline(x)}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
          <section className="kb-sec kb-two" id="numbers" aria-labelledby="numbers-h">
            <div>
              <div className="kb-sec-head">
                <h2 id="numbers-h">Numbers</h2>
              </div>
              <ul className="kb-plain kb-numbers">
                {d.journal.numbers.map((x, n) => (
                  <li key={n}>{inline(x)}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="kb-sec-head">
                <h2>Live from the mini</h2>
              </div>
              {s ? (
                <dl className="kb-table">
                  <dt>Status pushed</dt>
                  <dd className={(!s || age(s.at) > STATUS_STALE) ? 'bad' : ''}>
                    {ago(s.at, now)}
                    {(!s || age(s.at) > STATUS_STALE) && ' (stale: it should come every 10 minutes)'}
                  </dd>
                  <dt>Web app</dt>
                  <dd>{s.deployed ? `${s.deployed.commit.slice(0, 7)}, updated ${ago(s.deployed.at, now)}` : 'not deployed'}</dd>
                  <dt>Checks</dt>
                  <dd>{s.deployed ? Object.entries(s.deployed.suites).map(([k, v]) => `${k} ${v}`).join(', ') : '–'}</dd>
                  <dt>Alarm</dt>
                  <dd className={s.alarm.state === 'alarm' ? 'bad' : ''}>
                    {s.alarm.state === 'alarm' ? s.alarm.says.join(' ') : s.alarm.state === 'warn' ? `quiet; warnings: ${s.alarm.warns.join(', ')}` : 'quiet'}
                    {s.alarm.runAt && `, checked ${ago(s.alarm.runAt, now)}`}
                  </dd>
                  <dt>Parts</dt>
                  <dd>
                    {Object.entries(s.parts)
                      .map(([k, ok]) => `${k} ${ok ? 'answers' : 'DOWN'}`)
                      .join(', ') || '–'}
                  </dd>
                  <dt>Disk</dt>
                  <dd>{s.disk ? `${s.disk.freeGB} GB free` : '–'}</dd>
                  <dt>Memory</dt>
                  <dd>{s.memory ?? '–'}</dd>
                  <dt>Projects running</dt>
                  <dd>{s.projects ? s.projects.running : '–'}</dd>
                </dl>
              ) : (
                <p className="kb-empty">The mini has not pushed a status yet.</p>
              )}
            </div>
          </section>
      </div>
    </Shell>
  )
}
