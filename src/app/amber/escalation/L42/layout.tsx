import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#120A06',
}

export default function L42Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
