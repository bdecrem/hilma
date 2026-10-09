import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './daily-call.css'

// Inter is the neutral stand-in: the brand designer picks the real family.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Daily call — design artifact',
  description:
    'Core flows and screens for a daily three-minute spoken language lesson started from a text. Unbranded on purpose: structure, flows and copy are set; name, color, type and mascot are open.',
  openGraph: {
    title: 'Daily call — design artifact',
    description: 'Eleven screens, three flows, one button a day. An unbranded prototype for the brand designer.',
    url: 'https://ola.cx/design/daily-call',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ebebe8',
}

export default function DailyCallLayout({ children }: { children: React.ReactNode }) {
  return <div className={inter.variable}>{children}</div>
}
