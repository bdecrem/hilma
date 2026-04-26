import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'halo — amber',
  description: 'spring.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function HaloLayout({ children }: { children: React.ReactNode }) {
  return children
}
