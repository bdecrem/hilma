import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Instrument_Sans, Instrument_Serif } from 'next/font/google'
import './v2.css'

// Display: heavy, slightly condensed, friendly without being round.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
// UI: body, labels, buttons.
const ui = Instrument_Sans({ subsets: ['latin'], variable: '--font-ui', display: 'swap' })
// The language: every Spanish phrase on a card, and nothing else.
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Daily call v2 — design artifact',
  description:
    'High-fidelity flows for a daily language app: a three-minute call, three things to say back, a round of cards, and a map with a streak. A visual direction to react to.',
  openGraph: {
    title: 'Daily call v2 — in color',
    description: 'Talk, three things, cards. Five screens, one loop, a parrot.',
    url: 'https://ola.cx/design/daily-call-v2',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#efede8',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${ui.variable} ${serif.variable}`}>{children}</div>
}
