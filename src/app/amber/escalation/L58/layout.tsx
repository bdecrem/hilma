import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L58 — light through water, on the floor',
  description: 'caustic patterns from a virtual pool.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L58Layout({ children }: { children: React.ReactNode }) {
  return children
}
