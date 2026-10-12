import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

const shantell = localFont({ src: '../../fonts/shantell-sans/ShantellSans.woff2', weight: '300 800', variable: '--font-shantell' })
const caveat = localFont({ src: '../../fonts/caveat/Caveat.woff2', weight: '400 700', variable: '--font-caveat' })

export const metadata: Metadata = {
  title: 'dog ear',
  description: 'A little library on the internet — new books worth folding down a corner for, picked by real booksellers, with a few from Claude based on your own shelf.',
}

export const viewport: Viewport = {
  themeColor: '#f3ece0',
}

export default function DogEarLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${shantell.variable} ${caveat.variable}`}>{children}</div>
}
