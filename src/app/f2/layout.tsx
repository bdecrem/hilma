import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'F2',
  description: 'Learn anything, the AI way.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f7f5',
}

export default function F2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
