import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0C1424',
}

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return children
}
