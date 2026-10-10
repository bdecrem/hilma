import type { Metadata, Viewport } from 'next'
import { Baloo_2, Quicksand } from 'next/font/google'

const display = Baloo_2({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const ui = Quicksand({ subsets: ['latin'], variable: '--font-ui', display: 'swap' })
import '../_walk/walk.css'
import '../_walk/candy.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Daily call · Candy',
  description: 'The daily-call walkthrough as candy: a pastel sky, glossy jelly buttons and cards, a gummy parrot.',
  openGraph: { title: 'Daily call · Candy', description: 'The daily-call walkthrough as candy: a pastel sky, glossy jelly buttons and cards, a gummy parrot.', url: 'https://ola.cx/design/daily-call-candy', type: 'website' },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4ecff',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${ui.variable}`}>{children}</div>
}
