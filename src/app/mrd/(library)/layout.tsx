import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Link from 'next/link'
import Header from './Header'
import { BASE } from './ui'
import './library.css'

const dmSans = localFont({
  src: [
    { path: '../../../fonts/dm-sans/DMSans.woff2', style: 'normal' },
    { path: '../../../fonts/dm-sans/DMSans-Italic.woff2', style: 'italic' },
  ],
  weight: '100 1000',
  variable: '--font-dm-sans', display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: { default: 'Migrant Rights Law Library', template: '%s · Migrant Rights Law Library' },
  description: 'The statutes, regulations, court decisions and treaties behind the Migrant Rights Database, in full text, searchable across 45 countries.',
  robots: { index: false, follow: false },
  openGraph: {
    url: 'https://ola.cx/mrd',
    siteName: 'Migrant Rights Law Library',
    title: 'Migrant Rights Law Library',
    description: 'The laws behind the Migrant Rights Database, in full text. Search 2,271 statutes, rulings and treaties from 45 countries.',
  },
}

export const viewport: Viewport = { themeColor: '#f7f3eb' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mri ${dmSans.variable}`}>
      <Header />
      <main>{children}</main>
      <footer className="ftr">
        <div>
          <h2>About</h2>
          <p>
            The Migrant Rights Database scores how 45 countries protect and implement the human rights of migrants, and backs every
            answer with citations to national law. This library gathers the law behind those 2,970 citations: the statutes, regulations,
            decrees, court decisions and treaties, in their original language and full text wherever a public copy could be found.
          </p>
          <div className="actions">
            <a className="pill" href="https://www.migrantrightsinitiative.org/en" target="_blank" rel="noreferrer">The Migrant Rights Initiative</a>
            <Link className="pill" href={`${BASE}/crawl`}>How it was built</Link>
          </div>
        </div>
        <div>
          <h4>About these texts</h4>
          <p className="small">
            Texts were collected automatically from official gazettes, legislature and court sites and other public sources, then matched to
            each citation. Check the source before relying on a text. This library is an independent companion to the Migrant Rights
            Database, not a publication of the Initiative.
          </p>
        </div>
      </footer>
    </div>
  )
}
