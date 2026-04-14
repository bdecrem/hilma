import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#060402',
}

export default function AuroraLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
