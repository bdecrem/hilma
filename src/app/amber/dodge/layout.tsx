import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'dodge — amber',
  description: 'stay alive.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function DodgeLayout({ children }: { children: React.ReactNode }) {
  return children
}
