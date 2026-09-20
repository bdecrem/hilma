import type { Metadata, Viewport } from 'next'
import { Bowlby_One, DM_Mono, Fraunces } from 'next/font/google'
import './rpa.css'

// Enemy names, title, scores: a fat poster face that survives being small.
const display = Bowlby_One({ subsets: ['latin'], weight: '400', variable: '--font-display' })
// Probabilities, latency, cost: the machine's voice.
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
// What the player types: the one human voice on the page.
const serif = Fraunces({ subsets: ['latin'], style: ['italic', 'normal'], variable: '--font-serif' })

export const metadata: Metadata = {
  metadataBase: new URL('https://hilma-nine.vercel.app'),
  title: 'Rock Paper Anything',
  description:
    'Things are coming for your gate. Type anything. If it beats them, it hurts them — every shot is judged against the whole horde at once, in about 150 ms, by Jev.',
  // A static card rendered from scripts/rpa/og.html (npx tsx scripts/rpa/og.ts): it needs the page's own fonts.
  openGraph: { title: 'Rock Paper Anything', description: 'Type anything. If it beats them, it hurts them.', images: [{ url: '/rpa/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/rpa/og.png'] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f2e8d5',
}

export default function RpaLayout({ children }: { children: React.ReactNode }) {
  return <div className={`rpa ${display.variable} ${mono.variable} ${serif.variable}`}>{children}</div>
}
