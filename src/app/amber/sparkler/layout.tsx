import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'sparkler — amber',
  description: 'draw with light.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SparklerLayout({ children }: { children: React.ReactNode }) {
  return children
}
