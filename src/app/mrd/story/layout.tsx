import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './story.css'

const dmSans = localFont({
  src: [
    { path: '../../../fonts/dm-sans/DMSans.woff2', style: 'normal' },
    { path: '../../../fonts/dm-sans/DMSans-Italic.woff2', style: 'italic' },
  ],
  weight: '100 1000',
  variable: '--font-dm-sans', display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Migrant Rights Law Library: how it was made',
  description: 'From a database of 2,970 citations to a library of 2,652 laws in full text, and six countries coded by Claude.',
  robots: { index: false, follow: false },
  openGraph: { url: 'https://ola.cx/mrd/story', siteName: 'Migrant Rights Law Library', title: 'Migrant Rights Law Library', description: 'Every law behind migrants’ rights, in one place.' },
}

export const viewport: Viewport = { themeColor: '#f7f3eb' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`story ${dmSans.variable}`}>{children}</div>
}
