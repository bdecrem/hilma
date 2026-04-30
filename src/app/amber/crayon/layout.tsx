import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · crayon',
  description: 'a scribble pad. drag to scribble. fast strokes spark pink.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function CrayonLayout({ children }: { children: React.ReactNode }) {
  return children
}
