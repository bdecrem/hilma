import type { Metadata } from 'next'

const TITLE = 'MRD · Costa Rica'
const DESC = 'An experimental Costa Rica dossier for the Migrant Rights Database and its quality-control pass.'
export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: TITLE,
  description: DESC,
  robots: { index: false, follow: false },
  openGraph: { url: 'https://ola.cx/mrd/costa-rica', title: TITLE, description: DESC },
}

const LINKS = [
  { href: '/mrd/dossiers/costa-rica', title: 'Quality control report', line: 'How the 64 answers were checked, what changed, what it cost.' },
  { href: '/mrd/dossiers/costa-rica/before', title: 'Before the pass', line: 'All 64 answers as first coded, 6 November 2026.' },
  { href: '/mrd/dossiers/costa-rica/after', title: 'After the pass', line: 'All 64 answers as published now, each marked verified, changed or waiting.' },
]

export default function Page() {
  return (
    <main className="wrap cr">
      <header className="top">
        <div className="eyebrow"><span><a href="/mrd/dossiers">MRD · six new dossiers</a> · Costa Rica</span></div>
        <h1>Costa Rica</h1>
        <p className="lede">An experimental dossier for the Migrant Rights Database, coded by Claude, and the quality-control pass it went through.</p>
      </header>
      <nav className="cr-hub">
        {LINKS.map(l => <a key={l.href} href={l.href}><b>{l.title} →</b><span>{l.line}</span></a>)}
      </nav>
    </main>
  )
}
