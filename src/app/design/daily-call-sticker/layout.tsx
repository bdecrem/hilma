import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

const display = localFont({ src: '../../../fonts/bangers/Bangers-400.woff2', weight: '400', variable: '--font-sticker-display', display: 'swap' })
const ui = localFont({ src: '../../../fonts/nunito/Nunito.woff2', weight: '200 1000', variable: '--font-sticker-ui', display: 'swap' })
const lang = localFont({ src: '../../../fonts/permanent-marker/PermanentMarker-400.woff2', weight: '400', variable: '--font-sticker-lang', display: 'swap' })
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
