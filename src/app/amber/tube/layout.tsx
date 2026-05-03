import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · tube',
  description: 'a vacuum tube. hold to apply current. the filament glows.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function TubeLayout({ children }: { children: React.ReactNode }) {
  return children
}
