import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0A1C1A',
}

export default function PingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
