import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './woodworker.css'

// The title, the item labels, the win card: a slab serif with a workshop stencil feel.
const display = localFont({ src: '../../fonts/alfa-slab-one/AlfaSlabOne-400.woff2', weight: '400', variable: '--ww-display' })
// Labels on the woodwork, the controls.
const body = localFont({ src: '../../fonts/figtree/Figtree.woff2', weight: '300 900', variable: '--ww-body' })
// Cyriel's notes, in pencil.
const hand = localFont({ src: '../../fonts/caveat/Caveat.woff2', weight: '400 700', variable: '--ww-hand' })
// Moves, par, best.
const mono = localFont({ src: '../../fonts/dm-mono/DMMono-500.woff2', weight: '500', variable: '--ww-mono' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'The Woodworker',
  description:
    'Cyriel, a well-meaning, clumsy carpenter, rebuilt your house. Ten rooms, five kinds of puzzle (sliding drawers, swinging doors, a counter that tips, trays tied with string, Japanese puzzle boxes), and Cyriel\'s week, which keeps interrupting.',
  openGraph: {
    title: 'The Woodworker',
    description: 'Ten rooms a clumsy carpenter rebuilt, and the week they kept barging in.',
    url: 'https://ola.cx/woodworker',
    images: [{ url: '/woodworker/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', images: ['/woodworker/og.png'] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1d3832',
}

export default function WoodworkerLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ww ${display.variable} ${body.variable} ${hand.variable} ${mono.variable}`}>{children}</div>
}
