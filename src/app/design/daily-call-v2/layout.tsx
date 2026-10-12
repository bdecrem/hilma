import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './v2.css'
import '../_walk/walk.css'
import '../_walk/arcade.css'
import '../_walk/candy.css'
import '../_walk/sticker.css'

// Display: heavy, slightly condensed, friendly without being round.
const display = localFont({ src: '../../../fonts/bricolage-grotesque/BricolageGrotesque.woff2', weight: '200 800', variable: '--font-display', display: 'swap' })
// UI: body, labels, buttons.
const ui = localFont({ src: '../../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--font-ui', display: 'swap' })
// The language: every Spanish phrase on a card, and nothing else.
const serif = localFont({
  src: [
    { path: '../../../fonts/instrument-serif/InstrumentSerif-400.woff2', weight: '400' },
    { path: '../../../fonts/instrument-serif/InstrumentSerif-400-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-serif', display: 'swap',
})
// The three looks' faces, so their live previews on this page render true.
const arcadeDisplay = localFont({ src: '../../../fonts/bungee/Bungee-400.woff2', weight: '400', variable: '--font-arcade-display', display: 'swap' })
const arcadeUi = localFont({ src: '../../../fonts/space-grotesk/SpaceGrotesk.woff2', weight: '300 700', variable: '--font-arcade-ui', display: 'swap' })
const arcadeLang = localFont({
  src: [
    { path: '../../../fonts/space-mono/SpaceMono-400.woff2', weight: '400' },
    { path: '../../../fonts/space-mono/SpaceMono-700.woff2', weight: '700' },
  ],
  variable: '--font-arcade-lang', display: 'swap',
})
const candyDisplay = localFont({ src: '../../../fonts/baloo-2/Baloo2.woff2', weight: '400 800', variable: '--font-candy-display', display: 'swap' })
const candyUi = localFont({ src: '../../../fonts/quicksand/Quicksand.woff2', weight: '300 700', variable: '--font-candy-ui', display: 'swap' })
const stickerDisplay = localFont({ src: '../../../fonts/bangers/Bangers-400.woff2', weight: '400', variable: '--font-sticker-display', display: 'swap' })
const stickerUi = localFont({ src: '../../../fonts/nunito/Nunito.woff2', weight: '200 1000', variable: '--font-sticker-ui', display: 'swap' })
const stickerLang = localFont({ src: '../../../fonts/permanent-marker/PermanentMarker-400.woff2', weight: '400', variable: '--font-sticker-lang', display: 'swap' })
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
