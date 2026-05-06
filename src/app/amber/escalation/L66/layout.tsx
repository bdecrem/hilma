import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L66 — follow the scent',
  description: 'Physarum slime-mold simulation: 16,384 agents leaving trails, sensing each other, organizing into vascular networks. drag to attract, tap to scatter.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L66Layout({ children }: { children: React.ReactNode }) {
  return children
}
