import type { Metadata, Viewport } from 'next'
import { Fredoka, Nunito } from 'next/font/google'

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-fredoka',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-nunito',
})

export const metadata: Metadata = {
  title: 'Dodo — learn it, keep it',
  description:
    'An AI learning companion for iPhone. Feed it a book, a video, or an article — then actually remember it. Open source, MIT.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FBF5E6',
}

export default function DodoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${fredoka.variable} ${nunito.variable}`}>{children}</div>
}
