import type { Metadata } from 'next'
import { Block, Top, getQuestions, getRows } from '../shared'

export const revalidate = 60
export const metadata: Metadata = {
  title: 'MRD · Costa Rica before the quality-control pass',
  description: 'All 64 answers of the experimental Costa Rica dossier as first coded.',
  openGraph: { url: 'https://ola.cx/mrd/dossiers/costa-rica/before', title: 'MRD · Costa Rica before the quality-control pass', description: 'All 64 answers as first coded.' },
}

export default async function Page() {
  const rows = await getRows()
  const Q = await getQuestions(rows.map(r => r.question_id))
  const ordered = [...rows].sort((a, b) => a.question_id - b.question_id)
  const cats: { name: string; rows: typeof rows }[] = []
  for (const r of ordered) {
    const name = Q.get(r.question_id)?.categories?.name_en ?? 'Other'
    let g = cats.find(c => c.name === name)
    if (!g) cats.push((g = { name, rows: [] }))
    g.rows.push(r)
  }
  return (
    <main className="wrap cr">
      <Top here="before" />
      <h1>Costa Rica <em>before</em> the quality-control pass</h1>
      <p className="lede">All {rows.length} answers as the first coder (Claude Opus 5.5, 6 November 2026) wrote them, in question order, grouped by right.</p>
      {cats.map(c => (
        <section key={c.name} className="ck-list">
          <h2>{c.name}</h2>
          {c.rows.map(r => (
            <article key={r.question_id} className="panel ck-item" id={`q${r.question_id}`}>
              <p className="slabel">Indicator {r.question_id}</p>
              <h3 className="ck-q">{Q.get(r.question_id)?.text_en}</h3>
              <Block who="As first coded" b={r.original} />
            </article>
          ))}
        </section>
      ))}
    </main>
  )
}
