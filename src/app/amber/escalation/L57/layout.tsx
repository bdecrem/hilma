import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L57 — smoke from a single point',
  description: 'incense in 3D curl-noise air currents.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L57Layout({ children }: { children: React.ReactNode }) {
  return children
}
