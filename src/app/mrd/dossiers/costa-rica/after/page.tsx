import type { Metadata } from 'next'
import { rpc } from '@/lib/mrd/db'
import { BASE, LABEL, Sources, Top, type Status } from '../shared'

export const revalidate = 60
export const metadata: Metadata = {
  title: 'MRD · Costa Rica after the quality-control pass',
  description: 'All 64 answers of the experimental Costa Rica dossier as published now.',
  openGraph: { url: 'https://ola.cx/mrd/dossiers/costa-rica/after', title: 'MRD · Costa Rica after the quality-control pass', description: 'All 64 answers as published now.' },
}

type Q = {
  id: number; text: string
  answer: { text: string | null } | null
  implementation: { text: string | null; evidence: string | null; sources: { title: string; url: string | null; year: number | null }[] | null } | null
  citations: { id: number; text: string; local: string | null; international: string | null }[]
}
type Country = { categories: { slug: string; name: string; questions: Q[] }[] }
type Checks = Record<string, { status: Status; reason: string | null }>

export default async function Page() {
  const [c, checks] = await Promise.all([
    rpc<Country | null>('lib_country', { p_slug: 'costa-rica' }, 60),
    rpc<Checks>('lib_checks', { p_slug: 'costa-rica' }, 60),
  ])
  if (!c) throw new Error('costa-rica not found')
  const total = c.categories.reduce((a, g) => a + g.questions.length, 0)
  return (
    <main className="wrap cr">
      <Top here="after" />
      <h1>Costa Rica <em>after</em> the quality-control pass</h1>
      <p className="lede">All {total} answers as published now: the first coding where the checks confirmed it, the new coding where they changed it. Each carries its status.</p>
      {c.categories.map(g => (
        <section key={g.slug} className="ck-list">
          <h2>{g.name}</h2>
          {g.questions.map(q => {
            const st = checks[q.id]?.status
            return (
              <article key={q.id} className={`panel ck-item ${st ?? ''}`} id={`q${q.id}`}>
                <p className="slabel">Indicator {q.id}{st && <span className={`cr-tag cr-${st}`}>{LABEL[st]}</span>}</p>
                <h3 className="ck-q">{q.text}</h3>
                <div className="ck-reader">
                  <p className="ck-ans">{q.answer?.text ?? '—'}</p>
                  <p className="ck-impl">Implementation: {q.implementation?.text ?? '—'}</p>
                  {q.citations[0]?.text && <p className="cr-cite">{q.citations[0].text}</p>}
                  {(q.implementation?.evidence || q.implementation?.sources?.length || q.citations[0]?.local) && (
                    <details>
                      <summary>Evidence and sources</summary>
                      {q.implementation?.evidence && <><p className="slabel">Implementation evidence</p><p>{q.implementation.evidence}</p></>}
                      {q.citations[0]?.local && <><p className="slabel">Law and rulings cited</p><pre className="cr-pre">{q.citations[0].local}</pre></>}
                      <Sources ev={q.implementation?.sources} />
                    </details>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ))}
    </main>
  )
}
