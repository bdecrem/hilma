import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · chamber',
  description: 'dub techno for the aurora curtain. tap to begin.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function ChamberLayout({ children }: { children: React.ReactNode }) {
  return children
}
