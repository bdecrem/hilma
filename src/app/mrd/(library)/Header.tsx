'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BASE, Logo } from './ui'

export default function Header() {
  const path = usePathname()
  const home = path === BASE || path === `${BASE}/`
  const on = (p: string) => (path.startsWith(`${BASE}/${p}`) ? 'pill on' : 'pill')
  return (
    <header className="hdr">
      <Link href={BASE} className="brand" aria-label="Migrant Rights Law Library, home">
        <Logo />
        <b>Migrant Rights<br />Law Library</b>
      </Link>
      {home && (
        <div className="tagline">
          <p>Every law the Migrant Rights Database cites, in full text.</p>
          <Link href={`${BASE}/search`}>Search them →</Link>
        </div>
      )}
      <nav>
        <Link className={on('search')} href={`${BASE}/search`}>Search</Link>
        <Link className={on('categories')} href={`${BASE}/categories`}>Categories</Link>
        <Link className={on('countries')} href={`${BASE}/countries`}>Countries</Link>
      </nav>
    </header>
  )
}
