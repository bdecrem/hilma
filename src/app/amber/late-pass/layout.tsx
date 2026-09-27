import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'the late pass — amber',
  description: 'department of delay · amber industries. tap to issue.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function LatePassLayout({ children }: { children: React.ReactNode }) {
  return children
}
