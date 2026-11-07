import type { Metadata } from 'next'
import Md from './Md'
import { KEY, RANKING, LETTERS, readBlind } from './content'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'MRD · blind review',
  description: 'Six experimental dossiers and six matched MRD originals, reviewed blind against the law.',
  openGraph: { url: 'https://ola.cx/mrd/dossiers/review', title: 'MRD · blind review', description: 'Six experimental dossiers and six matched MRD originals, reviewed blind against the law.' },
}

const PAIRS = [['F', 'C'], ['K', 'G'], ['A', 'I'], ['J', 'D'], ['E', 'B'], ['L', 'H']]

export default function Page() {
  const report = readBlind('REVIEW.md').replace(/^# .*\n/, '')
  const sum = (side: 'new' | 'mrd', k: 'c' | 'p' | 'w') => RANKING.filter(r => KEY[r.letter].source === side).reduce((a, r) => a + r[k], 0)

  return (
    <main className="wrap">
      <header className="top">
        <div className="eyebrow">
          <span><a href="/mrd/dossiers">MRD · six new dossiers</a> · blind review · 2026-11-07</span>
        </div>
        <h1>Twelve dossiers, labelled A to L, <em>checked against the law.</em></h1>
        <p className="lede">
          The six experimental dossiers and six MRD originals from the 2023 edition, one matched to each: Portugal and Spain, Norway and Sweden,
          the Philippines and India, Costa Rica and Colombia, Qatar and Jordan, China and Russia. Both sides were cut to the same fields
          (answer, implementation, citation) and shuffled. A separate Claude agent with web research, and no access to the key, scored all twelve
          and checked the same 8 indicators against the law in each.
        </p>
      </header>

      <section className="stats">
        <div className="stat"><p className="slabel">Experimental · checks correct</p><p className="svalue">{sum('new', 'c')}/48</p><p className="ssub">{sum('new', 'p')} partly · {sum('new', 'w')} wrong</p></div>
        <div className="stat"><p className="slabel">MRD originals · checks correct</p><p className="svalue">{sum('mrd', 'c')}/48</p><p className="ssub">{sum('mrd', 'p')} partly · {sum('mrd', 'w')} wrong</p></div>
        <div className="stat"><p className="slabel">Ranks 1–6</p><p className="svalue">6 of 6</p><p className="ssub">all experimental, scored 5 of 5</p></div>
        <div className="stat"><p className="slabel">Best original</p><p className="svalue">Spain</p><p className="ssub">rank 7, scored 4 of 5</p></div>
      </section>

      <section className="panel rv-rank">
        <h3>The ranking, with the key</h3>
        <div className="rv-scroll">
          <table className="rv-table">
            <thead><tr><th>Rank</th><th>Packet</th><th>Country</th><th>Source</th><th>Overall</th><th>Checks</th></tr></thead>
            <tbody>
              {RANKING.map((r, i) => (
                <tr key={r.letter} className={KEY[r.letter].source}>
                  <td>{i + 1}</td>
                  <td><a href={`/mrd/dossiers/review/${r.letter}`}>{r.letter}</a></td>
                  <td>{KEY[r.letter].country}</td>
                  <td>{KEY[r.letter].source === 'new' ? <span className="flag">experimental</span> : <span className="rv-mrd">MRD 2023</span>}</td>
                  <td>{r.overall} / 5</td>
                  <td><span className="rv-checks">{Array.from({ length: 8 }, (_, j) => <i key={j} className={j < r.c ? 'c' : j < r.c + r.p ? 'p' : 'w'} />)}</span> {r.c} / 8</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="detail">
          Pairs: {PAIRS.map(([a, b], i) => <span key={a}>{i ? ' · ' : ''}{KEY[a].country} {a} ↔ {KEY[b].country} {b}</span>)}.
          The format gives the experimental dossiers away (they are longer and quote the articles) and their citations mention law from 2024–2026;
          the reviewer is the same model family as the coder.
        </p>
      </section>

      <section className="panel rv-packets">
        <h3>The package</h3>
        <p className="detail">What the reviewer read: the instrument and the twelve packets, exactly as handed over.</p>
        <ul>
          <li><a href="/mrd/dossiers/review/instrument">The instrument</a> <span>64 indicators and their answer options</span></li>
          {LETTERS.map(l => (
            <li key={l}><a href={`/mrd/dossiers/review/${l}`}>Dossier {l}</a> <span>{KEY[l].country} · {KEY[l].source === 'new' ? 'experimental' : 'MRD 2023'}</span></li>
          ))}
        </ul>
      </section>

      <article className="panel rv-report">
        <p className="eyebrow"><span>The reviewer&apos;s report, unedited</span></p>
        <Md text={report} />
      </article>

      <footer className="foot">Files in apps/mrd/dossiers/review: blind/REVIEW.md, blind/dossier-A.md … L.md, blind/instrument.md, key.json.</footer>
    </main>
  )
}
