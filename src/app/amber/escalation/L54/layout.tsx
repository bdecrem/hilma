import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L54 — light bent by what cannot be seen',
  description: 'gravitational lensing of a starfield.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L54Layout({ children }: { children: React.ReactNode }) {
  return children
}
