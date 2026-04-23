import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'wiggle — amber',
  description: 'follow.',
}

export const viewport: Viewport = {
  themeColor: '#150826',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function WiggleLayout({ children }: { children: React.ReactNode }) {
  return children
}
