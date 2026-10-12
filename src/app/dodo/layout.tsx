import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

const fredoka = localFont({ src: '../../fonts/fredoka/Fredoka.woff2', weight: '300 700', variable: '--font-fredoka' })

const nunito = localFont({ src: '../../fonts/nunito/Nunito.woff2', weight: '200 1000', variable: '--font-nunito' })

export const metadata: Metadata = {
  title: 'Dodo — learn it, keep it',
  description:
    'An AI learning companion for iPhone. Feed it a book, a video, or an article — then actually remember it. Open source, MIT.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F2F8' },
    { media: '(prefers-color-scheme: dark)', color: '#17131D' },
  ],
}

export default function DodoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${fredoka.variable} ${nunito.variable}`}>{children}</div>
}
