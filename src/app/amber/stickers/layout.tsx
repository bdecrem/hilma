import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'stickers — amber',
  description: 'stick it.',
}

export const viewport: Viewport = {
  themeColor: '#1A110A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function StickersLayout({ children }: { children: React.ReactNode }) {
  return children
}
