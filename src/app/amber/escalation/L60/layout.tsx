import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L60 — the field has weather',
  description: 'first WebGL piece. domain-warped fbm. cursor is a soft light.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L60Layout({ children }: { children: React.ReactNode }) {
  return children
}
