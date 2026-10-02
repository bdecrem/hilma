import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Plus Buddy',
  description: 'The Macintosh Plus, 1986, extremely happy to see you.',
}

export const viewport: Viewport = {
  themeColor: '#1a0b2e',
  viewportFit: 'cover',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
