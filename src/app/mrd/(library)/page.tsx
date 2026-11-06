import Link from 'next/link'
import Finder from './Finder'
import { home, options, wheelMax } from './data'
import { BASE, GROUPS, KIND_ORDER, KINDS, Legend, Wheel, fmt, groupColor } from './ui'

export default async function Page() {
  const h = await home()
  const max = wheelMax(h)
  const { countries, categories } = options(h)
  const s = h.stats
  return (
    <>
      <section className="hero">
        <div>
          <h1>Check the Legislation</h1>
          <p className="lede">
            Every statute, regulation, court decision and treaty the Migrant Rights Database cites, collected from the countries that
            wrote them. Search their full texts in the original languages, or browse them by country and by right.
          </p>
        </div>
        <Finder countries={countries} categories={categories} />
      </section>

      <div className="stats">
        <div className="stat"><b>{fmt(s.texts)}</b><span>laws in full text, of {fmt(s.laws)} cited</span></div>
        <div className="stat"><b>{s.countries}</b><span>countries</span></div>
        <div className="stat"><b>{s.languages}</b><span>languages, kept as written</span></div>
        <div className="stat"><b>{fmt(Math.round(s.chars / 6.2 / 1e6))}M</b><span>words of law to search</span></div>
      </div>

      <section className="sec">
        <div className="sec-h">
          <h2>Countries</h2>
          <Link className="pill" href={`${BASE}/countries`}>Explore countries</Link>
        </div>
        <Legend />
        <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>Each spoke is one category of rights; its length is the number of laws the database cites for it.</p>
        <div className="wheels">
          {h.countries.map(c => (
            <Link key={c.slug} href={`${BASE}/countries/${c.slug}`} className="wheel">
              <Wheel cats={c.cats} max={max} />
              <span className="pill">{c.name}</span>
              <small>{c.texts} of {c.laws} laws in full text</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Categories</h2>
          <Link className="pill" href={`${BASE}/categories`}>All categories</Link>
        </div>
        {GROUPS.map(g => {
          const cs = h.categories.filter(c => c.group === g.key)
          if (!cs.length) return null
          return (
            <div key={g.key} style={{ marginBottom: 30 }}>
              <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="dot" style={{ background: groupColor(g.key) }} />{g.label}
              </div>
              <div className="cats">
                {cs.map(c => (
                  <Link key={c.slug} href={`${BASE}/categories/${c.slug}`} className="cat">
                    <b>{c.name}</b><em>{fmt(c.laws)} laws</em>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Types of law</h2></div>
        <div className="cats">
          {KIND_ORDER.filter(k => h.kinds[k]).map(k => (
            <Link key={k} href={`${BASE}/search?kind=${k}`} className="cat"><b>{KINDS[k]}</b><em>{fmt(h.kinds[k])}</em></Link>
          ))}
        </div>
      </section>
    </>
  )
}
