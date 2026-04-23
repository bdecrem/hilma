import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L53 — a cube above cubes',
  description: 'a shape that needs more than three dimensions.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L53Layout({ children }: { children: React.ReactNode }) {
  return children
}
