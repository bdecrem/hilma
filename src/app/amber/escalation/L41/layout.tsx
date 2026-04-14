import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1a1612',
}

export default function L41Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
