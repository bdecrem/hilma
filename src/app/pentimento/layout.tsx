import type { Metadata, Viewport } from 'next'
import { IM_Fell_English, IM_Fell_English_SC } from 'next/font/google'
import './pentimento.css'

const fell = IM_Fell_English({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--pm-fell' })
const fellSC = IM_Fell_English_SC({ subsets: ['latin'], weight: '400', variable: '--pm-sc' })

export const metadata: Metadata = {
  metadataBase: new URL('https://hilma-nine.vercel.app'),
  title: 'Pentimento',
  description: 'One canvas, painted four times over a dodo. A film painted and scored in code by Claude Opus 5.5.',
  openGraph: {
    title: 'Pentimento',
    description: 'One canvas, painted four times over a dodo. Painted and scored in code by Claude Opus 5.5.',
    images: [{ url: '/pentimento/og.jpg', width: 1200, height: 630 }],
    type: 'video.other',
  },
  twitter: { card: 'summary_large_image', title: 'Pentimento', images: ['/pentimento/og.jpg'] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e0b09',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`pm ${fell.variable} ${fellSC.variable}`}>{children}</div>
}
