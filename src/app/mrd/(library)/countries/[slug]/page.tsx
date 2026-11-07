import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { rpc } from '@/lib/mrd/db'
import Finder from '../../Finder'
import { home, options, wheelMax } from '../../data'
import { BASE, Flag, KIND_ORDER, KINDS, LawMeta, Legend, Wheel, groupColor, langName, size } from '../../ui'

type LawRef = { id: string; name: string; kind: string; year: number | null; status: string; articles?: string }
type Answer = { text: string | null; score: number | null; confidence: string | null; notes: string | null } | null
type Impl = { text: string | null; score: number | null; evidence: string | null; sources: { title: string; url: string | null; year: number | null }[] | null } | null
type Score = { slug: string; name: string; group: string; protection: number | null; implementation: number | null; adjusted: number | null }
type Country = {
  name: string; iso: string; slug: string; experimental: boolean
  description: string | null; coded_at: string | null; coded_by: string | null; year: number | null
  stats: { laws: number; texts: number; links: number; chars: number }
  scores: Score[]
  categories: { slug: string; name: string; group: string; questions: { id: number; text: string; answer: Answer; implementation: Impl; citations: { id: number; text: string; local: string | null; international: string | null; laws: LawRef[] }[] }[] }[]
  laws: (LawRef & { official: string | null; chars: number | null; language: string | null; cites: number })[]
}

const get = (slug: string) => rpc<Country | null>('lib_country', { p_slug: slug })
const n0 = (x: number | null | undefined) => (x === null || x === undefined ? '—' : String(Math.round(x)))

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await get((await params).slug)
  return { title: c ? `${c.name}${c.experimental ? ' (experimental dossier)' : ''}` : 'Not found', description: c ? `${c.stats.laws} laws cited for ${c.name} in the Migrant Rights Database, ${c.stats.texts} in full text.` : undefined }
}

function Pill({ label, text, score }: { label: string; text: string | null; score: number | null }) {
  const tone = score === null ? 'na' : score >= 75 ? 'hi' : score >= 50 ? 'mid' : 'lo'
  return <span className={`ans ${tone}`} title={label}><i>{label}</i>{text ?? '—'}{score !== null && <b>{Math.round(score)}</b>}</span>
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [c, h] = await Promise.all([get(slug), home()])
  if (!c) notFound()
  const me = h.countries.find(x => x.slug === slug)
  const { countries, categories } = options(h)
  const byKind = KIND_ORDER.map(k => ({ k, laws: c.laws.filter(l => l.kind === k) })).filter(g => g.laws.length)
  const avg = c.scores.find(s => s.group === 'TOTAL SCORE')
  const cats = c.scores.filter(s => s.group !== 'TOTAL SCORE')
  const hasAnswers = c.categories.some(cat => cat.questions.some(q => q.answer))
  return (
    <>
      {c.experimental && (
        <p className="exp-banner">
          <Flag long /> {c.name} is not in the Migrant Rights Database. This dossier was compiled by Claude ({c.coded_by ?? 'Claude'}) with the database&apos;s 2023
          instrument{c.coded_at ? ` on ${new Date(c.coded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' })}` : ''}, and has not been reviewed by the
          Migrant Rights Initiative. <Link href={`${BASE}/dossiers`}>How it was made →</Link>
        </p>
      )}
      <h1 className="c">{c.name}</h1>
      <div className="wheel-hero">
        {me && <Wheel cats={me.cats} max={wheelMax(h)} labels />}
        <div>
          <div className="stats three" style={{ marginTop: 0 }}>
            <div className="stat"><b>{c.stats.laws}</b><span>laws cited</span></div>
            <div className="stat"><b>{c.stats.texts}</b><span>in full text</span></div>
            <div className="stat"><b>{size(c.stats.chars)?.replace(' words', '') ?? '0'}</b><span>words</span></div>
          </div>
          <div style={{ margin: '28px 0' }}><Legend /></div>
          <Finder countries={countries} categories={categories} value={{ country: slug }} placeholder={`Search ${c.name}'s laws`} />
        </div>
      </div>

      {(c.description || avg) && (
        <section className="sec dossier" id="dossier">
          <div className="sec-h"><h2>The dossier{c.year ? ` · ${c.year}` : ''}</h2>{c.experimental && <Flag />}</div>
          {c.description && <p className="overview">{c.description}</p>}
          {avg && (
            <div className="score-grid">
              <div className="score avg">
                <span>Average</span>
                <b>{n0(avg.protection)}</b><b>{n0(avg.implementation)}</b><b>{n0(avg.adjusted)}</b>
              </div>
              <div className="score head"><span /><i>Protection</i><i>Implementation</i><i>Adjusted</i></div>
              {cats.map(s => (
                <a key={s.slug} className="score" href={`#${s.slug}`}>
                  <span><em className="dot" style={{ background: groupColor(s.group) }} />{s.name}</span>
                  <b>{n0(s.protection)}</b><b>{n0(s.implementation)}</b><b>{n0(s.adjusted)}</b>
                </a>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
            Protection: how completely the law protects the right, 0–100. Implementation: how far the authorities give effect to it. Adjusted: the two combined.
            {c.experimental ? ' Computed from the answers below the way the database computes them.' : ' As published by the Migrant Rights Database.'}
          </p>
        </section>
      )}

      <div className="sec-h" style={{ marginTop: 64 }}>
        <h2>{hasAnswers ? 'The indicators and the laws' : 'The laws'}</h2>
        <div className="tabs"><a href="#by-right" className="on">By right</a><a href="#all-laws">All laws</a></div>
      </div>

      <div id="by-right">
        {c.categories.map(cat => (
          <section key={cat.slug} className="block" id={cat.slug}>
            <header>
              <span className="dot" style={{ background: groupColor(cat.group), width: 16, height: 16 }} />
              <Link href={`${BASE}/categories/${cat.slug}`}><h2>{cat.name}</h2></Link>
            </header>
            {cat.questions.map(q => {
              const laws = new Map<string, LawRef & { arts: string[] }>()
              for (const ci of q.citations) for (const l of ci.laws) {
                const x = laws.get(l.id) ?? { ...l, arts: [] }
                if (l.articles && !x.arts.includes(l.articles)) x.arts.push(l.articles)
                laws.set(l.id, x)
              }
              return (
                <div key={q.id} className="q">
                  <div>
                    <h3>{q.text}</h3>
                    {(q.answer || q.implementation) && (
                      <div className="q-answers">
                        {q.answer && <Pill label="Law" text={q.answer.text} score={q.answer.score} />}
                        {q.implementation && <Pill label="Practice" text={q.implementation.text} score={q.implementation.score} />}
                        {q.answer?.confidence && <span className={`conf ${q.answer.confidence}`}>{q.answer.confidence} confidence</span>}
                      </div>
                    )}
                    {q.citations.map(ci => (
                      <details key={ci.id}>
                        <summary>{c.experimental ? 'What the dossier says' : 'What the database says'}</summary>
                        <p>{ci.text}</p>
                        {ci.local && <pre className="sources">{ci.local}</pre>}
                        {ci.international && <p className="intl">{ci.international}</p>}
                        {q.implementation?.evidence && (
                          <div className="evidence">
                            <b>Implementation: {q.implementation.text}.</b> {q.implementation.evidence}
                            {q.implementation.sources && q.implementation.sources.length > 0 && (
                              <ul>{q.implementation.sources.map((s, i) => <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}{s.year ? ` (${s.year})` : ''}</li>)}</ul>
                            )}
                          </div>
                        )}
                        {q.answer?.notes && <p className="notes"><b>Note:</b> {q.answer.notes}</p>}
                      </details>
                    ))}
                  </div>
                  <ul className="lawlist">
                    {[...laws.values()].map(l => (
                      <li key={l.id}>
                        <Link href={`${BASE}/law/${l.id}`}>{l.name}</Link>
                        <LawMeta status={l.status} kind={l.kind} year={l.year} extra={l.arts.length ? <span>{l.arts.join('; ')}</span> : null} />
                      </li>
                    ))}
                    {laws.size === 0 && <li className="muted">{c.experimental && c.stats.laws === 0 ? 'The laws are being traced.' : 'No law named in the citation.'}</li>}
                  </ul>
                </div>
              )
            })}
          </section>
        ))}
      </div>

      <section className="sec" id="all-laws">
        <div className="sec-h"><h2>All laws</h2><span className="muted">{c.laws.length}</span></div>
        <div className="kinds">
          {byKind.map(g => (
            <div key={g.k}>
              <h3>{KINDS[g.k]} · {g.laws.length}</h3>
              <table className="tbl"><tbody>
                {g.laws.map(l => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`${BASE}/law/${l.id}`}>{l.name}</Link>
                      {l.official && l.official !== l.name && <div className="official" style={{ fontSize: 14 }}>{l.official}</div>}
                    </td>
                    <td style={{ width: 120 }}><LawMeta status={l.status} /></td>
                    <td className="n" style={{ width: 160 }}>{[l.year, l.status === 'text' ? langName(l.language) : null, size(l.chars)].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
