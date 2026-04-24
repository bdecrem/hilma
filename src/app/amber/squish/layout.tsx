import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'squish — amber',
  description: 'press it. press it again.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SquishLayout({ children }: { children: React.ReactNode }) {
  return children
}
