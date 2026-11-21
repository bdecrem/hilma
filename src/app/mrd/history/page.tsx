import Link from 'next/link'
import { COUNTRIES, STEPS, TOTAL, runs, stats, usd, num, mil, type CountrySlug, type StepKey } from './data'

export const dynamic = 'force-static'

export default function Page() {
  const all = runs()
  const cs = Object.keys(COUNTRIES) as CountrySlug[]
  const ss = Object.keys(STEPS) as StepKey[]
  const cells = cs.flatMap(c => ss.map(s => ({ c, s, st: stats(all, c, s) })))
  return (
    <main className="wrap hist">
      <header className="top">
        <div className="eyebrow"><span><a href="/mrd/dossiers">MRD · dossiers</a> · through time · <a href="/mrd">the library</a></span></div>
        <h1>Argentina and Chile <em>through time</em></h1>
        <p className="lede">
          Two research projects on the Migrant Rights Database, run on Argentina and Chile. Both start from the MRD’s own human-coded answers
          (64 indicators of the 2023 instrument). <b>Forward</b> asks what changed in each country’s law and practice between 1 January 2023 and
          1 January 2026. <b>Back in time</b> starts from the MRD’s answer as of 1 January 2020 and goes back to 1 January 2000, with answers on 2000,
          2005, 2010, 2015 and 2020, from each provision’s full amendment history and the laws it replaced. Claude works through the indicators in groups of two to six.
          This is experimental and has not been reviewed by a person.
        </p>
      </header>

      <div className="grid">
        {cells.map(({ c, s, st }) => (
          <div className="cell" key={c + s}>
            <div className="gh">{STEPS[s].short}</div>
            <h2>{COUNTRIES[c]}<small>{STEPS[s].name}</small></h2>
            <div className="bar"><i style={{ width: `${(st.done / TOTAL) * 100}%` }} /></div>
            <div className="nums">
              <div><b>{st.done} of {TOTAL}</b><span>indicators done</span></div>
              <div><b>{st.changed}</b><span>show a change</span></div>
              <div><b>{usd(st.cost)}</b><span>cost so far</span></div>
              <div><b>{mil(st.total)}</b><span>tokens, all</span></div>
              <div><b>{mil(st.output)}</b><span>of them output</span></div>
              <div><b>{st.minutes.toFixed(0)}</b><span>minutes</span></div>
            </div>
            <div className="meta">{st.models.join('; ') || 'Opus 5.5, high effort'}{st.running ? ` · ${st.running} running now` : ''}</div>
            <Link className="go" href={`/mrd/history/${c}/${s}`}>Open the results →</Link>
          </div>
        ))}
      </div>

      <section>
        <h2 className="sec">Model and cost</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Country</th><th>Project</th><th>Model and effort</th><th>Total</th><th>Per indicator</th></tr></thead>
            <tbody>
              {cells.map(({ c, s, st }) => (
                <tr key={c + s}>
                  <td>{COUNTRIES[c]}</td><td>{STEPS[s].short}</td>
                  <td>{st.models.join('; ') || 'Opus 5.5, high effort'}</td>
                  <td>{usd(st.cost)}</td><td>{st.done ? usd(st.cost / st.done) : 'none yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Dollars are what the same work would cost on the Claude API; it ran on a Claude Max subscription. Tokens count input, output and cached
          reads and writes together (input and cache {num(cells.reduce((s, x) => s + x.st.input, 0))}, output {num(cells.reduce((s, x) => s + x.st.output, 0))} across all four).
          This page is rebuilt as each run finishes.
        </p>
      </section>
    </main>
  )
}
