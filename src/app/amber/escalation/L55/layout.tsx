import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L55 — the inside spins faster than the outside',
  description: 'a Rankine vortex of cream points.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L55Layout({ children }: { children: React.ReactNode }) {
  return children
}
