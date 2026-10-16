import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './concepts.css'

// Notebook: Instrument Serif + Instrument Sans + Caveat + DM Mono.
// Riso: Archivo Black + DM Mono + Fraunces italic.
// Tear-off: Inter Tight + Source Serif 4 italic.
const serif = localFont({ src: [{ path: '../../../fonts/instrument-serif/InstrumentSerif-400.woff2', weight: '400', style: 'normal' }, { path: '../../../fonts/instrument-serif/InstrumentSerif-400-Italic.woff2', weight: '400', style: 'italic' }], variable: '--f-nb-serif', preload: false })
const sans = localFont({ src: '../../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--f-nb-sans', preload: false })
const caveat = localFont({ src: '../../../fonts/caveat/Caveat.woff2', weight: '400 700', variable: '--f-nb-hand', preload: false })
const mono = localFont({ src: [{ path: '../../../fonts/dm-mono/DMMono-400.woff2', weight: '400' }, { path: '../../../fonts/dm-mono/DMMono-500.woff2', weight: '500' }], variable: '--f-mono', preload: false })
const archivo = localFont({ src: '../../../fonts/archivo-black/ArchivoBlack-400.woff2', weight: '400', variable: '--f-rz-display', preload: false })
const fraunces = localFont({ src: [{ path: '../../../fonts/fraunces/Fraunces.woff2', style: 'normal' }, { path: '../../../fonts/fraunces/Fraunces-Italic.woff2', style: 'italic' }], weight: '100 900', variable: '--f-rz-serif', preload: false })
const tight = localFont({ src: '../../../fonts/inter-tight/InterTight.woff2', weight: '100 900', variable: '--f-to-sans', preload: false })
const source = localFont({ src: [{ path: '../../../fonts/source-serif-4/SourceSerif4.woff2', style: 'normal' }, { path: '../../../fonts/source-serif-4/SourceSerif4-Italic.woff2', style: 'italic' }], weight: '200 900', variable: '--f-to-serif', preload: false })

const DESCRIPTION = 'Three design directions for onething: Notebook, Riso and Tear-off. Each with its landing page and a journal page.'

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'onething · three directions',
  description: DESCRIPTION,
  openGraph: { title: 'onething · three directions', description: DESCRIPTION, url: 'https://ola.cx/design/onething', type: 'website' },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4efe2',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={[serif, sans, caveat, mono, archivo, fraunces, tight, source].map((f) => f.variable).join(' ')}>{children}</div>
}
