import Link from 'next/link'
import { notFound } from 'next/navigation'
import { COUNTRIES, STEPS, TOTAL, runs, inds, stats, question, chunkLabels, usd, type CountrySlug, type StepKey } from '../../data'

export const dynamic = 'force-static'
export const dynamicParams = false
export function generateStaticParams() {
  return (Object.keys(COUNTRIES) as string[]).flatMap(country => (Object.keys(STEPS) as string[]).map(step => ({ country, step })))
}
export async function generateMetadata({ params }: { params: Promise<{ country: string; step: string }> }) {
  const { country, step } = await params
  const t = `${COUNTRIES[country as CountrySlug] ?? ''} · ${STEPS[step as StepKey]?.name ?? ''}`
  return { title: `MRD · ${t}`, openGraph: { url: `https://ola.cx/mrd/history/${country}/${step}`, title: `MRD · ${t}` } }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const yr = (d: string) => d.slice(0, 4)
const short = (s: string) => s.replace(/\s*\((as of|as of)[^)]*\)/g, '')

function Events({ events }: { events: any[] }) {
  if (!events?.length) return <p className="scale">No dated event found in the period.</p>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {[...events].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e, i) => (
        <div className="ev" key={i}>
          <span className="when">{e.date} · {String(e.kind).replace('_', ' ')}</span>
          <span className="inst">{e.instrument}{e.article ? `, ${e.article}` : ''}</span>
          <span className="what">{e.what_changed}</span>
          {e.url && <span><a href={e.url} target="_blank" rel="noreferrer">source</a></span>}
          {e.passage && <details><summary>Original-language passage</summary><blockquote>{e.passage}</blockquote></details>}
        </div>
      ))}
    </div>
  )
}

function Chips({ step, a }: { step: string; a: any }) {
  const chips: { label: string; answer: string; impl?: string }[] = step === 'forward'
    ? [{ label: '1 Jan 2023', answer: a.answer_2023, impl: a.implementation_2023 }, { label: '1 Jan 2026', answer: a.answer_2026, impl: a.implementation_2026 }]
    : (a.answers_by_date || []).map((d: any) => ({ label: '1 Jan ' + yr(d.date), answer: d.answer, impl: d.implementation }))
  return (
    <div className="chips">
      {chips.map((c, i) => (
        <div className={'chip' + (i > 0 && (c.answer !== chips[i - 1].answer || c.impl !== chips[i - 1].impl) ? ' diff' : '')} key={c.label}>
          <b>{c.label}</b>{c.answer}{c.impl && <em>Implementation: {c.impl}</em>}
        </div>
      ))}
      {step === 'back2000' && <div className="chip"><b>1 Jan 2020</b>the MRD’s answer (starting point)</div>}
    </div>
  )
}

export default async function Page({ params }: { params: Promise<{ country: string; step: string }> }) {
  const { country, step } = await params
  if (!(country in COUNTRIES) || !(step in STEPS)) notFound()
  const c = country as CountrySlug, s = step as StepKey
  const all = runs()
  const list = inds(all, c, s)
  const st = stats(all, c, s)
  const changed = list.filter(i => i.changed), same = list.filter(i => !i.changed)
  const labels = chunkLabels()
  const pendingChunks = all.filter(r => r.slug === c && r.step === s && r.status === 'started')
  const scaleOf = (a: any) => short(String(s === 'forward' ? a.change_2023_2026 : a.change_2000_2020 || ''))
  return (
    <main className="wrap hist">
      <header className="top">
        <div className="eyebrow"><span><Link href="/mrd/history">Argentina and Chile through time</Link> · {COUNTRIES[c]} · {STEPS[s].short.toLowerCase()}</span></div>
        <h1>{COUNTRIES[c]}, <em>{STEPS[s].name.toLowerCase()}</em></h1>
        <p className="lede">
          {STEPS[s].blurb} Starting from the MRD’s human-coded answers. Experimental and not reviewed by a person.
          {' '}<b>{st.done} of {TOTAL} indicators done</b>{st.done < TOTAL ? '; the rest are being researched.' : '.'}
          {' '}{st.changed} show a change. Cost so far {usd(st.cost)} at API prices (it ran on a Claude Max subscription).
        </p>
      </header>

      <section>
        <h2 className="sec">Something changed ({changed.length})</h2>
        {!changed.length && <div className="pending">{st.done ? 'No indicator done so far shows a change.' : 'No indicator is finished yet. Results appear here as each group finishes.'}</div>}
        {changed.map(({ qid, a }) => {
          const q = question(qid)
          return (
            <article className="card" key={qid} id={`q${qid}`}>
              <h3><span className="q">Indicator {qid}</span>{q.text}</h3>
              <Chips step={s} a={a} />
              <p className="scale">{scaleOf(a)}</p>
              {a.starting_answer_concern && <div className="concern"><b>Doubts about the MRD’s starting answer</b>{a.starting_answer_concern}</div>}
              <Events events={a.events} />
              <p className="conf">Confidence: {a.confidence}. {a.sourcing_note}</p>
            </article>
          )
        })}
      </section>

      <section>
        <h2 className="sec">No change found ({same.length})</h2>
        {same.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary>Show the {same.length} indicators with no change</summary>
            <ul className="nc">
              {same.map(({ qid, a }) => (
                <li key={qid}>
                  <b>{qid}</b>{question(qid).text}
                  <div className="scale">{(s === 'forward' ? a.answer_2023 : a.answers_by_date?.[0]?.answer)}. {a.sourcing_note}</div>
                </li>
              ))}
            </ul>
          </details>
        )}
        {!same.length && <div className="pending">None yet.</div>}
      </section>

      {st.done < TOTAL && (
        <section>
          <h2 className="sec">Still to come</h2>
          <div className="pending">
            {TOTAL - st.done} of {TOTAL} indicators are still being researched.
            {pendingChunks.length > 0 && <> Running now: {[...new Set(pendingChunks.map(r => labels[r.chunk] || r.chunk))].join('; ')}.</>}
          </div>
        </section>
      )}
    </main>
  )
}
