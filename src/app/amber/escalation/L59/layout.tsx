import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L59 — a curtain in the sky',
  description: 'an aurora curtain in 3D. tap for a substorm.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L59Layout({ children }: { children: React.ReactNode }) {
  return children
}
