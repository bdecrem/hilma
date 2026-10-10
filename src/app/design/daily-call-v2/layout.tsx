import type { Metadata, Viewport } from 'next'
import { Baloo_2, Bangers, Bricolage_Grotesque, Bungee, Instrument_Sans, Instrument_Serif, Nunito, Permanent_Marker, Quicksand, Space_Grotesk, Space_Mono } from 'next/font/google'
import './v2.css'
import '../_walk/walk.css'
import '../_walk/arcade.css'
import '../_walk/candy.css'
import '../_walk/sticker.css'

// Display: heavy, slightly condensed, friendly without being round.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
// UI: body, labels, buttons.
const ui = Instrument_Sans({ subsets: ['latin'], variable: '--font-ui', display: 'swap' })
// The language: every Spanish phrase on a card, and nothing else.
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' })
// The three looks' faces, so their live previews on this page render true.
const arcadeDisplay = Bungee({ subsets: ['latin'], weight: '400', variable: '--font-arcade-display', display: 'swap' })
const arcadeUi = Space_Grotesk({ subsets: ['latin'], variable: '--font-arcade-ui', display: 'swap' })
const arcadeLang = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-arcade-lang', display: 'swap' })
const candyDisplay = Baloo_2({ subsets: ['latin'], variable: '--font-candy-display', display: 'swap' })
const candyUi = Quicksand({ subsets: ['latin'], variable: '--font-candy-ui', display: 'swap' })
const stickerDisplay = Bangers({ subsets: ['latin'], weight: '400', variable: '--font-sticker-display', display: 'swap' })
const stickerUi = Nunito({ subsets: ['latin'], variable: '--font-sticker-ui', display: 'swap' })
const stickerLang = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-sticker-lang', display: 'swap' })
const lookFonts = [arcadeDisplay, arcadeUi, arcadeLang, candyDisplay, candyUi, stickerDisplay, stickerUi, stickerLang].map((f) => f.variable).join(' ')

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
  return <div className={`${display.variable} ${ui.variable} ${serif.variable} ${lookFonts}`}>{children}</div>
}
