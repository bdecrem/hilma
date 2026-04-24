import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'pluck — amber',
  description: 'drag across.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function PluckLayout({ children }: { children: React.ReactNode }) {
  return children
}
