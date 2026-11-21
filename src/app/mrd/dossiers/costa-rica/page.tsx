import type { Metadata } from 'next'
import { BASE, Block, HUB, getQuestions, getRows, type Brief, type Row, type Q } from './shared'

// The quality-control pass on the experimental Costa Rica dossier, for an attorney. Reads the database live (60 s).
export const revalidate = 60

const TITLE = 'Costa Rica quality control pass'
const DESC = 'Opus 5.5 reviewed all 64 answers of our experimental Costa Rica dossier, Fable 5.2 coded 8 of them again: what each found and what it cost.'
export const metadata: Metadata = {
  title: `MRD · ${TITLE}`,
  description: DESC,
  openGraph: { url: 'https://ola.cx/mrd/dossiers/costa-rica', title: `MRD · ${TITLE}`, description: DESC },
}

// The 8 answers Fable 5.2 coded again on 17 Nov; every other recoded answer was coded again by Opus 5.5 on 20 Nov.
const FABLE = new Set([5, 7, 9, 11, 27, 33, 39, 127])
const recoder = (id: number) => (FABLE.has(id) ? 'Fable 5.2' : 'Opus 5.5')
const SHORT: Record<number, string> = {
  5: 'Special protection for women', 7: 'Special protection for migrants with disabilities', 9: 'No force to prevent entry',
  11: 'No lethal force to prevent entry', 27: 'Identity documents not confiscated', 33: 'Residency and identity documents not destroyed',
  39: 'Interpreter in criminal proceedings', 127: 'Public adult education',
}
const OUTCOME: Record<Row['status'], string> = { verified: 'verified', changed: 'changed', review: 'waiting', pending: 'not finished' }

const COSTS = [
  { work: 'Second reader of all 64 answers', model: 'Opus 5.5', effort: 'high', date: '17 Nov', answers: 64, cost: 81.54 },
  { work: 'Coded 17 failed answers again', model: 'Opus 5.5', effort: 'high', date: '20 Nov', answers: 17, cost: 21.51 },
  { work: 'Coded 8 failed answers again', model: 'Fable 5.2', effort: 'high', date: '17 Nov', answers: 8, cost: 53.45 },
  { work: 'Checked every cited source, in the first coding and in every answer coded again', model: 'Sonnet 5.5', effort: 'low', date: '17 and 20 Nov', answers: 89, cost: 44.22 },
]
const TOTAL = 200.72
const money = (n: number) => `$${n.toFixed(2)}`

function Cell({ answer, impl }: { answer?: string; impl?: string }) {
  return <td><span className="cr-a">{answer ?? '—'}</span><span className="cr-i">{impl ?? '—'}</span></td>
}

function Card({ r, q }: { r: Row; q?: Q }) {
  const v = r.verifier
  const before = r.original
  const after: Brief | null = r.redo ?? r.redo_first
  const tags = r.status === 'changed' && after
    ? { answer: before.answer !== after.answer, impl: before.implementation !== after.implementation } : undefined
  return (
    <article className={`panel ck-item ${r.status}`} id={`q${r.question_id}`}>
      <p className="slabel">Indicator {r.question_id} · {q?.categories?.name_en ?? ''} · coded again by {recoder(r.question_id)}</p>
      <h3 className="ck-q">{q?.text_en}</h3>
      <div className="ck-readers">
        {r.status === 'changed' && after && (
          <>
            <Block who="Before" b={before} />
            <Block who="After" b={after} tags={tags} />
          </>
        )}
        {r.status === 'review' && (
          <>
            <Block who="First coding" b={before} />
            {v && (
              <div className="ck-reader">
                <p className="slabel">Second reader (Opus 5.5)</p>
                <p className="ck-ans">{v.protection_answer}</p>
                <p className="ck-impl">Implementation: {v.implementation_answer}</p>
              </div>
            )}
            {after && <Block who={`Coded again (${recoder(r.question_id)})`} b={after} />}
          </>
        )}
      </div>
      {r.reason && <p className="ck-reason"><strong>Why: </strong>{r.reason}</p>}
    </article>
  )
}

export default async function Page() {
  const rows = await getRows()
  const Qs = await getQuestions(rows.map(r => r.question_id))
  const by = (s: Row['status']) => rows.filter(r => r.status === s)
  const verified = by('verified'), changed = by('changed'), review = by('review'), pending = by('pending')
  const both = rows.filter(r => FABLE.has(r.question_id))

  return (
    <main className="wrap cr">
      <header className="top">
        <div className="eyebrow"><span><a href="/mrd/dossiers">MRD · six new dossiers</a> · <a href={HUB}>Costa Rica</a> · quality control</span></div>
        <h1>Costa Rica <em>quality control pass</em></h1>
        <p className="cr-sum">
          We checked our experimental Costa Rica dossier: 64 answers to the Migrant Rights Database’s 2023 instrument, first coded by Claude Opus 5.5 on 6 November 2026.
          Opus 5.5 reviewed all 64 as an independent second reader, and Fable 5.2 coded 8 of them again.
          Result: <strong>{verified.length} verified, {changed.length} changed, {review.length} waiting for a person{pending.length ? `, ${pending.length} not finished` : ''}.</strong>{' '}
          Opus, at about $1.27 an answer, did the full review; Fable, at about $6.68 an answer, agreed with Opus on 7 of the 8 answers both read, and differed only on indicator 11 (lethal force at the border), where Fable answered Yes and Opus No.
        </p>
      </header>

      <section className="rv-rank cr-sec">
        <h2>Opus and Fable side by side</h2>
        <p className="cr-lead">The 8 answers both models read; each cell gives the protection answer, then the implementation rating.</p>
        <div className="rv-scroll">
          <table className="rv-table cr-sbs">
            <thead><tr><th>Indicator</th><th>First coding</th><th>Opus 5.5, second reader</th><th>Fable 5.2, coded again</th><th>Outcome</th></tr></thead>
            <tbody>
              {both.map(r => (
                <tr key={r.question_id}>
                  <td><a href={`${BASE}/after#q${r.question_id}`}>{r.question_id}</a> <span className="cr-name">{SHORT[r.question_id]}</span></td>
                  <Cell answer={r.original.answer} impl={r.original.implementation} />
                  <Cell answer={r.verifier?.protection_answer} impl={r.verifier?.implementation_answer} />
                  <Cell answer={r.redo?.answer} impl={r.redo?.implementation} />
                  <td><span className={`cr-tag cr-${r.status}`}>{OUTCOME[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rv-rank cr-sec">
        <h2>What each cost</h2>
        <div className="rv-scroll">
          <table className="rv-table cr-cost">
            <thead><tr><th>Work</th><th>Model, effort</th><th>Answers</th><th>Cost</th><th>Per answer</th></tr></thead>
            <tbody>
              {COSTS.map(c => (
                <tr key={c.work}>
                  <td>{c.work}<span className="cr-i">{c.date}</span></td>
                  <td>{c.model}, {c.effort}</td>
                  <td>{c.answers}</td><td>{money(c.cost)}</td><td>{money(c.cost / c.answers)}</td>
                </tr>
              ))}
              <tr className="cr-total"><td>Total</td><td></td><td>64 indicators</td><td>{money(TOTAL)}</td><td>{money(TOTAL / 64)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="cr-note">Dollars are what this work would cost on the Claude API; it ran on a Claude Max subscription.</p>
      </section>

      <section className="ck-list">
        <h2>Final report</h2>
        <div className="cr-links">
          <a href={`${BASE}/before`}>The dossier before the pass →</a>
          <a href={`${BASE}/after`}>The dossier after the pass →</a>
        </div>

        <h3 className="cr-h3">Changed ({changed.length})</h3>
        {changed.map(r => <Card key={r.question_id} r={r} q={Qs.get(r.question_id)} />)}
        <p className="cr-note">
          Indicator 55 (told of the right to asylum before expulsion) was changed by the MRD team before the pass. It had been coded Yes on a press summary of a Constitutional Chamber ruling (Voto 2025-019485);
          the full ruling is three sentences about one group and puts no duty on anyone to inform, so it was recoded No from the text on 17 Nov.
        </p>

        <h3 className="cr-h3">Waiting for a person ({review.length})</h3>
        {review.length ? review.map(r => <Card key={r.question_id} r={r} q={Qs.get(r.question_id)} />) : <p className="cr-note">Nothing is waiting.</p>}

        {pending.length > 0 && (
          <>
            <h3 className="cr-h3">Not finished ({pending.length})</h3>
            <p className="cr-note">Indicators {pending.map(r => r.question_id).join(', ')}.</p>
          </>
        )}
      </section>
    </main>
  )
}
