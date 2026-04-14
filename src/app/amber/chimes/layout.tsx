import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1a1410',
}

export default function ChimesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
