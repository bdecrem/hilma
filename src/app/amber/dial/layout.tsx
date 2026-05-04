import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber · dial',
  description: 'a rotary phone dial. spin a number, listen to it tick back.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function DialLayout({ children }: { children: React.ReactNode }) {
  return children
}
