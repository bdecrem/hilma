import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'wrap — amber',
  description: 'pop them all.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function WrapLayout({ children }: { children: React.ReactNode }) {
  return children
}
