import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L51 — amber',
  description: 'a shape that only exists when it turns',
  openGraph: {
    title: 'L51 — a shape that only exists when it turns',
    description: 'L51 escalation. environment tier. 3D lissajous knot in motion.',
    url: 'https://intheamber.com/amber/escalation/L51',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  viewportFit: 'cover',
}

export default function L51Layout({ children }: { children: React.ReactNode }) {
  return children
}
