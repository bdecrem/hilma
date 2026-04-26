import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L56 — the field between two points',
  description: 'an electric dipole flowing in 3D.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L56Layout({ children }: { children: React.ReactNode }) {
  return children
}
