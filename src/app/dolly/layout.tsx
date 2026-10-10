import type { Metadata, Viewport } from 'next'
import { Baloo_2, Quicksand } from 'next/font/google'
import './dolly.css'

const display = Baloo_2({ subsets: ['latin'], weight: ['600', '800'], variable: '--dolly-display', display: 'swap' })
const ui = Quicksand({ subsets: ['latin'], weight: ['500', '700'], variable: '--dolly-ui', display: 'swap' })

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
