import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L61 — you can look into it',
  description: 'ray-marched volumetric noise. drag to orbit, tap to bloom.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L61Layout({ children }: { children: React.ReactNode }) {
  return children
}
