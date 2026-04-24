import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'murmur — amber',
  description: 'a small signal in the dark.',
}

export const viewport: Viewport = {
  themeColor: '#0C1424',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function MurmurLayout({ children }: { children: React.ReactNode }) {
  return children
}
