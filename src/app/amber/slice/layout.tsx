import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · slice',
  description: 'octatrack-style glitch sampler over the weather field. tap to begin.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SliceLayout({ children }: { children: React.ReactNode }) {
  return children
}
