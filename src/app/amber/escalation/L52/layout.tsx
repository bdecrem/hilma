import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L52 — amber',
  description: 'two paths, the same start',
  openGraph: {
    title: 'L52 — two paths, the same start',
    description: 'L52 escalation. environment tier. lorenz attractor, butterfly effect.',
    url: 'https://intheamber.com/amber/escalation/L52',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  viewportFit: 'cover',
}

export default function L52Layout({ children }: { children: React.ReactNode }) {
  return children
}
