import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './kochito.css'

// kochitolabs.com (also ola.cx/kochito): the company's site. Two service pages,
// /pdf and /apps, each with one form; what visitors do is counted in
// kochito_events and sign-ups land in kochito_leads (src/lib/kochito/store.ts).
// Headlines in Fraunces, text in Instrument Sans, labels in JetBrains Mono.
const display = localFont({
  src: [
    { path: '../../fonts/fraunces/Fraunces.woff2', style: 'normal' },
    { path: '../../fonts/fraunces/Fraunces-Italic.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--kl-display',
  display: 'swap',
})
const text = localFont({ src: '../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--kl-text', display: 'swap' })
const mono = localFont({ src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2', weight: '100 800', variable: '--kl-mono', display: 'swap' })

const DESCRIPTION = 'Desk work with a deadline on it, done by AI agents and checked before it reaches you.'

export const metadata: Metadata = {
  metadataBase: new URL('https://kochitolabs.com'),
  title: { default: 'Kochito Labs', template: '%s · Kochito Labs' },
  description: DESCRIPTION,
  openGraph: { title: 'Kochito Labs', description: DESCRIPTION, url: 'https://kochitolabs.com', siteName: 'Kochito Labs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Kochito Labs', description: DESCRIPTION },
}

export const viewport: Viewport = { themeColor: '#f7f3ea', viewportFit: 'cover' }

export default function KochitoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`kl ${display.variable} ${text.variable} ${mono.variable}`}>{children}</div>
}
