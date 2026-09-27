import type { Metadata, Viewport } from 'next'
import { Archivo_Black, DM_Mono, Instrument_Serif } from 'next/font/google'
import './drum.css'

// The nameplate, key caps and sheet numbers: a heavy grotesk that survives small.
const display = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--drum-display' })
// Labels, readouts, the colophon: the machine's voice.
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--drum-mono' })
// The operating instructions' title, the one italic in the building.
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['italic', 'normal'], variable: '--drum-serif' })

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
  themeColor: '#ff4b1f',
}

export default function DrumLayout({ children }: { children: React.ReactNode }) {
  return <div className={`drum ${display.variable} ${mono.variable} ${serif.variable}`}>{children}</div>
}
