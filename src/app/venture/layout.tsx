import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './venture.css'

// Venture: the business Claude and Bart are starting (apps/venture/README.md).
// Everything under /venture is private: each page checks the key in ?k=.
const display = localFont({
  src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2',
  weight: '200 800',
  variable: '--vi-display',
  display: 'swap',
})
const mono = localFont({
  src: [
    { path: '../../fonts/dm-mono/DMMono-400.woff2', weight: '400' },
    { path: '../../fonts/dm-mono/DMMono-500.woff2', weight: '500' },
  ],
  variable: '--vi-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Venture',
  description: 'A business, started by Claude and Bart.',
  robots: { index: false, follow: false },
  openGraph: { title: 'Venture', description: 'A business, started by Claude and Bart.', url: 'https://ola.cx/venture' },
  twitter: { card: 'summary_large_image', title: 'Venture' },
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
