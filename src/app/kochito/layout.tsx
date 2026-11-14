import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './kochito.css'

// kochitolabs.com (also ola.cx/kochito): the company's site. Two service pages,
// /pdf and /apps, each with one form; what visitors do is counted in
// kochito_events and sign-ups land in kochito_leads (src/lib/kochito/store.ts).
// One typeface, Public Sans (the US government's own; its readers see it daily).
// The look is deliberately plain: read the note at the top of kochito.css.
const sans = localFont({
  src: [
    { path: '../../fonts/public-sans/PublicSans.woff2', style: 'normal' },
    { path: '../../fonts/public-sans/PublicSans-Italic.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--kl-sans',
  display: 'swap',
})

const DESCRIPTION = 'Accessible PDFs for city and county websites, and maintenance for Shopify apps.'

export const metadata: Metadata = {
  metadataBase: new URL('https://kochitolabs.com'),
  title: { default: 'Kochito Labs', template: '%s | Kochito Labs' },
  description: DESCRIPTION,
  openGraph: { title: 'Kochito Labs', description: DESCRIPTION, url: 'https://kochitolabs.com', siteName: 'Kochito Labs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Kochito Labs', description: DESCRIPTION },
}

export const viewport: Viewport = { themeColor: '#1a4480', viewportFit: 'cover' }

export default function KochitoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`kl ${sans.variable}`}>{children}</div>
}
