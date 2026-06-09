import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'elements — amber',
  description: 'a falling-everything toy. sand piles, water pools, plants drink, fire takes.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function ElementsLayout({ children }: { children: React.ReactNode }) {
  return children
}
