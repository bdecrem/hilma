import type { Metadata } from 'next'
import { rpc } from '@/lib/mrd/db'

// The due diligence over the experimental dossiers (apps/mrd/dossiers/PLAN.md, audit.py): where every
// answer stands, what changed, and what waits for a person. Read-only; decisions are entered with
// `python3 audit.py <slug> --resolve`.

export const revalidate = 60

export const metadata: Metadata = {
  title: 'MRD · checks',
  description: 'Every answer of the experimental dossiers: sources opened, a second reader, what changed, what waits for a person.',
  openGraph: { url: 'https://ola.cx/mrd/dossiers/checks', title: 'MRD · checks', description: 'Every answer of the experimental dossiers, checked: sources opened, a second reader, what changed.' },
}

type Brief = { answer: string; implementation: string; confidence?: string | null; citation?: string; evidence?: string; notes?: string | null; what_changed?: string }
type Verifier = { protection_verdict: string; protection_answer: string; protection_reason: string; implementation_verdict: string; implementation_answer: string; implementation_reason: string }
type SourceCheck = { pass: boolean; failures: string[] } | null
type Item = {
  country: string; slug: string; question_id: number; question: string; category: string; status: 'changed' | 'review'
  reason: string | null; failed: string[] | null; decided_by: string | null
  original: Brief; verifier: Verifier | null; redo: Brief | null; source_check: SourceCheck; redo_source_check: SourceCheck
}
type CountryRow = { id: number; name: string; slug: string; total: number; verified: number; changed: number; review: number; pending: number; source_checked: number; second_read: number; redone: number; cost_usd: number }
type Data = { now: string; countries: CountryRow[]; items: Item[] }

const words = (s: string) => s.replace(/_/g, ' ')

function Reader({ who, answer, impl, children }: { who: string; answer: string; impl: string; children?: React.ReactNode }) {
  return (
    <div className="ck-reader">
      <p className="slabel">{who}</p>
      <p className="ck-ans">{answer}</p>
      <p className="ck-impl">Implementation: {impl}</p>
      {children}
    </div>
  )
}

function Card({ it }: { it: Item }) {
  const v = it.verifier
  return (
    <article className={`panel ck-item ${it.status}`}>
      <p className="slabel">{it.country} · {it.category} · q{it.question_id}{it.decided_by && it.decided_by !== 'pipeline' ? ` · decided by ${it.decided_by}` : ''}</p>
      <h3 className="ck-q">{it.question}</h3>
      {it.reason && <p className="ck-reason">{it.reason}</p>}
      <div className="ck-readers">
        <Reader who="First coder" answer={it.original.answer} impl={it.original.implementation}>
          {it.original.notes && <p className="note">{it.original.notes}</p>}
        </Reader>
        {v && (
          <Reader who={`Second reader · ${words(v.protection_verdict)}`} answer={v.protection_answer} impl={`${v.implementation_answer} (${words(v.implementation_verdict)})`}>
            <p className="note">{v.protection_reason}</p>
            <p className="note">{v.implementation_reason}</p>
          </Reader>
        )}
        {it.redo && (
          <Reader who="Coded again" answer={it.redo.answer} impl={it.redo.implementation}>
            {it.redo.what_changed && <p className="note">{it.redo.what_changed}</p>}
          </Reader>
        )}
      </div>
      {!!it.failed?.length && (
        <details>
          <summary>Why it was coded again ({it.failed.length})</summary>
          <ul>{it.failed.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </details>
      )}
      {it.redo?.citation && (
        <details>
          <summary>The new citation</summary>
          <p>{it.redo.citation}</p>
          {it.redo.evidence && <p>{it.redo.evidence}</p>}
        </details>
      )}
      <p className="note"><a href={`/mrd/countries/${it.slug}`}>{it.country} in the library →</a></p>
    </article>
  )
}

export default async function Page() {
  const d = await rpc<Data>('dossier_checks_page', {}, 60)
  const sum = (k: keyof CountryRow) => d.countries.reduce((a, c) => a + Number(c[k]), 0)
  const total = sum('total')
  const review = d.items.filter(i => i.status === 'review')
  const changed = d.items.filter(i => i.status === 'changed')
  return (
    <main className="wrap">
      <header className="top">
        <div className="eyebrow">
          <span><a href="/mrd/dossiers">MRD · six new dossiers</a> · checks · <a href="/mrd/dossiers/changes">what changed this week</a> · <a href="/mrd/dossiers/costa-rica">Costa Rica</a> · <a href="/mrd">the library</a></span>
        </div>
        <h1>No answer stays up unless its sources were read <em>and a second reader agrees.</em></h1>
        <p className="lede">
          Every answer of the experimental dossiers goes through three steps. A source check opens each page the coder cited and confirms the quoted words are there, and that the
          evidence for the implementation rating shows practice and is about the same people. A second reader reads the law again and tries to prove the answer wrong. Whatever fails
          either one, or was marked low confidence, is coded again from the primary sources. Where the readers still disagree, a person decides.
        </p>
      </header>

      <section className="stats">
        <div className="stat"><p className="slabel">Answers</p><p className="svalue">{total}</p><p className="ssub">{sum('source_checked')} source-checked · {sum('second_read')} read twice</p></div>
        <div className="stat"><p className="slabel">Verified</p><p className="svalue">{sum('verified')}</p><p className="ssub">{sum('pending')} still in the checks</p></div>
        <div className="stat"><p className="slabel">Changed</p><p className="svalue">{sum('changed')}</p><p className="ssub">{sum('redone')} coded again</p></div>
        <div className="stat"><p className="slabel">Waiting for a person</p><p className="svalue">{sum('review')}</p><p className="ssub">the readers disagree</p></div>
      </section>

      <section className="rv-rank">
        <h2>By country</h2>
        <div className="rv-scroll">
          <table className="rv-table">
            <thead><tr><th>Country</th><th>Answers</th><th>Source-checked</th><th>Read twice</th><th>Coded again</th><th>Verified</th><th>Changed</th><th>Waiting</th><th>In progress</th></tr></thead>
            <tbody>
              {d.countries.map(c => (
                <tr key={c.id}>
                  <td><a href={`/mrd/countries/${c.slug}`}>{c.name}</a></td>
                  <td>{c.total}</td><td>{c.source_checked}</td><td>{c.second_read}</td><td>{c.redone}</td>
                  <td>{c.verified}</td><td>{c.changed}</td><td>{c.review}</td><td>{c.pending}</td>
                </tr>
              ))}
              {!d.countries.length && <tr><td colSpan={9}>The checks have not started.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ck-list">
        <h2>Waiting for a person ({review.length})</h2>
        {review.length ? review.map(it => <Card key={`${it.slug}-${it.question_id}`} it={it} />) : <p className="note">Nothing is waiting.</p>}
      </section>

      <section className="ck-list">
        <h2>Changed ({changed.length})</h2>
        {changed.length ? changed.map(it => <Card key={`${it.slug}-${it.question_id}`} it={it} />) : <p className="note">No answer has changed yet.</p>}
      </section>
    </main>
  )
}
