import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './interview.css'

const display = localFont({
  src: '../../../fonts/bricolage-grotesque/BricolageGrotesque.woff2',
  weight: '200 800',
  variable: '--vi-display',
  display: 'swap',
})
const mono = localFont({
  src: [
    { path: '../../../fonts/dm-mono/DMMono-400.woff2', weight: '400' },
    { path: '../../../fonts/dm-mono/DMMono-500.woff2', weight: '500' },
  ],
  variable: '--vi-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'A call with Claude',
  description: 'Fifteen minutes of questions before I start a business.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'A call with Claude',
    description: 'Fifteen minutes of questions before I start a business.',
    url: 'https://ola.cx/venture/interview',
  },
  twitter: { card: 'summary_large_image', title: 'A call with Claude' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f6efe0',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`vi ${display.variable} ${mono.variable}`}>{children}</div>
}
