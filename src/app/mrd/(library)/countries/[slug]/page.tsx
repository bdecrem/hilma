import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { rpc } from '@/lib/mrd/db'
import Finder from '../../Finder'
import { home, options, wheelMax } from '../../data'
import { BASE, KIND_ORDER, KINDS, LawMeta, Legend, Wheel, groupColor, langName, size } from '../../ui'

type LawRef = { id: string; name: string; kind: string; year: number | null; status: string; articles?: string }
type Country = {
  name: string; iso: string; slug: string
  stats: { laws: number; texts: number; links: number; chars: number }
  categories: { slug: string; name: string; group: string; questions: { id: number; text: string; citations: { id: number; text: string; laws: LawRef[] }[] }[] }[]
  laws: (LawRef & { official: string | null; chars: number | null; language: string | null; cites: number })[]
}

const get = (slug: string) => rpc<Country | null>('lib_country', { p_slug: slug })

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await get((await params).slug)
  return { title: c ? c.name : 'Not found', description: c ? `${c.stats.laws} laws cited for ${c.name} in the Migrant Rights Database, ${c.stats.texts} in full text.` : undefined }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [c, h] = await Promise.all([get(slug), home()])
  if (!c) notFound()
  const me = h.countries.find(x => x.slug === slug)
  const { countries, categories } = options(h)
  const byKind = KIND_ORDER.map(k => ({ k, laws: c.laws.filter(l => l.kind === k) })).filter(g => g.laws.length)
  return (
    <>
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

      <div className="sec-h" style={{ marginTop: 64 }}>
        <h2>The laws</h2>
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
                    {q.citations.map(ci => (
                      <details key={ci.id}>
                        <summary>What the database says</summary>
                        <p>{ci.text}</p>
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
                    {laws.size === 0 && <li className="muted">No law named in the citation.</li>}
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
