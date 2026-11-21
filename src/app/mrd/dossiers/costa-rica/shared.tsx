import { select } from '@/lib/mrd/db'

export const COUNTRY = 1004
export const BASE = '/mrd/dossiers/costa-rica'
export const HUB = '/mrd/costa-rica'

export type Source = { url: string; quote?: string; article?: string; instrument?: string }
export type EvSource = { url: string; title?: string; year?: number }
export type Brief = {
  answer: string; implementation: string; confidence?: string | null; citation?: string; evidence?: string; notes?: string | null
  sources?: Source[]; evidence_sources?: EvSource[]
}
export type Verifier = { protection_verdict: string; protection_answer: string; protection_reason: string; implementation_verdict: string; implementation_answer: string; implementation_reason: string }
export type Status = 'verified' | 'changed' | 'review' | 'pending'
export type Row = {
  question_id: number; status: Status; reason: string | null; failed: string[] | null
  original: Brief; redo: Brief | null; redo_first: Brief | null; verifier: Verifier | null
  source_check: { pass: boolean; failures?: string[] } | null; redo_source_check: { pass: boolean; failures?: string[] } | null
}
export type Q = { id: number; text_en: string; categories: { name_en: string } | null }

export const LABEL: Record<Status, string> = { verified: 'verified', changed: 'changed', review: 'waiting for a person', pending: 'not finished' }

export const getRows = () => select<Row>(`dossier_checks?select=*&country_id=eq.${COUNTRY}&order=question_id`, 60)
export async function getQuestions(ids: number[]) {
  const qs = await select<Q>(`questions?select=id,text_en,categories(name_en)&id=in.(${ids.join(',')})&order=id`, 3600)
  return new Map(qs.map(q => [q.id, q]))
}

export function Sources({ list, ev }: { list?: Source[] | null; ev?: { url?: string | null; title?: string; year?: number | null }[] | null }) {
  const n = (list?.length ?? 0) + (ev?.length ?? 0)
  if (!n) return null
  return (
    <>
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
          <ul>{ev.map((s, i) => <li key={i}>{s.url ? <a href={s.url} rel="noopener">{s.title ?? s.url}</a> : s.title}{s.year ? ` (${s.year})` : ''}</li>)}</ul>
        </>
      )}
    </>
  )
}

/** One reader's answer: protection answer, implementation rating, citation, and evidence + sources folded away. */
export function Block({ who, b, tags }: { who: string; b: Brief; tags?: { answer?: boolean; impl?: boolean } }) {
  const hasMore = !!(b.evidence || b.sources?.length || b.evidence_sources?.length)
  return (
    <div className="ck-reader">
      <p className="slabel">{who}</p>
      <p className="ck-ans">{b.answer}{tags?.answer && <span className="cr-tag">changed</span>}</p>
      <p className="ck-impl">Implementation: {b.implementation}{tags?.impl && <span className="cr-tag">changed</span>}</p>
      {b.citation && <p className="cr-cite">{b.citation}</p>}
      {hasMore && (
        <details>
          <summary>Evidence and sources</summary>
          {b.evidence && <><p className="slabel">Implementation evidence</p><p>{b.evidence}</p></>}
          <Sources list={b.sources} ev={b.evidence_sources} />
        </details>
      )}
    </div>
  )
}

export function Top({ here }: { here: string }) {
  return (
    <header className="top">
      <div className="eyebrow"><span><a href={HUB}>Costa Rica</a> · <a href={BASE}>quality control report</a> · {here}</span></div>
    </header>
  )
}
