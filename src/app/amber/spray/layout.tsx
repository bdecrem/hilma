import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · spray',
  description: 'a spray can. hold to paint. the can heats up pink.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SprayLayout({ children }: { children: React.ReactNode }) {
  return children
}
