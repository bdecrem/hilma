import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import { select } from '@/lib/mrd/db'
import Md from '../review/Md'

// Costa Rica's experimental dossier: every answer the quality checks changed, before and after, and what the checks cost.
// Reads the database live (60 s) because the recode is still running.

export const revalidate = 60

export const metadata: Metadata = {
  title: 'MRD · Costa Rica: what the checks changed',
  description: 'Every answer in the experimental Costa Rica dossier that the quality checks changed, before and after, and what the checks cost.',
  openGraph: {
    url: 'https://ola.cx/mrd/dossiers/costa-rica',
    title: 'MRD · Costa Rica: what the checks changed',
    description: 'Every answer in the experimental Costa Rica dossier that the quality checks changed, before and after, and what the checks cost.',
  },
}

const COUNTRY = 1004

type Source = { url: string; quote?: string; article?: string; instrument?: string }
type EvSource = { url: string; title?: string; year?: number }
type Brief = {
  answer: string; implementation: string; confidence?: string | null; citation?: string; evidence?: string; notes?: string | null
  what_changed?: string; sources?: Source[]; evidence_sources?: EvSource[]
}
type Verifier = { protection_verdict: string; protection_answer: string; protection_reason: string; implementation_verdict: string; implementation_answer: string; implementation_reason: string }
type Row = {
  question_id: number; status: 'verified' | 'changed' | 'review' | 'pending'; reason: string | null; failed: string[] | null; decided_by: string | null
  original: Brief; before: Partial<Brief> | null; after: Partial<Brief> | null; verifier: Verifier | null; redo: Brief | null
  source_check: { pass: boolean; failures?: string[] } | null; redo_source_check: { pass: boolean; failures?: string[] } | null
}
type Q = { id: number; text_en: string; categories: { name_en: string } | null }
type Run = { phase: string; model: string; effort: string | null; status: string; cost_usd: number | null }

const words = (s: string) => s.replace(/_/g, ' ')
const money = (n: number) => `$${n.toFixed(2)}`
const MODEL: Record<string, string> = { 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-fable-5-2': 'Claude Fable 5.2' }
const model = (m: string) => MODEL[m] ?? m
const VERDICT: Record<string, string> = { confirmed: 'confirmed the answer', wrong: 'disagreed', not_supported: 'found the answer not supported', not_applicable: 'not applicable' }
const verdict = (v: string) => VERDICT[v] ?? words(v)

function Sources({ list, ev }: { list?: Source[]; ev?: EvSource[] }) {
  if (!list?.length && !ev?.length) return null
  return (
    <details>
      <summary>Sources ({(list?.length ?? 0) + (ev?.length ?? 0)})</summary>
      {!!list?.length && (
        <>
          <p className="slabel">Law and rulings cited</p>
          <ul>{list.map((s, i) => (
            <li key={i}><a href={s.url} rel="noopener">{s.instrument ?? s.url}</a>{s.article ? `, ${s.article}` : ''}{s.quote ? <> — <em>“{s.quote}”</em></> : null}</li>
          ))}</ul>
        </>
      )}
      {!!ev?.length && (
        <>
          <p className="slabel">Evidence of practice</p>
          <ul>{ev.map((s, i) => <li key={i}><a href={s.url} rel="noopener">{s.title ?? s.url}</a>{s.year ? ` (${s.year})` : ''}</li>)}</ul>
        </>
      )}
    </details>
  )
}

function Block({ who, b, tags }: { who: string; b: Brief; tags?: { answer?: boolean; impl?: boolean } }) {
  return (
    <div className="ck-reader">
      <p className="slabel">{who}</p>
      <p className="ck-ans">{b.answer}{tags?.answer && <span className="cr-tag">changed</span>}</p>
      <p className="ck-impl">Implementation: {b.implementation}{tags?.impl && <span className="cr-tag">changed</span>}</p>
      {b.confidence && <p className="ck-impl">Coder’s confidence: {b.confidence}</p>}
      {b.citation && <details open><summary>Citation</summary><p>{b.citation}</p></details>}
      {b.evidence && <details open><summary>Implementation evidence</summary><p>{b.evidence}</p></details>}
      <Sources list={b.sources} ev={b.evidence_sources} />
      {b.notes && <details><summary>Coder’s notes</summary><p>{b.notes}</p></details>}
    </div>
  )
}

function Card({ r, q }: { r: Row; q?: Q }) {
  const v = r.verifier
  const redo = r.redo
  const before = r.before ?? { answer: r.original.answer, implementation: r.original.implementation }
  const after = r.after ?? (redo ? { answer: redo.answer, implementation: redo.implementation } : before)
  const tags = r.status === 'changed' ? { answer: before.answer !== after.answer, impl: before.implementation !== after.implementation } : undefined
  const scFails = r.source_check?.failures ?? []
  const redoFails = r.redo_source_check?.failures ?? []
  return (
    <article className={`panel ck-item ${r.status}`} id={`q${r.question_id}`}>
      <p className="slabel">Indicator {r.question_id} · {q?.categories?.name_en ?? ''}{r.decided_by && r.decided_by !== 'pipeline' ? ` · decided by ${r.decided_by}` : ''}</p>
      <h3 className="ck-q">{q?.text_en ?? `Indicator ${r.question_id}`}</h3>
      <div className="ck-readers">
        <Block who="Before: the first coder" b={r.original} />
        {r.status === 'changed' && redo && <Block who="After: published answer" b={redo} tags={tags} />}
        {r.status === 'review' && v && (
          <div className="ck-reader">
            <p className="slabel">Second reader · {verdict(v.protection_verdict)}</p>
            <p className="ck-ans">{v.protection_answer}</p>
            <p className="ck-impl">Implementation: {v.implementation_answer} ({verdict(v.implementation_verdict)})</p>
            <p className="note">{v.protection_reason}</p>
            <p className="note">{v.implementation_reason}</p>
          </div>
        )}
        {r.status === 'review' && redo && <Block who="Coded again" b={redo} />}
      </div>
      {r.status === 'changed' && tags && !tags.answer && !tags.impl && <p className="note">Neither the answer nor the rating moved; the citation and evidence were rebuilt.</p>}
      {r.reason && <><p className="slabel">{r.status === 'review' ? 'Why it waits for a person' : 'Why it changed'}</p><p className="ck-reason">{r.reason}</p></>}
      {redo?.what_changed && !(r.reason ?? '').includes(redo.what_changed.slice(0, 60)) && <p className="ck-reason"><em>The recoder’s account:</em> {redo.what_changed}</p>}
      {!!(r.failed?.length || scFails.length) && (
        <details>
          <summary>What the source check found on the first answer</summary>
          <ul>{(scFails.length ? scFails : r.failed ?? []).map((f, i) => <li key={i}>{f.replace(/^source check: /, '')}</li>)}</ul>
        </details>
      )}
      {v && r.status === 'changed' && (
        <details>
          <summary>The second reader’s verdict: {verdict(v.protection_verdict)}</summary>
          <p>Protection: {v.protection_answer}. {v.protection_reason}</p>
          <p>Implementation: {v.implementation_answer} ({verdict(v.implementation_verdict)}). {v.implementation_reason}</p>
        </details>
      )}
      {r.redo_source_check && (
        <details>
          <summary>Source check of the new answer: {r.redo_source_check.pass ? 'passed' : 'found problems'}</summary>
          {redoFails.length ? <ul>{redoFails.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p>Every cited source was opened and the quoted words found.</p>}
        </details>
      )}
    </article>
  )
}

const STEPS: { phase: string; name: string; touched: (r: Row) => boolean }[] = [
  { phase: 'sources', name: 'Source check', touched: r => !!r.source_check },
  { phase: 'verify', name: 'Second reader', touched: r => !!r.verifier },
  { phase: 'redo', name: 'Coded again', touched: r => !!r.redo },
  { phase: 'sources2', name: 'Source check of the new answers', touched: r => !!r.redo_source_check },
]

export default async function Page() {
  const [rows, runs] = await Promise.all([
    select<Row>(`dossier_checks?select=*&country_id=eq.${COUNTRY}&order=question_id`, 60),
    select<Run>(`dossier_check_runs?select=phase,model,effort,status,cost_usd&country_id=eq.${COUNTRY}`, 60),
  ])
  const qs = await select<Q>(`questions?select=id,text_en,categories(name_en)&id=in.(${rows.map(r => r.question_id).join(',')})`, 3600)
  const Q = new Map(qs.map(q => [q.id, q]))
  const by = (s: Row['status']) => rows.filter(r => r.status === s)
  const verified = by('verified'), changed = by('changed'), review = by('review'), pending = by('pending')

  let conclusions = ''
  try { conclusions = fs.readFileSync(path.join(process.cwd(), 'apps/mrd/dossiers/costa-rica-conclusions.md'), 'utf8').trim() } catch { /* none yet */ }

  const total = runs.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0)
  const table = STEPS.map(s => {
    const rs = runs.filter(r => r.phase === s.phase)
    const groups = [...new Set(rs.map(r => `${r.model}|${r.effort ?? ''}`))]
    const touched = rows.filter(s.touched).length
    const cost = rs.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0)
    return {
      name: s.name, touched, cost, sessions: rs.length,
      model: groups.map(g => { const [m, e] = g.split('|'); return `${model(m)}${e ? `, ${e} effort` : ''}` }).join('; ') || '—',
    }
  })

  return (
    <main className="wrap cr">
      <header className="top">
        <div className="eyebrow">
          <span><a href="/mrd/dossiers">MRD · six new dossiers</a> · <a href="/mrd/dossiers/checks">checks</a> · <a href="/mrd/dossiers/changes">what changed this week</a> · Costa Rica · <a href="/mrd/countries/costa_rica">the library</a></span>
        </div>
        <h1>Costa Rica: <em>what the checks changed</em></h1>
        <p className="lede">
          This is an experimental dossier: Claude Opus 5.5 coded Costa Rica’s 64 indicators on 6 November 2026, and it is not part of the Migrant Rights Database’s human-coded data.
          On 17 November every answer went through two checks. A source check (Claude Sonnet 5.5) confirms the coder actually opened each cited source, that the quoted words are at the cited article,
          and that the evidence of practice is about practice and about the right people. A second reader (Claude Opus 5.5) reads the primary law itself and tries to prove the answer wrong.
          An answer that failed either check, or that the coder marked low confidence, was coded again by Claude Fable 5.2, reading the law and rulings in full; the new answer then had its own source check.
          A fixed rule then decides whether the answer is verified, changed, or waits for a person.
        </p>
        <p className="lede"><strong>
          {verified.length} of {rows.length} verified ({verified.length - verified.filter(r => r.redo).length} as first coded, {verified.filter(r => r.redo).length} after being coded again with the same answer) · {changed.length} changed · {review.length} waiting for a person
          {pending.length > 0 && <> · {pending.length} still being coded again (in progress, this page updates itself)</>}
        </strong></p>
      </header>

      <section className="ck-list">
        <h2>Changed answers ({changed.length})</h2>
        {changed.length ? changed.map(r => <Card key={r.question_id} r={r} q={Q.get(r.question_id)} />) : <p className="note">No answer has changed yet.</p>}
      </section>

      <section className="ck-list">
        <h2>Waiting for a person ({review.length})</h2>
        {review.length ? review.map(r => <Card key={r.question_id} r={r} q={Q.get(r.question_id)} />) : <p className="note">Nothing is waiting.</p>}
      </section>

      <section className="ck-list">
        <h2>Changed by a person before the checks</h2>
        <article className="panel ck-item changed">
          <p className="slabel">Indicator 55 · Advised of asylum before expulsion</p>
          <p className="ck-reason">
            This answer was coded Yes on a Constitutional Chamber ruling (Voto 2025-019485) known only from a press summary. The full ruling is a three-sentence finding about one group of people,
            with no order to inform anyone. After the MRD team’s review it was coded again as No from the full text on 17 November.
          </p>
        </article>
      </section>

      <section className="ck-list">
        <h2>Verified ({verified.length})</h2>
        <details>
          <summary>Show the {verified.length} answers</summary>
          <ul className="cr-ver">
            {verified.map(r => {
              const a = r.after ?? r.original
              return <li key={r.question_id}><span className="slabel">{r.question_id}</span> {Q.get(r.question_id)?.text_en} <strong>{a.answer ?? r.original.answer}</strong>{(a.implementation ?? r.original.implementation) ? <span className="cr-impl"> · {a.implementation ?? r.original.implementation}</span> : null}</li>
            })}
          </ul>
        </details>
      </section>

      <section className="rv-rank">
        <h2>What the checks cost</h2>
        <div className="rv-scroll">
          <table className="rv-table">
            <thead><tr><th>Step</th><th>Model</th><th>Sessions</th><th>Answers touched</th><th>Cost</th><th>Per answer</th></tr></thead>
            <tbody>
              {table.map(t => (
                <tr key={t.name}><td>{t.name}</td><td>{t.model}</td><td>{t.sessions}</td><td>{t.touched}</td><td>{money(t.cost)}</td><td>{t.touched ? money(t.cost / t.touched) : '—'}</td></tr>
              ))}
              <tr><td><strong>Total</strong></td><td></td><td>{runs.length}</td><td></td><td><strong>{money(total)}</strong></td><td></td></tr>
            </tbody>
          </table>
        </div>
        <p className="note">Dollars are API-equivalent: what the same work would cost on the API. The work itself ran on a Claude Max subscription. Sessions that failed and were run again, and any still running, are included.</p>
      </section>

      {conclusions && (
        <section className="rv-report">
          <div className="md"><h2>Conclusions</h2></div>
          <Md text={conclusions} />
        </section>
      )}
    </main>
  )
}
