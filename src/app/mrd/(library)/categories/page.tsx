import type { Metadata } from 'next'
import Link from 'next/link'
import { home } from '../data'
import { BASE, GROUPS, fmt } from '../ui'

export const metadata: Metadata = { title: 'Categories' }

export default async function Page() {
  const h = await home()
  return (
    <>
      <h1 className="c">Categories</h1>
      <p className="lede" style={{ margin: '18px auto 0', textAlign: 'center' }}>
        17 categories of rights in five groups. Each lists the laws cited for it, country by country.
      </p>
      {GROUPS.map(g => {
        const cs = h.categories.filter(c => c.group === g.key)
        if (!cs.length) return null
        return (
          <section key={g.key} className="block">
            <header><span className="dot" style={{ background: g.color, width: 16, height: 16 }} /><h2>{g.label}</h2></header>
            <div className="cats">
              {cs.map(c => (
                <Link key={c.slug} href={`${BASE}/categories/${c.slug}`} className="cat">
                  <b>{c.name}</b><em>{c.questions} indicators · {fmt(c.laws)} laws</em>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}
