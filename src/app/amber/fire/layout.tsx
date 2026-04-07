import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1a1512',
}

export default function FireLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
