import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { rpc } from '@/lib/mrd/db'
import Finder from '../../Finder'
import { home, options } from '../../data'
import { BASE, GROUPS, LawMeta, groupColor } from '../../ui'

type LawRef = { id: string; name: string; kind: string; year: number | null; status: string; articles: string }
type Category = {
  slug: string; name: string; group: string
  questions: { id: number; text: string; countries: { name: string; iso: string; slug: string; laws: LawRef[] }[] }[]
}

const get = (slug: string) => rpc<Category | null>('lib_category', { p_slug: slug })

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await get((await params).slug)
  return { title: c ? c.name : 'Not found' }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [c, h] = await Promise.all([get(slug), home()])
  if (!c) notFound()
  const { countries, categories } = options(h)
  const group = GROUPS.find(g => g.key === c.group)
  return (
    <>
      <div className="crumbs"><Link href={`${BASE}/categories`}>Categories</Link><span>›</span><span>{group?.label}</span></div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span className="dot" style={{ background: groupColor(c.group), width: 22, height: 22 }} />{c.name}
      </h1>
      <hr className="rule" />
      <Finder countries={countries} categories={categories} value={{ category: slug }} placeholder={`Search the laws cited for ${c.name.toLowerCase()}`} />
      {c.questions.map(q => (
        <section key={q.id} className="ind">
          <h3>{q.text}</h3>
          {q.countries.map(co => (
            <div key={co.slug} className="ctry">
              <Link href={`${BASE}/countries/${co.slug}#${slug}`}>{co.name}</Link>
              <ul className="lawlist">
                {co.laws.map(l => (
                  <li key={`${l.id}-${l.articles}`}>
                    <Link href={`${BASE}/law/${l.id}`}>{l.name}</Link>
                    <LawMeta status={l.status} kind={l.kind} year={l.year} extra={l.articles ? <span>{l.articles}</span> : null} />
                  </li>
                ))}
                {co.laws.length === 0 && <li className="muted">No law named in the citation.</li>}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </>
  )
}
