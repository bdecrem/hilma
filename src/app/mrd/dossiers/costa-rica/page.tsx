import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import Md from '../review/Md'
import { BASE, Block, getQuestions, getRows, type Row, type Q } from './shared'

// The quality-control pass on the experimental Costa Rica dossier, for an attorney. Reads the database live (60 s).
export const revalidate = 60

const TITLE = 'Costa Rica quality control pass'
export const metadata: Metadata = {
  title: `MRD · ${TITLE}`,
  description: 'How the experimental Costa Rica dossier was checked, what the checks changed, what they cost.',
  openGraph: { url: 'https://ola.cx/mrd/dossiers/costa-rica', title: `MRD · ${TITLE}`, description: 'How the experimental Costa Rica dossier was checked, what the checks changed, what they cost.' },
}

type CostRow = { step: string; date: string; model: string; effort: string; answers: number; cost: number; detail?: string }
type Costs = { note: string; rows: CostRow[]; total: number }

const money = (n: number) => `$${n.toFixed(2)}`
const verdict = (v: string) => ({ confirmed: 'confirmed the answer', wrong: 'disagreed', not_supported: 'found the answer not supported', not_applicable: 'not applicable' } as Record<string, string>)[v] ?? v.replace(/_/g, ' ')

function Card({ r, q }: { r: Row; q?: Q }) {
  const v = r.verifier
  const before = r.original
  const after = r.redo ?? r.redo_first
  const tags = r.status === 'changed' && after
    ? { answer: before.answer !== after.answer, impl: before.implementation !== after.implementation } : undefined
  return (
    <article className={`panel ck-item ${r.status}`} id={`q${r.question_id}`}>
      <p className="slabel">Indicator {r.question_id} · {q?.categories?.name_en ?? ''}</p>
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
            <Block who="First coder" b={before} />
            {v && (
              <div className="ck-reader">
                <p className="slabel">Second reader · {verdict(v.protection_verdict)}</p>
                <p className="ck-ans">{v.protection_answer}</p>
                <p className="ck-impl">Implementation: {v.implementation_answer}</p>
              </div>
            )}
            {after && <Block who="Coded again" b={after} />}
          </>
        )}
        {r.status === 'pending' && <Block who="As first coded" b={before} />}
      </div>
      {r.status !== 'pending' && r.reason && <><p className="slabel">Why</p><p className="ck-reason">{r.reason}</p></>}
      {r.status === 'pending' && <p className="note">Being coded again; no decision yet.</p>}
    </article>
  )
}

export default async function Page() {
  const rows = await getRows()
  const Qs = await getQuestions(rows.map(r => r.question_id))
  const by = (s: Row['status']) => rows.filter(r => r.status === s)
  const verified = by('verified'), changed = by('changed'), review = by('review'), pending = by('pending')

  let conclusions = ''
  try { conclusions = fs.readFileSync(path.join(process.cwd(), 'apps/mrd/dossiers/costa-rica-conclusions.md'), 'utf8').trim() } catch { /* none yet */ }

  const costs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'apps/mrd/dossiers/costa-rica-costs.json'), 'utf8')) as Costs

  return (
    <main className="wrap cr">
      <header className="top">
        <div className="eyebrow"><span><a href="/mrd/dossiers">MRD · six new dossiers</a> · Costa Rica</span></div>
        <h1>Costa Rica <em>quality control pass</em></h1>
        <p className="cr-sum">
          Our experimental Costa Rica dossier (64 indicators of the MRD’s 2023 instrument, coded by Claude on 6 November 2026, and not part of the MRD’s human-coded data) went through a quality-control pass.
          Every cited source was opened and checked against the answer. A second reader re-read the law and tried to prove each answer wrong.
          Every answer that failed was coded again from the primary texts and checked again. A fixed rule then decided whether each answer is verified, changed, or sent to a person.
        </p>
        <p className="cr-sum"><strong>
          {verified.length} verified · {changed.length} changed · {review.length} waiting for a person · {pending.length} not finished
        </strong></p>
      </header>

      <section className="rv-rank">
        <h2>Models and cost</h2>
        <div className="rv-scroll">
          <table className="rv-table">
            <thead><tr><th>Step</th><th>Date</th><th>Model and effort</th><th>Answers</th><th>Cost (API-equivalent $)</th><th>Cost per answer</th></tr></thead>
            <tbody>
              {costs.rows.map((t, i) => (
                <tr key={i}>
                  <td>{t.step}</td><td>{t.date}</td>
                  <td>{t.model}, {t.effort.replace(/^(\w+)/, '$1 effort')}{t.detail && <><br /><small className="muted">{t.detail}</small></>}</td>
                  <td>{t.answers}</td><td>{money(t.cost)}</td><td>{money(t.cost / t.answers)}</td>
                </tr>
              ))}
              <tr><td><strong>Total</strong></td><td></td><td></td><td></td><td><strong>{money(costs.total)}</strong></td><td></td></tr>
            </tbody>
          </table>
        </div>
        <p className="note">Dollars are what the same work would cost on the Claude API; it ran on a Claude Max subscription.</p>
        <p className="note" style={{ fontSize: 12 }}>{costs.note}</p>
        {conclusions && (
          <div className="rv-report">
            <p className="slabel" style={{ marginTop: 24 }}>What this tells us about the model needed</p>
            <Md text={conclusions} />
          </div>
        )}
      </section>

      <section className="ck-list">
        <h2>The full dossiers</h2>
        <div className="cr-links">
          <a href={`${BASE}/before`}>Before the quality-control pass (all 64 answers as first coded)</a>
          <a href={`${BASE}/after`}>After the quality-control pass (all 64 answers as published now)</a>
        </div>
      </section>

      <section className="ck-list">
        <h2>Changed ({changed.length})</h2>
        {changed.map(r => <Card key={r.question_id} r={r} q={Qs.get(r.question_id)} />)}
        <p className="note" style={{ marginTop: 18 }}>
          Indicator 55 (advised of asylum before expulsion) was changed by the MRD team before the pass: coded Yes on a Constitutional Chamber ruling (Voto 2025-019485) known only from a press summary;
          the full ruling is a three-sentence finding about one group with no order to inform anyone; recoded No from the full text on 17 Nov.
        </p>
      </section>

      <section className="ck-list">
        <h2>Waiting for a person ({review.length})</h2>
        {review.length ? review.map(r => <Card key={r.question_id} r={r} q={Qs.get(r.question_id)} />) : <p className="note">Nothing is waiting.</p>}
      </section>

      {pending.length > 0 && (
        <section className="ck-list">
          <h2>Not finished ({pending.length})</h2>
          {pending.map(r => <Card key={r.question_id} r={r} q={Qs.get(r.question_id)} />)}
        </section>
      )}
    </main>
  )
}
