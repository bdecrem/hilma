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
  description: 'The laws behind the Migrant Rights Database, in full text, for 45 countries.',
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
            The Migrant Rights Database scores how 45 countries protect migrants&apos; rights, and cites national law for every answer.
            This library holds the laws behind its 2,970 citations, in full text and in the original language wherever a public copy exists.
          </p>
          <div className="actions">
            <a className="pill" href="https://www.migrantrightsinitiative.org/en" target="_blank" rel="noreferrer">The Migrant Rights Initiative</a>
            <Link className="pill" href={`${BASE}/crawl`}>How it was built</Link>
          </div>
        </div>
        <div>
          <h4>Sources</h4>
          <p className="small">
            The texts were downloaded automatically from official gazettes, parliament and court websites and other public sources.
            Check the original before relying on one. This library is independent; the Migrant Rights Initiative did not publish it.
          </p>
        </div>
      </footer>
    </div>
  )
}
