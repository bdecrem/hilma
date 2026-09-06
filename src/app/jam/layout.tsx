import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import './jam.css'

// Panel labels: a condensed industrial grotesk, always caps + tracking.
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-panel' })
// Reading: a quiet sans with real personality in its numerals.
const instrument = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' })
// Readouts: BPM, bars, values.
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })

export const metadata: Metadata = {
  // Absolute URLs in og:image etc. must point at jambot.to: the project
  // serves several domains and Next otherwise picks one where /jam/* 404s.
  metadataBase: new URL('https://jambot.to'),
  title: 'Jambot — a groovebox you talk to',
  description:
    'Describe a beat, hear it in seconds, turn the knobs, keep every track. Publish it and let anyone remix it.',
  icons: {
    icon: [
      { url: '/jam/favicon.ico', sizes: 'any' },
      { url: '/jam/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/jam/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/jam/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#DCDFD8',
}

export default function JamLayout({ children }: { children: React.ReactNode }) {
  return <div className={`jb ${barlow.variable} ${instrument.variable} ${mono.variable}`}>{children}</div>
}
