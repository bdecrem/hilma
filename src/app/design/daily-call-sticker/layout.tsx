import type { Metadata, Viewport } from 'next'
import { Bangers, Nunito, Permanent_Marker } from 'next/font/google'

const display = Bangers({ subsets: ['latin'], weight: '400', variable: '--font-display', display: 'swap' })
const ui = Nunito({ subsets: ['latin'], variable: '--font-ui', display: 'swap' })
const lang = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-lang', display: 'swap' })
import '../_walk/walk.css'
import '../_walk/sticker.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Daily call · Sticker',
  description: 'The daily-call walkthrough as a sticker zine: fat black outlines, hard shadows, tilted die-cut stickers, marker-pen Spanish.',
  openGraph: { title: 'Daily call · Sticker', description: 'The daily-call walkthrough as a sticker zine: fat black outlines, hard shadows, tilted die-cut stickers, marker-pen Spanish.', url: 'https://ola.cx/design/daily-call-sticker', type: 'website' },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fffdf5',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${ui.variable} ${lang.variable}`}>{children}</div>
}
