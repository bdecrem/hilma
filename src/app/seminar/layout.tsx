import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './seminar.css'

// Bart's CASBS seminar (2026-12-02): the landing page at bartin16.xyz/seminar and
// its three sheets (website, library, fact-checker), in the look of the homepage they
// sit beside (warm paper, Inter Tight light against bold, clay for the accent).
const tight = localFont({
  src: '../../fonts/inter-tight/InterTight.woff2',
  weight: '100 900',
  variable: '--font-tight',
  display: 'swap',
})

const title = 'The Seminar: three things to build with Claude'
const description =
  'Bart Decrem\'s hands-on seminar at CASBS, December 2, 2026: build your own work website, your own paper library and your own fact checker with Claude. What to do before you come, and the three sheets.'

export const metadata: Metadata = {
  metadataBase: new URL('https://bartin16.xyz'),
  title,
  description,
  alternates: { canonical: '/seminar' },
  openGraph: { title, description, url: '/seminar', type: 'article' },
  twitter: { card: 'summary_large_image', title, description },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#fff6ea',
  colorScheme: 'light',
}

export default function SeminarLayout({ children }: { children: React.ReactNode }) {
  return <div className={`sem ${tight.variable}`}>{children}</div>
}
