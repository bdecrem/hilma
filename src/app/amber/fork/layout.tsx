import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'fork — strike it.',
  description: 'a tuning fork. tap to strike it. the tines ring at A=440Hz and decay over six seconds.',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function ForkLayout({ children }: { children: React.ReactNode }) {
  return children
}
