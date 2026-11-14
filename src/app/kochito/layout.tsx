import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './kochito.css'

// kochitolabs.com (also ola.cx/kochito): the company's site. Two service pages,
// /pdf and /apps, each with one form; what visitors do is counted in
// kochito_events and sign-ups land in kochito_leads (src/lib/kochito/store.ts).
// Headlines in the display face, reading text in Public Sans, mono only where
// the thing shown is code. The design and the rule it is held to: the note at
// the top of kochito.css.
const display = localFont({
  src: [
    { path: '../../fonts/source-serif-4/SourceSerif4.woff2', style: 'normal' },
    { path: '../../fonts/source-serif-4/SourceSerif4-Italic.woff2', style: 'italic' },
  ],
  weight: '200 900',
  variable: '--kl-display-serif',
  display: 'swap',
})
const displayAlt = localFont({ src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2', weight: '200 800', variable: '--kl-display-grot', display: 'swap' })
const sans = localFont({
  src: [
    { path: '../../fonts/public-sans/PublicSans.woff2', style: 'normal' },
    { path: '../../fonts/public-sans/PublicSans-Italic.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--kl-sans',
  display: 'swap',
})
const mono = localFont({ src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2', weight: '100 800', variable: '--kl-mono', display: 'swap' })

const DESCRIPTION = 'Accessible PDFs for city and county websites, and maintenance for Shopify apps.'

export const metadata: Metadata = {
  metadataBase: new URL('https://kochitolabs.com'),
  title: { default: 'Kochito Labs', template: '%s | Kochito Labs' },
  description: DESCRIPTION,
  openGraph: { title: 'Kochito Labs', description: DESCRIPTION, url: 'https://kochitolabs.com', siteName: 'Kochito Labs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Kochito Labs', description: DESCRIPTION },
}

export const viewport: Viewport = { themeColor: '#fbfbf8', viewportFit: 'cover' }

export default function KochitoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`kl ${display.variable} ${displayAlt.variable} ${sans.variable} ${mono.variable}`}>{children}</div>
}
