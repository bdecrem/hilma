import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
}

export default function LatticeLayout({ children }: { children: React.ReactNode }) {
  return children
}
