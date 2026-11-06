import type { Metadata } from 'next'
import Link from 'next/link'
import { rpc } from '@/lib/mrd/db'
import Finder from '../Finder'
import { home, options, type Row } from '../data'
import { BASE, CatChip, LawMeta, Snippet, fmt, langName, size } from '../ui'

export const metadata: Metadata = { title: 'Search' }

type SP = { q?: string; country?: string; category?: string; kind?: string; status?: string; page?: string }
const PER = 20

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const pageNo = Math.max(1, Number(sp.page) || 1)
  const [h, res] = await Promise.all([
    home(),
    rpc<{ total: number; rows: Row[] }>('lib_search', {
      p_q: sp.q, p_country: sp.country, p_category: sp.category, p_kind: sp.kind, p_status: sp.status, p_page: pageNo, p_per: PER,
    }, false),
  ])
  const { countries, categories } = options(h)
  const pages = Math.ceil(res.total / PER)
  const link = (p: number) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'page') qs.set(k, v)
    if (p > 1) qs.set('page', String(p))
    return `${BASE}/search?${qs}`
  }
  const lawHref = (id: string) => `${BASE}/law/${id}${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ''}`
  return (
    <>
      <h1>Search the laws</h1>
      <hr className="rule" />
      <Finder key={JSON.stringify(sp)} full countries={countries} categories={categories}
        value={{ q: sp.q, country: sp.country, category: sp.category, kind: sp.kind, status: sp.status }} />
      <p className="count">
        {fmt(res.total)} {res.total === 1 ? 'law' : 'laws'}{sp.q ? <> matching <b style={{ color: '#000' }}>{sp.q}</b></> : null}
        {pages > 1 ? ` · page ${pageNo} of ${pages}` : ''}
      </p>
      {res.rows.length === 0 ? (
        <div className="empty">Nothing found. Try fewer words, the law&apos;s name in its own language, or clear a filter.</div>
      ) : (
        <ul className="rows">
          {res.rows.map(r => (
            <li key={r.id} className="row">
              <LawMeta status={r.status} country={r.country} kind={r.kind} year={r.year}
                extra={<>{r.chars ? <span>{size(r.chars)}</span> : null}{r.language && r.status === 'text' ? <span>{langName(r.language)}</span> : null}</>} />
              <h3><Link href={lawHref(r.id)}>{r.name}</Link></h3>
              {r.official && r.official !== r.name && <div className="official">{r.official}</div>}
              {r.snippet && (
                <p className="snip"><i>{r.snippet_from === 'text' ? 'In the text' : 'In the database'}</i><Snippet text={r.snippet} /></p>
              )}
              {r.cats.length > 0 && (
                <div className="chips">{r.cats.map(c => <CatChip key={c.slug} c={c} />)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <Link className="pill ghost" href={link(pageNo - 1)} aria-disabled={pageNo <= 1}>Previous</Link>
          <span>{pageNo} / {pages}</span>
          <Link className="pill ghost" href={link(pageNo + 1)} aria-disabled={pageNo >= pages}>Next</Link>
        </nav>
      )}
    </>
  )
}
