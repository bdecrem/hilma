import type { Metadata } from 'next'
import Link from 'next/link'
import { home, wheelMax } from '../data'
import { BASE, Legend, Wheel } from '../ui'

export const metadata: Metadata = { title: 'Countries' }

export default async function Page() {
  const h = await home()
  const max = wheelMax(h)
  return (
    <>
      <h1 className="c">Countries</h1>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}><Legend /></div>
      <div className="wheels">
        {h.countries.map(c => (
          <Link key={c.slug} href={`${BASE}/countries/${c.slug}`} className="wheel">
            <Wheel cats={c.cats} max={max} />
            <span className="pill">{c.name}</span>
            <small>{c.texts} of {c.laws} laws in full text</small>
          </Link>
        ))}
      </div>
    </>
  )
}
