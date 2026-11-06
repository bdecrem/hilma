import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { articleTranslations, rpc } from '@/lib/mrd/db'
import { getDoc, page } from '@/lib/mrd/text'
import { ArticleChips } from './Articles'
import Reader from './Reader'
import { BASE, Badge, CatChip, Flag, KINDS, LawMeta, langName, size, type Cat, type CountryRef } from '../../ui'

type Law = {
  id: string; name: string; name_en: string | null; official: string | null; cited: string; kind: string; number: string | null; court: string | null
  year: number | null; date: string | null; in_force: string | null; language: string | null; url: string | null; domain: string | null
  official_source: boolean | null; format: string | null; file: boolean; chars: number | null; status: string; fetched_at: string | null
  country: CountryRef
  citations: { id: number; articles: string; quote: string | null; text: string; question: string | null; question_id: number | null; cat: Cat }[]
  related: { id: string; name: string; kind: string; year: number | null; status: string; shared: number }[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const getLaw = (id: string) => (UUID.test(id) ? rpc<Law | null>('lib_law', { p_id: id }) : Promise.resolve(null))

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const law = await getLaw((await params).id)
  if (!law) return { title: 'Not found' }
  return { title: `${law.name} (${law.country.name})`, description: `${KINDS[law.kind] ?? law.kind}${law.year ? `, ${law.year}` : ''}. Cited ${law.citations.length} times in the Migrant Rights Database.` }
}

const IN_FORCE: Record<string, string> = { in_force: 'In force', amended: 'Amended', repealed: 'Repealed' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const [{ id }, { q }] = await Promise.all([params, searchParams])
  const law = await getLaw(id)
  if (!law) notFound()
  const doc = law.status === 'text' ? await getDoc(law.id) : null
  const first = doc ? page(doc, 0) : null
  const english = doc && law.language && law.language !== 'en'
    ? Object.fromEntries((await articleTranslations(law.id)).map(a => [a.article, a.english]))
    : undefined
  const rtl = law.language === 'ar' || law.language === 'he'
  // the same citation can name a law under several questions; group the cards by category
  return (
    <>
      <div className="crumbs">
        <Link href={`${BASE}/countries/${law.country.slug}`}>{law.country.name}</Link><span>›</span>
        <Link href={`${BASE}/search?country=${law.country.slug}&kind=${law.kind}`}>{KINDS[law.kind] ?? law.kind}</Link>
      </div>
      {law.country.experimental && (
        <p className="exp-banner"><Flag long /> This law was traced for a dossier Claude compiled, not by the Migrant Rights Initiative&apos;s coders.</p>
      )}
      <div className="law-h">
        <h1>{law.name}</h1>
        {law.official && law.official !== law.name && <div className="official" dir={rtl ? 'rtl' : undefined}>{law.official}</div>}
        {law.cited && law.cited !== law.name && law.cited !== law.official && <div className="official" style={{ fontStyle: 'normal' }}>Cited as “{law.cited}”</div>}
      </div>

      <dl className="facts">
        <div><dt>Availability</dt><dd><Badge status={law.status} /></dd></div>
        <div><dt>Country</dt><dd><Link href={`${BASE}/countries/${law.country.slug}`}>{law.country.name}</Link>{law.country.experimental && <> <Flag /></>}</dd></div>
        <div><dt>Type</dt><dd>{KINDS[law.kind] ?? law.kind}</dd></div>
        {law.number && <div><dt>Number</dt><dd>{law.number}</dd></div>}
        {law.court && <div><dt>Court</dt><dd>{law.court}</dd></div>}
        {(law.date || law.year) && <div><dt>{law.kind === 'court_decision' ? 'Decided' : 'Enacted'}</dt><dd>{law.date ? new Date(law.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : law.year}</dd></div>}
        {law.in_force && IN_FORCE[law.in_force] && <div><dt>Status</dt><dd>{IN_FORCE[law.in_force]}</dd></div>}
        {law.language && law.status === 'text' && <div><dt>Language of the text</dt><dd>{langName(law.language)}</dd></div>}
        {law.chars ? <div><dt>Length</dt><dd>{size(doc ? doc.text.length : law.chars)}</dd></div> : null}
        {law.domain && <div><dt>Source</dt><dd>{law.url ? <a href={law.url} target="_blank" rel="noreferrer">{law.domain}</a> : law.domain}{law.official_source ? ' (official)' : ''}</dd></div>}
      </dl>
      <div className="actions">
        {law.url && <a className="pill" href={law.url} target="_blank" rel="noreferrer">Original source ↗</a>}
        {law.file && <a className="pill ghost" href={`/api/mrd/law/${law.id}/file`}>Download the original{law.format ? ` (${law.format.toUpperCase()})` : ''}</a>}
        {first && <a className="pill ghost" href="#text">Read the full text ↓</a>}
      </div>

      <div className="law-grid">
        <section>
          <h2 style={{ marginBottom: 20 }}>Cited in the Migrant Rights Database</h2>
          <div className="cites">
            {law.citations.map(c => (
              <article key={`${c.id}-${c.articles}`} className="cite">
                <CatChip c={c.cat} />
                {c.question && <h3>{c.question}</h3>}
                {c.articles && <ArticleChips articles={c.articles} enabled={!!first} english={english} />}
                {c.quote && <blockquote>{c.quote}</blockquote>}
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        </section>
        <aside className="aside">
          {law.related.length > 0 && (
            <>
              <h2>Cited with it</h2>
              <ul>
                {law.related.map(r => (
                  <li key={r.id}>
                    <Link href={`${BASE}/law/${r.id}`}>{r.name}</Link>
                    <LawMeta status={r.status} kind={r.kind} year={r.year} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      {first ? (
        <Reader id={law.id} first={first.text} pages={first.pages} chars={doc!.text.length} q={q ?? ''} lang={law.language ?? undefined} />
      ) : (
        <section className="reader" id="text">
          <div className="note">
            {law.status === 'link' ? (
              <><b>Not stored here.</b> The source site blocks automated downloads.{law.url && <> <a href={law.url} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', fontWeight: 700 }}>Read it on {law.domain} ↗</a></>}</>
            ) : (
              <><b>No public copy found.</b> The citations above are all there is on it.</>
            )}
          </div>
        </section>
      )}
    </>
  )
}
