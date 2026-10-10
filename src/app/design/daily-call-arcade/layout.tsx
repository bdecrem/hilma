import type { Metadata, Viewport } from 'next'
import { Bungee, Space_Grotesk, Space_Mono } from 'next/font/google'

const display = Bungee({ subsets: ['latin'], weight: '400', variable: '--font-arcade-display', display: 'swap' })
const ui = Space_Grotesk({ subsets: ['latin'], variable: '--font-arcade-ui', display: 'swap' })
const lang = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-arcade-lang', display: 'swap' })
import '../_walk/walk.css'
import '../_walk/arcade.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Daily call · Arcade',
  description: 'The daily-call walkthrough as an arcade cabinet: neon magenta and cyan on deep space, glowing panels, a pixel parrot.',
  openGraph: { title: 'Daily call · Arcade', description: 'The daily-call walkthrough as an arcade cabinet: neon magenta and cyan on deep space, glowing panels, a pixel parrot.', url: 'https://ola.cx/design/daily-call-arcade', type: 'website' },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06061a',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${ui.variable} ${lang.variable}`}>{children}</div>
}
