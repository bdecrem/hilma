import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './dolly.css'

const display = localFont({ src: '../../fonts/baloo-2/Baloo2.woff2', weight: '400 800', variable: '--dolly-display', display: 'swap' })
const ui = localFont({ src: '../../fonts/quicksand/Quicksand.woff2', weight: '300 700', variable: '--dolly-ui', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Dolly',
  description: 'A three-minute call a day, in Spanish. Talk, say three things back, play ten cards. Every day.',
  openGraph: {
    title: 'Dolly',
    description: 'A three-minute call a day, in Spanish.',
    url: 'https://ola.cx/dolly',
    siteName: 'Dolly',
  },
}

export const viewport: Viewport = {
  themeColor: '#ebdfff',
  viewportFit: 'cover',
}

export default function DollyLayout({ children }: { children: React.ReactNode }) {
  return <div className={`dolly ${display.variable} ${ui.variable}`}>{children}</div>
}
