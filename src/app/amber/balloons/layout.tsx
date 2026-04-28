import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'balloons — amber',
  description: 'pop them.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function BalloonsLayout({ children }: { children: React.ReactNode }) {
  return children
}
