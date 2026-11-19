import type { BoardData, Learning, Sweep, SweepChange, Sweeps, Weakness } from '@/lib/venture/board'
import { href } from '../Shell'
import { inline } from '../inline'
import { at, clock, dayLong, dayShort, pday, shiftDay } from '../time'

// Learning (app.kochitolabs.com/learning; Bart, Nov 18: "Instead of numbers, make it Learning").
// Top: the headline numbers, Kit (the share of his corrections that were new, not repeats), Ola
// (its own model's score as a share of Claude's) and the weaknesses (how many of the known ones
// have a guard the system enforces that is holding). Then the weaknesses themselves (Bart, the
// same evening: "a system that gets smarter and better each day by studying what it did wrong, how
// to prevent that same mistake/weakness, and what else can be learned, generalized, built"): every
// correction and sweep finding filed under a named weakness, how often it was seen, its guard,
// whether the guard held, and what to build next. Then the sweep itself, one dated update
// per day, newest first: what Kit read that day, what it changed in how the project is run (Kit)
// and in how Ola's agents, skills and orchestration work (Ola), and what it found and has not
// fixed. Then the measures with their history (what the Numbers page held).
// Data: venture_state "learning" (scripts/venture/learning.mjs) and "sweeps" (scripts/venture/
// sweep.mjs post; the procedure is apps/venture/SWEEP.md). Missing: "not measured yet", "not
// swept"; older than a day: "as of <when>" in amber. Never a made-up number.
const DAY = 24 * 3600e3
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

export function learningAge(l: Learning | null, now: string) {
  if (!l) return { old: true, line: 'not measured yet' }
  const old = Date.parse(now) - Date.parse(l.at) > DAY
  return { old, line: old ? `as of ${at(l.at, now)}` : `measured ${at(l.at, now)}` }
}

/** The sweep in numbers: changes made so far, how many the system enforces, and the days owed
 *  (every day from the first sweep through yesterday that has no entry). */
export function sweepStats(s: Sweeps | null, today: string) {
  const days = [...(s?.days ?? [])].sort((a, b) => b.day.localeCompare(a.day))
  const all = days.flatMap((d) => [...d.kit, ...d.ola])
  const missed: string[] = []
  if (s) for (let d = shiftDay(today, -1); d >= s.since && missed.length < 60; d = shiftDay(d, -1)) if (!days.some((x) => x.day === d)) missed.push(d)
  return { days, n: all.length, kit: days.reduce((n, d) => n + d.kit.length, 0), ola: days.reduce((n, d) => n + d.ola.length, 0), enforced: all.filter((c) => c.enforced).length, swept: days.filter((d) => !d.quiet).length, latest: days[0] ?? null, missed }
}

const Fig = ({ name, what, big, pct, label, line, small, amber }: { name: string; what: string; big: string; pct: number; label: string; line: string; small: string; amber?: boolean }) => (
  <div className="bd-learn-fig">
    <p className="who">
      {name} <span>{what}</span>
    </p>
    <b>{big}</b>
    <p className="line">{line}</p>
    <span className="bar" role="img" aria-label={label}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
    {small && <p className={`small${amber ? ' bd-amber' : ''}`}>{small}</p>}
  </div>
)

/** The headline figures: Kit and Ola (Home shows these two), and with `sweeps` the daily sweep. */
export function LearningFigures({ l, now, sweeps }: { l: Learning | null; now: string; sweeps?: ReturnType<typeof sweepStats> }) {
  if (!l && !sweeps) return <p className="bd-empty">Learning is not measured yet.</p>
  const k = l?.kit
  const o = l?.ola
  const today = k?.latest_day ? `${k.latest_day.day === pday(now) ? 'today' : dayShort(k.latest_day.day)}: ${k.latest_day.corrections} corrections, ${k.latest_day.repeats} repeats` : ''
  return (
    <div className={`bd-learn${sweeps ? ' three' : ''}`}>
      {k && <Fig name="Kit" what="the system that works with you" big={`${Math.round(k.percent)}%`} pct={k.percent} label={`${Math.round(k.percent)} of 100`} line={k.label} small={[today, k.steers ? `${k.steers.rate} steers per 100 messages` : ''].filter(Boolean).join(' · ')} />}
      {o && <Fig name="Ola" what="models and skills" big={`${Math.round(o.percent)}%`} pct={o.percent} label={`${Math.round(o.percent)} of 100`} line={o.label} small={o.own && o.claude ? `${Math.round(o.own.rate)}% against Claude's ${Math.round(o.claude.rate)}%, ${o.model}${o.measured ? `, ${o.measured}` : ''}` : ''} />}
      {sweeps && <WeakFig l={l} sweeps={sweeps} />}
    </div>
  )
}

// The third headline figure: of the known weaknesses, how many have a guard the system enforces
// that has held. The sweep's own count (changes made) is the small line under it.
function WeakFig({ l, sweeps }: { l: Learning | null; sweeps: ReturnType<typeof sweepStats> }) {
  const w = l?.weaknesses ?? []
  const held = w.filter((x) => x.status === 'guarded').length
  const back = w.filter((x) => x.status === 'back').length
  const sweepLine = sweeps.latest ? `${sweeps.n} ${sweeps.n === 1 ? 'change' : 'changes'} from ${sweeps.swept} ${sweeps.swept === 1 ? 'sweep' : 'sweeps'}` : 'not swept yet'
  if (!w.length)
    return (
      <div className="bd-learn-fig">
        <p className="who">
          Weaknesses <span>guarded and holding</span>
        </p>
        <p className="line" style={{ marginTop: 6 }}>Not filed yet. {sweepLine}.</p>
      </div>
    )
  return (
    <Fig
      name="Weaknesses"
      what="guarded and holding"
      big={`${held} of ${w.length}`}
      pct={(held / w.length) * 100}
      label={`${held} of ${w.length}`}
      line={`known weaknesses have a guard the system enforces and have not come back since`}
      small={sweeps.missed.length ? `not swept: ${sweeps.missed.slice(0, 3).map(dayShort).join(', ')}` : `${back ? `${back} came back after a guard · ` : ''}${w.length - held - back} still rest on a rule · ${sweepLine}`}
      amber={sweeps.missed.length > 0}
    />
  )
}

const ORDER = { back: 0, open: 1, guarded: 2 } as const
function Weaknesses({ list, today, base }: { list: Weakness[]; today: string; base: string }) {
  const rows = [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.seen - a.seen)
  const days = (n: number | null) => (n === null ? '' : n === 0 ? 'since today' : n === 1 ? '1 day' : `${n} days`)
  return (
    <ol className="bd-weak">
      <li className="head">
        <span>Weakness</span>
        <span>Seen</span>
        <span>What prevents it now</span>
        <span>Holding?</span>
      </li>
      {rows.map((w) => (
        <li key={w.id} className={w.status} title={w.what}>
          <span className="name">
            <b>{w.name}</b>
            <span className="who">{w.side === 'kit' ? 'Kit' : 'Ola'}</span>
          </span>
          <span className="seen">
            <b>{w.seen}</b> {w.seen === 1 ? 'time' : 'times'}
            {w.last && <span className="faint">, last {w.last === today ? 'today' : dayShort(w.last).replace(/^[A-Za-z]+, /, '')}</span>}
          </span>
          <span className="guard">
            {w.guard ? (
              <>
                {w.guard.what}
                <span className={w.guard.enforced ? 'enf' : 'rule'}>{w.guard.enforced ? 'enforced by the system' : 'a rule, not enforced'}</span>
              </>
            ) : (
              <span className="rule">nothing yet</span>
            )}
            {w.bet && w.status !== 'guarded' && (
              <span className="bet">
                To build: {w.bet.text} {w.bet.issue && <a href={`${href(base, '/issues')}/${w.bet.issue}`} className="m">{w.bet.issue}</a>}
              </span>
            )}
          </span>
          <span className={`st ${w.status}`}>{w.status === 'guarded' ? `holding ${days(w.held_days)}` : w.status === 'back' ? 'came back after its guard' : w.quiet_days !== null && w.quiet_days >= 2 ? `open, quiet ${days(w.quiet_days)}` : 'open'}</span>
        </li>
      ))}
    </ol>
  )
}

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

function Changes({ name, what, items, base, weak }: { name: string; what: string; items: SweepChange[]; base: string; weak: Weakness[] }) {
  return (
    <div>
      <h4>
        {name} <span>{what}</span> <span className="bd-n">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <p className="none">Nothing to change today.</p>
      ) : (
        <ul className="bd-changes">
          {items.map((c, n) => (
            <li key={n}>
              <p className="did">{inline(c.changed)}</p>
              <p className="saw">{inline(c.saw)}</p>
              <p className="where">
                <span className={c.enforced ? 'enf' : ''}>{c.enforced ? 'Enforced by the system' : 'A note Kit follows'}</span>
                <span>{c.where}</span>
                {c.weakness && weak.find((w) => w.id === c.weakness) && <span className="wk">Weakness: {weak.find((w) => w.id === c.weakness)!.name.replace(/^./, (x) => x.toLowerCase())}</span>}
                {c.issue && <a href={`${href(base, '/issues')}/${c.issue}`} className="m">{c.issue}</a>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Day({ s, now, base, weak }: { s: Sweep; now: string; base: string; weak: Weakness[] }) {
  return (
    <>
      <div className="bd-sweep-head">
        <h3>{dayLong(s.day)}</h3>
        <span className="m faint">
          swept {pday(s.at) === s.day ? clock(s.at) : at(s.at, now)} by {s.by}
        </span>
      </div>
      <p className="bd-sweep-sum">{inline(s.summary)}</p>
      {s.pattern && (
        <p className="bd-sweep-sum pattern">
          <b>The pattern.</b> {inline(s.pattern)}
        </p>
      )}
      {s.read.length > 0 && (
        <p className="bd-sweep-read">
          <span className="faint">Read:</span>
          {s.read.map((r, n) => (
            <span key={n}>
              <b>{r.n}</b> {r.what}
            </span>
          ))}
        </p>
      )}
      <div className="bd-sweep-cols">
        <Changes name="Kit" what="how the project is run" items={s.kit} base={base} weak={weak} />
        <Changes name="Ola" what="agents, skills, orchestration" items={s.ola} base={base} weak={weak} />
      </div>
      {s.build && (
        <p className="bd-sweep-build">
          <b>To build next.</b> {inline(s.build.text)} {s.build.issue && <a href={`${href(base, '/issues')}/${s.build.issue}`} className="m">{s.build.issue}</a>}
        </p>
      )}
      {s.open.length > 0 && (
        <div className="bd-sweep-open">
          <h4>
            Found, not fixed yet <span className="bd-n">{s.open.length}</span>
          </h4>
          <ul>
            {s.open.map((o, n) => (
              <li key={n}>
                {inline(o.text)} {o.issue && <a href={`${href(base, '/issues')}/${o.issue}`} className="m">{o.issue}</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export default function LearningPage({ d, base }: { d: BoardData; base: string }) {
  const now = d.now
  const l = d.learning
  const st = sweepStats(d.sweeps, d.today)
  const age = learningAge(l, now)
  const note = `${href(base, '/notes')}/${l?.doc || 'how-we-learn'}`
  const ind = d.independence
  const latest = ind.days[ind.days.length - 1]
  const window14 = latest ? Array.from({ length: 14 }, (_, n) => shiftDay(latest.day, n - 13)) : []
  const steers = latest?.items.filter((x) => x.label === 'steer') ?? []
  // the days, newest first: every sweep, and every day owed
  const rows = [...st.days.map((s) => ({ day: s.day, s: s as Sweep | null })), ...st.missed.map((day) => ({ day, s: null as Sweep | null }))].sort((a, b) => b.day.localeCompare(a.day))
  const OPEN = 2 // the newest sweeps are shown whole, older ones fold
  let shown = 0
  return (
    <>
      <div className="bd-head">
        <h1>Learning</h1>
        <p>
          <span className={`m${age.old ? ' bd-amber' : ''}`}>{age.line}</span> · <a href={note}>How Kit and Ola learn</a>
        </p>
      </div>

      <LearningFigures l={l} now={now} sweeps={st} />

      <section className="bd-sec" aria-labelledby="weak-h">
        <h2 id="weak-h">
          Weaknesses <span className="m faint">{(l?.weaknesses ?? []).length} known</span>
        </h2>
        <p className="bd-p" style={{ margin: '0 0 8px' }}>
          Every correction you make and every fault the sweep finds is filed under one of these. A weakness is closed when the system itself prevents it and it stops coming back; a rule I have to remember does not count.
        </p>
        {l?.weaknesses?.length ? <Weaknesses list={l.weaknesses} today={d.today} base={base} /> : <p className="bd-empty">Not filed yet.</p>}
      </section>

      <section className="bd-sec" aria-labelledby="sweep-h">
        <h2 id="sweep-h">
          Daily sweep {st.latest && <span className="m faint">last swept {at(st.latest.at, now)}</span>}
        </h2>
        <p className="bd-p" style={{ margin: '0 0 10px' }}>
          Once a day Kit goes through everything that happened (what you wrote and said, the corrections, the tracker, the code, Ola&rsquo;s tests and requests). For each thing that went wrong: which weakness it belongs to, whether an earlier guard failed, what now prevents it, where else the same cause bites, and what to build so the whole weakness goes away.
        </p>
        {rows.length === 0 ? (
          <p className="bd-empty">Not swept yet.</p>
        ) : (
          <ol className="bd-sweeps">
            {rows.map(({ day, s }) => {
              if (!s)
                return (
                  <li key={day} className="line bd-amber">
                    <span className="day">{dayShort(day)}</span> not swept
                  </li>
                )
              if (s.quiet)
                return (
                  <li key={day} className="line">
                    <span className="day">{dayShort(day)}</span> {plain(s.summary)}
                  </li>
                )
              shown++
              return shown <= OPEN ? (
                <li key={day} id={`d-${day}`}>
                  <Day s={s} now={now} base={base} weak={l?.weaknesses ?? []} />
                </li>
              ) : (
                <li key={day} id={`d-${day}`} className="fold">
                  <details>
                    <summary>
                      <span className="day">{dayShort(day)}</span>
                      <span className="bd-cut">{plain(s.summary)}</span>
                      <span className="m faint">
                        {s.kit.length + s.ola.length} {s.kit.length + s.ola.length === 1 ? 'change' : 'changes'}
                      </span>
                    </summary>
                    <Day s={s} now={now} base={base} weak={l?.weaknesses ?? []} />
                  </details>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="bd-sec" aria-labelledby="ind-h">
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

      {l && (
        <section className="bd-sec" aria-labelledby="hist-h">
          <h2 id="hist-h">Corrections and test rounds</h2>
          <div className="bd-home-grid">
            <div>
              <h3 className="bd-h3">
                Kit: corrections by day <span className="faint">repeats in red</span>
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
              <h3 className="bd-h3">Ola: test rounds</h3>
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
                  <h3 className="bd-h3" style={{ marginTop: 12 }}>Open points</h3>
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
        </section>
      )}

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
