import type { Metadata, Viewport } from 'next'
import { Fredoka } from 'next/font/google'

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-fredoka',
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
  return <div className={fredoka.variable}>{children}</div>
}
