import type { BoardData } from '@/lib/venture/board'
import { href } from '../Shell'
import { at, dayShort, shiftDay } from '../time'
import { LearningFigures } from './Learning'

// Numbers (app.kochitolabs.com/numbers): Independence (how often Bart had to steer, today, the last
// two weeks, what counts, the day's steers one click away), Agent learning with its history (Kit's
// corrections and repeats by day, Ola's rounds), then the other figures, each with one line on what
// it means and when it was measured.

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

function Bars({ items }: { items: { key: string; v: number | null; rep?: number; label: string; title: string; last?: boolean }[] }) {
  const top = Math.max(1, ...items.map((x) => (x.v ?? 0) + (x.rep ?? 0)))
  return (
    <ol className="bd-bars">
      {items.map((x) => (
        <li key={x.key} className={`${x.v === null ? 'none' : ''}${x.last ? ' last' : ''}`} title={x.title}>
          <span className="v">{x.v === null ? '' : x.v + (x.rep ?? 0)}</span>
          <span className="col">
            <span className="stack" style={{ height: x.v ? `${Math.max(3, Math.round(((x.v + (x.rep ?? 0)) / top) * 100))}%` : undefined }}>
              {!!x.rep && <i className="rep" style={{ flex: x.rep }} />}
              <i style={{ flex: x.v ?? 0 }} />
            </span>
          </span>
          <span className="d">{x.label}</span>
        </li>
      ))}
    </ol>
  )
}

export default function Numbers({ d, base }: { d: BoardData; base: string }) {
  const now = d.now
  const ind = d.independence
  const latest = ind.days[ind.days.length - 1]
  const window14 = latest ? Array.from({ length: 14 }, (_, n) => shiftDay(latest.day, n - 13)) : []
  const l = d.learning
  const steers = latest?.items.filter((x) => x.label === 'steer') ?? []
  return (
    <>
      <div className="bd-head">
        <h1>Numbers</h1>
      </div>

      <section className="bd-sec" style={{ marginTop: 0 }} aria-labelledby="ind-h">
        <h2 id="ind-h">Independence</h2>
        {latest ? (
          <>
            <div className="bd-ind">
              <div className="now">
                <b>{latest.rate ?? '–'}</b> <span className="sub">steers per 100 messages</span>
                <p>
                  {latest.day === d.today ? 'Today' : dayShort(latest.day)}: {latest.steers} {latest.steers === 1 ? 'steer' : 'steers'} in {latest.messages} messages, {latest.repeats} {latest.repeats === 1 ? 'repeat' : 'repeats'}.
                </p>
              </div>
              <Bars
                items={window14.map((day) => {
                  const row = ind.days.find((x) => x.day === day)
                  return { key: day, v: row?.rate ?? null, label: day.slice(8).replace(/^0/, ''), title: row ? `${dayShort(day)}: ${row.rate}` : `${dayShort(day)}: not graded`, last: day === latest.day }
                })}
              />
            </div>
            <p className="bd-p">A steer is a message where you had to correct, redirect or repeat something Kit should have known; a repeat counts twice. Lower is better.</p>
            {steers.length > 0 && (
              <details className="bd-more">
                <summary>
                  Your {steers.length} {steers.length === 1 ? 'steer' : 'steers'} on {dayShort(latest.day)}
                </summary>
                <ol className="bd-steers" style={{ marginTop: 6, borderTop: '1px solid var(--line)' }}>
                  {steers.map((x, n) => (
                    <li key={n}>
                      <span className="t">{x.time}</span>
                      <span>“{x.quote}”</span>
                      <span className={`c${x.repeat ? ' rep' : ''}`}>
                        {x.class}, {x.repeat ? 'repeat' : 'new'}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        ) : (
          <p className="bd-empty">Not graded yet.</p>
        )}
      </section>

      <section className="bd-sec" aria-labelledby="learn-h">
        <h2 id="learn-h">Agent learning</h2>
        <LearningFigures l={l} now={now} href={`${href(base, '/notes')}/${l?.doc || 'how-we-learn'}`} />
        {l && (
          <div className="bd-home-grid" style={{ marginTop: 10 }}>
            <div>
              <h3 className="bd-h2" style={{ fontSize: 12 }}>
                Kit: corrections by day <span className="m faint">repeats in red</span>
              </h3>
              {l.kit.by_day?.length ? (
                <Bars
                  items={l.kit.by_day.slice(-14).map((x) => ({ key: x.day, v: Math.max(0, x.corrections - x.repeats), rep: x.repeats, label: x.day.slice(8).replace(/^0/, ''), title: `${dayShort(x.day)}: ${x.corrections} corrections, ${x.repeats} repeats` }))}
                />
              ) : (
                <p className="bd-empty">No days yet.</p>
              )}
            </div>
            <div>
              <h3 className="bd-h2" style={{ fontSize: 12 }}>Ola: test rounds</h3>
              {l.ola.rounds?.length ? (
                <ol className="bd-kv bd-rounds">
                  {l.ola.rounds.map((r, n) => (
                    <li key={n}>
                      <b>{Math.round(r.share)}%</b>
                      <span>
                        {r.model}: {Math.round(r.rate)}% of the tasks
                      </span>
                      <span className="t">{r.date}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="bd-empty">No rounds yet.</p>
              )}
              {l.ola.open && l.ola.open.length > 0 && (
                <>
                  <h3 className="bd-h2" style={{ fontSize: 12, marginTop: 12 }}>Open points</h3>
                  <div className="bd-md" style={{ fontSize: 13.5 }}>
                    <ul>
                      {l.ola.open.map((x, n) => (
                        <li key={n}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="bd-sec" aria-labelledby="other-h">
        <h2 id="other-h">Other figures</h2>
        <ol className="bd-kv">
          {d.status?.checks && (
            <li>
              <b>
                {d.status.checks.passed} of {d.status.checks.total}
              </b>
              <span>checks passed at the last update of the web app{d.status.deployed ? ` (version ${d.status.deployed.commit.slice(0, 8)})` : ''}</span>
              <span className="t">{d.status.deployed?.at ? at(d.status.deployed.at, now) : '–'}</span>
            </li>
          )}
          {ind.replay && (
            <li>
              <b>
                {ind.replay.prevented} of {ind.replay.cases}
              </b>
              <span>past mistakes prevented by Kit&rsquo;s rules when a fresh Claude replays them ({ind.replay.prevented_without} without the rules)</span>
              <span className="t">{at(ind.replay.at, now)}</span>
            </li>
          )}
          {d.journal.numbers.map((x, n) => {
            const m = x.match(/^\*\*([^*]+)\*\*\s*(.*)$/)
            if (m && /steer|checks passed|past mistakes/i.test(m[2])) return null // shown above from their own readings
            return (
              <li key={n}>
                <b>{m ? m[1] : ''}</b>
                <span>{plain(m ? m[2] : x).replace(/^[\s:,;]+/, '')}</span>
                <span className="t">{d.journal.at ? `Kit, ${at(d.journal.at, now)}` : '–'}</span>
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
