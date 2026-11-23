import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import content from './content.json'
import './seminar.css'

// The handout for Bart's CASBS seminar (2026-11): build a real website with
// Claude Code. Served at bartin16.xyz/seminar, in the look of the homepage it
// sits beside (warm paper, Inter Tight light against bold, clay for the accent).
const tight = localFont({
  src: '../../fonts/inter-tight/InterTight.woff2',
  weight: '100 900',
  variable: '--font-tight',
  display: 'swap',
})

const description =
  'A step-by-step sheet for building and publishing your own website with Claude Code, written for people who are not technical.'

export const metadata: Metadata = {
  metadataBase: new URL('https://bartin16.xyz'),
  title: content.title,
  description,
  alternates: { canonical: '/seminar' },
  openGraph: { title: content.title, description, url: '/seminar', type: 'article' },
  twitter: { card: 'summary_large_image', title: content.title, description },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#fff6ea',
  colorScheme: 'light',
}

export default function SeminarLayout({ children }: { children: React.ReactNode }) {
  return <div className={`sem ${tight.variable}`}>{children}</div>
}
