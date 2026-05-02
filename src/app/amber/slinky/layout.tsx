import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · slinky',
  description: 'a slinky. pull the top. watch the wave travel down.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SlinkyLayout({ children }: { children: React.ReactNode }) {
  return children
}
