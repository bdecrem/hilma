import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'L67 — it keeps moving after you stop',
  description:
    'a stable-fluids solver on the GPU: velocity, pressure and ink fields coupled through a 20-step Jacobi pressure solve. fresh ink is lime and cools to cream. drag to stir, tap to drop.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function L67Layout({ children }: { children: React.ReactNode }) {
  return children
}
