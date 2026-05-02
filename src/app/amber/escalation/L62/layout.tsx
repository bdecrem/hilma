import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: "L62 — it can't decide on a shape",
  description: 'ray-marched SDF metaball cluster. drag to orbit, tap to shudder.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L62Layout({ children }: { children: React.ReactNode }) {
  return children
}
