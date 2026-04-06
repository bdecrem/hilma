import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#FFF8E7',
}

export default function FortuneLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
