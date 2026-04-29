import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'snowglobe — amber',
  description: 'shake it.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SnowglobeLayout({ children }: { children: React.ReactNode }) {
  return children
}
