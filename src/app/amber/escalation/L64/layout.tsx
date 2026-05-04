import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L64 — follow the current',
  description: 'per-pixel streamline integration through a curl-noise field. drag to bend, tap to glow.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L64Layout({ children }: { children: React.ReactNode }) {
  return children
}
