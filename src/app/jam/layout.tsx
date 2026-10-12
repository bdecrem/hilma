import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './jam.css'

// Panel labels: a condensed industrial grotesk, always caps + tracking.
const barlow = localFont({
  src: [
    { path: '../../fonts/barlow-condensed/BarlowCondensed-500.woff2', weight: '500' },
    { path: '../../fonts/barlow-condensed/BarlowCondensed-600.woff2', weight: '600' },
    { path: '../../fonts/barlow-condensed/BarlowCondensed-700.woff2', weight: '700' },
  ],
  variable: '--font-panel',
})
// The synth panels' own labels (alt/skins.css), loaded only when they show.
const grotesk = localFont({ src: '../../fonts/space-grotesk/SpaceGrotesk.woff2', weight: '300 700', variable: '--font-grotesk', preload: false })
// Reading: a quiet sans with real personality in its numerals.
const instrument = localFont({ src: '../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--font-body' })
// Readouts: BPM, bars, values.
const mono = localFont({ src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2', weight: '100 800', variable: '--font-mono' })

export const metadata: Metadata = {
  // Absolute URLs in og:image etc. must point at jambot.to: the project
  // serves several domains and Next otherwise picks one where /jam/* 404s.
  metadataBase: new URL('https://jambot.to'),
  title: 'Jambot — a groovebox you talk to',
  description:
    'An AI groovebox: talk to it like a producer and it programs real synth engines — 909 drums, 303 acid, 101 leads — in your browser, on your phone and in your terminal. Every parameter tweakable, every pattern yours.',
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
  return <div className={`jb ${barlow.variable} ${grotesk.variable} ${instrument.variable} ${mono.variable}`}>{children}</div>
}
