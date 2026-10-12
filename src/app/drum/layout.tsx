import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './drum.css'

// The nameplate, key caps and sheet numbers: a heavy grotesk that survives small.
const display = localFont({ src: '../../fonts/archivo-black/ArchivoBlack-400.woff2', weight: '400', variable: '--drum-display' })
// Labels, readouts, the colophon: the machine's voice.
const mono = localFont({
  src: [
    { path: '../../fonts/dm-mono/DMMono-400.woff2', weight: '400' },
    { path: '../../fonts/dm-mono/DMMono-500.woff2', weight: '500' },
  ],
  variable: '--drum-mono',
})
// The operating instructions' title, the one italic in the building.
const serif = localFont({
  src: [
    { path: '../../fonts/instrument-serif/InstrumentSerif-400.woff2', weight: '400' },
    { path: '../../fonts/instrument-serif/InstrumentSerif-400-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--drum-serif',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://hilma-nine.vercel.app'),
  title: 'DRUM',
  description:
    'A four-color risograph you play. Punch the stencil, squeeze the ink, turn the drum by hand. Every sheet it prints is the score of what it played. Designed and built by Claude Opus 5.5.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#b7b1a6',
}

export default function DrumLayout({ children }: { children: React.ReactNode }) {
  return <div className={`drum ${display.variable} ${mono.variable} ${serif.variable}`}>{children}</div>
}
