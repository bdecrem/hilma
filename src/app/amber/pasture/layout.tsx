import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · pasture',
  description: 'boards of canada for the weather field. tap to begin.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function PastureLayout({ children }: { children: React.ReactNode }) {
  return children
}
