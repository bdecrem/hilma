import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'floor — amber',
  description: '132 bpm. tap to start.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function FloorLayout({ children }: { children: React.ReactNode }) {
  return children
}
