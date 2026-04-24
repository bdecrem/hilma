import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'splatter — amber',
  description: 'make a mess.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SplatterLayout({ children }: { children: React.ReactNode }) {
  return children
}
