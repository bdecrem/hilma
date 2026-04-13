import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#120C08',
}

export default function L40Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
