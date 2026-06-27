import type { Metadata, Viewport } from 'next'
import { Shantell_Sans, Caveat } from 'next/font/google'

const shantell = Shantell_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-shantell' })
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-caveat' })

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
