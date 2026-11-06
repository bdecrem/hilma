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
        {h.countries.filter(c => !c.experimental).map(c => (
          <Link key={c.slug} href={`${BASE}/countries/${c.slug}`} className="wheel">
            <Wheel cats={c.cats} max={max} />
            <span className="pill">{c.name}</span>
            <small>{c.texts} of {c.laws} laws in full text</small>
          </Link>
        ))}
      </div>
      {h.countries.some(c => c.experimental) && (
        <>
          <div className="sec-h" style={{ marginTop: 56 }}><h2>Experimental dossiers</h2><Link className="pill" href={`${BASE}/dossiers`}>How they are made</Link></div>
          <p className="muted" style={{ fontSize: 14, marginTop: 12, maxWidth: 720 }}>Coded by Claude with the database&apos;s 2023 instrument, not by the Migrant Rights Initiative. Kept apart from its data.</p>
          <div className="wheels">
            {h.countries.filter(c => c.experimental).map(c => (
              <Link key={c.slug} href={`${BASE}/countries/${c.slug}`} className="wheel exp">
                <Wheel cats={c.cats} max={max} />
                <span className="pill">{c.name}</span>
                <small>{c.laws ? `${c.texts} of ${c.laws} laws in full text` : `${c.citations} indicators cited`}</small>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
