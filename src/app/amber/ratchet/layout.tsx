import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'ratchet — amber',
  description: 'one direction only',
  openGraph: {
    title: 'ratchet',
    description: 'one direction only',
    url: 'https://intheamber.com/amber/ratchet',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  viewportFit: 'cover',
}

export default function RatchetLayout({ children }: { children: React.ReactNode }) {
  return children
}
